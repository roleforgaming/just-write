import { Plugin, WorkspaceLeaf, TFolder, TFile, MarkdownView, Notice } from 'obsidian';
import { InspectorView, VIEW_TYPE_INSPECTOR } from './views/InspectorView';
import { CorkboardView, VIEW_TYPE_CORKBOARD } from './views/CorkboardView';
import { ScriveningsView, VIEW_TYPE_SCRIVENINGS } from './views/ScriveningsView';
import { OutlinerView, VIEW_TYPE_OUTLINER } from './views/OutlinerView';
import { BinderView, VIEW_TYPE_BINDER } from './views/BinderView';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './views/DashboardView';
import { StatisticsView, VIEW_TYPE_STATISTICS } from './views/StatisticsView';
import { CreateProjectModal } from './modals/CreateProjectModal';
import { ProjectManager } from './utils/projectManager';
import { SessionManager } from './utils/sessionManager'; 
import { SnapshotManager } from './utils/snapshotManager';
import { Logger } from './utils/logger';
import { NovelistSettingTab, NovelistSettings, DEFAULT_SETTINGS } from './settings';
import { AutoSnapshotManager } from './features/snapshots/autoSnapshotManager';

export default class NovelistPlugin extends Plugin {
    settings: NovelistSettings;
    sessionManager: SessionManager;
    snapshotManager: SnapshotManager;
    autoSnapshotManager: AutoSnapshotManager;
    logger: Logger;
    statusBarItem: HTMLElement;

    async onload() {
        await this.loadSettings();

        // Initialize Managers
        this.logger = new Logger(this);
        
        this.snapshotManager = new SnapshotManager(this.app, this, () => ({
            enabled: this.settings.enablePruning,
            rules: this.settings.pruningSettings
        }));

        this.sessionManager = new SessionManager(this.app, this);
        const projectManager = new ProjectManager(this.app, this);
        
        // Initialize Automation
        this.autoSnapshotManager = new AutoSnapshotManager(this, this.snapshotManager, this.settings, this.logger);
        this.autoSnapshotManager.load();

        // --- 1. Register Views ---
        this.registerView(VIEW_TYPE_INSPECTOR, (leaf) => new InspectorView(leaf, this));
        this.registerView(VIEW_TYPE_CORKBOARD, (leaf) => new CorkboardView(leaf, this));
        this.registerView(VIEW_TYPE_SCRIVENINGS, (leaf) => new ScriveningsView(leaf));
        this.registerView(VIEW_TYPE_OUTLINER, (leaf) => new OutlinerView(leaf));
        this.registerView(VIEW_TYPE_BINDER, (leaf) => new BinderView(leaf, this));
        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
        this.registerView(VIEW_TYPE_STATISTICS, (leaf) => new StatisticsView(leaf));

        // --- 2. Ribbon Icons ---
        this.addRibbonIcon('book', 'Open Binder', () => {
            this.activateBinder();
        });

        this.addRibbonIcon('layout-dashboard', 'Open Project Dashboard', () => {
            this.activateDashboard();
        });

        // --- 3. Settings Tab ---
        this.addSettingTab(new NovelistSettingTab(this.app, this));

        // --- 4. Commands ---
        this.addCommand({
            id: 'create-novelist-project',
            name: 'Create New Novelist Project',
            callback: () => {
                new CreateProjectModal(this.app, this, async (projectFolder) => {
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

        this.addCommand({
            id: 'open-novelist-statistics',
            name: 'Open Project Statistics',
            callback: () => this.activateStatistics(),
        });

        this.addCommand({
            id: 'novelist-prune-snapshots',
            name: 'Prune snapshots for the current file',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (file && file instanceof TFile && file.extension === 'md') {
                    if (!checking) {
                        this.handlePruneCommand(file);
                    }
                    return true;
                }
                return false;
            }
        });

        // --- 5. Context Menus ---
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item.setTitle("Open as Corkboard").setIcon("layout-grid").onClick(async () => await this.openCorkboard(file));
                    });
                    menu.addItem((item) => {
                        item.setTitle("Open as Scrivenings").setIcon("scroll-text").onClick(async () => await this.openScrivenings(file));
                    });
                    menu.addItem((item) => {
                        item.setTitle("Open as Outliner").setIcon("list-tree").onClick(async () => await this.openOutliner(file));
                    });
                    
                    if (projectManager.isProject(file)) {
                        menu.addItem((item) => {
                            item.setTitle("View Statistics").setIcon("bar-chart").onClick(async () => await this.openStatistics(file));
                        });
                    }
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                this.snapshotManager.handleFileRename(file, oldPath);
            })
        );

