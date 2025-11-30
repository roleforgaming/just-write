// src/utils/projectManager.ts
import { App, TFolder, TFile, normalizePath, Notice, TAbstractFile } from 'obsidian';
import { getRank } from './metadata';

export const PROJECT_MARKER_FILE = 'project.md';
export const PROJECT_TYPE_KEY = 'novelist-project';

export class ProjectManager {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    isProject(folder: TFolder): boolean {
        const markerFile = folder.children.find(
            c => c.name === PROJECT_MARKER_FILE && c instanceof TFile
        ) as TFile;

        if (!markerFile) return false;

        const cache = this.app.metadataCache.getFileCache(markerFile);
        return cache?.frontmatter?.type === PROJECT_TYPE_KEY;
    }

    getProjectForFile(file: TAbstractFile): TFolder | null {
        let current: TAbstractFile | null = file.parent;
        // If file is already a root folder, check itself
        if (file instanceof TFolder && this.isProject(file)) return file;

        while (current && !current.isRoot()) {
            if (current instanceof TFolder && this.isProject(current)) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }

    getAllProjects(): TFolder[] {
        const projects: TFolder[] = [];
        const files = this.app.vault.getMarkdownFiles();
        
        files.forEach(file => {
            if (file.name === PROJECT_MARKER_FILE) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.type === PROJECT_TYPE_KEY && file.parent) {
                    projects.push(file.parent);
                }
            }
        });
        
        return projects;
    }

    // --- NEW METHODS ---

    /**
     * Finds the specific Trash folder for a given project
     */
    getTrashFolder(projectRoot: TFolder): TFolder | null {
        return projectRoot.children.find(
            child => child instanceof TFolder && child.name === "Trash"
        ) as TFolder || null;
    }

    /**
     * Safely moves an item to the project's trash folder
     */
    async moveToTrash(item: TAbstractFile, projectRoot: TFolder) {
        const trashFolder = this.getTrashFolder(projectRoot);
        if (!trashFolder) {
            new Notice("Project Trash folder not found.");
            return;
        }

        if (item.path === trashFolder.path) {
            new Notice("Cannot move Trash to Trash.");
            return;
        }

        // Generate unique name in trash
        let newName = item.name;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(`${trashFolder.path}/${newName}`)) {
            if (item instanceof TFile) {
                newName = `${item.basename} (${counter}).${item.extension}`;
            } else {
                newName = `${item.name} (${counter})`;
            }
            counter++;
        }

        await this.app.fileManager.renameFile(item, `${trashFolder.path}/${newName}`);
        new Notice(`Moved "${item.name}" to Project Trash.`);
    }

    /**
     * Creates a new item (file/folder) inside a target folder
     */
    async createNewItem(parentFolder: TFolder, type: 'file' | 'folder', baseName = "Untitled") {
        let name = baseName;
        let counter = 1;
        
        // Dedup name
        const extension = type === 'file' ? '.md' : '';
        while (this.app.vault.getAbstractFileByPath(`${parentFolder.path}/${name}${extension}`)) {
            name = `${baseName} ${counter}`;
            counter++;
        }

        const fullPath = `${parentFolder.path}/${name}${extension}`;

        if (type === 'folder') {
            await this.app.vault.createFolder(fullPath);
        } else {
            // Calculate rank for new file
            const siblings = parentFolder.children.filter(c => c instanceof TFile && c.extension === 'md');
            let maxRank = 0;
            siblings.forEach(s => {
                const r = getRank(this.app, s as TFile);
                if (r < 999999 && r > maxRank) maxRank = r;
            });

            const content = `---
rank: ${maxRank + 10}
status: Draft
label: Scene
synopsis: ""
notes: ""
---
`;
            await this.app.vault.create(fullPath, content);
        }
    }
}