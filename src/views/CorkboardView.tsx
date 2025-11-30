import { ItemView, WorkspaceLeaf, TFolder } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Board } from '../components/Corkboard/Board'; // Import the new Board

export const VIEW_TYPE_CORKBOARD = "novelist-corkboard-view";

export class CorkboardView extends ItemView {
    root: Root | null = null;
    currentFolder: TFolder | null = null;

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

        this.root?.render(
            <Board app={this.app} folder={this.currentFolder} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}