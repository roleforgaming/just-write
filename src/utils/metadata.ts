import { TFile, App } from 'obsidian';

export interface NovelistMetadata {
    synopsis: string;
    rank: number;
    label: string;
    status: string;
    icon: string;
    accentColor: string;
    notes: string;
    targetWordCount?: number;
    targetSessionCount?: number;
    targetDeadline?: string;
    writingHistory?: Record<string, number>;
    wordCountFolders?: string[];
}

export function getMetadata(app: App, file: TFile): NovelistMetadata {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    return {
        synopsis: fm.synopsis || "",
        rank: typeof fm.rank === 'number' ? fm.rank : 999999,
        label: fm.label || "Scene",
        status: fm.status || "Draft",
        icon: fm.icon || "file-text",
        accentColor: fm.accentColor || "",
        notes: fm.notes || "",
        targetWordCount: fm.targetWordCount,
        targetSessionCount: fm.targetSessionCount,
        targetDeadline: fm.targetDeadline,
        writingHistory: fm.writingHistory,
        wordCountFolders: fm.wordCountFolders
    };
}

export function getRank(app: App, file: TFile): number {
    const cache = app.metadataCache.getFileCache(file);
    return typeof cache?.frontmatter?.rank === 'number' ? cache.frontmatter.rank : 999999;
}

export async function updateMetadata(app: App, file: TFile, changes: Partial<NovelistMetadata>): Promise<void> {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
        for (const [key, value] of Object.entries(changes)) {
            if (value !== undefined) {
                frontmatter[key] = value;
            }
        }
    });
}

/**
 * Safely updates the body of a note while preserving its CURRENT frontmatter.
 * Uses vault.process for atomic updates to avoid race conditions.
 * 
 * @param app - The Obsidian App instance
 * @param file - The file to update
 * @param newBody - The new body content (should NOT contain frontmatter)
 */
export async function updateNoteBody(app: App, file: TFile, newBody: string): Promise<void> {
    await app.vault.process(file, (data) => {
        // ROBUST REGEX:
        // 1. (?:\ufeff)? matches optional Byte Order Mark
        // 2. \s* matches optional leading whitespace
        // 3. --- matches the start fence
        // 4. [\r\n]+ matches the newline(s)
        // 5. ([\s\S]*?) captures the content
        // 6. [\r\n]+ matches the newline(s) before end fence
        // 7. --- matches end fence
        // 8. \s* matches trailing spaces/newline
        const fmRegex = /^(?:\ufeff)?\s*---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/;
        
        const match = data.match(fmRegex);
        
        // Strip any leading whitespace/newlines from the new body to prevent gaps
        const cleanBody = newBody.replace(/^\s+/, '');

        if (match) {
            const currentFrontmatter = match[0].trim(); // Keep the fence and content
            return `${currentFrontmatter}\n${cleanBody}`;
        } else {
            // If no frontmatter exists in the live file, just return the new body
            return cleanBody;
        }
    });
}