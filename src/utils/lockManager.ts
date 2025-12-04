import { WorkspaceLeaf, TFile, OpenViewState, App, Notice, FileView, setIcon, MarkdownView } from 'obsidian';
import NovelistPlugin from '../main';

export class LockManager {
    private app: App;
    private plugin: NovelistPlugin;
    
    // Tracks the lock state (true/false)
    private lockedLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();
    // Tracks the icon DOM element for each leaf so we can modify it
    private leafIcons: WeakMap<WorkspaceLeaf, HTMLElement> = new WeakMap();
    
    private originalOpenFile: (file: TFile, openState?: OpenViewState) => Promise<void>;

    constructor(app: App, plugin: NovelistPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    load() {
        // Monkey-patch remains the same, it handles the core lock *functionality*
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

        // This event fires whenever panes are created, split, or closed.
        // It's our hook to add/update icons.
        this.plugin.registerEvent(this.app.workspace.on('layout-change', () => this.addIconsToAllLeaves()));

        // Run once on load for any already-open leaves
        this.addIconsToAllLeaves();
        
        console.log("Novelist: Persistent Editor Lock initialized.");
    }

    unload() {
        if (this.originalOpenFile) {
            WorkspaceLeaf.prototype.openFile = this.originalOpenFile;
        }
        // Clean up all icons and classes on unload
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            if (this.leafIcons.has(leaf)) {
                this.leafIcons.get(leaf)?.remove();
            }
            this.updateContainerClass(leaf, false);
        });
    }

    /**
     * Iterates all markdown panes and ensures they have a lock icon.
     */
    private addIconsToAllLeaves() {
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            // Check if it's a markdown view and doesn't already have our icon
            if (leaf.view instanceof MarkdownView && !this.leafIcons.has(leaf)) {
                this.addIconToLeaf(leaf);
            }
        });
    }

    /**
     * Adds a single lock/unlock icon to a given leaf's header.
     */
    private addIconToLeaf(leaf: WorkspaceLeaf) {
        const viewActions = leaf.view.containerEl.querySelector('.view-actions');
        if (!viewActions) return;

        const lockIcon = viewActions.createDiv({
            cls: ['clickable-icon', 'view-action', 'novelist-lock-toggle-icon'],
        });

        // The icon itself handles toggling the lock
        lockIcon.onclick = () => this.toggleLock(leaf);
        
        this.leafIcons.set(leaf, lockIcon);

        // Set the correct initial appearance (locked or unlocked)
        this.updateIconAppearance(leaf);
    }

    /**
     * The main function to toggle a pane's lock state.
     */
    toggleLock(leaf: WorkspaceLeaf) {
        if (this.isLocked(leaf)) {
            this.lockedLeaves.delete(leaf);
            new Notice("Pane Unlocked");
        } else {
            this.lockedLeaves.add(leaf);
            new Notice("Pane Locked");
        }
        // After changing state, update all visuals
        this.updateContainerClass(leaf, this.isLocked(leaf));
        this.updateIconAppearance(leaf);
    }

    isLocked(leaf: WorkspaceLeaf): boolean {
        return this.lockedLeaves.has(leaf);
    }

    /**
     * Updates the icon's SVG and CSS class based on the lock state.
     */
    private updateIconAppearance(leaf: WorkspaceLeaf) {
        const iconEl = this.leafIcons.get(leaf);
        if (!iconEl) return;

        if (this.isLocked(leaf)) {
            setIcon(iconEl, 'lock');
            iconEl.addClass('is-locked');
            iconEl.setAttribute('aria-label', 'Pane is Locked (Click to Unlock)');
        } else {
            setIcon(iconEl, 'unlock');
            iconEl.removeClass('is-locked');
            iconEl.setAttribute('aria-label', 'Lock Pane (Click to Lock)');
        }
    }

    /**
     * Updates the border on the leaf's container.
     */
    private updateContainerClass(leaf: WorkspaceLeaf, isLocked: boolean) {
        const container = leaf.view.containerEl.parentElement; 
        if (container) {
            if (isLocked) container.addClass('novelist-is-locked');
            else container.removeClass('novelist-is-locked');
        }
    }
}