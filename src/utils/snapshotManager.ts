import { App, TFile, TAbstractFile, normalizePath } from 'obsidian';
import { Logger } from './logger';

export interface Snapshot {
    path: string;         // Full path to the snapshot file
    originalPath: string; // Path of the source file
    timestamp: number;
    note?: string;
    wordCount: number;
}

export class SnapshotManager {
    private app: App;
    private logger: Logger;
    public static readonly SNAPSHOT_DIR = '.novelist/snapshots';

    constructor(app: App, logger: Logger) {
        this.app = app;
        this.logger = logger;
    }

    /**
     * Generates a sanitized directory path for storing snapshots of a specific file.
     */
    private getSnapshotDirForFile(file: TFile | string): string {
        const filePath = file instanceof TFile ? file.path : file;
        // Replace chars invalid for folders or confusing for structure
        const sanitized = filePath.replace(/[:*?"<>|]/g, '_');
        return normalizePath(`${SnapshotManager.SNAPSHOT_DIR}/${sanitized}`);
    }

    /**
     * Creates a snapshot of the current file content.
     */
    async createSnapshot(file: TFile, note?: string): Promise<void> {
        this.logger.log(`Creating snapshot for: ${file.path}`);
        
        try {
            const snapshotDir = this.getSnapshotDirForFile(file);
            
            // 1. Ensure .novelist/snapshots exists
            if (!await this.app.vault.adapter.exists(SnapshotManager.SNAPSHOT_DIR)) {
                await this.app.vault.createFolder(SnapshotManager.SNAPSHOT_DIR);
            }

            // 2. Ensure specific file snapshot folder exists
            if (!await this.app.vault.adapter.exists(snapshotDir)) {
                await this.app.vault.createFolder(snapshotDir);
            }

            // 3. Read content and prepare metadata
            const fileContent = await this.app.vault.read(file);
            const timestamp = window.moment().valueOf();
            const wordCount = (fileContent.match(/\S+/g) || []).length;
            
            const frontmatter = {
                originalPath: file.path,
                timestamp,
                note: note || '',
                snapshotWordCount: wordCount,
            };
            
            // Wrap original content in a new snapshot wrapper
            // We store metadata in the frontmatter of the snapshot file
            const snapshotContent = `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${fileContent}`;
            const snapshotFilename = `${window.moment(timestamp).format('YYYY-MM-DD-HHmmss')}.md`;
            const snapshotPath = normalizePath(`${snapshotDir}/${snapshotFilename}`);

            await this.app.vault.create(snapshotPath, snapshotContent);
            this.logger.log(`Snapshot created at: ${snapshotPath}`);

        } catch (e) {
            this.logger.error(`Failed to create snapshot for ${file.path}`, e);
            throw e;
        }
    }

    /**
     * Retrieves a list of snapshots for a specific file, sorted by newest first.
     */
    async getSnapshots(file: TFile): Promise<Snapshot[]> {
        this.logger.log(`Fetching snapshots for: ${file.path}`);
        const snapshotDir = this.getSnapshotDirForFile(file);

        if (!await this.app.vault.adapter.exists(snapshotDir)) {
            return [];
        }

        const listResult = await this.app.vault.adapter.list(snapshotDir);
        const snapshotFiles = listResult.files.filter(p => p.endsWith('.md'));

        const snapshots: Snapshot[] = [];

        for (const path of snapshotFiles) {
            const cache = this.app.metadataCache.getCache(path);
            if (cache?.frontmatter) {
                snapshots.push({
                    path: path,
                    originalPath: cache.frontmatter.originalPath,
                    timestamp: cache.frontmatter.timestamp,
                    note: cache.frontmatter.note,
                    wordCount: cache.frontmatter.snapshotWordCount,
                });
            }
        }

        return snapshots.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Restores a file to a previous state.
     * Automatically takes a backup snapshot of current state before overwriting.
     */
    async restoreSnapshot(fileToRestore: TFile, snapshot: Snapshot): Promise<void> {
        this.logger.log(`Restoring snapshot ${snapshot.path} to ${fileToRestore.path}`);

        // 1. Safety: Backup current state
        await this.createSnapshot(fileToRestore, 'Pre-Restore Auto-Backup');

        // 2. Read snapshot content
        const snapshotFile = this.app.vault.getAbstractFileByPath(snapshot.path);
        if (!(snapshotFile instanceof TFile)) {
            throw new Error(`Snapshot file not found: ${snapshot.path}`);
        }

        const rawSnapshotContent = await this.app.vault.read(snapshotFile);
        
        // 3. Strip the snapshot-specific frontmatter to get original content
        // The snapshot format is: --- {json} --- \n\n {original_content}
        const contentStart = rawSnapshotContent.indexOf('\n---\n');
        let contentToRestore = "";

        if (contentStart !== -1) {
            // +5 for '\n---\n' length
            contentToRestore = rawSnapshotContent.substring(contentStart + 5).trimStart(); 
            // We trim start to remove the newline after the closing fence
        } else {
            // Fallback: rely on Obsidian cache to find end of frontmatter
            const cache = this.app.metadataCache.getFileCache(snapshotFile);
            if (cache && cache.frontmatterPosition) {
                contentToRestore = rawSnapshotContent.substring(cache.frontmatterPosition.end.offset).trimStart();
            } else {
                contentToRestore = rawSnapshotContent; // Should not happen if created by us
            }
        }

        // 4. Overwrite file
        await this.app.vault.modify(fileToRestore, contentToRestore);
        this.logger.log(`Restoration complete.`);
    }

    async deleteSnapshot(snapshot: Snapshot): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(snapshot.path);
        if (file) {
            await this.app.vault.delete(file);
            this.logger.log(`Deleted snapshot: ${snapshot.path}`);
        }
    }

    /**
     * Handles renaming of source files by renaming their snapshot directory
     * to maintain history linkage.
     */
    async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
        if (!(file instanceof TFile)) return;

        const oldSnapshotDir = this.getSnapshotDirForFile(oldPath);
        const newSnapshotDir = this.getSnapshotDirForFile(file);

        if (await this.app.vault.adapter.exists(oldSnapshotDir)) {
            this.logger.log(`Renaming snapshot history from ${oldSnapshotDir} to ${newSnapshotDir}`);
            
            // Ensure parent of new dir exists
            const newParent = newSnapshotDir.substring(0, newSnapshotDir.lastIndexOf('/'));
            if (!await this.app.vault.adapter.exists(newParent)) {
                await this.app.vault.createFolder(newParent);
            }

            await this.app.vault.adapter.rename(oldSnapshotDir, newSnapshotDir);
        }
    }
}