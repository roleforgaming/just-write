import { ItemView, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Inspector } from '../components/Inspector';
import { ProjectManager } from '../utils/projectManager';

export const VIEW_TYPE_INSPECTOR = "novelist-inspector-view";

export class InspectorView extends ItemView {
    root: Root | null = null;
    selectedFile: TFile | null = null; // Track selection manually

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_INSPECTOR; }
    getDisplayText() { return "Inspector"; }
    
    // Updated to 'glasses' for a more distinct look representing inspection
    getIcon() { return "glasses"; }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        this.renderReact();
        
        // 1. Listen for standard file opening
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file) {
                    this.selectedFile = file;
                    this.renderReact();
                }
            })
        );

        // 2. Listen for our Custom Event from Corkboard/Outliner/Binder
        this.registerEvent(
            (this.app.workspace as any).on('novelist:select-file', (file: TFile | TFolder) => {
                // If it is a folder, check for a folder note immediately to show that in inspector
                if (file instanceof TFolder) {
                     const pm = new ProjectManager(this.app);
                     const folderNote = pm.getFolderNote(file);
                     if (folderNote) {
                         this.selectedFile = folderNote;
                     } else {
                         this.selectedFile = null; // Can't inspect a raw folder without note
                     }
                } else {
                    this.selectedFile = file;
                }
                this.renderReact();
            })
        );
    }

    renderReact() {
        // Fallback to active file if no manual selection yet
        let file = this.selectedFile || this.app.workspace.getActiveFile();
        
        // Final fallback: If current selection is null, but there's a file active, use it?
        // No, stay consistent with selection.
        
        if (!file || file.extension !== 'md') {
            this.root?.render(
                <div className="novelist-inspector-empty" style={{padding: '20px', textAlign: 'center'}}>
                    No Document Selected
                </div>
            );
            return;
        }

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