import { App, PluginSettingTab, Setting } from 'obsidian';
import NovelistPlugin from './main';

// --- Interfaces ---

export interface ProjectTemplate {
    name: string;
    structure: string; // Newline separated paths
}

export interface DocumentTemplate {
    name: string;
    path: string;
}

export interface FolderMapping {
    folderName: string;
    templateName: string;
}

export interface NovelistSettings {
    // 1. General & Startup
    startupBehavior: 'none' | 'dashboard' | 'binder' | 'both';

    // 2. Project Templates (Global)
    projectTemplates: ProjectTemplate[];

    // 3. Binder
    binderShowRank: boolean;
    binderSortOrder: string[];
    binderDragSensitivity: number;

    // 4. Corkboard
    corkboardDefaultSize: 'small' | 'medium' | 'large';
    corkboardShowIcon: boolean;
    corkboardShowAccent: boolean;
    corkboardDoubleClickAction: 'current' | 'new-tab' | 'new-pane';

    // 5. Scrivenings
    scriveningsMaxWidth: number;
    scriveningsCenterAlign: boolean;
    scriveningsSeparatorStyle: 'dashed' | 'solid' | 'subtle' | 'none';
    scriveningsLivePreviewHeaders: boolean;
    scriveningsLivePreviewBlockquotes: boolean;
    scriveningsLivePreviewHR: boolean;
    scriveningsLivePreviewImages: boolean;

    // 6. Inspector
    inspectorStatusOptions: string[];
    inspectorLabelOptions: string[];
    inspectorDefaultTab: 'synopsis' | 'notes' | 'metadata' | 'snapshots';

    // 7. Dashboard
    dashboardDefaultView: 'grid' | 'list';
    dashboardDefaultSort: 'modified' | 'created' | 'name' | 'wordCount' | 'status';
    dashboardWordCountFolder: string;

    // 8. Advanced
    advancedAutoSaveDelay: number;
    advancedSearchDelay: number;
    advancedReorderCommand: string;
    
    // 9. Writing Targets (Global)
    globalDailyTarget: number;
    
    // 10. Statistics
    statsSubtractOnDelete: boolean;
}

export const DEFAULT_SETTINGS: NovelistSettings = {
    startupBehavior: 'none',
    projectTemplates: [
        { 
            name: 'Standard Novel', 
            structure: 'Manuscript\nResearch\nStory Bible\nStory Bible/Characters\nStory Bible/Locations\nTrash' 
        },
        { 
            name: 'Blank', 
            structure: 'Trash' 
        }
    ],
    binderShowRank: true,
    binderSortOrder: ['Manuscript', 'Research', 'Story Bible', 'Trash'],
    binderDragSensitivity: 8,
    corkboardDefaultSize: 'medium',
    corkboardShowIcon: true,
    corkboardShowAccent: true,
    corkboardDoubleClickAction: 'current',
    scriveningsMaxWidth: 800,
    scriveningsCenterAlign: true,
    scriveningsSeparatorStyle: 'dashed',
    scriveningsLivePreviewHeaders: true,
    scriveningsLivePreviewBlockquotes: true,
    scriveningsLivePreviewHR: true,
    scriveningsLivePreviewImages: true,
    inspectorStatusOptions: ['Draft', 'Revised', 'Final', 'Done'],
    inspectorLabelOptions: ['Chapter', 'Scene', 'Research', 'Idea', 'Character', 'Location'],
    inspectorDefaultTab: 'synopsis',
    dashboardDefaultView: 'grid',
    dashboardDefaultSort: 'modified',
    dashboardWordCountFolder: 'Manuscript',
    advancedAutoSaveDelay: 1000,
    advancedSearchDelay: 500,
    advancedReorderCommand: 'Custom File Explorer sorting: Enable and apply the custom sorting, (re)parsing the sorting configuration first. Sort-on.',
    globalDailyTarget: 500,
    statsSubtractOnDelete: true,
};

// --- Settings Tab ---

export class NovelistSettingTab extends PluginSettingTab {
    plugin: NovelistPlugin;

