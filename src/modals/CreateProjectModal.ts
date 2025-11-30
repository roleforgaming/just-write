// src/modals/CreateProjectModal.ts
import { App, Modal, Setting, TFolder } from 'obsidian';
import { ProjectManager } from '../utils/projectManager';

export class CreateProjectModal extends Modal {
    projectName: string = '';
    projectManager: ProjectManager;
    onSubmit: (folder: TFolder) => void;

    constructor(app: App, onSubmit: (folder: TFolder) => void) {
        super(app);
        this.projectManager = new ProjectManager(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Create New Novelist Project' });

        new Setting(contentEl)
            .setName('Project Name')
            .setDesc('This will create a new folder structure for your novel.')
            .addText((text) =>
                text.onChange((value) => {
                    this.projectName = value;
                })
            );

        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText('Create Project')
                .setCta()
                .onClick(async () => {
                    if (!this.projectName) return;
                    this.close();
                    const folder = await this.projectManager.createProject(this.projectName);
                    if (folder) this.onSubmit(folder);
                })
        );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}