import { App, TFile, TFolder } from 'obsidian';
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

    constructor(app: App, plugin: NovelistPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.projectManager = new ProjectManager(app, plugin);
        this.currentDateStr = new Date().toISOString().split('T')[0];
        this.checkDateReset();
    }

    private checkDateReset() {
        const today = new Date().toISOString().split('T')[0];
        if (today !== this.currentDateStr) {
            this.sessionWordCount = 0;
            this.currentDateStr = today;
            // In Phase 2, we will save history here
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
    }

    public updateSessionCount(file: TFile, content: string) {
        this.checkDateReset();
        
        const currentCount = this.getWordCount(content);
        const previousCount = this.fileWordCounts[file.path] || 0;
        
        const delta = currentCount - previousCount;
        
        // Only update state if there's a change
        if (delta !== 0) {
            this.sessionWordCount += delta;
            this.fileWordCounts[file.path] = currentCount;
        }
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