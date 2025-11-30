import { App, TFolder, TFile, Notice, TAbstractFile, normalizePath } from 'obsidian';
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
        let current: TFolder | null = file instanceof TFolder ? file : file.parent;

        while (current) {
            if (this.isProject(current)) {
                return current;
            }
            if (current.isRoot()) break;
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

    async createProject(projectName: string, parentPath: string = ""): Promise<TFolder | null> {
        const rootPath = parentPath ? normalizePath(`${parentPath}/${projectName}`) : projectName;
        
        try {
            const rootFolder = await this.app.vault.createFolder(rootPath);
            const frontmatter = `---
type: ${PROJECT_TYPE_KEY}
status: Planning
author: 
deadline: 
---
# ${projectName}
Project notes and synopsis go here.
`;
            await this.app.vault.create(`${rootPath}/${PROJECT_MARKER_FILE}`, frontmatter);
            await this.app.vault.createFolder(`${rootPath}/Manuscript`);
            await this.app.vault.createFolder(`${rootPath}/Research`);
            await this.app.vault.createFolder(`${rootPath}/Story Bible`);
            await this.app.vault.createFolder(`${rootPath}/Story Bible/Characters`);
            await this.app.vault.createFolder(`${rootPath}/Story Bible/Locations`);
            await this.app.vault.createFolder(`${rootPath}/Trash`);

            new Notice(`Project "${projectName}" created!`);
            return rootFolder;
        } catch (error) {
            new Notice(`Failed to create project: ${error.message}`);
            console.error(error);
            return null;
        }
    }

    getTrashFolder(projectRoot: TFolder): TFolder | null {
        return projectRoot.children.find(
            child => child instanceof TFolder && child.name === "Trash"
        ) as TFolder || null;
    }

    isInTrash(item: TAbstractFile): boolean {
        const project = this.getProjectForFile(item);
        if (!project) return false;
        
        const trash = this.getTrashFolder(project);
        if (!trash) return false;

        return item.path.startsWith(trash.path) && item.path !== trash.path;
    }

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

        if (item instanceof TFile && item.extension === 'md') {
            await this.app.fileManager.processFrontMatter(item, (fm) => {
                fm.originalPath = item.parent?.path;
            });
        }

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

    async restoreFromTrash(item: TAbstractFile) {
        const project = this.getProjectForFile(item);
        if (!project) return;

        let targetPath = project.path; 

        if (item instanceof TFile && item.extension === 'md') {
            const cache = this.app.metadataCache.getFileCache(item);
            if (cache?.frontmatter?.originalPath) {
                const originalFolder = this.app.vault.getAbstractFileByPath(cache.frontmatter.originalPath);
                if (originalFolder && originalFolder instanceof TFolder) {
                    targetPath = originalFolder.path;
                }
            }
            await this.app.fileManager.processFrontMatter(item, (fm) => {
                delete fm.originalPath;
            });
        }

        let newName = item.name;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(`${targetPath}/${newName}`)) {
             if (item instanceof TFile) {
                newName = `${item.basename} (${counter}).${item.extension}`;
            } else {
                newName = `${item.name} (${counter})`;
            }
            counter++;
        }

        await this.app.fileManager.renameFile(item, `${targetPath}/${newName}`);
        new Notice(`Restored "${item.name}"`);
    }

    // FIX: Updated logic to handle snapshots and folder resolution
    async emptyTrash(trashFolder: TFolder) {
        let target = trashFolder;
        
        // If passed folder isn't explicitly named Trash, try to find it (in case Root was passed)
        if (target.name !== 'Trash') {
            const found = this.getTrashFolder(target);
            if (found) target = found;
            else return; 
        }

        // Create snapshot of children to iterate safely while deleting
        const children = [...target.children]; 
        
        for (const child of children) {
            await this.app.vault.delete(child, true);
        }
        new Notice("Trash emptied.");
    }

    async permanentlyDelete(item: TAbstractFile) {
        await this.app.vault.delete(item, true);
        new Notice(`Deleted "${item.name}" permanently.`);
    }

    async createNewItem(parentFolder: TFolder, type: 'file' | 'folder', baseName = "Untitled") {
        let name = baseName;
        let counter = 1;
        const extension = type === 'file' ? '.md' : '';
        
        while (this.app.vault.getAbstractFileByPath(`${parentFolder.path}/${name}${extension}`)) {
            name = `${baseName} ${counter}`;
            counter++;
        }

        const fullPath = `${parentFolder.path}/${name}${extension}`;

        if (type === 'folder') {
            await this.app.vault.createFolder(fullPath);
        } else {
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