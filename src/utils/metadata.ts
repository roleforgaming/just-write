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
        // Preserve optional fields if they exist
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

/**
 * Safely updates the metadata for a file using Obsidian's atomic frontmatter API.
 * This ensures that the body of the note is never modified or deleted during updates.
 * 
 * @param app - The Obsidian App instance
 * @param file - The file to update
 * @param changes - An object containing only the fields to be updated
 */
export async function updateMetadata(app: App, file: TFile, changes: Partial<NovelistMetadata>): Promise<void> {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
        for (const [key, value] of Object.entries(changes)) {
            // Explicitly check for undefined to allow clearing values with null/empty string if intended,
            // but ignore fields not present in the changes object.
            if (value !== undefined) {
                frontmatter[key] = value;
            }
        }
    });
}