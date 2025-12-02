import { App, Modal, Setting, TFolder, AbstractInputSuggest, TFile } from 'obsidian';
import { ProjectManager } from '../utils/projectManager';
import { DocumentTemplate, FolderMapping } from '../settings'; 

// --- File Suggest Utility ---
class FileSuggest extends AbstractInputSuggest<TFile> {
    inputEl: HTMLInputElement;
    onSelectCallback: (file: TFile) => void;

    constructor(app: App, textInputEl: HTMLInputElement, onSelect: (file: TFile) => void) {
        super(app, textInputEl);
        this.inputEl = textInputEl;
        this.onSelectCallback = onSelect;
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => 
            file.path.toLowerCase().contains(query.toLowerCase())
        ).slice(0, 20);
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.setText(file.path);
    }

    selectSuggestion(file: TFile) {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
        this.onSelectCallback(file);
    }
}

export class ProjectSettingsModal extends Modal {
    project: TFolder;
    projectManager: ProjectManager;
    
    // Form State
    newName: string;
    description: string;
    tags: string; 
    
    // Templates State
    templates: DocumentTemplate[] = [];
    mappings: FolderMapping[] = [];
    
    constructor(app: App, project: TFolder) {
        super(app);
        this.project = project;
        this.projectManager = new ProjectManager(app);
        
        const meta = this.projectManager.getProjectMetadata(project);
        this.newName = project.name;
        this.description = meta?.description || "";
        this.tags = (meta?.tags || []).join(', ');
        
        this.templates = meta?.templates || [];
        this.mappings = meta?.mappings || [];
    }

    onOpen() {
        this.render();
    }

    // Helper: Recursively get all subfolders in the project
    getAllProjectFolders(parent: TFolder): TFolder[] {
        let folders: TFolder[] = [];
        
        for (const child of parent.children) {
            if (child instanceof TFolder) {
                // Optional: Skip Trash folder to keep list clean
                if (child.name === 'Trash') continue;

                folders.push(child);
                folders = folders.concat(this.getAllProjectFolders(child));
            }
        }
        return folders;
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: `Settings: ${this.newName}` });

        // --- SECTION 1: GENERAL ---
        contentEl.createEl('h3', { text: 'General' });

        new Setting(contentEl)
            .setName('Project Name')
            .addText(text => text
                .setValue(this.newName)
                .onChange(val => this.newName = val)
            );

        new Setting(contentEl)
            .setName('Description')
            .addTextArea(text => text
                .setValue(this.description)
                .setPlaceholder("Brief summary...")
                .onChange(val => this.description = val)
            );
        
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma separated')
            .addText(text => text
                .setValue(this.tags)
                .setPlaceholder("fiction, horror, 2024")
                .onChange(val => this.tags = val)
            );

        // --- SECTION 2: DOCUMENT TEMPLATES ---
        contentEl.createEl('h3', { text: 'Document Templates' });
        contentEl.createEl('p', { text: 'Define templates that point to markdown files in your vault.', cls: 'setting-item-description' });

        const templatesDiv = contentEl.createDiv();
        
        this.templates.forEach((template, index) => {
            const div = templatesDiv.createDiv({ cls: 'novelist-setting-item-box' });
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '10px';
            div.style.marginBottom = '10px';

            const nameInput = div.createEl('input', { type: 'text', placeholder: 'Template Name' });
            nameInput.value = template.name;
            nameInput.onchange = () => { this.templates[index].name = nameInput.value; };

            const pathInput = div.createEl('input', { type: 'text', placeholder: 'Path to .md file' });
            pathInput.value = template.path;
            
            new FileSuggest(this.app, pathInput, (file) => {
                this.templates[index].path = file.path;
            });
            pathInput.onchange = () => { this.templates[index].path = pathInput.value; };

            const delBtn = div.createEl('button', { text: 'Delete' });
            delBtn.onclick = () => {
                this.templates.splice(index, 1);
                this.render(); 
            };
        });

        new Setting(templatesDiv)
            .addButton(btn => btn
                .setButtonText('Add Template')
                .onClick(() => {
                    this.templates.push({ name: '', path: '' });
                    this.render();
                }));

        // --- SECTION 3: FOLDER MAPPINGS ---
        contentEl.createEl('h3', { text: 'Folder Mappings' });
        contentEl.createEl('p', { text: 'Automatically use a template when creating files in specific folders.', cls: 'setting-item-description' });

        const mappingsDiv = contentEl.createDiv();
        
        // Fetch folders once to populate dropdowns
        const availableFolders = this.getAllProjectFolders(this.project);

        this.mappings.forEach((mapping, index) => {
            const div = mappingsDiv.createDiv({ cls: 'novelist-setting-item-box' });
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '10px';
            div.style.marginBottom = '10px';

            div.createSpan({ text: 'In folder:' });
            
            // --- FOLDER DROPDOWN ---
            const folderSelect = div.createEl('select');
            
            // Add a placeholder option if currently empty
            if (!mapping.folderName) {
                folderSelect.createEl('option', { text: 'Select a Folder...', value: '' });
            }

            availableFolders.forEach(folder => {
                // We show the relative path for clarity, but store the Name 
                // (matching ProjectManager logic)
                const relativePath = folder.path.replace(this.project.path + '/', '');
                const option = folderSelect.createEl('option', { 
                    text: relativePath, 
                    value: folder.name 
                });
                
                if (folder.name === mapping.folderName) {
                    option.selected = true;
                }
            });

            folderSelect.onchange = () => { 
                this.mappings[index].folderName = folderSelect.value; 
            };

            div.createSpan({ text: 'use template:' });
            
            // --- TEMPLATE DROPDOWN ---
            const templateSelect = div.createEl('select');
            
            if (!mapping.templateName && this.templates.length > 0) {
                 templateSelect.createEl('option', { text: 'Select Template...', value: '' });
            }

            this.templates.forEach(t => {
                const opt = templateSelect.createEl('option', { text: t.name, value: t.name });
                if (t.name === mapping.templateName) opt.selected = true;
            });
            
            templateSelect.onchange = () => { 
                this.mappings[index].templateName = templateSelect.value; 
            };

            const delBtn = div.createEl('button', { text: 'Delete' });
            delBtn.onclick = () => {
                this.mappings.splice(index, 1);
                this.render();
            };
        });

        new Setting(mappingsDiv)
            .addButton(btn => btn
                .setButtonText('Add Mapping')
                .onClick(() => {
                    this.mappings.push({ folderName: '', templateName: '' });
                    this.render();
                }));

        // --- SAVE BUTTON ---
        const footer = contentEl.createDiv();
        footer.style.marginTop = '20px';
        footer.style.borderTop = '1px solid var(--background-modifier-border)';
        footer.style.paddingTop = '10px';

        new Setting(footer)
            .addButton(btn => btn
                .setButtonText('Save Changes')
                .setCta()
                .onClick(async () => {
                    const tagArray = this.tags.split(',').map(t => t.trim()).filter(t => t !== "");
                    
                    await this.projectManager.updateProjectMetadata(this.project, {
                        description: this.description,
                        tags: tagArray,
                        templates: this.templates,
                        mappings: this.mappings
                    });

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