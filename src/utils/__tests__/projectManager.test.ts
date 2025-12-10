import { ProjectManager, PROJECT_MARKER_FILE, PROJECT_TYPE_KEY } from '../projectManager';
// The import below picks up the MOCKED versions because of the jest.mock call
import { App, TFile, TFolder, Notice } from 'obsidian';

// ----------------------------------------------------------------------------
// Jest Mocks
// ----------------------------------------------------------------------------

jest.mock('../metadata', () => ({
    getRank: jest.fn().mockReturnValue(0)
}));

jest.mock('obsidian', () => {
    // 1. Define classes INSIDE the factory to avoid hoisting ReferenceErrors
    class MockTAbstractFile {
        path: string;
        name: string;
        parent: any = null;
        constructor(path: string) {
            this.path = path;
            this.name = path.split('/').pop() || '';
        }
    }

    class MockTFolder extends MockTAbstractFile {
        children: any[] = [];
        constructor(path: string) {
            super(path);
        }
        isRoot() { return this.path === '/' || this.path === ''; }
    }

    class MockTFile extends MockTAbstractFile {
        basename: string;
        extension: string;
        stat: { ctime: number; mtime: number; size: number };
        constructor(path: string) {
            super(path);
            const parts = this.name.split('.');
            if (parts.length > 1) {
                this.extension = parts.pop() || '';
                this.basename = parts.join('.');
            } else {
                this.extension = '';
                this.basename = this.name;
            }
            this.stat = { ctime: Date.now(), mtime: Date.now(), size: 100 };
        }
    }

    // 2. Return the mock module
    return {
        App: class {},
        TFile: MockTFile,
        TFolder: MockTFolder,
        TAbstractFile: MockTAbstractFile,
        Notice: jest.fn(),
        normalizePath: (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '')
    };
});

// ----------------------------------------------------------------------------
// Test Suite
// ----------------------------------------------------------------------------

