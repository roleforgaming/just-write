// src/utils/projectManager.ts
import { App, TFolder, TFile, normalizePath, Notice } from 'obsidian';

export const PROJECT_MARKER_FILE = 'project.md';
export const PROJECT_TYPE_KEY = 'novelist-project';

export interface NovelistProject {
    name: string;
    rootFolder: TFolder;
    manuscriptFolder: TFolder;
    structure: {
        research: TFolder | null;
        characters: TFolder | null;
        trash: TFolder | null;
    }
}

export class ProjectManager {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Checks if a folder is the root of a Novelist project
     */
    isProject(folder: TFolder): boolean {
        const markerFile = folder.children.find(
            c => c.name === PROJECT_MARKER_FILE && c instanceof TFile
        ) as TFile;

        if (!markerFile) return false;

        const cache = this.app.metadataCache.getFileCache(markerFile);
        return cache?.frontmatter?.type === PROJECT_TYPE_KEY;
    }

    /**
     * Finds the project a specific file belongs to (bubbling up)
     */
    getProjectForFile(file: TFile): TFolder | null {
        let current: TFolder | null = file.parent;
        while (current && !current.isRoot()) {
            if (this.isProject(current)) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }

    /**
     * Creates a new Novelist Project structure
     */
    async createProject(projectName: string, parentPath: string = ""): Promise<TFolder | null> {
        const rootPath = normalizePath(`${parentPath}/${projectName}`);
        
        try {
            // 1. Create Root
            const rootFolder = await this.app.vault.createFolder(rootPath);

            // 2. Create Marker File
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

            // 3. Create Subfolders
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

    /**
     * Get all projects in the vault
     */
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
}