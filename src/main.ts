import { Plugin, WorkspaceLeaf, TFolder, TFile } from 'obsidian'; // Fixed: Added TFile
import { InspectorView, VIEW_TYPE_INSPECTOR } from './views/InspectorView';
import { CorkboardView, VIEW_TYPE_CORKBOARD } from './views/CorkboardView';
import { ScriveningsView, VIEW_TYPE_SCRIVENINGS } from './views/ScriveningsView';
import { BinderView, VIEW_TYPE_BINDER } from './views/BinderView';
import { CreateProjectModal } from './modals/CreateProjectModal';

export default class NovelistPlugin extends Plugin {
    async onload() {
        // 1. Register Views
        this.registerView(
            VIEW_TYPE_INSPECTOR,
            (leaf) => new InspectorView(leaf)
        );
        this.registerView(
            VIEW_TYPE_CORKBOARD,
            (leaf) => new CorkboardView(leaf)
        );
        this.registerView(
            VIEW_TYPE_SCRIVENINGS,
            (leaf) => new ScriveningsView(leaf)
        );
        this.registerView(
            VIEW_TYPE_BINDER,
            (leaf) => new BinderView(leaf)
        );

        // 2. Add Ribbon Icon for Binder
        this.addRibbonIcon('book', 'Open Binder', () => {
            this.activateBinder();
        });

        // NEW: Command to Create Project
        this.addCommand({
            id: 'create-novelist-project',
            name: 'Create New Novelist Project',
            callback: () => {
                new CreateProjectModal(this.app, async (projectFolder) => {
                    // 1. Create project
                    // 2. Open Binder
                    await this.activateBinder();
                    // 3. Force context switch
                    const marker = projectFolder.children.find(c => c.name === 'project.md');
                    // Type guard for TFile used here
                    if(marker && marker instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(marker);
                    }
                }).open();
            },
        });

        // 3. Add Command to Open Inspector
        this.addCommand({
            id: 'open-novelist-inspector',
            name: 'Open Novelist Inspector',
            callback: () => this.activateInspector(),
        });
        
        // Add Command to Open Binder
        this.addCommand({
            id: 'open-novelist-binder',
            name: 'Open Novelist Binder',
            callback: () => this.activateBinder(),
        });

        // 4. Context Menu for Folders
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle("Open as Corkboard")
                            .setIcon("layout-grid")
                            .onClick(async () => {
                                await this.openCorkboard(file);
                            });
                    });

                    menu.addItem((item) => {
                        item
                            .setTitle("Open as Scrivenings")
                            .setIcon("scroll-text")
                            .onClick(async () => {
                                await this.openScrivenings(file);
                            });
                    });
                }
            })
        );
        
        // 5. Initialize Layout
        this.app.workspace.onLayoutReady(() => {
            // Optional: Activate binder on load if you want it persistent
            // this.activateBinder(); 
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_INSPECTOR);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CORKBOARD);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCRIVENINGS);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_BINDER);
    }

    async activateBinder() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_BINDER);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // Create in left split
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