describe('ProjectManager', () => {
    let app: any;
    let manager: ProjectManager;
    let fileSystem: Map<string, any>;

    // Helper to simulate file system structure
    const createMockPath = (path: string, isFolder: boolean): any => {
        if (fileSystem.has(path)) return fileSystem.get(path)!;

        // Ensure parent exists
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        let parent: any = null;
        
        if (parentPath && parentPath !== path) {
            parent = createMockPath(parentPath, true);
        }

        // We use TFolder/TFile here, which refer to the MOCKED classes imported from 'obsidian'
        // We cast to 'any' to bypass strict type checking of the constructor signature
        const item = isFolder ? new (TFolder as any)(path) : new (TFile as any)(path);
        item.parent = parent;
        
        if (parent) {
            parent.children.push(item);
        }

        fileSystem.set(path, item);
        return item;
    };

    beforeEach(() => {
        fileSystem = new Map();
        jest.clearAllMocks();

        app = {
            vault: {
                getAbstractFileByPath: jest.fn((path: string) => fileSystem.get(path) || null),
                createFolder: jest.fn(async (path: string) => {
                    if (fileSystem.has(path)) throw new Error('Folder already exists');
                    return createMockPath(path, true);
                }),
                create: jest.fn(async (path: string, _content: string) => {
                    if (fileSystem.has(path)) throw new Error('File already exists');
                    return createMockPath(path, false);
                }),
                read: jest.fn().mockResolvedValue(''),
                cachedRead: jest.fn().mockResolvedValue(''),
                getMarkdownFiles: jest.fn(() => 
                    Array.from(fileSystem.values()).filter(f => f instanceof TFile && f.extension === 'md')
                ),
                delete: jest.fn(async (file: any) => {
                    fileSystem.delete(file.path);
                    if (file.parent) {
                        file.parent.children = file.parent.children.filter((c: any) => c !== file);
                    }
                }),
            },
            metadataCache: {
                getFileCache: jest.fn().mockReturnValue(null),
            },
            fileManager: {
                processFrontMatter: jest.fn(async (file: any, cb: (fm: any) => void) => {
                    const fm = {}; 
                    cb(fm);
                }),
                renameFile: jest.fn(async (file: any, newPath: string) => {
                    fileSystem.delete(file.path);
                    file.path = newPath;
                    file.name = newPath.split('/').pop() || '';
                    fileSystem.set(newPath, file);
                }),
            }
        };

        manager = new ProjectManager(app as App);
    });

    describe('isProject', () => {
        it('should return true if folder contains project marker with correct type', () => {
            const folder = createMockPath('MyProject', true);
            createMockPath('MyProject/project.md', false);

            (app.metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatter: { type: PROJECT_TYPE_KEY }
            });

            expect(manager.isProject(folder as any)).toBe(true);
        });

        it('should return false if marker file is missing', () => {
            const folder = createMockPath('NotProject', true);
            expect(manager.isProject(folder as any)).toBe(false);
        });
    });

    describe('createProject', () => {
        it('should create project folder, marker, and default structure', async () => {
            const name = 'NewNovel';
            const structure = 'Chapters\nCharacters';
            
            await manager.createProject(name, structure);

            expect(app.vault.createFolder).toHaveBeenCalledWith(name);
            expect(app.vault.create).toHaveBeenCalledWith(
                `${name}/${PROJECT_MARKER_FILE}`,
                expect.stringContaining(`type: ${PROJECT_TYPE_KEY}`)
            );
            expect(app.vault.createFolder).toHaveBeenCalledWith(`${name}/Chapters`);
            expect(app.vault.createFolder).toHaveBeenCalledWith(`${name}/Characters`);
            expect(app.vault.createFolder).toHaveBeenCalledWith(`${name}/Trash`);
        });

        it('should abort if folder already exists', async () => {
            const name = 'ExistingNovel';
            createMockPath(name, true);

            const result = await manager.createProject(name, '');

            expect(result).toBeNull();
            expect(app.vault.create).not.toHaveBeenCalled();
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        });
    });

    describe('getProjectWordCount', () => {
        it('should count words in markdown files recursively', async () => {
            const project = createMockPath('Novel', true);
            
            (app.metadataCache.getFileCache as jest.Mock).mockImplementation((file: any) => {
                if (file.name === 'project.md') {
                    return { frontmatter: { wordCountFolders: ['Manuscript'] } };
                }
                return {};
            });
            
            createMockPath('Novel/project.md', false);

            const ch1 = createMockPath('Novel/Manuscript/Ch1.md', false);
            const ch2 = createMockPath('Novel/Manuscript/Ch2.md', false);

            (app.vault.cachedRead as jest.Mock).mockImplementation(async (file: any) => {
                if (file === ch1) return "One two three.";
                if (file === ch2) return "Four five.";
                return "";
            });

            const count = await manager.getProjectWordCount(project as any);
            
            expect(count).toBe(5);
        });

        it('should safely handle read errors', async () => {
            const project = createMockPath('Novel', true);
            createMockPath('Novel/project.md', false);
            
            const goodFile = createMockPath('Novel/Manuscript/Good.md', false);
            const badFile = createMockPath('Novel/Manuscript/Bad.md', false);

            (app.vault.cachedRead as jest.Mock).mockImplementation(async (file: any) => {
                if (file === goodFile) return "Word word.";
                if (file === badFile) throw new Error("File locked");
                return "";
            });

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            const count = await manager.getProjectWordCount(project as any);

            expect(count).toBe(2);
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('moveToTrash', () => {
        it('should move file and handle naming collisions', async () => {
            const project = createMockPath('Book', true);
            createMockPath('Book/Trash', true);
            createMockPath('Book/project.md', false);
            const file = createMockPath('Book/Note.md', false);
            createMockPath('Book/Trash/Note.md', false);

            (app.metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatter: { type: PROJECT_TYPE_KEY }
            });

            await manager.moveToTrash(file as any, project as any);

            expect(app.fileManager.renameFile).toHaveBeenCalledWith(
                file, 
                'Book/Trash/Note (1).md'
            );
        });
    });

    describe('renameProject', () => {
        it('should rename project folder and update the folder note\'s frontmatter title', async () => {
            const oldName = 'OldName';
            const newName = 'NewName';
            const project = createMockPath(oldName, true);
            // Create the folder note file that ProjectManager must update
            const folderNote = createMockPath(`${oldName}/index.md`, false);

            let capturedFrontMatterCallback: (fm: any) => void = () => {};
            
            // Temporarily override the mock to capture the callback
            app.fileManager.processFrontMatter.mockImplementation(async (file: any, cb: (fm: any) => void) => {
                if (file === folderNote) {
                    capturedFrontMatterCallback = cb;
                }
            });

            await manager.renameProject(project as any, newName);

            // 1. Verify folder rename
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(project, newName);

            // 2. Verify frontmatter processing was initiated
            expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(folderNote, expect.any(Function));

            // 3. Verify the frontmatter update logic by running the captured callback
            const mockFrontMatter = { title: oldName, type: 'project' }; // Start with old title
            
            // Execute the function that *should* update the frontmatter
            capturedFrontMatterCallback(mockFrontMatter);

            // Assert that the title field was updated to the new name
            expect(mockFrontMatter.title).toBe(newName);
        });
    });
});