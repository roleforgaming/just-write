import { App, Workspace, TFile, Plugin, MarkdownView } from 'obsidian';
import { NovelistSettings } from '../../settings';
import { SnapshotManager } from '../../utils/snapshotManager';
import { Logger } from '../../utils/logger';
import NovelistPlugin from '../../main';

// Helper function: Standardizes date to YYYY-MM-DD format
const getLocalDateString = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export class AutoSnapshotManager {
    private plugin: NovelistPlugin;
    private app: App;
    private workspace: Workspace;
    private snapshotManager: SnapshotManager;
    private settings: NovelistSettings;
    private logger: Logger;
    
    private dailyInterval: number | null = null;

    constructor(plugin: NovelistPlugin, snapshotManager: SnapshotManager, settings: NovelistSettings, logger: Logger) {
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
        this.stopDailyTimer();
        
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

    public startDailyTimer() {
        if (this.dailyInterval) {
            // Stop existing timer just in case, for safe restart
            this.stopDailyTimer();
        }
        
        if (this.settings.enableDailyAutoSnapshot) {
            this.logger.log("AutoSnapshot: Daily Timer Started");
            // Check immediately in case we missed it while closed
            this.checkDailySnapshot();

            // Check every minute
            this.dailyInterval = window.setInterval(() => {
                this.checkDailySnapshot();
            }, 60 * 1000); 
        }
    }

    public stopDailyTimer() {
        if (this.dailyInterval) {
            window.clearInterval(this.dailyInterval);
            this.dailyInterval = null;
            this.logger.log("AutoSnapshot: Daily Timer Stopped");
        }
    }

    private async checkDailySnapshot() {
        if (!this.settings.enableDailyAutoSnapshot) return;

        const now = new Date();
        const targetTimeParts = this.settings.dailyAutoSnapshotTime.split(':');
        
        if (targetTimeParts.length !== 2) {
             return;
        }

        const targetHour = parseInt(targetTimeParts[0], 10);
        const targetMinute = parseInt(targetTimeParts[1], 10);
        
        if (isNaN(targetHour) || isNaN(targetMinute)) return;

        // FIX: Use YYYY-MM-DD for reliable persistent storage and comparison
        const todayStr = getLocalDateString(now);
        
        if (this.settings.lastDailySnapshotDate === todayStr) {
            return;
        }
        
        // Robust check: Is the current time PAST or EQUAL to the target time?
        const nowHour = now.getHours();
        const nowMinute = now.getMinutes();

        const isTargetHourPassed = nowHour > targetHour;
        const isTargetMinutePassed = nowHour === targetHour && nowMinute >= targetMinute;

        const hasTimePassed = isTargetHourPassed || isTargetMinutePassed;
        
        if (hasTimePassed) {
            this.logger.log("AutoSnapshot: Daily triggered.");
            
            // Mark as run for today immediately and persist
            this.settings.lastDailySnapshotDate = todayStr;
            await this.plugin.saveSettings();
            
            // Snapshot ALL markdown files
            const files = this.app.vault.getMarkdownFiles();
            for (const file of files) {
                await this.snapshotManager.createSnapshot(file, 'Auto-snapshot: Daily');
            }
        }
    }
}