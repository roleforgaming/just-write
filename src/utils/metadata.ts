import { TFile, App, getFrontMatterInfo } from 'obsidian';

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
        // --- FIXED: Use getFrontMatterInfo instead of Regex ---
        const info = getFrontMatterInfo(data);
        
        // 1. Extract existing frontmatter (including the fence and trailing newline)
        // info.contentStart is the index where the actual body begins.
        const existingFrontmatter = info.exists ? data.slice(0, info.contentStart) : '';

        // 2. Clean up the new body (remove leading whitespace to prevent huge gaps)
        const cleanBody = newBody.trim();

        // 3. Combine
        if (existingFrontmatter) {
            // Ensure we don't accidentally lose the newline separator if the slice didn't catch it
            // (though contentStart usually accounts for it).
            // To be safe, we check if it ends in whitespace.
            const separator = existingFrontmatter.match(/\s$/) ? '' : '\n';
            return `${existingFrontmatter}${separator}${cleanBody}`;
        } else {
            return cleanBody;
        }
    });
}