import { WorkspaceLeaf, TFile, OpenViewState, App, Notice } from 'obsidian';
import NovelistPlugin from '../main';

export class LockManager {
    private app: App;
    private plugin: NovelistPlugin;
    private lockedLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();
    private originalOpenFile: (file: TFile, openState?: OpenViewState) => Promise<void>;

    constructor(app: App, plugin: NovelistPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    load() {
        // 1. Save original method
        this.originalOpenFile = WorkspaceLeaf.prototype.openFile;
        const self = this;

        // 2. Monkey-patch WorkspaceLeaf.openFile
        // @ts-ignore - Overriding private/protected method logic
        WorkspaceLeaf.prototype.openFile = async function(file: TFile, openState?: OpenViewState) {
            const leaf = this as WorkspaceLeaf;

            // Check if this leaf is locked
            if (self.isLocked(leaf)) {
                // If locked, create a NEW leaf (tab) and open the file there instead
                const newLeaf = self.app.workspace.getLeaf('tab');
                // Call the ORIGINAL openFile on the NEW leaf
                return self.originalOpenFile.call(newLeaf, file, openState);
            }

            // If not locked, proceed as normal
            return self.originalOpenFile.call(leaf, file, openState);
        };
        
        console.log("Novelist: Editor Lock initialized.");
    }

    unload() {
        // Restore original method when plugin disables
        if (this.originalOpenFile) {
            WorkspaceLeaf.prototype.openFile = this.originalOpenFile;
        }
    }

    /**
     * Toggles the lock state of a specific leaf.
     * Adds/Removes a CSS class for visual indication.
     */
    toggleLock(leaf: WorkspaceLeaf) {
        if (this.lockedLeaves.has(leaf)) {
            this.lockedLeaves.delete(leaf);
            this.updateVisuals(leaf, false);
            new Notice("Pane Unlocked");
        } else {
            this.lockedLeaves.add(leaf);
            this.updateVisuals(leaf, true);
            new Notice("Pane Locked: New files will open in a new tab.");
        }
    }

    isLocked(leaf: WorkspaceLeaf): boolean {
        return this.lockedLeaves.has(leaf);
    }

    private updateVisuals(leaf: WorkspaceLeaf, isLocked: boolean) {
        // We add a class to the leaf's container for styling
        const container = leaf.view.containerEl.parentElement; // usually .workspace-leaf
        if (container) {
            if (isLocked) {
                container.addClass('novelist-is-locked');
                // Optional: Add an icon to the header if you want to manipulate DOM directly
                // or rely on CSS ::after elements
            } else {
                container.removeClass('novelist-is-locked');
            }
        }
    }
}