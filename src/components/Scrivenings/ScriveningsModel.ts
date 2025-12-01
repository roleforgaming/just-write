import { App, TFile, TFolder, Notice } from 'obsidian';
import { getRank } from '../../utils/metadata';

export interface FileSection {
    file: TFile;
    content: string;
    frontmatter: string;
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
            const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
            const frontmatter = fmMatch ? fmMatch[0] : "";
            const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");

            this.sections.push({
                file,
                content: body,
                frontmatter,
                originalPath: file.path
            });

            parts.push(body);
        }

        return parts.join(ScriveningsModel.SEPARATOR);
    }

    async save(fullText: string) {
        // ROBUST SPLIT LOGIC:
        // Use Regex to find the marker <!-- SC_BREAK -->
        // (?:\r?\n)* matches zero or more newlines before and after.
        // This ensures that if the user deletes the blank lines, we still split correctly.
        const parts = fullText.split(/(?:\r?\n)*<!-- SC_BREAK -->(?:\r?\n)*/);

        // Safety Check
        if (parts.length !== this.sections.length) {
            new Notice("Scrivenings Sync Warning: Section count mismatch. Save aborted to protect data.");
            console.error("Scrivenings mismatch:", { expected: this.sections.length, found: parts.length });
            return;
        }

        const promises = this.sections.map(async (section, index) => {
            const newContent = parts[index];
            
            // Only write to disk if content actually changed
            if (newContent !== section.content) {
                const fileData = section.frontmatter + newContent;
                await this.app.vault.modify(section.file, fileData);
                section.content = newContent; // Update local cache
            }
        });

        await Promise.all(promises);
    }
}