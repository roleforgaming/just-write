import { App, Modal, TFile, ButtonComponent } from 'obsidian';
import * as dmp from 'diff-match-patch';

const Diff_Match_Patch = (dmp as any).Diff_Match_Patch || (dmp as any).default || (window as any).Diff_Match_Patch; 

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

export class SnapshotCompareModal extends Modal {
    private currentContent: string;
    private snapshotContent: string;
    private file: TFile;
    private snapshotDate: string;
    private viewMode: 'unified' | 'split' = 'unified';
    private diffContainer: HTMLElement;

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

        // --- Header Section ---
        const headerContainer = contentEl.createDiv({ cls: 'compare-modal-top' });
        const titleEl = headerContainer.createEl('h2', { text: `Comparing: ${this.file.basename}` });
        titleEl.style.margin = '0';

        const toggleContainer = headerContainer.createDiv({ cls: 'view-mode-toggle' });
        const btnUnified = toggleContainer.createEl('button', { text: 'Unified', cls: 'view-toggle-btn' });
        const btnSplit = toggleContainer.createEl('button', { text: 'Side-by-Side', cls: 'view-toggle-btn' });

        // --- Content Section ---
        // FIX: Initialize diffContainer *before* it is used.
        this.diffContainer = contentEl.createDiv({ cls: 'diff-container-wrapper' });

        const updateToggleState = () => {
            if (this.viewMode === 'unified') {
                btnUnified.addClass('active');
                btnSplit.removeClass('active');
            } else {
                btnUnified.removeClass('active');
                btnSplit.addClass('active');
            }
            this.renderContent();
        };

        btnUnified.onclick = () => { this.viewMode = 'unified'; updateToggleState(); };
        btnSplit.onclick = () => { this.viewMode = 'split'; updateToggleState(); };
        
        // Initial render call
        updateToggleState();

        // --- Footer Section ---
        const footer = contentEl.createDiv({ cls: 'compare-footer' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    renderContent() {
        // Now 'this.diffContainer' will always be defined here.
        this.diffContainer.empty();
        
        if (!Diff_Match_Patch) {
            console.error('Diff Match Patch class not found on import or window.');
            this.diffContainer.createEl('p', { text: 'Error: Diff library failed to load.', cls: 'text-error' });
            return;
        }

        const dmpInstance = new Diff_Match_Patch();
        const diffs = dmpInstance.diff_main(this.snapshotContent, this.currentContent);
        dmpInstance.diff_cleanupSemantic(diffs);

        if (this.viewMode === 'unified') {
            this.renderUnified(diffs);
        } else {
            this.renderSplit(diffs);
        }
    }

    renderUnified(diffs: [number, string][]) {
        this.diffContainer.removeClass('is-split');
        this.diffContainer.addClass('is-unified');

        const container = this.diffContainer.createDiv({ cls: 'diff-content-unified' });
        const fragment = document.createDocumentFragment();

        diffs.forEach(([type, text]) => {
            switch (type) {
                case DIFF_INSERT:
                    const ins = fragment.createEl('ins', { text });
                    ins.style.backgroundColor = 'rgba(var(--color-green-rgb), 0.25)';
                    ins.style.textDecoration = 'none';
                    break;
                case DIFF_DELETE:
                    const del = fragment.createEl('del', { text });
                    del.style.backgroundColor = 'rgba(var(--color-red-rgb), 0.25)';
                    break;
                case DIFF_EQUAL:
                    fragment.createSpan({ text });
                    break;
            }
        });
        container.appendChild(fragment);
    }

    renderSplit(diffs: [number, string][]) {
        this.diffContainer.removeClass('is-unified');
        this.diffContainer.addClass('is-split');

        const leftPane = this.diffContainer.createDiv({ cls: 'diff-pane' });
        // FIX: Remove unused variable assignment
        leftPane.createDiv({ cls: 'diff-pane-header', text: `Snapshot (${this.snapshotDate})` });
        const leftContent = leftPane.createDiv({ cls: 'diff-pane-content' });

        const rightPane = this.diffContainer.createDiv({ cls: 'diff-pane' });
        // FIX: Remove unused variable assignment
        rightPane.createDiv({ cls: 'diff-pane-header', text: 'Current Version' });
        const rightContent = rightPane.createDiv({ cls: 'diff-pane-content' });

        const leftFrag = document.createDocumentFragment();
        const rightFrag = document.createDocumentFragment();

        diffs.forEach(([type, text]) => {
            if (type === DIFF_EQUAL) {
                leftFrag.createSpan({ text });
                rightFrag.createSpan({ text });
            } else if (type === DIFF_DELETE) {
                const span = leftFrag.createEl('span', { text });
                span.style.backgroundColor = 'rgba(var(--color-red-rgb), 0.25)';
            } else if (type === DIFF_INSERT) {
                const span = rightFrag.createEl('span', { text });
                span.style.backgroundColor = 'rgba(var(--color-green-rgb), 0.25)';
            }
        });

        leftContent.appendChild(leftFrag);
        rightContent.appendChild(rightFrag);
    }

    onClose() {
        this.contentEl.empty();
    }
}