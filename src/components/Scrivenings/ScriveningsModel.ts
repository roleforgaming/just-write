import { App, TFile, TFolder, Notice } from 'obsidian';
import { getRank } from '../../utils/metadata';
import matter from 'gray-matter';
import { updateNoteBody } from 'src/utils/metadata';

export interface FileSection {
    file: TFile;
    content: string;
    frontmatter: string; // Contains the full fence --- ... --- and trailing newlines
    originalPath: string;
}

export class ScriveningsModel {
    app: App;
    folder: TFolder;
    sections: FileSection[] = [];
    
    // Default separator for generating the view
    static SEPARATOR = "\n\n<!-- SC_BREAK -->\n\n"; 

    constructor(app: App, folder: TFolder) {
        this.app = app;
        this.folder = folder;
    }

    async load(): Promise<string> {
        this.sections = [];
        const parts: string[] = [];

        const files = this.folder.children
            .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
            .sort((a, b) => getRank(this.app, a) - getRank(this.app, b));

        for (const file of files) {
            const raw = await this.app.vault.read(file);
            
            // USE GRAY-MATTER
            const parsed = matter(raw);
            
            // We separate content from frontmatter.
            // parsed.content is the body. 
            // To ensure we preserve exact formatting of the frontmatter (including comments and 
            // specific newline spacing after the fence), we slice the original string.
            // This is safer than re-serializing the yaml which would lose comments.
            const body = parsed.content;
            const frontmatterBlock = raw.slice(0, raw.length - body.length);

            this.sections.push({
                file,
                content: body,
                frontmatter: frontmatterBlock,
                originalPath: file.path
            });

            parts.push(body);
        }

        return parts.join(ScriveningsModel.SEPARATOR);
    }

    async save(fullText: string) {
        // ROBUST SPLIT LOGIC:
        const parts = fullText.split(/(?:\r?\n)*<!-- SC_BREAK -->(?:\r?\n)*/);

        if (parts.length !== this.sections.length) {
            new Notice("Scrivenings Sync Warning: Section count mismatch. Save aborted.");
            console.error("Scrivenings mismatch:", { expected: this.sections.length, found: parts.length });
            return;
        }

        const promises = this.sections.map(async (section, index) => {
            const newContent = parts[index];
            
            if (newContent !== section.content) {
                // REFACTOR: Use updateNoteBody to preserve live frontmatter
                // This prevents reverting metadata if it changed in the background
                await updateNoteBody(this.app, section.file, newContent);
                
                section.content = newContent; // Update local cache
            }
        });
        
        await Promise.all(promises);
    }
}