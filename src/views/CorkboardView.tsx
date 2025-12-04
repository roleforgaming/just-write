import { ItemView, WorkspaceLeaf, TFolder, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Board } from '../components/Corkboard/Board';
import { ProjectManager } from '../utils/projectManager';
import NovelistPlugin from '../main';

export const VIEW_TYPE_CORKBOARD = "novelist-corkboard-view";

export class CorkboardView extends ItemView {
    root: Root | null = null;
    currentFolder: TFolder | null = null;
    isProjectContext: boolean = true;
    partnerLeaf: WorkspaceLeaf | null = null; // Stores the leaf from auto-split
    plugin: NovelistPlugin; // Reference to the main plugin

    constructor(leaf: WorkspaceLeaf, plugin: NovelistPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_CORKBOARD; }
    getDisplayText() { return this.currentFolder ? this.currentFolder.name : "Corkboard"; }
    getIcon() { return "layout-grid"; }

    setPartnerLeaf(leaf: WorkspaceLeaf) {
        this.partnerLeaf = leaf;
    }

    async setState(state: any, result: any): Promise<void> {
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
    
    private isLeafValid(leaf: WorkspaceLeaf | null): boolean {
        if (!leaf) return false;
        // Check if attached
        if (!leaf.view.containerEl.isConnected) return false;
        // Check if pinned - we generally shouldn't reuse a partner leaf if the user pinned it manually.
        if (leaf.getViewState().pinned) return false;
        
        return true;
    }

    handleCardSelect = (file: TFile) => {
        (this.app.workspace as any).trigger('novelist:select-file', file);
    };

    handleOpenFileRequest = (file: TFile) => {
        // 1. Check if the dedicated partner leaf exists, is valid, AND is not pinned.
        if (this.isLeafValid(this.partnerLeaf)) {
            this.partnerLeaf!.openFile(file);
            return;
        }

        // 2. If no partner leaf, find any other markdown pane that isn't this corkboard AND is not pinned.
        const allLeaves = this.app.workspace.getLeavesOfType('markdown');
        const otherLeaf = allLeaves.find(leaf => {
            if (leaf === this.leaf) return false;
            
            // Crucial Fix: Check if the leaf is pinned.
            const state = leaf.getViewState();
            if (state.pinned) return false;
            
            return true;
        });

        if (otherLeaf) {
            otherLeaf.openFile(file);
            return;
        }

        // 3. If no other pane exists, create a new split.
        // Use createLeafBySplit on THIS leaf to ensure the split happens relative to the Corkboard.
        const newLeaf = this.app.workspace.createLeafBySplit(this.leaf, 'vertical');
        newLeaf.openFile(file);
        
        // If auto-split is enabled, this new leaf becomes the partner for future clicks.
        if (this.plugin.settings.corkboardAutoSplit) {
            this.partnerLeaf = newLeaf;
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
            <Board 
                app={this.app} 
                folder={this.currentFolder} 
                onCardSelect={this.handleCardSelect}
                onOpenFileRequest={this.handleOpenFileRequest}
            />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}