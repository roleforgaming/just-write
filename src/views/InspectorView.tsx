import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Inspector } from '../components/Inspector';
import { ProjectManager } from '../utils/projectManager'; // Fixed: Import added

export const VIEW_TYPE_INSPECTOR = "novelist-inspector-view";

export class InspectorView extends ItemView {
    root: Root | null = null;
    selectedFile: TFile | null = null; // Track selection manually

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_INSPECTOR; }
    getDisplayText() { return "Inspector"; }
    getIcon() { return "info"; }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        this.renderReact(); // Fixed: Removed malformed code from inside parenthesis
        
        // 1. Listen for standard file opening
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file) {
                    this.selectedFile = file;
                    this.renderReact();
                }
            })
        );

        // 2. Listen for our Custom Event from Corkboard
        this.registerEvent(
            (this.app.workspace as any).on('novelist:select-file', (file: TFile) => {
                this.selectedFile = file;
                this.renderReact();
            })
        );
    }

    renderReact() {
        // Fallback to active file if no manual selection yet
        const file = this.selectedFile || this.app.workspace.getActiveFile();
        
        if (!file || file.extension !== 'md') {
            this.root?.render(
                <div className="novelist-inspector-empty" style={{padding: '20px', textAlign: 'center'}}>
                    No Document Selected
                </div>
            );
            return;
        }

        // Fixed: Moved Project Check logic inside the method
        const pm = new ProjectManager(this.app);
        const isProjectFile = pm.getProjectForFile(file);

        if (!isProjectFile) {
            this.root?.render(
                <div className="novelist-inspector-empty" style={{padding: '20px', textAlign: 'center'}}>
                    Not a Novelist Project File
                </div>
            );
            return;
        }

        this.root?.render(
            <Inspector 
                app={this.app} 
                file={file} 
            />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}