import { App, Workspace, TFile, Plugin, MarkdownView } from 'obsidian';
import { NovelistSettings } from '../../settings';
import { SnapshotManager } from '../../utils/snapshotManager';
import { Logger } from '../../utils/logger';

export class AutoSnapshotManager {
    private plugin: Plugin;
    private app: App;
    private workspace: Workspace;
    private snapshotManager: SnapshotManager;
    private settings: NovelistSettings;
    private logger: Logger;
    
    private dailyInterval: number | null = null;
    private lastDailyCheck: string = '';

    constructor(plugin: Plugin, snapshotManager: SnapshotManager, settings: NovelistSettings, logger: Logger) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.workspace = plugin.app.workspace;
        this.snapshotManager = snapshotManager;
        this.settings = settings;
        this.logger = logger;
    }

    load() {
        this.logger.log('Loading AutoSnapshotManager...');
        
        // 1. Session Start Snapshot
        if (this.settings.autoSnapshotOnSessionStart) {
            this.workspace.onLayoutReady(() => this.handleSessionStart());
        }

        // 2. Daily Snapshot Timer
        if (this.settings.enableDailyAutoSnapshot) {
            this.startDailyTimer();
        }
    }

    unload() {
        if (this.dailyInterval) {
            window.clearInterval(this.dailyInterval);
        }
        
        // 3. Session End Snapshot
        if (this.settings.autoSnapshotOnSessionEnd) {
            this.handleSessionEnd();
        }
        
        this.logger.log('Unloaded AutoSnapshotManager.');
    }

    private async handleSessionStart() {
        this.logger.log("AutoSnapshot: Session Start triggered.");
        const leaves = this.workspace.getLeavesOfType('markdown');
        const filesToSnapshot = new Set<TFile>();

        leaves.forEach(leaf => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                filesToSnapshot.add(leaf.view.file);
            }
        });

        for (const file of Array.from(filesToSnapshot)) {
            await this.snapshotManager.createSnapshot(file, 'Auto-snapshot: Session Start');
        }
    }

    private async handleSessionEnd() {
        // Note: Async operations in onunload are not guaranteed to complete before app close.
        this.logger.log("AutoSnapshot: Session End triggered.");
        const leaves = this.workspace.getLeavesOfType('markdown');
        const filesToSnapshot = new Set<TFile>();

        leaves.forEach(leaf => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                filesToSnapshot.add(leaf.view.file);
            }
        });

        const promises = Array.from(filesToSnapshot).map(file => 
            this.snapshotManager.createSnapshot(file, 'Auto-snapshot: Session End')
        );
        
        await Promise.allSettled(promises);
    }

    private startDailyTimer() {
        // Check every minute
        this.dailyInterval = window.setInterval(() => {
            this.checkDailySnapshot();
        }, 60 * 1000); 
    }

    private async checkDailySnapshot() {
        if (!this.settings.enableDailyAutoSnapshot) return;

        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;
        const todayStr = now.toDateString();

        // If time matches settings AND we haven't done it today (in this runtime session)
        // Note: A more robust "Done Today" check would involve persistent state, 
        // but for a plugin, simple session memory + time exact match often suffices for MVP.
        // Better: Check if the target time has passed and we haven't run it.
        
        if (currentTime === this.settings.dailyAutoSnapshotTime && this.lastDailyCheck !== todayStr) {
            this.lastDailyCheck = todayStr;
            this.logger.log("AutoSnapshot: Daily triggered.");
            
            // Snapshot ALL markdown files
            const files = this.app.vault.getMarkdownFiles();
            for (const file of files) {
                // Avoid spamming main thread, do in chunks or sequential
                await this.snapshotManager.createSnapshot(file, 'Auto-snapshot: Daily');
            }
        }
    }
}