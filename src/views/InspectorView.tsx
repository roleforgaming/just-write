import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Inspector } from '../components/Inspector';

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

        // 2. Listen for our Custom Event from Corkboard
        // We cast to 'any' because this is a custom event name
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
                <div className="novelist-inspector-empty">
                    No Document Selected
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