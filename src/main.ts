import { Plugin, WorkspaceLeaf, TFolder } from 'obsidian';
import { InspectorView, VIEW_TYPE_INSPECTOR } from './views/InspectorView';
import { CorkboardView, VIEW_TYPE_CORKBOARD } from './views/CorkboardView';
import { ScriveningsView, VIEW_TYPE_SCRIVENINGS } from './views/ScriveningsView';

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

        // 2. Add Command to Open Inspector
        this.addCommand({
            id: 'open-novelist-inspector',
            name: 'Open Novelist Inspector',
            callback: () => this.activateInspector(),
        });

        // 3. Context Menu for Folders
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    // Option 1: Corkboard
                    menu.addItem((item) => {
                        item
                            .setTitle("Open as Corkboard")
                            .setIcon("layout-grid")
                            .onClick(async () => {
                                await this.openCorkboard(file);
                            });
                    });

                    // Option 2: Scrivenings (Composite View)
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
        
        // 4. Initialize Layout
        this.app.workspace.onLayoutReady(() => {
            this.activateInspector();
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_INSPECTOR);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CORKBOARD);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCRIVENINGS);
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
        // Open a new leaf in the center
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_CORKBOARD,
            active: true,
            state: { folderPath: folder.path } // Pass folder path to view
        });
    }

    async openScrivenings(folder: TFolder) {
        // Open a new leaf
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_SCRIVENINGS,
            active: true
        });
        
        // Pass the folder data to the view
        if (leaf.view instanceof ScriveningsView) {
            await leaf.view.setFolder(folder);
        }
    }
}