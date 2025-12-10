import { App, TFolder, TFile, Notice, TAbstractFile, normalizePath } from 'obsidian';
import { getRank } from './metadata';
import { DocumentTemplate, FolderMapping } from '../settings';
import NovelistPlugin from '../main';

export const PROJECT_MARKER_FILE = 'project.md';
export const PROJECT_TYPE_KEY = 'novelist-project';
export const FOLDER_NOTE_NAME = 'index.md';

export class ProjectManager {
    app: App;
    plugin?: NovelistPlugin;

    constructor(app: App, plugin?: NovelistPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    isProject(folder: TFolder): boolean {
        const markerFile = folder.children.find(
            c => c.name === PROJECT_MARKER_FILE && c instanceof TFile
        ) as TFile;
        if (!markerFile) return false;
        const cache = this.app.metadataCache.getFileCache(markerFile);
        return cache?.frontmatter?.type === PROJECT_TYPE_KEY;
    }

    async isProjectAsync(folder: TFolder): Promise<boolean> {
        const markerFile = folder.children.find(
            c => c.name === PROJECT_MARKER_FILE && c instanceof TFile
        ) as TFile;
        if (!markerFile) return false;
        const cache = this.app.metadataCache.getFileCache(markerFile);
        if (cache?.frontmatter?.type === PROJECT_TYPE_KEY) {
            return true;
        }
        try {
            const content = await this.app.vault.read(markerFile);
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (fmMatch) {
                return /^\s*type:\s*novelist-project/m.test(fmMatch[1]);
            }
        } catch (e) {
            console.error("Error checking project status async:", e);
        }
        return false;
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

    async getProjectForFileAsync(file: TAbstractFile): Promise<TFolder | null> {
        let current: TFolder | null = file instanceof TFolder ? file : file.parent;
        while (current) {
            if (await this.isProjectAsync(current)) {
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

    async createProject(projectName: string, structure: string, parentPath: string = ""): Promise<TFolder | null> {
        const rootPath = parentPath ? normalizePath(`${parentPath}/${projectName}`) : projectName;
        try {
            const existingFolder = this.app.vault.getAbstractFileByPath(rootPath);
            if (existingFolder) {
                new Notice(`A folder named "${projectName}" already exists.`);
                return null;
            }

            const rootFolder = await this.app.vault.createFolder(rootPath);

            const frontmatter = `---
type: ${PROJECT_TYPE_KEY}
title: ${projectName}
status: Planning
author:
deadline:
targetWordCount: 50000
targetSessionCount: 0
---
# ${projectName}

Project notes and synopsis go here.
`;
            await this.app.vault.create(`${rootPath}/${PROJECT_MARKER_FILE}`, frontmatter);

            const paths = structure.split('\n')
                .map(p => p.trim())
                .filter(p => p.length > 0);

            if (!paths.includes('Trash')) {
                paths.push('Trash');
            }

            paths.sort();

            for (const relPath of paths) {
                const fullPath = normalizePath(`${rootPath}/${relPath}`);
                const existing = this.app.vault.getAbstractFileByPath(fullPath);
                if (!existing) {
                    try {
                        await this.app.vault.createFolder(fullPath);
                    } catch (err) {
                        await this.ensureFolderExists(fullPath);
                    }
                }
            }
            new Notice(`Project "${projectName}" created!`);
            return rootFolder;
        } catch (error) {
            new Notice(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
            return null;
        }
    }

    private async ensureFolderExists(path: string) {
        let currentPath = "";
        const segments = path.split("/");
        for (const segment of segments) {
            currentPath = currentPath === "" ? segment : `${currentPath}/${segment}`;
            const existing = this.app.vault.getAbstractFileByPath(currentPath);
            if (!existing) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    getTrashFolder(projectRoot: TFolder): TFolder | null {
        const trash = projectRoot.children.find(
            child => child instanceof TFolder && child.name === "Trash"
        ) as TFolder;
        if (trash) return trash;
        return null;
    }

    isInTrash(item: TAbstractFile): boolean {
        const project = this.getProjectForFile(item);
        if (!project) return false;
        const trash = this.getTrashFolder(project);
        if (!trash) return false;
        return item.path.startsWith(trash.path) && item.path !== trash.path;
    }

    async moveToTrash(item: TAbstractFile, projectRoot: TFolder) {
        try {
            const trashFolder = this.getTrashFolder(projectRoot);
            if (!trashFolder) {
                new Notice("Project Trash folder not found.");
                return;
            }

            if (item.path === trashFolder.path) return;

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
        } catch (error) {
            new Notice(`Failed to move to trash: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }

    async restoreFromTrash(item: TAbstractFile) {
        try {
            const project = this.getProjectForFile(item);
            if (!project) {
                new Notice("Could not determine project for restoration.");
                return;
            }

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
        } catch (error) {
            new Notice(`Failed to restore file: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }

    async emptyTrash(trashFolder: TFolder) {
        try {
            let target = trashFolder;
            if (target.name !== 'Trash') {
                const found = this.getTrashFolder(target);
                if (found) target = found;
                else return;
            }
            const children = [...target.children];
            for (const child of children) {
                await this.app.vault.delete(child, true);
            }
            new Notice("Trash emptied.");
        } catch (error) {
            new Notice(`Failed to empty trash: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }

    async permanentlyDelete(item: TAbstractFile) {
        try {
            await this.app.vault.delete(item, true);
            new Notice(`Deleted "${item.name}" permanently.`);
        } catch (error) {
            new Notice(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }

    getFolderNote(folder: TFolder): TFile | null {
        const file = folder.children.find(c => c.name === FOLDER_NOTE_NAME && c instanceof TFile);
        return file as TFile || null;
    }

    async createFolderNote(folder: TFolder): Promise<TFile | null> {
        try {
            const existing = this.getFolderNote(folder);
            if (existing) return existing;

            const path = `${folder.path}/${FOLDER_NOTE_NAME}`;
            const content = `---
title: ${folder.name}
label: Folder
status: Planning
synopsis: ""
notes: ""
---
`;
            return await this.app.vault.create(path, content);
        } catch (error) {
            new Notice(`Failed to create folder note: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
            return null;
        }
    }

    async createNewItem(parentFolder: TFolder, type: 'file' | 'folder', baseName = "Untitled") {
        try {
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

                const newRank = maxRank + 10;
                let content = '';
                const project = this.getProjectForFile(parentFolder);

                if (project) {
                    const meta = this.getProjectMetadata(project);
                    if (meta) {
                        const mappings: FolderMapping[] = meta.mappings || [];
                        const templates: DocumentTemplate[] = meta.templates || [];
                        const mapping = mappings.find(m => m.folderName === parentFolder.name);

                        let templateToUse: DocumentTemplate | undefined;
                        if (mapping) {
                            templateToUse = templates.find(t => t.name === mapping.templateName);
                        }

                        if (templateToUse) {
                            const templateFile = this.app.vault.getAbstractFileByPath(templateToUse.path);
                            if (templateFile instanceof TFile) {
                                content = await this.app.vault.read(templateFile);
                            } else {
                                new Notice(`Template file not found: ${templateToUse.path}`);
                            }
                        }
                    }
                }

                if (!content) {
                    content = `---
title: ${name}
rank: ${newRank}
status: Draft
label: Scene
synopsis: ""
notes: ""
---
`;
                } else {
                    if (content.startsWith('---')) {
                        let injections = '';
                        if (!content.includes('rank:')) injections += `rank: ${newRank}\n`;
                        if (!content.includes('title:')) injections += `title: ${name}\n`;
                        if (injections) {
                            content = content.replace('---', `---\n${injections}`);
                        }
                    } else {
                        content = `---\ntitle: ${name}\nrank: ${newRank}\n---\n${content}`;
                    }
                }

                await this.app.vault.create(fullPath, content);
            }
        } catch (error) {
            new Notice(`Failed to create ${type}: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }

    async getProjectWordCount(folder: TFolder): Promise<number> {
        let count = 0;
        const meta = this.getProjectMetadata(folder);
        let targetPaths: string[] = [];

        if (meta && meta.wordCountFolders && meta.wordCountFolders.length > 0) {
            targetPaths = meta.wordCountFolders.map((p: string) => normalizePath(`${folder.path}/${p}`));
        } else {
            const defaultName = this.plugin?.settings.dashboardWordCountFolder || 'Manuscript';
            targetPaths = [normalizePath(`${folder.path}/${defaultName}`)];
        }

        const countWords = async (file: TAbstractFile) => {
            if (file instanceof TFile && file.extension === 'md') {
                if (this.isInTrash(file)) return;
                try {
                    const content = await this.app.vault.cachedRead(file);
                    const contentBody = content.replace(/^---\n[\s\S]*?\n---\n/, '');
                    const words = contentBody.match(/\S+/g);
                    if (words) count += words.length;
                } catch (e) {
                    console.error("Error reading file for word count:", file.path, e);
                }
            } else if (file instanceof TFolder) {
                for (const child of file.children) {
                    await countWords(child);
                }
            }
        };

        for (const path of targetPaths) {
            const target = this.app.vault.getAbstractFileByPath(path);
            if (target) {
                await countWords(target);
            }
        }
        return count;
    }

    getProjectMetadata(folder: TFolder) {
        const marker = folder.children.find(c => c.name === 'project.md') as TFile;
        if (!marker) return null;
        const cache = this.app.metadataCache.getFileCache(marker);
        const fm = cache?.frontmatter || {};

        return {
            name: folder.name,
            path: folder.path,
            status: fm.status || 'Planning',
            tags: fm.tags || [],
            description: fm.description || "No description provided.",
            isArchived: fm.archived === true || fm.status === 'Archived',
            lastModified: marker.stat.mtime,
            createdTime: marker.stat.ctime,
            templates: fm.templates || [],
            mappings: fm.mappings || [],
            icons: fm.icons || {},
            iconColors: fm.iconColors || {},
            targetWordCount: fm.targetWordCount || 0,
            targetSessionCount: fm.targetSessionCount || 0,
            targetDeadline: fm.targetDeadline || '',
            writingHistory: fm.writingHistory || {},
            wordCountFolders: fm.wordCountFolders || [],
            cursorPositions: fm.cursorPositions || {},
        };
    }

    async updateProjectMetadata(folder: TFolder, data: {
        description?: string,
        tags?: string[],
        status?: string,
        archived?: boolean,
        templates?: DocumentTemplate[],
        mappings?: FolderMapping[],
        icons?: Record<string, string>,
        iconColors?: Record<string, string>,
        targetWordCount?: number,
        targetSessionCount?: number,
        targetDeadline?: string,
        writingHistory?: Record<string, number>,
        wordCountFolders?: string[]
        cursorPositions?: Record<string, number>
    }) {
        const marker = folder.children.find(c => c.name === 'project.md') as TFile;
        if (!marker) return;

        try {
            await this.app.fileManager.processFrontMatter(marker, (fm) => {
                if (data.description !== undefined) fm.description = data.description;
                if (data.tags !== undefined) fm.tags = data.tags;
                if (data.status !== undefined) fm.status = data.status;
                if (data.archived !== undefined) fm.archived = data.archived;
                if (data.templates !== undefined) fm.templates = data.templates;
                if (data.mappings !== undefined) fm.mappings = data.mappings;
                if (data.icons !== undefined) fm.icons = data.icons;
                if (data.iconColors !== undefined) fm.iconColors = data.iconColors;
                if (data.targetWordCount !== undefined) fm.targetWordCount = data.targetWordCount;
                if (data.targetSessionCount !== undefined) fm.targetSessionCount = data.targetSessionCount;
                if (data.targetDeadline !== undefined) fm.targetDeadline = data.targetDeadline;
                if (data.writingHistory !== undefined) fm.writingHistory = data.writingHistory;
                if (data.wordCountFolders !== undefined) fm.wordCountFolders = data.wordCountFolders;
                if (data.cursorPositions !== undefined) fm.cursorPositions = data.cursorPositions;
            });
        } catch (error) {
            new Notice(`Failed to update project metadata: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }

    async renameProject(folder: TFolder, newName: string) {
        if (folder.name === newName) return;
        try {
            const parentPath = folder.parent?.path === '/' ? '' : (folder.parent?.path || '');
            const newPath = normalizePath(`${parentPath}/${newName}`);
            
            const folderNote = this.getFolderNote(folder);
            const projectMarker = folder.children.find(c => c.name === PROJECT_MARKER_FILE) as TFile;

            await this.app.fileManager.renameFile(folder, newPath);

            if (folderNote) {
                await this.app.fileManager.processFrontMatter(folderNote, (fm) => {
                    fm.title = newName;
                });
            }

            if (projectMarker) {
                await this.app.fileManager.processFrontMatter(projectMarker, (fm) => {
                    fm.title = newName;
                });
            }
        } catch (error) {
            new Notice(`Could not rename project: ${error instanceof Error ? error.message : String(error)}`);
            console.error(error);
        }
    }
}