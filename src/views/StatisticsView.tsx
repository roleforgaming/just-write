import { ItemView, WorkspaceLeaf, TFolder } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Statistics } from '../components/Statistics/Statistics';
import { ProjectManager } from '../utils/projectManager';

export const VIEW_TYPE_STATISTICS = "novelist-statistics-view";

export class StatisticsView extends ItemView {
    root: Root | null = null;
    project: TFolder | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_STATISTICS; }
    getDisplayText() { return "Statistics"; }
    getIcon() { return "bar-chart"; }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.determineProject();
            })
        );
        
        this.determineProject(true);
    }
    
    determineProject(forceRender: boolean = false) {
        let nextProject: TFolder | null = null;
        const file = this.app.workspace.getActiveFile();
        if (file) {
            const pm = new ProjectManager(this.app);
            nextProject = pm.getProjectForFile(file);
        }

        if (forceRender || this.project?.path !== nextProject?.path) {
            this.project = nextProject;
            this.renderReact();
        }
    }

    async setState(state: any, result: any): Promise<void> {
        if (state.folderPath) {
            const folder = this.app.vault.getAbstractFileByPath(state.folderPath);
            if (folder instanceof TFolder) {
                const pm = new ProjectManager(this.app);
                if (pm.isProject(folder)) {
                    this.project = folder;
                    this.renderReact();
                }
            }
        }
        return super.setState(state, result);
    }

    renderReact() {
        if (!this.project) {
            this.root?.render(
                <div style={{
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: 'var(--text-muted)',
                    padding: '20px',
                    textAlign: 'center'
                }}>
                    <div style={{marginBottom: 10}}>No Active Project Detected</div>
                    <div style={{fontSize: '0.85em'}}>Open a file within a Novelist project or select "View Statistics" from a project folder's context menu.</div>
                </div>
            );
            return;
        }

        this.root?.render(
            <Statistics app={this.app} project={this.project} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}