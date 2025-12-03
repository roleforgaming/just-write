import { TFile, App } from 'obsidian';

export interface NovelistMetadata {
    synopsis: string;
    rank: number;
    label: string;
    status: string;
    icon: string;
    accentColor: string;
    notes: string;
    // New fields for Project Metadata
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
        notes: fm.notes || ""
    };
}

export function getRank(app: App, file: TFile): number {
    const cache = app.metadataCache.getFileCache(file);
    return typeof cache?.frontmatter?.rank === 'number' ? cache.frontmatter.rank : 999999;
}