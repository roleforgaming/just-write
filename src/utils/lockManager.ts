import { WorkspaceLeaf, TFile, OpenViewState, App, Notice, FileView, setIcon, MarkdownView } from 'obsidian';
import NovelistPlugin from '../main';

export class LockManager {
    private app: App;
    private plugin: NovelistPlugin;
    
    private leafHeaderIcons: WeakMap<WorkspaceLeaf, HTMLElement> = new WeakMap();
    private leafTabIcons: WeakMap<WorkspaceLeaf, HTMLElement> = new WeakMap();
    
    private originalOpenFile: (file: TFile, openState?: OpenViewState) => Promise<void>;

    constructor(app: App, plugin: NovelistPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    load() {
        this.originalOpenFile = WorkspaceLeaf.prototype.openFile;
        const self = this;
        // @ts-ignore
        WorkspaceLeaf.prototype.openFile = async function(file: TFile, openState?: OpenViewState) {
            const leaf = this as WorkspaceLeaf;
            if (self.isLocked(leaf)) {
                if (leaf.view instanceof FileView && leaf.view.file && leaf.view.file.path === file.path) {
                    return self.originalOpenFile.call(leaf, file, openState);
                }
                const newLeaf = self.app.workspace.createLeafBySplit(leaf, 'vertical');
                return self.originalOpenFile.call(newLeaf, file, openState);
            }
            return self.originalOpenFile.call(leaf, file, openState);
        };

        this.plugin.registerEvent(this.app.workspace.on('layout-change', () => this.addIconsToAllLeaves()));
        this.plugin.registerEvent(this.app.workspace.on('active-leaf-change', () => this.addIconsToAllLeaves()));

        this.app.workspace.onLayoutReady(() => this.addIconsToAllLeaves());
        
        console.log("Novelist: Persistent Editor Lock initialized.");
    }

    unload() {
        if (this.originalOpenFile) {
            WorkspaceLeaf.prototype.openFile = this.originalOpenFile;
        }
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            this.leafHeaderIcons.get(leaf)?.remove();
            this.leafTabIcons.get(leaf)?.remove();
            this.updateContainerClass(leaf, false);
        });
    }

    private addIconsToAllLeaves() {
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            if (leaf.view instanceof MarkdownView && !this.leafHeaderIcons.has(leaf)) {
                this.addIconToLeaf(leaf);
            }
            this.updateLeafVisuals(leaf);
        });
    }

    private addIconToLeaf(leaf: WorkspaceLeaf) {
        const viewActions = leaf.view.containerEl.querySelector('.view-actions');
        if (!viewActions) return;

        const lockIcon = viewActions.createDiv({
            cls: ['clickable-icon', 'view-action', 'novelist-lock-toggle-icon'],
        });
        lockIcon.onclick = () => this.toggleLock(leaf);
        this.leafHeaderIcons.set(leaf, lockIcon);
    }

    async toggleLock(leaf: WorkspaceLeaf) {
        const leafId = (leaf as any).id;
        const lockedIds = new Set(this.plugin.settings.lockedLeafIds);

        if (lockedIds.has(leafId)) {
            lockedIds.delete(leafId);
            new Notice("Pane Unlocked");
        } else {
            lockedIds.add(leafId);
            new Notice("Pane Locked");
        }

        this.plugin.settings.lockedLeafIds = Array.from(lockedIds);
        await this.plugin.saveSettings();
        this.updateLeafVisuals(leaf);
    }

    isLocked(leaf: WorkspaceLeaf): boolean {
        return this.plugin.settings.lockedLeafIds.includes((leaf as any).id);
    }

    private updateLeafVisuals(leaf: WorkspaceLeaf) {
        const isLocked = this.isLocked(leaf);
        this.updateHeaderIcon(leaf, isLocked);
        this.updateContainerClass(leaf, isLocked);
        this.updateTabIndicator(leaf, isLocked);
    }

    private updateHeaderIcon(leaf: WorkspaceLeaf, isLocked: boolean) {
        const iconEl = this.leafHeaderIcons.get(leaf);
        if (!iconEl) return;

        if (isLocked) {
            setIcon(iconEl, 'lock');
            iconEl.addClass('is-locked');
            iconEl.setAttribute('aria-label', 'Pane is Locked (Click to Unlock)');
        } else {
            setIcon(iconEl, 'unlock');
            iconEl.removeClass('is-locked');
            iconEl.setAttribute('aria-label', 'Lock Pane (Click to Lock)');
        }
    }

    private updateContainerClass(leaf: WorkspaceLeaf, isLocked: boolean) {
        const container = leaf.view.containerEl.parentElement; 
        if (container) {
            container.toggleClass('novelist-is-locked', isLocked);
        }
    }

    private updateTabIndicator(leaf: WorkspaceLeaf, isLocked: boolean) {
        // --- THIS IS THE FIX ---
        // Use the leaf's internal reference to its tab header element.
        // This is far more reliable than a global document query.
        const tabHeader = (leaf as any).tabHeaderEl as HTMLElement | undefined;
        if (!tabHeader) return;

        // The container for the title and file icon.
        const innerContainer = tabHeader.querySelector('.workspace-tab-header-inner');
        if (!innerContainer) return;
        
        let tabIcon = this.leafTabIcons.get(leaf);
        
        if (isLocked) {
            if (!tabIcon) {
                // Create the icon if it doesn't exist
                tabIcon = document.createElement('div');
                tabIcon.addClass('novelist-tab-lock-icon');
                setIcon(tabIcon, 'lock');
                // Prepend it so it appears before the file icon
                innerContainer.prepend(tabIcon);
                this.leafTabIcons.set(leaf, tabIcon);
            }
        } else {
            // If it's not locked, remove the icon and clean up the map
            if (tabIcon) {
                tabIcon.remove();
                this.leafTabIcons.delete(leaf);
            }
        }
    }
}