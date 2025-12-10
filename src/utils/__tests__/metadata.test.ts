import { getMetadata, getRank, updateMetadata, updateNoteBody } from '../metadata';
import { App } from '../../../test/mocks/App';
import { TFile } from '../../../test/mocks/TFile';
import { App as ObsidianApp, TFile as ObsidianTFile } from 'obsidian';

describe('Metadata Utilities', () => {
    let app: App;
    let file: TFile;
    let mockVaultModify: jest.Mock;

    beforeEach(() => {
        app = new App();
        file = new TFile('folder/test-note.md');

        (app as any).metadataCache = {
            getFileCache: jest.fn(),
        };

        (app as any).fileManager = {
            processFrontMatter: jest.fn((targetFile, callback) => {
                const mockFrontmatter = {}; 
                callback(mockFrontmatter);
                return Promise.resolve();
            }),
        };

        mockVaultModify = jest.fn();
        (app.vault as any).modify = mockVaultModify;
        app.vault.read = jest.fn();
    });

    describe('getMetadata', () => {
        test('Happy Path: Should extract all known fields correctly', () => {
            const mockCache = {
                frontmatter: {
                    synopsis: "A great story",
                    rank: 10,
                    label: "Chapter",
                    status: "Done",
                    icon: "book",
                    accentColor: "#ff0000",
                    notes: "Needs revision",
                    targetWordCount: 500
                }
            };
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue(mockCache);

            const result = getMetadata(app as unknown as ObsidianApp, file as unknown as ObsidianTFile);

            expect(result).toEqual({
                synopsis: "A great story",
                rank: 10,
                label: "Chapter",
                status: "Done",
                icon: "book",
                accentColor: "#ff0000",
                notes: "Needs revision",
                targetWordCount: 500,
                targetSessionCount: undefined,
                targetDeadline: undefined,
                writingHistory: undefined,
                wordCountFolders: undefined
            });
        });

        test('Defaults: Should return default values when frontmatter is missing', () => {
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue(null);
            const result = getMetadata(app as unknown as ObsidianApp, file as unknown as ObsidianTFile);
            expect(result.status).toBe("Draft");
            expect(result.rank).toBe(999999);
        });

        test('Type Safety: Should handle malformed rank (string instead of number)', () => {
            const mockCache = { frontmatter: { rank: "10" } };
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue(mockCache);
            const result = getMetadata(app as unknown as ObsidianApp, file as unknown as ObsidianTFile);
            expect(result.rank).toBe(999999);
        });
    });

    describe('getRank', () => {
        test('Should return correct rank when present', () => {
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue({ frontmatter: { rank: 5 } });
            expect(getRank(app as unknown as ObsidianApp, file as unknown as ObsidianTFile)).toBe(5);
        });

        test('Should return default rank (999999) when missing', () => {
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue({ frontmatter: {} });
            expect(getRank(app as unknown as ObsidianApp, file as unknown as ObsidianTFile)).toBe(999999);
        });
    });

    describe('updateMetadata', () => {
        test('Happy Path: Should call processFrontMatter with correct changes', async () => {
            const changes = { status: "Published", rank: 1 };
            let capturedFrontmatter: any = {};
            
            ((app as any).fileManager.processFrontMatter as jest.Mock).mockImplementation(async (f, fn) => {
                fn(capturedFrontmatter);
            });

            await updateMetadata(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, changes);

            expect((app as any).fileManager.processFrontMatter).toHaveBeenCalledWith(file, expect.any(Function));
            expect(capturedFrontmatter.status).toBe("Published");
            expect(capturedFrontmatter.rank).toBe(1);
        });

        test('Partial Update: Should only update provided fields', async () => {
            const changes = { status: "WIP" };
            let capturedFrontmatter: any = { synopsis: "Existing", rank: 5 }; 
            
            ((app as any).fileManager.processFrontMatter as jest.Mock).mockImplementation(async (f, fn) => {
                fn(capturedFrontmatter);
            });

            await updateMetadata(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, changes);

            expect(capturedFrontmatter.status).toBe("WIP");
            expect(capturedFrontmatter.synopsis).toBe("Existing"); 
        });
    });

    describe('updateNoteBody', () => {
        test('Happy Path: Should preserve existing frontmatter and update body', async () => {
            // String length: 3(---) + 1(\n) + 7(rank: 1) + 1(\n) + 3(---) = 15 chars.
            // Indices: 0 to 14. Last char is at index 14.
            const existingContent = "---\nrank: 1\n---\nOld Body Content";
            const newBody = "New Body Content";
            
            (app.vault.read as jest.Mock).mockResolvedValue(existingContent);
            
            // Corrected offset to 14
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatterPosition: { end: { offset: 14 } }
            });

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            const expectedContent = "---\nrank: 1\n---\nNew Body Content";
            expect(mockVaultModify).toHaveBeenCalledWith(file, expectedContent);
        });

        test('Formatting: Should ensure newline separation if body lacks it', async () => {
            // String length: 3(---) + 1(\n) + 8(key: val) + 1(\n) + 3(---) = 16 chars.
            // Indices: 0 to 15. Last char is at index 15.
            const existingContent = "---\nkey: val\n---"; 
            const newBody = "Start of text"; 
            
            (app.vault.read as jest.Mock).mockResolvedValue(existingContent);
            // Corrected offset to 15
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatterPosition: { end: { offset: 15 } }
            });

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            expect(mockVaultModify).toHaveBeenCalledWith(file, "---\nkey: val\n---\nStart of text");
        });

        test('Edge Case: Should remove leading newline from newBody to prevent double spacing', async () => {
            const existingContent = "---\nkey: val\n---"; 
            const newBody = "\nStart of text"; 
            
            (app.vault.read as jest.Mock).mockResolvedValue(existingContent);
            // Corrected offset to 15
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue({
                frontmatterPosition: { end: { offset: 15 } }
            });

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            expect(mockVaultModify).toHaveBeenCalledWith(file, "---\nkey: val\n---\nStart of text");
        });

        test('No Frontmatter: Should replace entire file content', async () => {
            const existingContent = "Just some text";
            const newBody = "New text";
            
            (app.vault.read as jest.Mock).mockResolvedValue(existingContent);
            ((app as any).metadataCache.getFileCache as jest.Mock).mockReturnValue({});

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            expect(mockVaultModify).toHaveBeenCalledWith(file, "New text");
        });
    });
});