    constructor(app: App, plugin: NovelistPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Novelist Settings' });

        // --- 1. General & Startup ---
        new Setting(containerEl)
            .setName('Startup Behavior')
            .setDesc('Choose which Novelist views to open automatically when you start Obsidian.')
            .addDropdown(dropdown => dropdown
                .addOption('none', 'Nothing')
                .addOption('dashboard', 'Project Dashboard')
                .addOption('binder', 'Binder')
                .addOption('both', 'Project Dashboard and Binder')
                .setValue(this.plugin.settings.startupBehavior)
                .onChange(async (value: any) => {
                    this.plugin.settings.startupBehavior = value;
                    await this.plugin.saveSettings();
                }));
        
        containerEl.createEl('h2', { text: 'Writing Targets & Statistics' });

        new Setting(containerEl)
            .setName('Global Daily Word Count Target')
            .setDesc('Default session target if a specific project target is not set.')
            .addText(text => text
                .setValue(String(this.plugin.settings.globalDailyTarget))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 0) {
                        this.plugin.settings.globalDailyTarget = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Subtract Words on Deletion')
            .setDesc('If enabled, deleting words written TODAY reduces your session count. Deleting words written on previous days will NOT reduce your session count. If disabled, session count only goes up (Gross count).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.statsSubtractOnDelete)
                .onChange(async (value) => {
                    this.plugin.settings.statsSubtractOnDelete = value;
                    await this.plugin.saveSettings();
                }));

        // --- 2. Project Templates ---
        this.renderProjectTemplates(containerEl);

        // --- 3. Binder Customization ---
        containerEl.createEl('h2', { text: 'Binder' });

        new Setting(containerEl)
            .setName('Show Rank Badge')
            .setDesc('Display the rank frontmatter property as a small badge next to files.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.binderShowRank)
                .onChange(async (value) => {
                    this.plugin.settings.binderShowRank = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Special Folder Sort Order')
            .setDesc('Comma-separated list of folders to display at the top.')
            .addTextArea(text => text
                .setValue(this.plugin.settings.binderSortOrder.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.binderSortOrder = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Drag Sensitivity')
            .setDesc('Distance in pixels to initiate a drag.')
            .addSlider(slider => slider
                .setLimits(0, 20, 1)
                .setValue(this.plugin.settings.binderDragSensitivity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.binderDragSensitivity = value;
                    await this.plugin.saveSettings();
                }));

        // --- 4. Corkboard Customization ---
        containerEl.createEl('h2', { text: 'Corkboard' });

        new Setting(containerEl)
            .setName('Default Card Size')
            .addDropdown(dropdown => dropdown
                .addOption('small', 'Small')
                .addOption('medium', 'Medium')
                .addOption('large', 'Large')
                .setValue(this.plugin.settings.corkboardDefaultSize)
                .onChange(async (value: any) => {
                    this.plugin.settings.corkboardDefaultSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Card Icon')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.corkboardShowIcon)
                .onChange(async (value) => {
                    this.plugin.settings.corkboardShowIcon = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Card Accent Color Bar')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.corkboardShowAccent)
                .onChange(async (value) => {
                    this.plugin.settings.corkboardShowAccent = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Double-Click Action')
            .addDropdown(dropdown => dropdown
                .addOption('current', 'Open in current tab')
                .addOption('new-tab', 'Open in new tab')
                .addOption('new-pane', 'Open in new pane')
                .setValue(this.plugin.settings.corkboardDoubleClickAction)
                .onChange(async (value: any) => {
                    this.plugin.settings.corkboardDoubleClickAction = value;
                    await this.plugin.saveSettings();
                }));

        // --- 5. Scrivenings Customization ---
        containerEl.createEl('h2', { text: 'Scrivenings (Seamless Editor)' });

        new Setting(containerEl)
            .setName('Editor Max Width')
            .addSlider(slider => slider
                .setLimits(500, 1200, 50)
                .setValue(this.plugin.settings.scriveningsMaxWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.scriveningsMaxWidth = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Center-align Editor Content')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scriveningsCenterAlign)
                .onChange(async (value) => {
                    this.plugin.settings.scriveningsCenterAlign = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Separator Style')
            .addDropdown(dropdown => dropdown
                .addOption('dashed', 'Dashed Line')
                .addOption('solid', 'Solid Line')
                .addOption('subtle', 'Subtle Break')
                .addOption('none', 'None')
                .setValue(this.plugin.settings.scriveningsSeparatorStyle)
                .onChange(async (value: any) => {
                    this.plugin.settings.scriveningsSeparatorStyle = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h4', { text: 'Live Preview Rendering' });

        new Setting(containerEl)
            .setName('Render Headers')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scriveningsLivePreviewHeaders)
                .onChange(async (value) => {
                    this.plugin.settings.scriveningsLivePreviewHeaders = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Render Blockquotes')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scriveningsLivePreviewBlockquotes)
                .onChange(async (value) => {
                    this.plugin.settings.scriveningsLivePreviewBlockquotes = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('Render Horizontal Rules')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scriveningsLivePreviewHR)
                .onChange(async (value) => {
                    this.plugin.settings.scriveningsLivePreviewHR = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Render Images')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scriveningsLivePreviewImages)
                .onChange(async (value) => {
                    this.plugin.settings.scriveningsLivePreviewImages = value;
                    await this.plugin.saveSettings();
                }));

        // --- 6. Inspector & Metadata ---
        containerEl.createEl('h2', { text: 'Inspector' });

        new Setting(containerEl)
            .setName('Status Options')
            .setDesc('Comma-separated list of status options.')
            .addTextArea(text => text
                .setValue(this.plugin.settings.inspectorStatusOptions.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.inspectorStatusOptions = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Label Options')
            .setDesc('Comma-separated list of label options.')
            .addTextArea(text => text
                .setValue(this.plugin.settings.inspectorLabelOptions.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.inspectorLabelOptions = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Inspector Tab')
            .addDropdown(dropdown => dropdown
                .addOption('synopsis', 'Synopsis')
                .addOption('notes', 'Notes')
                .addOption('metadata', 'Metadata')
                .addOption('snapshots', 'Snapshots')
                .setValue(this.plugin.settings.inspectorDefaultTab)
                .onChange(async (value: any) => {
                    this.plugin.settings.inspectorDefaultTab = value;
                    await this.plugin.saveSettings();
                }));

        // --- 7. Dashboard Customization ---
        containerEl.createEl('h2', { text: 'Dashboard' });

        new Setting(containerEl)
            .setName('Default View Mode')
            .addDropdown(dropdown => dropdown
                .addOption('grid', 'Grid')
                .addOption('list', 'List')
                .setValue(this.plugin.settings.dashboardDefaultView)
                .onChange(async (value: any) => {
                    this.plugin.settings.dashboardDefaultView = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Sort By')
            .addDropdown(dropdown => dropdown
                .addOption('modified', 'Last Modified')
                .addOption('created', 'Date Created')
                .addOption('name', 'Name')
                .addOption('wordCount', 'Word Count')
                .addOption('status', 'Status')
                .setValue(this.plugin.settings.dashboardDefaultSort)
                .onChange(async (value: any) => {
                    this.plugin.settings.dashboardDefaultSort = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Word Count Folder')
            .setDesc('Folder name within projects to use for word counts.')
            .addText(text => text
                .setValue(this.plugin.settings.dashboardWordCountFolder)
                .onChange(async (value) => {
                    this.plugin.settings.dashboardWordCountFolder = value;
                    await this.plugin.saveSettings();
                }));

        // --- 8. Advanced Settings ---
        containerEl.createEl('h2', { text: 'Advanced' });

        new Setting(containerEl)
            .setName('Scrivenings Auto-Save Delay (ms)')
            .addText(text => text
                .setValue(String(this.plugin.settings.advancedAutoSaveDelay))
                .onChange(async (value) => {
                    const num = Number(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.advancedAutoSaveDelay = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Binder Content Search Delay (ms)')
            .addText(text => text
                .setValue(String(this.plugin.settings.advancedSearchDelay))
                .onChange(async (value) => {
                    const num = Number(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.advancedSearchDelay = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Reorder Command')
            .setDesc('Command to run after reordering items (e.g. for custom sort plugins).')
            .addText(text => text
                .setValue(this.plugin.settings.advancedReorderCommand)
                .onChange(async (value) => {
                    this.plugin.settings.advancedReorderCommand = value;
                    await this.plugin.saveSettings();
                }));
    }

    renderProjectTemplates(containerEl: HTMLElement) {
        containerEl.createEl('h2', { text: 'Project Templates' });
        
        this.plugin.settings.projectTemplates.forEach((template, index) => {
            const div = containerEl.createDiv({ cls: 'novelist-setting-item-box' });
            div.style.border = '1px solid var(--background-modifier-border)';
            div.style.padding = '10px';
            div.style.marginBottom = '10px';
            div.style.borderRadius = '4px';

            new Setting(div)
                .setName(`Template #${index + 1} Name`)
                .addText(text => text
                    .setValue(template.name)
                    .setPlaceholder('Template Name')
                    .onChange(async (value) => {
                        this.plugin.settings.projectTemplates[index].name = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(div)
                .setName('Folder Structure')
                .setDesc('One folder per line. Use "/" for subfolders.')
                .addTextArea(text => text
                    .setValue(template.structure)
                    .setPlaceholder('Folder/Path')
                    .onChange(async (value) => {
                        this.plugin.settings.projectTemplates[index].structure = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(div)
                .addButton(btn => btn
                    .setButtonText('Delete Template')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.projectTemplates.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add New Project Template')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.projectTemplates.push({ name: 'New Template', structure: '' });
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }
}