        // --- 6. Read-Only Enforcement (Trash) ---
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
                
                if (file) {
                    this.sessionManager.onFileOpen(file);
                    const project = projectManager.getProjectForFile(file);
                    this.sessionManager.updateTarget(project);
                    this.updateStatusBar();
                } else {
                    this.statusBarItem.hide();
                }
            })
        );

        // --- 7. Session Tracking (Status Bar) ---
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('novelist-status-bar');
        this.updateStatusBar();

        let editorChangeTimeout: NodeJS.Timeout;
        
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, info) => {
                if (editorChangeTimeout) clearTimeout(editorChangeTimeout);
                
                editorChangeTimeout = setTimeout(() => {
                    const file = info.file;
                    if (!file || file.extension !== 'md') return;

                    const project = projectManager.getProjectForFile(file);
                    if (!project) return;

                    const content = editor.getValue();
                    this.sessionManager.updateSessionCount(file, content);
                    this.updateStatusBar();
                    
                }, 1000);
            })
        );

        // --- 8. Startup Behavior ---
        this.app.workspace.onLayoutReady(() => {
            this.handleStartupBehavior();
        });
    }

    updateStatusBar() {
        const file = this.app.workspace.getActiveFile();
        const pm = new ProjectManager(this.app, this);
        const project = file ? pm.getProjectForFile(file) : null;

        if (!project) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.show();
        const { current, target, percent } = this.sessionManager.getSessionProgress();
        
        let text = `${current} words today`;
        if (target > 0) {
            text += ` / ${target} (${percent}%)`;
        }
        
        this.statusBarItem.setText(text);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async handlePruneCommand(file: TFile) {
        if (!this.settings.enablePruning) {
            new Notice("Snapshot pruning is disabled in Novelist settings.");
            return;
        }

        new Notice(`Novelist: Pruning snapshots for ${file.basename}...`);

        try {
            const pruningRules = this.settings.pruningSettings;
            const deletedCount = await this.snapshotManager.pruneSnapshots(file, pruningRules);
            
            if (deletedCount > 0) {
                new Notice(`Pruning complete. Removed ${deletedCount} snapshot(s).`);
            } else {
                new Notice(`Pruning complete. No snapshots were removed.`);
            }

            this.app.workspace.trigger('novelist-ui-refresh');

        } catch (error) {
            console.error("Novelist: Failed to run prune command:", error);
            new Notice("Error occurred during snapshot pruning. See console for details.");
        }
    }

    async onunload() {
        if (this.autoSnapshotManager) {
            this.autoSnapshotManager.unload();
        }

        this.app.workspace.detachLeavesOfType(VIEW_TYPE_INSPECTOR);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CORKBOARD);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCRIVENINGS);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_OUTLINER);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_BINDER);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_STATISTICS);
    }

    async handleStartupBehavior() {
        const behavior = this.settings.startupBehavior;
        if (behavior === 'none') return;

        if (behavior === 'binder' || behavior === 'both') {
            await this.activateBinder();
        }

        if (behavior === 'dashboard' || behavior === 'both') {
            await this.activateDashboard();
        }
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
            leaf = workspace.getLeaf('tab'); 
            await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
        }
        
        if (leaf) workspace.revealLeaf(leaf);
    }

    async activateStatistics() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_STATISTICS);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE_STATISTICS, active: true });
        }
        
        if (leaf) workspace.revealLeaf(leaf);
    }

    async openCorkboard(folder: TFolder) {
        const corkboardLeaf = this.app.workspace.getLeaf('tab');
        
        await corkboardLeaf.setViewState({
            type: VIEW_TYPE_CORKBOARD,
            active: true,
            state: { folderPath: folder.path }
        });

        if (this.settings.corkboardAutoSplit) {
            const partnerLeaf = this.app.workspace.createLeafBySplit(corkboardLeaf, 'vertical');
            
            const view = corkboardLeaf.view;
            if (view instanceof CorkboardView) {
                view.setPartnerLeaf(partnerLeaf);
            }
        }
        
        this.app.workspace.revealLeaf(corkboardLeaf);
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
    
    async openOutliner(folder: TFolder) {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_OUTLINER,
            active: true,
            state: { folderPath: folder.path }
        });
    }

    async openStatistics(folder: TFolder) {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_STATISTICS,
            active: true,
            state: { folderPath: folder.path }
        });
    }
}