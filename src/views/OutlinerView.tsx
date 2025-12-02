import { ItemView, WorkspaceLeaf, TFolder } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Outliner } from '../components/Outliner/Outliner';
import { ProjectManager } from '../utils/projectManager';

export const VIEW_TYPE_OUTLINER = "novelist-outliner-view";

export class OutlinerView extends ItemView {
    root: Root | null = null;
    currentFolder: TFolder | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_OUTLINER; }
    getDisplayText() { return this.currentFolder ? `Outliner: ${this.currentFolder.name}` : "Outliner"; }
    getIcon() { return "list-tree"; }

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
        this.renderReact(); // Initial render for empty state
    }

    renderReact() {
        if (!this.currentFolder) {
            this.root?.render(
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Open a folder as an Outliner from the file menu.
                </div>
            );
            return;
        }

        const pm = new ProjectManager(this.app);
        if (!pm.getProjectForFile(this.currentFolder)) {
             this.root?.render(
                <div style={{padding: 20, textAlign: 'center', color: 'var(--text-muted)'}}>
                    This folder is not part of a Novelist Project.
                </div>
            );
            return;
        }

        this.root?.render(
            <Outliner app={this.app} folder={this.currentFolder} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}