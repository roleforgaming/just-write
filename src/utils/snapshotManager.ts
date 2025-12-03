import { App, TFile, TAbstractFile, normalizePath, Notice } from 'obsidian';
import { Logger } from './logger';
import { PruningSettings } from '../settings'; // Import
import NovelistPlugin from '../main'; // Import for access to settings

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
    // We need access to plugin settings, pass plugin or settings in constructor
    // For now, I will assume the caller passes settings or I get them from app if possible, 
    // but cleaner to update constructor.
    private getSettings: () => { enabled: boolean, rules: PruningSettings };
    
    public static readonly SNAPSHOT_DIR = '.novelist/snapshots';

    constructor(app: App, logger: Logger, settingsGetter?: () => { enabled: boolean, rules: PruningSettings }) {
        this.app = app;
        this.logger = logger;
        this.getSettings = settingsGetter || (() => ({ enabled: false, rules: { keepDaily: 7, keepWeekly: 4, keepMonthly: 12 } }));
    }

    private getSnapshotDirForFile(file: TFile | string): string {
        const filePath = file instanceof TFile ? file.path : file;
        const sanitized = filePath.replace(/[:*?"<>|]/g, '_');
        return normalizePath(`${SnapshotManager.SNAPSHOT_DIR}/${sanitized}`);
    }

    async createSnapshot(file: TFile, note?: string): Promise<void> {
        this.logger.log(`Creating snapshot for: ${file.path}`);
        
        try {
            const snapshotDir = this.getSnapshotDirForFile(file);
            
            if (!await this.app.vault.adapter.exists(SnapshotManager.SNAPSHOT_DIR)) {
                await this.app.vault.adapter.mkdir(SnapshotManager.SNAPSHOT_DIR);
            }
            if (!await this.app.vault.adapter.exists(snapshotDir)) {
                await this.app.vault.adapter.mkdir(snapshotDir);
            }

            const fileContent = await this.app.vault.read(file);
            
            // FIX: Use window.moment()
            const timestamp = (window as any).moment().valueOf();
            const wordCount = (fileContent.match(/\S+/g) || []).length;
            const safeNote = note ? note.replace(/"/g, '\\"') : '';

            const frontmatter = {
                originalPath: file.path,
                timestamp,
                note: safeNote,
                snapshotWordCount: wordCount,
            };
            
            const snapshotContent = `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${fileContent}`;
            
            const snapshotFilename = `${(window as any).moment(timestamp).format('YYYY-MM-DD-HHmmss')}.md`;
            const snapshotPath = normalizePath(`${snapshotDir}/${snapshotFilename}`);

            await this.app.vault.adapter.write(snapshotPath, snapshotContent);
            this.logger.log(`Snapshot created at: ${snapshotPath}`);
            
            // --- Pruning Trigger ---
            const settings = this.getSettings();
            if (settings.enabled) {
                await this.pruneSnapshots(file, settings.rules);
            }

        } catch (e) {
            this.logger.error(`Failed to create snapshot for ${file.path}`, e);
            throw e;
        }
    }

    async getSnapshots(file: TFile): Promise<Snapshot[]> {
        const snapshotDir = this.getSnapshotDirForFile(file);
        const exists = await this.app.vault.adapter.exists(snapshotDir);
        if (!exists) return [];

        const result = await this.app.vault.adapter.list(snapshotDir);
        const snapshots: Snapshot[] = [];

        for (const path of result.files) {
            if (!path.endsWith('.md')) continue;

            try {
                const content = await this.app.vault.adapter.read(path);
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

    async restoreSnapshot(fileToRestore: TFile, snapshot: Snapshot): Promise<void> {
        this.logger.log(`Restoring snapshot ${snapshot.path} to ${fileToRestore.path}`);

        try {
            await this.createSnapshot(fileToRestore, 'Pre-Restore Auto-Backup');
            const snapContent = await this.app.vault.adapter.read(snapshot.path);
            const contentToRestore = snapContent.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
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
        }
    }

    async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
        if (!(file instanceof TFile)) return;

        const oldSnapshotDir = this.getSnapshotDirForFile(oldPath);
        const newSnapshotDir = this.getSnapshotDirForFile(file);

        if (await this.app.vault.adapter.exists(oldSnapshotDir)) {
            const newParent = newSnapshotDir.substring(0, newSnapshotDir.lastIndexOf('/'));
            if (!await this.app.vault.adapter.exists(newParent)) {
                await this.app.vault.adapter.mkdir(newParent);
            }
            await this.app.vault.adapter.rename(oldSnapshotDir, newSnapshotDir);
        }
    }

    // --- Pruning Logic ---
    async pruneSnapshots(file: TFile, rules: PruningSettings): Promise<void> {
        this.logger.log(`Pruning snapshots for ${file.basename}`);
        const snapshots = await this.getSnapshots(file); // Already sorted desc (newest first)
        
        if (snapshots.length === 0) return;

        const moment = (window as any).moment;
        const now = moment();
        
        const toDelete: Snapshot[] = [];
        const keptDaily = new Set<string>();   // YYYY-MM-DD
        const keptWeekly = new Set<string>();  // YYYY-WW
        const keptMonthly = new Set<string>(); // YYYY-MM

        // Time thresholds
        const dailyLimit = now.clone().subtract(rules.keepDaily, 'days');
        const weeklyLimit = now.clone().subtract(rules.keepWeekly, 'weeks');
        const monthlyLimit = now.clone().subtract(rules.keepMonthly, 'months');

        for (const snap of snapshots) {
            const snapTime = moment(snap.timestamp);
            
            // 1. "Keep All" Window
            if (snapTime.isAfter(dailyLimit)) {
                // Keep everything in this window
                continue;
            }

            // 2. "Keep Daily" Window (One per day)
            if (snapTime.isAfter(weeklyLimit)) {
                const dayKey = snapTime.format('YYYY-MM-DD');
                if (!keptDaily.has(dayKey)) {
                    keptDaily.add(dayKey);
                } else {
                    toDelete.push(snap);
                }
                continue;
            }

            // 3. "Keep Weekly" Window (One per week/month? Usually implied "One per week")
            // Rules say "Keep Weekly: 4" -> keep 4 weeks of history.
            // But usually this means "One snapshot per week" or "One per day for X weeks".
            // The AC says "retention policies (daily, weekly, monthly)".
            // Interpretation:
            //   - recent days: keep all
            //   - recent weeks: keep 1/day
            //   - recent months: keep 1/week
            
            if (snapTime.isAfter(monthlyLimit)) {
                const weekKey = snapTime.format('YYYY-WW');
                if (!keptWeekly.has(weekKey)) {
                    keptWeekly.add(weekKey);
                } else {
                    toDelete.push(snap);
                }
                continue;
            }

            // 4. Older than monthly limit -> Delete? 
            // Or Keep 1/Month indefinitely? 
            // AC says "exceeding the retention policy are automatically deleted".
            // So if it's older than keepMonthly, we delete it.
            toDelete.push(snap);
        }

        this.logger.log(`Pruning: Deleting ${toDelete.length} old snapshots.`);
        for (const snap of toDelete) {
            await this.deleteSnapshot(snap);
        }
    }
}