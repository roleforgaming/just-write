import { App, TFile, TAbstractFile, normalizePath, Notice } from 'obsidian';
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
                await this.app.vault.adapter.mkdir(SnapshotManager.SNAPSHOT_DIR);
            }

            // 2. Ensure specific file snapshot folder exists
            if (!await this.app.vault.adapter.exists(snapshotDir)) {
                await this.app.vault.adapter.mkdir(snapshotDir);
            }

            // 3. Read content and prepare metadata
            const fileContent = await this.app.vault.read(file);
            
            // FIX: Use window.moment()
            const timestamp = window.moment().valueOf();
            const wordCount = (fileContent.match(/\S+/g) || []).length;
            
            // Note is escaped to handle quotes in JSON
            const safeNote = note ? note.replace(/"/g, '\\"') : '';

            const frontmatter = {
                originalPath: file.path,
                timestamp,
                note: safeNote,
                snapshotWordCount: wordCount,
            };
            
            // Wrap original content in a new snapshot wrapper
            const snapshotContent = `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${fileContent}`;
            
            // FIX: Use window.moment()
            const snapshotFilename = `${window.moment(timestamp).format('YYYY-MM-DD-HHmmss')}.md`;
            const snapshotPath = normalizePath(`${snapshotDir}/${snapshotFilename}`);

            await this.app.vault.adapter.write(snapshotPath, snapshotContent);
            this.logger.log(`Snapshot created at: ${snapshotPath}`);

        } catch (e) {
            this.logger.error(`Failed to create snapshot for ${file.path}`, e);
            throw e;
        }
    }

    /**
     * Retrieves a list of snapshots for a specific file, sorted by newest first.
     * Uses explicit adapter reads + Regex parsing because metadataCache excludes hidden folders.
     */
    async getSnapshots(file: TFile): Promise<Snapshot[]> {
        this.logger.log(`Fetching snapshots for: ${file.path}`);
        const snapshotDir = this.getSnapshotDirForFile(file);

        // Use ADAPTER to list files in hidden folder
        const exists = await this.app.vault.adapter.exists(snapshotDir);
        if (!exists) {
            this.logger.log(`No snapshot directory found at ${snapshotDir}`);
            return [];
        }

        const result = await this.app.vault.adapter.list(snapshotDir);
        const snapshots: Snapshot[] = [];

        for (const path of result.files) {
            if (!path.endsWith('.md')) continue;

            try {
                // Read raw content directly from adapter
                const content = await this.app.vault.adapter.read(path);
                
                // Manual extraction of frontmatter properties
                const timestampMatch = content.match(/"timestamp":\s*(\d+)/);
                const noteMatch = content.match(/"note":\s*"(.*)"/);
                const wordCountMatch = content.match(/"snapshotWordCount":\s*(\d+)/);
                const origPathMatch = content.match(/"originalPath":\s*"(.*)"/);

                if (timestampMatch) {
                    snapshots.push({
                        path: path,
                        originalPath: origPathMatch ? origPathMatch[1] : file.path,
                        timestamp: parseInt(timestampMatch[1]),
                        note: noteMatch ? noteMatch[1] : '', 
                        wordCount: wordCountMatch ? parseInt(wordCountMatch[1]) : 0
                    });
                }
            } catch (e) {
                this.logger.error("Failed to read snapshot file", path, e);
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

        try {
            // 1. Safety: Backup current state
            await this.createSnapshot(fileToRestore, 'Pre-Restore Auto-Backup');

            // 2. Read Snapshot via adapter
            const snapContent = await this.app.vault.adapter.read(snapshot.path);
            
            // 3. Strip Snapshot Frontmatter
            const contentToRestore = snapContent.replace(/^---\n[\s\S]*?\n---\n\n?/, '');

            // 4. Modify original file
            await this.app.vault.modify(fileToRestore, contentToRestore);
            this.logger.log(`Restoration complete.`);
        } catch (e) {
            this.logger.error("Failed to restore snapshot", e);
            new Notice("Failed to restore snapshot. Check console for details.");
        }
    }

    async deleteSnapshot(snapshot: Snapshot): Promise<void> {
        if (await this.app.vault.adapter.exists(snapshot.path)) {
            await this.app.vault.adapter.remove(snapshot.path);
            this.logger.log(`Deleted snapshot: ${snapshot.path}`);
        }
    }

    async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
        if (!(file instanceof TFile)) return;

        const oldSnapshotDir = this.getSnapshotDirForFile(oldPath);
        const newSnapshotDir = this.getSnapshotDirForFile(file);

        if (await this.app.vault.adapter.exists(oldSnapshotDir)) {
            this.logger.log(`Renaming snapshot history from ${oldSnapshotDir} to ${newSnapshotDir}`);
            
            const newParent = newSnapshotDir.substring(0, newSnapshotDir.lastIndexOf('/'));
            if (!await this.app.vault.adapter.exists(newParent)) {
                await this.app.vault.adapter.mkdir(newParent);
            }

            await this.app.vault.adapter.rename(oldSnapshotDir, newSnapshotDir);
        }
    }
}