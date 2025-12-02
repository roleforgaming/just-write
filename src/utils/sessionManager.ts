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
    
    // Cache last word counts for active files to calculate delta
    private fileWordCounts: Record<string, number> = {};
    
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
        const content = await this.app.vault.cachedRead(file);
        this.fileWordCounts[file.path] = this.getWordCount(content);
        
        // Ensure date is correct on file switch
        this.checkDateReset();
    }

    public updateSessionCount(file: TFile, content: string) {
        this.checkDateReset();
        
        const currentCount = this.getWordCount(content);
        const previousCount = this.fileWordCounts[file.path] || 0;
        
        const delta = currentCount - previousCount;
        
        // Only update state if there's a change
        if (delta !== 0) {
            // Apply Net vs Gross logic based on settings
            if (this.plugin.settings.statsSubtractOnDelete) {
                 this.sessionWordCount += delta;
            } else {
                if (delta > 0) this.sessionWordCount += delta;
                // If delta is negative, we ignore it (gross positive count only)
            }
            
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