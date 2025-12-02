import { App, TFile, TFolder, debounce } from 'obsidian';
import NovelistPlugin from '../main';
import { ProjectManager } from './projectManager';

export class SessionManager {
    app: App;
    plugin: NovelistPlugin;
    projectManager: ProjectManager;

    currentDateStr: string;
    sessionWordCount: number = 0;
    dailyTarget: number = 0;
    
    // Cache last known word counts for active files to calculate immediate deltas
    private fileWordCounts: Record<string, number> = {};

    // Cache the word count of files at the start of the session (or first access today)
    // This allows us to calculate "Smart Net" counts (don't punish deleting old words)
    private fileSessionBaselines: Record<string, number> = {};
    
    // Debounced saver for history
    private debouncedHistorySave: (project: TFolder, date: string, count: number) => void;

    constructor(app: App, plugin: NovelistPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.projectManager = new ProjectManager(app, plugin);
        this.currentDateStr = new Date().toISOString().split('T')[0];
        
        // Debounce history saving to prevent excessive file writes (wait 5 seconds of inactivity)
        this.debouncedHistorySave = debounce(this.saveHistory.bind(this), 5000, true);
        
        this.checkDateReset();
    }

    private checkDateReset() {
        const today = new Date().toISOString().split('T')[0];
        if (today !== this.currentDateStr) {
            this.sessionWordCount = 0;
            this.currentDateStr = today;
            this.fileSessionBaselines = {}; // Reset baselines for the new day
            // The previous day's final count is already saved via the debounced saver
        }
    }

    public updateTarget(project: TFolder | null) {
        if (project) {
            const meta = this.projectManager.getProjectMetadata(project);
            if (meta && meta.targetSessionCount && meta.targetSessionCount > 0) {
                this.dailyTarget = meta.targetSessionCount;
                return;
            }
        }
        // Fallback to global
        this.dailyTarget = this.plugin.settings.globalDailyTarget || 500;
    }

    public getWordCount(content: string): number {
        // Strip frontmatter
        const body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        return (body.match(/\S+/g) || []).length;
    }

    public async onFileOpen(file: TFile) {
        if (file.extension !== 'md') return;
        
        this.checkDateReset();

        const content = await this.app.vault.cachedRead(file);
        const count = this.getWordCount(content);
        
        this.fileWordCounts[file.path] = count;
        
        // If we haven't seen this file today, set its baseline
        if (this.fileSessionBaselines[file.path] === undefined) {
            this.fileSessionBaselines[file.path] = count;
        }
    }

    public updateSessionCount(file: TFile, content: string) {
        this.checkDateReset();
        
        const currentCount = this.getWordCount(content);
        const previousCount = this.fileWordCounts[file.path] || 0;
        const baseline = this.fileSessionBaselines[file.path] !== undefined 
            ? this.fileSessionBaselines[file.path] 
            : previousCount; // Fallback if onFileOpen didn't fire yet

        // Ensure baseline is set if it wasn't (edge case)
        if (this.fileSessionBaselines[file.path] === undefined) {
             this.fileSessionBaselines[file.path] = previousCount;
        }
        
        const delta = currentCount - previousCount;
        
        // Only update state if there's a change
        if (delta !== 0) {
            let contribution = 0;

            if (this.plugin.settings.statsSubtractOnDelete) {
                // Smart Net Logic:
                // If delta is positive, we always count it.
                // If delta is negative, we only count it if we are deleting "New" words (words above the baseline).
                
                if (delta > 0) {
                    contribution = delta;
                } else {
                    // Negative delta (deletion)
                    if (currentCount >= baseline) {
                        // We are still above baseline, so we are deleting new words.
                        // Full deletion counts against session.
                        contribution = delta;
                    } else if (previousCount > baseline) {
                        // We dropped below baseline during this specific edit.
                        // Only count the deletion of the words that were above baseline.
                        // Ex: Baseline 1000. Prev 1010. Current 900. Delta -110.
                        // We only subtract 10 (the new words). The other 100 are old words.
                        contribution = baseline - previousCount; // (1000 - 1010 = -10)
                    } else {
                        // We were already below/at baseline, and deleted more old text.
                        // Do not punish session score.
                        contribution = 0;
                    }
                }

                this.sessionWordCount += contribution;

            } else {
                // Gross Logic: Only count positive inputs
                if (delta > 0) this.sessionWordCount += delta;
            }
            
            // Update caches
            this.fileWordCounts[file.path] = currentCount;

            // Trigger history save for the current project
            const project = this.projectManager.getProjectForFile(file);
            if (project) {
                this.debouncedHistorySave(project, this.currentDateStr, this.sessionWordCount);
            }
        }
    }

    // Persist session count to project metadata
    private async saveHistory(project: TFolder, date: string, count: number) {
        const meta = this.projectManager.getProjectMetadata(project);
        const history = meta?.writingHistory || {};

        // Avoid unnecessary writes if count hasn't changed from saved value
        if (history[date] === count) return;

        const newHistory = { ...history, [date]: count };
        await this.projectManager.updateProjectMetadata(project, { writingHistory: newHistory });
    }

    public getSessionProgress(): { current: number, target: number, percent: number } {
        const percent = this.dailyTarget > 0 ? Math.min(100, Math.round((this.sessionWordCount / this.dailyTarget) * 100)) : 0;
        return {
            current: this.sessionWordCount,
            target: this.dailyTarget,
            percent
        };
    }
}