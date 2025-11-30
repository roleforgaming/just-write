import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
    title: string;
    message: string;
    onConfirm: () => void;

    constructor(app: App, title: string, message: string, onConfirm: () => void) {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        new Setting(buttonContainer)
            .addButton((btn) =>
                btn
                    .setButtonText('Cancel')
                    .onClick(() => this.close())
            )
            .addButton((btn) =>
                btn
                    .setButtonText('Confirm')
                    .setWarning() // Red button
                    .onClick(() => {
                        this.onConfirm();
                        this.close();
                    })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}