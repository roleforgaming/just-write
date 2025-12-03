// src/modals/SnapshotCompareModal.ts

import { App, Modal, TFile, ButtonComponent } from 'obsidian';
// FIX: Import the entire module as 'dmp'.
import * as dmp from 'diff-match-patch';

// New robust way to access the class constructor:
// 1. Check if the module directly exports the class constructor (common for legacy modules).
// 2. Check the default export (common in esbuild for UMD/CommonJS modules).
// 3. Fallback to the global window object.
const Diff_Match_Patch = (dmp as any).Diff_Match_Patch || (dmp as any).default || (window as any).Diff_Match_Patch; 

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;


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
        header.createSpan({ text: `Current Version vs Snapshot (${this.snapshotDate})`, cls: 'compare-label' });
        
        const diffContainer = contentEl.createDiv({ cls: 'diff-container' });

        // --- Visual Diffing with Diff-Match-Patch ---
        // Ensure the class is available
        if (!Diff_Match_Patch) {
            diffContainer.createEl('p', { text: 'Error: Diff library failed to load.', cls: 'text-error' });
            console.error('Diff_Match_Patch class not found on import or window.');
            return;
        }

        const dmpInstance = new Diff_Match_Patch();
        
        // diff_main(text1, text2) -> calculates diff to transform text1 into text2
        const diffs = dmpInstance.diff_main(this.snapshotContent, this.currentContent);
        dmpInstance.diff_cleanupSemantic(diffs);

        const fragment = document.createDocumentFragment();

        // FIX: Use array destructuring in the loop signature to correctly infer types
        for (const part of diffs as [number, string][]) {
            const [type, text] = part;
            let span: HTMLElement;

            switch (type) {
                case DIFF_INSERT: // Added in Current
                    span = fragment.createEl('ins', { text });
                    span.style.backgroundColor = 'rgba(var(--color-green-rgb), 0.25)';
                    span.style.textDecoration = 'none';
                    span.style.color = 'var(--text-normal)';
                    break;
                case DIFF_DELETE: // Removed in Current (Existed in Snapshot)
                    span = fragment.createEl('del', { text });
                    span.style.backgroundColor = 'rgba(var(--color-red-rgb), 0.25)';
                    span.style.color = 'var(--text-muted)';
                    break;
                case DIFF_EQUAL: // Unchanged
                    span = fragment.createSpan({ text });
                    break;
            }
        }

        diffContainer.appendChild(fragment);

        const footer = contentEl.createDiv({ cls: 'compare-footer' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}