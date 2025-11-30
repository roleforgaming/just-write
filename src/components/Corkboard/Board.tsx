import React, { useState, useEffect } from 'react';
import { App, TFile, TFolder, Notice } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Card } from './Card';
import { getRank } from '../../utils/metadata';
import { Plus } from 'lucide-react'; // Import Plus icon

interface BoardProps {
    app: App;
    folder: TFolder;
}

export const Board: React.FC<BoardProps> = ({ app, folder }) => {
    const [files, setFiles] = useState<TFile[]>([]);
    const [cardSize, setCardSize] = useState<'small' | 'medium' | 'large'>('medium');

    const refreshFiles = () => {
        const children = folder.children
            .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
            .sort((a, b) => getRank(app, a) - getRank(app, b));
        setFiles(children);
    };

    useEffect(() => {
        refreshFiles();
        const eventRef = app.metadataCache.on('resolved', refreshFiles);
        // Also listen for creation to update grid immediately
        const createRef = app.vault.on('create', refreshFiles);
        
        return () => { 
            app.metadataCache.offref(eventRef);
            app.vault.offref(createRef);
        };
    }, [folder]);

    // --- New Note Logic ---
    const handleAddCard = async () => {
        let counter = 1;
        let newName = `Untitled Scene ${counter}`;
        
        // Find unique name
        while (app.vault.getAbstractFileByPath(`${folder.path}/${newName}.md`)) {
            counter++;
            newName = `Untitled Scene ${counter}`;
        }

        // Calculate Rank (End of list)
        const highestRank = files.length > 0 ? getRank(app, files[files.length - 1]) : 0;
        const newRank = highestRank + 100;

        // Default Scrivener-like frontmatter
        const content = `---
rank: ${newRank}
label: Scene
status: Draft
synopsis: ""
notes: ""
---
`;
        try {
            await app.vault.create(`${folder.path}/${newName}.md`, content);
            // The 'create' listener in useEffect will trigger a refresh visually
            // But we also want to sync the file tree order
            setTimeout(() => triggerExternalCommand("Custom File Explorer sorting: Enable and apply the custom sorting, (re)parsing the sorting configuration first. Sort-on."), 200);
        } catch (err) {
            new Notice("Could not create new card.");
            console.error(err);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = files.findIndex((f) => f.path === active.id);
            const newIndex = files.findIndex((f) => f.path === over.id);
            
            const newOrder = arrayMove(files, oldIndex, newIndex);
            setFiles(newOrder);

            const updatePromises = newOrder.map((file, index) => {
                return app.fileManager.processFrontMatter(file, (fm: any) => {
                    fm.rank = index * 10;
                });
            });

            await Promise.all(updatePromises);
            triggerExternalCommand("Custom File Explorer sorting: Enable and apply the custom sorting, (re)parsing the sorting configuration first. Sort-on.");
        }
    };

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

    return (
        <div className="novelist-board-wrapper">
            {/* Toolbar */}
            <div className="novelist-board-toolbar">
                
                {/* ADD BUTTON */}
                <button className="novelist-add-btn" onClick={handleAddCard} title="Add New Card">
                    <Plus size={16} /> New Card
                </button>

                <div className="novelist-separator"></div>

                <select 
                    value={cardSize} 
                    onChange={(e) => setCardSize(e.target.value as any)}
                    className="novelist-size-selector"
                >
                    <option value="small">Small Cards</option>
                    <option value="medium">Medium Cards</option>
                    <option value="large">Large Cards</option>
                </select>
                <span className="novelist-toolbar-info">
                    {files.length} Cards
                </span>
            </div>

            {/* Grid */}
            <div className={`novelist-corkboard-grid size-${cardSize}`}>
                <DndContext 
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext 
                        items={files.map(f => f.path)} 
                        strategy={rectSortingStrategy}
                    >
                        {files.map((file) => (
                            <Card 
                                key={file.path} 
                                file={file} 
                                app={app} 
                                size={cardSize}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
};