import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, TFile, TFolder, Notice } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { OutlinerRow } from './OutlinerRow';
import { getRank, NovelistMetadata } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { OutlinerToolbar } from './OutlinerToolbar';

interface OutlinerProps {
    app: App;
    folder: TFolder;
}

export const Outliner: React.FC<OutlinerProps> = ({ app, folder }) => {
    const [files, setFiles] = useState<TFile[]>([]);
    const [metadata, setMetadata] = useState<Record<string, NovelistMetadata>>({});
    const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
    const [allMetadataKeys, setAllMetadataKeys] = useState<string[]>([]);
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
        new Set(['title', 'synopsis', 'status', 'wordCount'])
    );
    
    const projectManager = useMemo(() => new ProjectManager(app), [app]);
    const isTrash = useMemo(() => projectManager.isInTrash(folder) || folder.name === 'Trash', [projectManager, folder]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const refreshData = useCallback(async () => {
        const children = folder.children
            .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
            .sort((a, b) => getRank(app, a) - getRank(app, b));
        
        setFiles(children);

        const meta: Record<string, NovelistMetadata> = {};
        const counts: Record<string, number> = {};
        const keys = new Set<string>();

        for (const file of children) {
            const cache = app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};
            meta[file.path] = {
                synopsis: fm.synopsis || "", rank: typeof fm.rank === 'number' ? fm.rank : 999999,
                label: fm.label || "Scene", status: fm.status || "Draft", icon: fm.icon || "file-text",
                accentColor: fm.accentColor || "", notes: fm.notes || ""
            };

            const content = await app.vault.cachedRead(file);
            counts[file.path] = (content.match(/\S+/g) || []).length;
            
            Object.keys(fm).forEach(key => {
                if (!['synopsis', 'rank', 'label', 'status', 'icon', 'accentColor', 'notes', 'tags', 'position'].includes(key)) {
                    keys.add(key);
                }
            });
        }
        setMetadata(meta);
        setWordCounts(counts);
        setAllMetadataKeys(Array.from(keys));
    }, [folder, app]);

    useEffect(() => {
        refreshData();
        const eventRef = app.metadataCache.on('changed', (file) => {
            if (file.parent?.path === folder.path) refreshData();
        });
        const vaultEventRef = app.vault.on('modify', (file) => {
             if (file.parent?.path === folder.path) refreshData();
        });
        return () => {
            app.metadataCache.offref(eventRef);
            app.vault.offref(vaultEventRef);
        }
    }, [refreshData]);

    const handleDragEnd = async (event: DragEndEvent) => {
        if (isTrash) return;
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = files.findIndex((f) => f.path === active.id);
            const newIndex = files.findIndex((f) => f.path === over.id);
            const newOrder = arrayMove(files, oldIndex, newIndex);
            
            setFiles(newOrder); // Optimistic update

            const updatePromises = newOrder.map((file, index) => {
                return app.fileManager.processFrontMatter(file, (fm: any) => {
                    fm.rank = index * 10;
                });
            });
            await Promise.all(updatePromises);
            new Notice("Reordered documents.");
        }
    };

    const handleSave = async (file: TFile, key: string, value: any) => {
        if (isTrash) return;
        await app.fileManager.processFrontMatter(file, (fm) => {
            fm[key] = value;
        });
    };

    const handleCreateNew = async () => {
        if (isTrash) return;
        await projectManager.createNewItem(folder, 'file');
        refreshData();
    };

    return (
        <div className="novelist-outliner-container">
            <OutlinerToolbar 
                visibleColumns={visibleColumns}
                allMetadataKeys={allMetadataKeys}
                onColumnToggle={(key) => {
                    setVisibleColumns(prev => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                    });
                }}
                onAdd={handleCreateNew}
                isReadOnly={isTrash}
            />
            <div className="novelist-outliner-table-wrapper">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={files.map(f => f.path)} strategy={verticalListSortingStrategy} disabled={isTrash}>
                        <table className="novelist-outliner-table">
                            <thead>
                                <tr>
                                    {!isTrash && <th className="col-drag"></th>}
                                    {visibleColumns.has('title') && <th className="col-title">Title</th>}
                                    {visibleColumns.has('synopsis') && <th className="col-synopsis">Synopsis</th>}
                                    {visibleColumns.has('label') && <th className="col-label">Label</th>}
                                    {visibleColumns.has('status') && <th className="col-status">Status</th>}
                                    {visibleColumns.has('wordCount') && <th className="col-wordcount">Words</th>}
                                    {allMetadataKeys.map(key => visibleColumns.has(key) && <th key={key}>{key}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {files.map(file => (
                                    <OutlinerRow
                                        key={file.path}
                                        app={app}
                                        file={file}
                                        metadata={metadata[file.path]}
                                        wordCount={wordCounts[file.path]}
                                        visibleColumns={visibleColumns}
                                        allMetadataKeys={allMetadataKeys}
                                        onSave={handleSave}
                                        isReadOnly={isTrash}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
};