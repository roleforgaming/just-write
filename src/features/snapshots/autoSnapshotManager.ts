// src/features/snapshots/autoSnapshotManager.ts

import { App, Workspace, TFile, MarkdownView } from 'obsidian';
import { NovelistSettings } from '../../settings';
import { SnapshotManager } from '../../utils/snapshotManager';
import { Logger } from '../../utils/logger';
import NovelistPlugin from '../../main';
import { ProjectManager } from '../../utils/projectManager';

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
    private projectManager: ProjectManager;
    
    private dailyInterval: number | null = null;

    constructor(plugin: NovelistPlugin, snapshotManager: SnapshotManager, settings: NovelistSettings, logger: Logger) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.workspace = plugin.app.workspace;
        this.snapshotManager = snapshotManager;
        this.settings = settings;
        this.logger = logger;
        this.projectManager = new ProjectManager(this.app, this.plugin);
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
        
        // **REMOVED** Session End Snapshot logic
        
        this.logger.log('Unloaded AutoSnapshotManager.');
    }

    private async handleSessionStart() {
        this.logger.log("AutoSnapshot: Session Start triggered.");
        const leaves = this.workspace.getLeavesOfType('markdown');
        const filesToSnapshot = new Set<TFile>();

        // Fix: Use for...of loop to await async project checks
        // This ensures we catch projects even if metadata cache isn't fully ready on startup
        for (const leaf of leaves) {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                // Only snapshot files that are part of a Novelist project
                // Use Async version to fallback to file read if cache is cold
                if (await this.projectManager.getProjectForFileAsync(leaf.view.file)) {
                    filesToSnapshot.add(leaf.view.file);
                }
            }
        }
        
        if (filesToSnapshot.size > 0) {
            this.logger.log(`AutoSnapshot: Found ${filesToSnapshot.size} open project files to snapshot.`);
            for (const file of Array.from(filesToSnapshot)) {
                await this.snapshotManager.createSnapshot(file, 'Auto-snapshot: Session Start');
            }
        } else {
            this.logger.log('AutoSnapshot: No open project files found to snapshot.');
        }
    }

    // **REMOVED** private async handleSessionEnd() {}

    public startDailyTimer() {
        if (this.dailyInterval) {
            this.stopDailyTimer();
        }
        
        if (this.settings.enableDailyAutoSnapshot) {
            this.logger.log("AutoSnapshot: Daily Timer Started");
            this.checkDailySnapshot();

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

        const todayStr = getLocalDateString(now);
        
        if (this.settings.lastDailySnapshotDate === todayStr) {
            return;
        }
        
        const nowHour = now.getHours();
        const nowMinute = now.getMinutes();

        const isTargetHourPassed = nowHour > targetHour;
        const isTargetMinutePassed = nowHour === targetHour && nowMinute >= targetMinute;

        const hasTimePassed = isTargetHourPassed || isTargetMinutePassed;
        
        if (hasTimePassed) {
            this.logger.log("AutoSnapshot: Daily triggered.");
            
            this.settings.lastDailySnapshotDate = todayStr;
            await this.plugin.saveSettings();
            
            const allFiles = this.app.vault.getMarkdownFiles();
            // Filter to only include files within a Novelist project
            const projectFiles = allFiles.filter(file => this.projectManager.getProjectForFile(file));

            if (projectFiles.length > 0) {
                this.logger.log(`AutoSnapshot: Found ${projectFiles.length} project files for daily snapshot.`);
                for (const file of projectFiles) {
                    await this.snapshotManager.createSnapshot(file, 'Auto-snapshot: Daily');
                }
            } else {
                this.logger.log('AutoSnapshot: No project files found for daily snapshot.');
            }
        }
    }
}