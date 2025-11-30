import React, { useState, useEffect } from 'react';
import { App, TFile, Menu, TAbstractFile, TFolder } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';

interface BinderProps {
    app: App;
}

export const Binder: React.FC<BinderProps> = ({ app }) => {
    // We only need the root's children to start the tree
    const [rootChildren, setRootChildren] = useState(app.vault.getRoot().children);
    const [activeFile, setActiveFile] = useState<TFile | null>(app.workspace.getActiveFile());
    // Version state to force deep re-renders when sort order changes
    const [fileSystemVersion, setFileSystemVersion] = useState(0);

    // Configure sensors to allow clicking without dragging immediately
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Drag must move 8px before starting
            },
        })
    );

    // Helper to trigger external sorting plugins (like Custom File Explorer Sort)
    const triggerExternalCommand = (name: string) => {
        // @ts-ignore
        const commands = app.commands;
        // @ts-ignore
        const foundCommand = Object.values(commands.commands).find((cmd: any) => cmd.name === name);
        if (foundCommand) {
            // @ts-ignore
            commands.executeCommandById(foundCommand.id);
        }
    };

    const sortChildren = (children: TAbstractFile[]) => {
        return [...children].sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;

            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;

            if (aIsFolder && bIsFolder) {
                return a.name.localeCompare(b.name);
            }

            // Both are files, sort by rank
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    };

    const refresh = () => {
        setRootChildren(sortChildren(app.vault.getRoot().children));
        setFileSystemVersion(v => v + 1);
    };

    useEffect(() => {
        // Initial sort
        refresh();

        const metaRef = app.metadataCache.on('resolved', refresh);
        // 'changed' event fires when a file's cache is updated (e.g. rank changed)
        const cacheRef = app.metadataCache.on('changed', refresh);
        const modifyRef = app.vault.on('modify', refresh);
        const createRef = app.vault.on('create', refresh);
        const deleteRef = app.vault.on('delete', refresh);
        const renameRef = app.vault.on('rename', refresh);

        const activeLeafRef = app.workspace.on('file-open', (file) => {
            setActiveFile(file);
        });

        return () => {
            app.metadataCache.offref(metaRef);
            app.metadataCache.offref(cacheRef);
            app.vault.offref(modifyRef);
            app.vault.offref(createRef);
            app.vault.offref(deleteRef);
            app.vault.offref(renameRef);
            app.workspace.offref(activeLeafRef);
        };
    }, [app]);

    const handleBackgroundContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (e.target !== e.currentTarget) return;

        const menu = new Menu();
        app.workspace.trigger(
            "file-menu",
            menu,
            app.vault.getRoot(),
            "file-explorer",
            app.workspace.getLeaf(false)
        );
        menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        // Basic validation
        if (!over || active.id === over.id) return;

        const activeFile = app.vault.getAbstractFileByPath(active.id as string);
        const overFile = app.vault.getAbstractFileByPath(over.id as string);

        if (!activeFile || !overFile) return;

        // Ensure we are dragging within the same folder (Sibling reordering)
        if (activeFile.parent?.path !== overFile.parent?.path) {
            return; 
        }

        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        // Get current sorted order to determine indices
        const siblings = sortChildren(parentFolder.children);
        
        const oldIndex = siblings.findIndex(x => x.path === activeFile.path);
        const newIndex = siblings.findIndex(x => x.path === overFile.path);

        if (oldIndex === -1 || newIndex === -1) return;

        // Create the new array order
        const newOrder = arrayMove(siblings, oldIndex, newIndex);

        // Update Ranks based on new index (0, 10, 20...)
        const updatePromises = newOrder.map((file, index) => {
            if (file instanceof TFile && file.extension === 'md') {
                return app.fileManager.processFrontMatter(file, (fm) => {
                    fm.rank = index * 10;
                });
            }
            return Promise.resolve();
        });

        await Promise.all(updatePromises);

        // Sync with external sorting plugins if present
        triggerExternalCommand("Custom File Explorer sorting: Enable and apply the custom sorting, (re)parsing the sorting configuration first. Sort-on.");
    };

    return (
        <div 
            className="novelist-binder-container"
            onContextMenu={handleBackgroundContextMenu}
        >
            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext 
                    items={rootChildren.map(c => c.path)} 
                    strategy={verticalListSortingStrategy}
                >
                    {rootChildren.map(child => (
                        <BinderNode 
                            key={child.path}
                            app={app}
                            item={child}
                            depth={0}
                            activeFile={activeFile}
                            version={fileSystemVersion}
                        />
                    ))}
                </SortableContext>
            </DndContext>
        </div>
    );
};