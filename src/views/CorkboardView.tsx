import { ItemView, WorkspaceLeaf, TFolder, TFile } from 'obsidian'; // Fixed: Added TFile
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Board } from '../components/Corkboard/Board';
import { ProjectManager } from '../utils/projectManager';

export const VIEW_TYPE_CORKBOARD = "novelist-corkboard-view";

export class CorkboardView extends ItemView {
    root: Root | null = null;
    currentFolder: TFolder | null = null;
    isProjectContext: boolean = true; // State to track valid context

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_CORKBOARD; }
    getDisplayText() { return this.currentFolder ? this.currentFolder.name : "Corkboard"; }
    getIcon() { return "layout-grid"; }

    async setState(state: any, result: any): Promise<void> {
        if (state.folderPath) {
            const abstractFile = this.app.vault.getAbstractFileByPath(state.folderPath);
            if (abstractFile instanceof TFolder) {
                
                // Check if this folder is part of a project
                const pm = new ProjectManager(this.app);
                // Heuristic: Check if the folder, or any parent, is a project
                // Note: children[0] check is risky if folder is empty, so we check the folder itself
                // To be safe, we check if the folder is inside a project structure
                let validProject = false;
                
                // If the folder contains a project marker, it is the root
                if (pm.isProject(abstractFile)) {
                    validProject = true;
                } else {
                    // Otherwise check heuristic based on path or parent
                    // We need a file to trace back up, or we assume if it has a parent that is a project
                    const dummyCheck = abstractFile.children.find(f => f instanceof TFile) as TFile;
                    if (dummyCheck) {
                        const root = pm.getProjectForFile(dummyCheck);
                        if (root) validProject = true;
                    } else if (abstractFile.parent) {
                        // Scan up from parent
                        const root = pm.getProjectForFile(abstractFile.parent.children[0] as TFile); // rough check
                         if (root) validProject = true;
                    }
                }
                
                this.isProjectContext = validProject;
                this.currentFolder = abstractFile;
                this.renderReact();
            }
        }
        return super.setState(state, result);
    }

    async onOpen() {
        this.root = createRoot(this.contentEl);
    }

    renderReact() {
        if (!this.currentFolder) return;

        if (!this.isProjectContext) {
             this.root?.render(
                <div style={{padding: 20, textAlign: 'center', color: 'var(--text-muted)'}}>
                    This folder is not part of a Novelist Project.
                </div>
            );
            return;
        }

        this.root?.render(
            <Board app={this.app} folder={this.currentFolder} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}