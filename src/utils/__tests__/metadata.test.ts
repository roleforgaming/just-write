import { getMetadata, getRank, updateMetadata, updateNoteBody } from '../metadata';
import { App } from '../../../test/mocks/App';
import { TFile } from '../../../test/mocks/TFile';
import { App as ObsidianApp, TFile as ObsidianTFile } from 'obsidian';

describe('Metadata Utilities', () => {
    let app: App;
    let file: TFile;
    // mockVaultProcess will capture the callback function passed to vault.process
    let mockVaultProcess: jest.Mock;

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

        // MOCK vault.process
        mockVaultProcess = jest.fn((_f, _callback) => {
            // We simulate the process by providing current file content 
            // and returning what the callback returns.
            // By default, let's assume empty file if not mocked otherwise.
            return Promise.resolve(); 
        });
        (app.vault as any).process = mockVaultProcess;
        
        // modify is likely no longer used by updateNoteBody, but good to keep mocked just in case
        (app.vault as any).modify = jest.fn();
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
            const existingContent = "---\nrank: 1\n---\nOld Body Content";
            const newBody = "New Body Content";

            // When process is called, we execute the callback with existingContent
            mockVaultProcess.mockImplementation(async (f, callback) => {
                const result = callback(existingContent);
                // In a real mock we might check if result matches expectation
                return result; 
            });

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            // We verify that the result of the callback was the correct combination
            const calls = mockVaultProcess.mock.calls;
            const callback = calls[0][1];
            const result = callback(existingContent);

            expect(result).toBe("---\nrank: 1\n---\nNew Body Content");
        });

        test('Formatting: Should ensure newline separation', async () => {
            const existingContent = "---\nkey: val\n---"; 
            const newBody = "Start of text"; 
            
            mockVaultProcess.mockImplementation(async (f, callback) => {
                 return callback(existingContent);
            });

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            const callback = mockVaultProcess.mock.calls[0][1];
            expect(callback(existingContent)).toBe("---\nkey: val\n---\nStart of text");
        });

        test('Edge Case: Should strip leading newlines from newBody', async () => {
            const existingContent = "---\nkey: val\n---"; 
            const newBody = "\n\nStart of text"; 
            
            mockVaultProcess.mockImplementation(async (f, callback) => callback(existingContent));

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            const callback = mockVaultProcess.mock.calls[0][1];
            expect(callback(existingContent)).toBe("---\nkey: val\n---\nStart of text");
        });

        test('No Frontmatter: Should replace entire file content', async () => {
            const existingContent = "Just some text";
            const newBody = "New text";
            
            mockVaultProcess.mockImplementation(async (f, callback) => callback(existingContent));

            await updateNoteBody(app as unknown as ObsidianApp, file as unknown as ObsidianTFile, newBody);

            const callback = mockVaultProcess.mock.calls[0][1];
            expect(callback(existingContent)).toBe("New text");
        });
    });
});