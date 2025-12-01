import { ItemView, WorkspaceLeaf, TFolder } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
// Ensure this path matches where you saved the file
import { SeamlessEditor } from '../components/Scrivenings/SeamlessEditor';

export const VIEW_TYPE_SCRIVENINGS = "novelist-scrivenings";

export class ScriveningsView extends ItemView {
    root: Root | null = null;
    folder: TFolder | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_SCRIVENINGS; }
    getDisplayText() { return this.folder ? `Manuscript: ${this.folder.name}` : "Scrivenings"; }
    getIcon() { return "scroll-text"; }

    async setFolder(folder: TFolder) {
        this.folder = folder;
        this.renderReact();
    }

    async onOpen() {
        this.root = createRoot(this.contentEl);
    }

    renderReact() {
        // Handle case where folder isn't set yet
        if (!this.folder) {
            this.root?.render(
                <div style={{
                    display: 'flex', 
                    height: '100%', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: 'var(--text-muted)',
                    fontStyle: 'italic'
                }}>
                    Select a folder to view Scrivenings
                </div>
            );
            return;
        }

        this.root?.render(
            <div className="novelist-scrivenings-wrapper" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                <SeamlessEditor app={this.app} folder={this.folder} />
            </div>
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}