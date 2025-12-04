import { ItemView, WorkspaceLeaf, TFolder, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Board } from '../components/Corkboard/Board';
import { ProjectManager } from '../utils/projectManager';

export const VIEW_TYPE_CORKBOARD = "novelist-corkboard-view";

export class CorkboardView extends ItemView {
    root: Root | null = null;
    currentFolder: TFolder | null = null;
    isProjectContext: boolean = true;
    partnerLeaf: WorkspaceLeaf | null = null; // Stores the actual leaf instance

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_CORKBOARD; }
    getDisplayText() { return this.currentFolder ? this.currentFolder.name : "Corkboard"; }
    getIcon() { return "layout-grid"; }

    setPartnerLeaf(leaf: WorkspaceLeaf) {
        this.partnerLeaf = leaf;
    }

    async setState(state: any, result: any): Promise<void> {
        // No need to process partnerLeafId from state anymore, it's set via setPartnerLeaf()
        if (state.folderPath) {
            const abstractFile = this.app.vault.getAbstractFileByPath(state.folderPath);
            if (abstractFile instanceof TFolder) {
                const pm = new ProjectManager(this.app);
                this.isProjectContext = !!pm.getProjectForFile(abstractFile);
                this.currentFolder = abstractFile;
                this.renderReact();
            }
        }
        return super.setState(state, result);
    }

    async onOpen() {
        this.root = createRoot(this.contentEl);
    }
    
    /**
     * Checks if a WorkspaceLeaf is still valid and part of the workspace layout.
     * @param leaf The leaf to check.
     * @returns true if the leaf is valid, false otherwise.
     */
    private isLeafValid(leaf: WorkspaceLeaf | null): boolean {
        if (!leaf) {
            return false;
        }
        // A leaf is considered detached (closed) if its container element is no longer part of the document's DOM.
        return leaf.view.containerEl.isConnected;
    }

    handleCardSelect = (file: TFile) => {
        // Trigger inspector update for other views that might be listening
        (this.app.workspace as any).trigger('novelist:select-file', file);
    
        let leafToOpenIn = this.partnerLeaf;
    
        // 1. Check if the existing partner leaf reference is still valid/attached
        if (!this.isLeafValid(leafToOpenIn)) {
            // If invalid, discard the old reference so we fall back to the "new tab" logic
            this.partnerLeaf = null;
            leafToOpenIn = null;
        }

        // 2. If we have a valid partner leaf, use it. Otherwise, fall back to a new tab.
        if (leafToOpenIn) {
            leafToOpenIn.openFile(file);
        } else {
            // This case handles both when the setting is off, and when the user has closed the partner pane.
            this.app.workspace.getLeaf('tab').openFile(file);
        }
    };

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
            <Board app={this.app} folder={this.currentFolder} onCardSelect={this.handleCardSelect} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}