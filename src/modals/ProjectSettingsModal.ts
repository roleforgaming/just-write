import { App, Modal, Setting, TFolder } from 'obsidian';
import { ProjectManager } from '../utils/projectManager';

export class ProjectSettingsModal extends Modal {
    project: TFolder;
    projectManager: ProjectManager;
    
    // Form State
    newName: string;
    description: string;
    tags: string; // Comma separated string for input
    
    constructor(app: App, project: TFolder) {
        super(app);
        this.project = project;
        this.projectManager = new ProjectManager(app);
        
        const meta = this.projectManager.getProjectMetadata(project);
        this.newName = project.name;
        this.description = meta?.description || "";
        this.tags = (meta?.tags || []).join(', ');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `Settings: ${this.project.name}` });

        // 1. Rename
        new Setting(contentEl)
            .setName('Project Name')
            .addText(text => text
                .setValue(this.newName)
                .onChange(val => this.newName = val)
            );

        // 2. Description
        new Setting(contentEl)
            .setName('Description')
            .addTextArea(text => text
                .setValue(this.description)
                .setPlaceholder("Brief summary...")
                .onChange(val => this.description = val)
            );
        
        // 3. Tags
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma separated')
            .addText(text => text
                .setValue(this.tags)
                .setPlaceholder("fiction, horror, 2024")
                .onChange(val => this.tags = val)
            );

        // Save Button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Save Changes')
                .setCta()
                .onClick(async () => {
                    // Process Tags
                    const tagArray = this.tags.split(',').map(t => t.trim()).filter(t => t !== "");
                    
                    // Update Metadata
                    await this.projectManager.updateProjectMetadata(this.project, {
                        description: this.description,
                        tags: tagArray
                    });

                    // Update Name if changed
                    if (this.newName !== this.project.name) {
                        await this.projectManager.renameProject(this.project, this.newName);
                    }

                    this.close();
                })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}