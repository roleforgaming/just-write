import { ItemView, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Inspector } from '../components/Inspector';
import { ProjectManager } from '../utils/projectManager';
import NovelistPlugin from '../main'; // Import

export const VIEW_TYPE_INSPECTOR = "novelist-inspector-view";

export class InspectorView extends ItemView {
    root: Root | null = null;
    selectedFile: TFile | null = null;
    plugin: NovelistPlugin; // Added

    constructor(leaf: WorkspaceLeaf, plugin: NovelistPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_INSPECTOR; }
    getDisplayText() { return "Inspector"; }
    getIcon() { return "glasses"; }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        this.renderReact();
        
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file) {
                    this.selectedFile = file;
                    this.renderReact();
                }
            })
        );

        this.registerEvent(
            (this.app.workspace as any).on('novelist:select-file', (file: TFile | TFolder) => {
                if (file instanceof TFolder) {
                     const pm = new ProjectManager(this.app);
                     const folderNote = pm.getFolderNote(file);
                     if (folderNote) {
                         this.selectedFile = folderNote;
                     } else {
                         this.selectedFile = null;
                     }
                } else {
                    this.selectedFile = file;
                }
                this.renderReact();
            })
        );
    }

    renderReact() {
        let file = this.selectedFile || this.app.workspace.getActiveFile();
        
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
                plugin={this.plugin} // Pass plugin
                file={file} 
            />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}