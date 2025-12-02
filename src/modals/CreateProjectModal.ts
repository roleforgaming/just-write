import { App, Modal, Setting, TFolder, Notice } from 'obsidian';
import { ProjectManager } from '../utils/projectManager';
import NovelistPlugin from '../main';
import { ProjectTemplate } from '../settings';

export class CreateProjectModal extends Modal {
    plugin: NovelistPlugin;
    projectName: string = '';
    selectedTemplate: ProjectTemplate;
    projectManager: ProjectManager;
    onSubmit: (folder: TFolder) => void;

    constructor(app: App, plugin: NovelistPlugin, onSubmit: (folder: TFolder) => void) {
        super(app);
        this.plugin = plugin;
        this.projectManager = new ProjectManager(app);
        this.onSubmit = onSubmit;
        
        // Default to the first available template or a fallback
        this.selectedTemplate = this.plugin.settings.projectTemplates[0] || { name: 'Empty', structure: '' };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Create New Novelist Project' });

        // 1. Project Name Input
        new Setting(contentEl)
            .setName('Project Name')
            .setDesc('This will create a new folder structure for your novel.')
            .addText((text) =>
                text
                    .setPlaceholder('My Awesome Novel')
                    .onChange((value) => {
                        this.projectName = value;
                    })
            );

        // 2. Template Selection Dropdown
        new Setting(contentEl)
            .setName('Project Template')
            .setDesc('Select the folder structure for this project.')
            .addDropdown((dropdown) => {
                // Populate options from settings
                this.plugin.settings.projectTemplates.forEach((t) => {
                    dropdown.addOption(t.name, t.name);
                });

                // Set initial value
                if (this.selectedTemplate) {
                    dropdown.setValue(this.selectedTemplate.name);
                }

                dropdown.onChange((value) => {
                    const found = this.plugin.settings.projectTemplates.find(t => t.name === value);
                    if (found) {
                        this.selectedTemplate = found;
                    }
                });
            });

        // 3. Create Button
        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText('Create Project')
                .setCta()
                .onClick(async () => {
                    if (!this.projectName || this.projectName.trim() === '') {
                        new Notice('Please enter a project name.');
                        return;
                    }
                    
                    this.close();
                    
                    const folder = await this.projectManager.createProject(
                        this.projectName, 
                        this.selectedTemplate.structure
                    );
                    
                    if (folder) this.onSubmit(folder);
                })
        );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}