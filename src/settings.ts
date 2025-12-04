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

export interface PruningSettings {
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
}

export interface NovelistSettings {
    // 1. General & Startup
    startupBehavior: 'none' | 'dashboard' | 'binder' | 'both';

    // 2. Project Templates
    projectTemplates: ProjectTemplate[];

    // 3. Binder
    binderShowRank: boolean;
    binderSortOrder: string[];
    binderDragSensitivity: number;

    // 4. Corkboard
    corkboardAutoSplit: boolean;
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
    
    // 9. Writing Targets
    globalDailyTarget: number;
    
    // 10. Statistics
    statsSubtractOnDelete: boolean;

    // 11. Snapshots
    autoSnapshotOnSessionStart: boolean;
    autoSnapshotOnSessionEnd: boolean;
    enableDailyAutoSnapshot: boolean;
    dailyAutoSnapshotTime: string; // HH:mm
    lastDailySnapshotDate: string; // YYYY-MM-DD (Persisted state)
    enablePruning: boolean;
    pruningSettings: PruningSettings;
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
    corkboardAutoSplit: true,
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
    // Snapshots Defaults
    autoSnapshotOnSessionStart: false,
    autoSnapshotOnSessionEnd: false,
    enableDailyAutoSnapshot: false,
    dailyAutoSnapshotTime: "12:00",
    lastDailySnapshotDate: "", // Default empty
    enablePruning: false,
    pruningSettings: {
        keepDaily: 7,
        keepWeekly: 4,
        keepMonthly: 12,
    },
};

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
        
        // --- CORKBOARD SETTINGS ---
        containerEl.createEl('h2', { text: 'Corkboard' });

        new Setting(containerEl)
            .setName('Automatic Split View')
            .setDesc('When opening a corkboard, automatically open a second pane to its right for viewing files.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.corkboardAutoSplit)
                .onChange(async (value) => {
                    this.plugin.settings.corkboardAutoSplit = value;
                    await this.plugin.saveSettings();
                }));

        // ... [Other sections omitted for brevity] ...

        // --- 11. Snapshots ---
        containerEl.createEl('h2', { text: 'Document Snapshots' });

        new Setting(containerEl)
            .setName('Auto-snapshot on Session Start')
            .setDesc('Create a snapshot of all currently open files when Obsidian starts.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSnapshotOnSessionStart)
                .onChange(async (value) => {
                    this.plugin.settings.autoSnapshotOnSessionStart = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Daily Auto-snapshot')
            .setDesc('Take a snapshot of every markdown file in the vault once a day.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDailyAutoSnapshot)
                .onChange(async (value) => {
                    this.plugin.settings.enableDailyAutoSnapshot = value;
                    await this.plugin.saveSettings();
                    // FIX: Immediately update timer state in manager
                    if (value) {
                        this.plugin.autoSnapshotManager.startDailyTimer();
                    } else {
                        this.plugin.autoSnapshotManager.stopDailyTimer();
                    }
                }));

        new Setting(containerEl)
            .setName('Daily Snapshot Time')
            .setDesc('Time to trigger the daily snapshot (HH:mm).')
            .addText(text => text
                .setPlaceholder('12:00')
                .setValue(this.plugin.settings.dailyAutoSnapshotTime)
                .onChange(async (value) => {
                    this.plugin.settings.dailyAutoSnapshotTime = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h4', { text: 'Snapshot Pruning' });
        
        new Setting(containerEl)
            .setName('Enable Pruning')
            .setDesc('Automatically delete old snapshots based on the rules below.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePruning)
                .onChange(async (value) => {
                    this.plugin.settings.enablePruning = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Keep All (Days)')
            .setDesc('Keep every snapshot made within this many days.')
            .addText(text => text
                .setValue(String(this.plugin.settings.pruningSettings.keepDaily))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.pruningSettings.keepDaily = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Keep Daily (Weeks)')
            .setDesc('For snapshots older than the "Keep All" limit, keep only one per day for this many weeks.')
            .addText(text => text
                .setValue(String(this.plugin.settings.pruningSettings.keepWeekly))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.pruningSettings.keepWeekly = num;
                        await this.plugin.saveSettings();
                    }
                }));
        
        new Setting(containerEl)
            .setName('Keep Weekly (Months)')
            .setDesc('For snapshots older than the "Keep Daily" limit, keep only one per week for this many months.')
            .addText(text => text
                .setValue(String(this.plugin.settings.pruningSettings.keepMonthly))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.pruningSettings.keepMonthly = num;
                        await this.plugin.saveSettings();
                    }
                }));
    }

    renderProjectTemplates(containerEl: HTMLElement) {
        // (Implementation remains unchanged)
        // ...
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