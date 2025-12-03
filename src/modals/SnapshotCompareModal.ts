import { App, Modal, TFile, ButtonComponent } from 'obsidian';
import { diffLines, Change } from 'diff'; 

export class SnapshotCompareModal extends Modal {
    private currentContent: string;
    private snapshotContent: string;
    private file: TFile;
    private snapshotDate: string;

    constructor(app: App, file: TFile, snapshotDate: string, currentContent: string, snapshotContent: string) {
        super(app);
        this.file = file;
        this.snapshotDate = snapshotDate;
        this.currentContent = currentContent;
        this.snapshotContent = snapshotContent;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('novelist-snapshot-compare-modal');
        contentEl.empty();
        
        contentEl.createEl('h2', { text: `Comparing: ${this.file.basename}` });
        
        const header = contentEl.createDiv({ cls: 'compare-header' });
        header.createSpan({ text: 'Left: Current Version', cls: 'compare-label' });
        header.createSpan({ text: `Right: Snapshot (${this.snapshotDate})`, cls: 'compare-label' });

        const diffContainer = contentEl.createDiv({ cls: 'diff-container' });

        // Calculate Diff
        const diff = diffLines(this.currentContent, this.snapshotContent);

        // We want to display a unified diff or side-by-side. 
        // For MVP, a unified view with color coding is often clearer for text.
        // Green = Added in Snapshot (meaning it was deleted in Current) -> Wait, logic depends on perspective.
        // Usually: Compare A (Current) to B (Snapshot).
        // Added in B = Exists in Snapshot but not Current (Deleted text).
        // Removed in B = Exists in Current but not Snapshot (New text).
        
        diff.forEach((part: Change) => {
            // Apply styles
            const color = part.added ? 'diff-green' : part.removed ? 'diff-red' : 'diff-neutral';
            const span = diffContainer.createEl('div', { cls: `diff-line ${color}` });
            
            // Handle prefix
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            span.setText(prefix + part.value);
        });

        const footer = contentEl.createDiv({ cls: 'compare-footer' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}