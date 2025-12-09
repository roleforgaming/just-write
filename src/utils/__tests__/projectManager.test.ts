import { ProjectManager, PROJECT_MARKER_FILE, PROJECT_TYPE_KEY } from '../src/utils/projectManager';
import { App, TFile, TFolder, TAbstractFile } from 'obsidian';

// ----------------------------------------------------------------------------
// Mocks for Obsidian API
// ----------------------------------------------------------------------------

// 1. Mock the TAbstractFile hierarchy used for instanceof checks
class MockTAbstractFile {
    path: string;
    name: string;
    parent: TFolder | null;
    constructor(path: string, parent: TFolder | null = null) {
        this.path = path;
        this.name = path.split('/').pop() || '';
        this.parent = parent;
    }
}

class MockTFile extends MockTAbstractFile {
    basename: string;
    extension: string;
    stat: { ctime: number; mtime: number; size: number };
    constructor(path: string, parent: TFolder | null = null) {
        super(path, parent);
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

class MockTFolder extends MockTAbstractFile {
    children: TAbstractFile[] = [];
    isRoot() { return this.path === '/'; }
    constructor(path: string, parent: TFolder | null = null) {
        super(path, parent);
    }
}

// 2. Mock the 'obsidian' module
jest.mock('obsidian', () => ({
    App: jest.fn(),
    TFile: MockTFile,
    TFolder: MockTFolder,
    TAbstractFile: MockTAbstractFile,
    Notice: jest.fn(),
    normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/^\/+/, ''),
}));

// 3. Helper to create a Mock App instance
const createMockApp = () => {
    return {
        vault: {
            createFolder: jest.fn(),
            create: jest.fn(),
            getAbstractFileByPath: jest.fn(),
            read: jest.fn(),
            cachedRead: jest.fn(),
            delete: jest.fn(),
            getMarkdownFiles: jest.fn(),
        },
        fileManager: {
            processFrontMatter: jest.fn((file, cb) => {
                // Simulate frontmatter object for callback
                const fm = {}; 
                cb(fm);
                return Promise.resolve();
            }),
            renameFile: jest.fn(),
        },
        metadataCache: {
            getFileCache: jest.fn(),
        },
    } as unknown as App;
};

// ----------------------------------------------------------------------------
// Test Suite
// ----------------------------------------------------------------------------

describe('ProjectManager', () => {
    let app: App;
    let projectManager: ProjectManager;

    beforeEach(() => {
        app = createMockApp();
        projectManager = new ProjectManager(app);
        jest.clearAllMocks();
    });

    describe('isProject', () => {
        it('should return true if folder contains project marker with correct type', () => {
            const folder = new MockTFolder('MyProject');
            const marker = new MockTFile('MyProject/project.md', folder);
            folder.children.push(marker);

            (app.metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatter: { type: PROJECT_TYPE_KEY }
            });

            // Cast to unknown then TFolder to satisfy TS check against real TFolder
            expect(projectManager.isProject(folder as unknown as TFolder)).toBe(true);
        });

        it('should return false if marker file is missing', () => {
            const folder = new MockTFolder('NotProject');
            expect(projectManager.isProject(folder as unknown as TFolder)).toBe(false);
        });

        it('should return false if marker exists but type is wrong', () => {
            const folder = new MockTFolder('WrongType');
            const marker = new MockTFile('WrongType/project.md', folder);
            folder.children.push(marker);

            (app.metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatter: { type: 'other-type' }
            });

            expect(projectManager.isProject(folder as unknown as TFolder)).toBe(false);
        });
    });

