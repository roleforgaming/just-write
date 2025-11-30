import { ItemView, WorkspaceLeaf, TFolder, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ScriveningsSection } from '../components/Scrivenings/ScriveningsSection';
import { getRank } from '../utils/metadata';

export const VIEW_TYPE_SCRIVENINGS = "novelist-scrivenings";

export class ScriveningsView extends ItemView {
    root: Root | null = null;
    folder: TFolder | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_SCRIVENINGS; }
    getDisplayText() { return this.folder ? this.folder.name : "Scrivenings"; }
    getIcon() { return "scroll-text"; }

    async setFolder(folder: TFolder) {
        this.folder = folder;
        this.renderReact();
    }

    async onOpen() {
        this.root = createRoot(this.contentEl);
    }

    renderReact() {
        if (!this.folder) return;

        const files = this.folder.children
            .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
            .sort((a, b) => getRank(this.app, a) - getRank(this.app, b));

        this.root?.render(
            <div className="scrivenings-container">
                {files.map(file => (
                    <ScriveningsSection 
                        key={file.path} 
                        app={this.app} 
                        file={file} 
                        component={this} 
                    />
                ))}
            </div>
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}