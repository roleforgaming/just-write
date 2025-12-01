import { Plugin, WorkspaceLeaf, TFolder, TFile, MarkdownView, Notice } from 'obsidian';
import { InspectorView, VIEW_TYPE_INSPECTOR } from './views/InspectorView';
import { CorkboardView, VIEW_TYPE_CORKBOARD } from './views/CorkboardView';
import { ScriveningsView, VIEW_TYPE_SCRIVENINGS } from './views/ScriveningsView';
import { BinderView, VIEW_TYPE_BINDER } from './views/BinderView';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './views/DashboardView';
import { CreateProjectModal } from './modals/CreateProjectModal';
import { ProjectManager } from './utils/projectManager';

export default class NovelistPlugin extends Plugin {
    async onload() {
        // --- 1. Register Views ---
        this.registerView(VIEW_TYPE_INSPECTOR, (leaf) => new InspectorView(leaf));
        this.registerView(VIEW_TYPE_CORKBOARD, (leaf) => new CorkboardView(leaf));
        this.registerView(VIEW_TYPE_SCRIVENINGS, (leaf) => new ScriveningsView(leaf));
        this.registerView(VIEW_TYPE_BINDER, (leaf) => new BinderView(leaf));
        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf));

        // --- 2. Ribbon Icons ---
        this.addRibbonIcon('book', 'Open Binder', () => {
            this.activateBinder();
        });

        this.addRibbonIcon('layout-dashboard', 'Open Project Dashboard', () => {
            this.activateDashboard();
        });

        // --- 3. Commands ---
        this.addCommand({
            id: 'create-novelist-project',
            name: 'Create New Novelist Project',
            callback: () => {
                new CreateProjectModal(this.app, async (projectFolder) => {
                    await this.activateBinder();
                    const marker = projectFolder.children.find(c => c.name === 'project.md');
                    if(marker && marker instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(marker);
                    }
                }).open();
            },
        });

        this.addCommand({
            id: 'open-novelist-inspector',
            name: 'Open Novelist Inspector',
            callback: () => this.activateInspector(),
        });
        
        this.addCommand({
            id: 'open-novelist-binder',
            name: 'Open Novelist Binder',
            callback: () => this.activateBinder(),
        });

        this.addCommand({
            id: 'open-novelist-dashboard',
            name: 'Open Project Dashboard',
            callback: () => this.activateDashboard(),
        });

        // --- 4. Context Menus ---
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item.setTitle("Open as Corkboard").setIcon("layout-grid").onClick(async () => await this.openCorkboard(file));
                    });
                    menu.addItem((item) => {
                        item.setTitle("Open as Scrivenings").setIcon("scroll-text").onClick(async () => await this.openScrivenings(file));
                    });
                }
            })
        );
        
        // --- 5. Read-Only Enforcement (Trash) ---
        const projectManager = new ProjectManager(this.app);
        
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file && projectManager.isInTrash(file)) {
                    const leaf = this.app.workspace.getLeaf(false);
                    const view = leaf.view;
                    if (view instanceof MarkdownView) {
                        const state = view.getState();
                        if (state.mode !== 'preview') {
                            state.mode = 'preview';
                            view.setState(state, { history: false });
                            new Notice("Read-Only: This file is in the Project Trash.");
                        }
                    }
                }
            })
        );

        this.app.workspace.onLayoutReady(() => {
            // Optional: Auto-open binder on load if desired
            // this.activateBinder(); 
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_INSPECTOR);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CORKBOARD);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCRIVENINGS);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_BINDER);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
    }

    async activateBinder() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_BINDER);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeftLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_BINDER, active: true });
        }
        
        if (leaf) workspace.revealLeaf(leaf);
    }

    async activateInspector() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_INSPECTOR);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_INSPECTOR, active: true });
        }
        
        if (leaf) workspace.revealLeaf(leaf);
    }

    async activateDashboard() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // 'tab' creates it in the main central area
            leaf = workspace.getLeaf('tab'); 
            await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
        }
        
        if (leaf) workspace.revealLeaf(leaf);
    }

    async openCorkboard(folder: TFolder) {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_CORKBOARD,
            active: true,
            state: { folderPath: folder.path }
        });
    }

    async openScrivenings(folder: TFolder) {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_SCRIVENINGS,
            active: true
        });
        if (leaf.view instanceof ScriveningsView) {
            await leaf.view.setFolder(folder);
        }
    }
}