    describe('createProject', () => {
        it('should create project folder, marker, and default structure', async () => {
            const name = 'NewNovel';
            const structure = 'Chapters\nCharacters';
            
            // Setup: Vault returns null for existing path (no collision)
            (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
            
            // Setup: createFolder returns the new folder
            const newFolder = new MockTFolder(name);
            (app.vault.createFolder as jest.Mock).mockResolvedValue(newFolder);

            const result = await projectManager.createProject(name, structure);

            // 1. Check Root Creation
            expect(app.vault.createFolder).toHaveBeenCalledWith(name);
            
            // 2. Check Marker Creation
            expect(app.vault.create).toHaveBeenCalledWith(
                `${name}/${PROJECT_MARKER_FILE}`,
                expect.stringContaining(`type: ${PROJECT_TYPE_KEY}`)
            );

            // 3. Check Structure Creation (structure paths + Trash)
            expect(app.vault.createFolder).toHaveBeenCalledWith(`${name}/Chapters`);
            expect(app.vault.createFolder).toHaveBeenCalledWith(`${name}/Characters`);
            expect(app.vault.createFolder).toHaveBeenCalledWith(`${name}/Trash`);
            
            expect(result).toBe(newFolder);
        });

        it('should abort and return null if folder already exists', async () => {
            const name = 'ExistingNovel';
            // Setup: Vault finds existing folder
            (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(new MockTFolder(name));

            const result = await projectManager.createProject(name, '');

            expect(result).toBeNull();
            expect(app.vault.createFolder).not.toHaveBeenCalled();
            expect(require('obsidian').Notice).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        });

        it('should handle errors gracefully', async () => {
            const name = 'ErrorProne';
            (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
            (app.vault.createFolder as jest.Mock).mockRejectedValue(new Error('Disk full'));

            const result = await projectManager.createProject(name, '');

            expect(result).toBeNull();
            expect(require('obsidian').Notice).toHaveBeenCalledWith(expect.stringContaining('Failed to create project'));
        });
    });

    describe('moveToTrash', () => {
        let projectRoot: MockTFolder;
        let trashFolder: MockTFolder;

        beforeEach(() => {
            projectRoot = new MockTFolder('Book');
            trashFolder = new MockTFolder('Book/Trash', projectRoot);
            projectRoot.children.push(trashFolder);
        });

        it('should move file to Trash and record original path', async () => {
            const file = new MockTFile('Book/Chapter1.md', projectRoot);
            
            // Mock getProjectForFile internally usually relies on parent traversal or metadata. 
            // Here we test moveToTrash logic directly assuming we pass valid projectRoot.
            
            await projectManager.moveToTrash(file as unknown as TAbstractFile, projectRoot as unknown as TFolder);

            // Check frontmatter updated (originalPath saved)
            expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(file, expect.any(Function));
            
            // Check move
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'Book/Trash/Chapter1.md');
        });

        it('should handle naming collisions in trash', async () => {
            const file = new MockTFile('Book/Note.md', projectRoot);

            // Mock that Note.md already exists in Trash
            (app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path) => {
                if (path === 'Book/Trash/Note.md') return new MockTFile(path);
                return null;
            });

            await projectManager.moveToTrash(file as unknown as TAbstractFile, projectRoot as unknown as TFolder);

            // Expect automatic renaming
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'Book/Trash/Note (1).md');
        });

        it('should fail gracefully if Trash folder is missing', async () => {
            const emptyProject = new MockTFolder('EmptyProject');
            const file = new MockTFile('EmptyProject/File.md', emptyProject);

            await projectManager.moveToTrash(file as unknown as TAbstractFile, emptyProject as unknown as TFolder);

            expect(app.fileManager.renameFile).not.toHaveBeenCalled();
            expect(require('obsidian').Notice).toHaveBeenCalledWith('Project Trash folder not found.');
        });
    });

    describe('renameProject', () => {
        it('should rename folder and update folder note title', async () => {
            const folder = new MockTFolder('OldTitle');
            const folderNote = new MockTFile('OldTitle/index.md', folder);
            folder.children.push(folderNote);
            
            // Setup parent
            const root = new MockTFolder('/');
            folder.parent = root;

            await projectManager.renameProject(folder as unknown as TFolder, 'NewTitle');

            // 1. Rename File
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(folder, 'NewTitle');

            // 2. Update Folder Note Title
            expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(folderNote, expect.any(Function));
        });

        it('should handle root path normalization correctly', async () => {
            const folder = new MockTFolder('MyProject');
            // Simulate parent being root
            folder.parent = new MockTFolder('/'); 

            await projectManager.renameProject(folder as unknown as TFolder, 'RenamedProject');

            // Should not result in "//RenamedProject" or "/RenamedProject" if normalizePath works
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(folder, 'RenamedProject');
        });
    });

    describe('getProjectWordCount', () => {
        it('should count words in markdown files recursively', async () => {
            const project = new MockTFolder('Novel');
            const marker = new MockTFile('Novel/project.md', project);
            project.children.push(marker);

            const manuscript = new MockTFolder('Novel/Manuscript', project);
            project.children.push(manuscript);
            
            // Setup Metadata to point to Manuscript folder
            (app.metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatter: { wordCountFolders: ['Manuscript'] }
            });

            // Setup vault to return manuscript folder when requested
            (app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path) => {
                if (path.includes('Manuscript')) return manuscript;
                return null;
            });

            // Add files to manuscript
            const ch1 = new MockTFile('Novel/Manuscript/Ch1.md', manuscript);
            const ch2 = new MockTFile('Novel/Manuscript/Ch2.md', manuscript);
            manuscript.children.push(ch1, ch2);

            // Mock content
            (app.vault.cachedRead as jest.Mock).mockImplementation(async (file: MockTFile) => {
                if (file === ch1) return "One two three.";
                if (file === ch2) return "Four five.";
                return "";
            });

            const count = await projectManager.getProjectWordCount(project as unknown as TFolder);
            
            expect(count).toBe(5);
        });

        it('should ignore errors for individual files and continue counting', async () => {
            const project = new MockTFolder('Novel');
            const manuscript = new MockTFolder('Novel/Manuscript', project);
            // Default fallback if metadata is empty
            (app.metadataCache.getFileCache as jest.Mock).mockReturnValue({}); 
            (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(manuscript);

            const goodFile = new MockTFile('Novel/Manuscript/Good.md', manuscript);
            const badFile = new MockTFile('Novel/Manuscript/Bad.md', manuscript);
            manuscript.children.push(goodFile, badFile);

            (app.vault.cachedRead as jest.Mock).mockImplementation(async (file: MockTFile) => {
                if (file === goodFile) return "Word word.";
                if (file === badFile) throw new Error("File locked");
                return "";
            });

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            const count = await projectManager.getProjectWordCount(project as unknown as TFolder);

            expect(count).toBe(2); // Should count the good file
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});