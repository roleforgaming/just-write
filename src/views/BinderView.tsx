import { ItemView, WorkspaceLeaf } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Binder } from '../components/Binder/Binder';
import NovelistPlugin from '../main';

export const VIEW_TYPE_BINDER = "novelist-binder-view";

export class BinderView extends ItemView {
    root: Root | null = null;
    plugin: NovelistPlugin; // Add property

    constructor(leaf: WorkspaceLeaf, plugin: NovelistPlugin) {
        super(leaf);
        this.plugin = plugin; // Store it
    }

    getViewType() { return VIEW_TYPE_BINDER; }
    getDisplayText() { return "Binder"; }
    getIcon() { return "book"; }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        this.renderReact();
    }

    renderReact() {
        this.root?.render(
            <Binder app={this.app} plugin={this.plugin} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}