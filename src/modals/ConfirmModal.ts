import { App, Modal, Setting } from 'obsidian';

export interface ModalButton {
    text: string;
    action: () => void;
    warning?: boolean;
    cta?: boolean;
}

export class ConfirmModal extends Modal {
    title: string;
    message: string;
    buttons: ModalButton[];

    constructor(app: App, title: string, message: string, buttons: ModalButton[]) {
        super(app);
        this.title = title;
        this.message = message;
        this.buttons = buttons;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        const setting = new Setting(buttonContainer);

        this.buttons.forEach(button => {
            setting.addButton(btn => {
                btn.setButtonText(button.text)
                   .onClick(() => {
                       this.close();
                       button.action();
                   });
                if (button.warning) btn.setWarning();
                if (button.cta) btn.setCta();
            });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}