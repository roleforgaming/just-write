import { ItemView, WorkspaceLeaf } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Dashboard } from '../components/Dashboard/Dashboard';
import NovelistPlugin from '../main';

export const VIEW_TYPE_DASHBOARD = "novelist-dashboard-view";

export class DashboardView extends ItemView {
    root: Root | null = null;
    plugin: NovelistPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: NovelistPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { 
        return VIEW_TYPE_DASHBOARD; 
    }

    getDisplayText() { 
        return "Project Dashboard"; 
    }

    getIcon() { 
        return "layout-dashboard"; 
    }

    async onOpen() {
        this.root = createRoot(this.contentEl);
        this.renderReact();
    }

    renderReact() {
        this.root?.render(
            <Dashboard app={this.app} plugin={this.plugin} />
        );
    }

    async onClose() {
        this.root?.unmount();
    }
}