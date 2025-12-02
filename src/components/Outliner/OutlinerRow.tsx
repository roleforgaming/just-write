import React, { useState, useEffect } from 'react';
import { App, TFile, Notice } from 'obsidian';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { NovelistMetadata } from '../../utils/metadata';

interface OutlinerRowProps {
    app: App;
    file: TFile;
    metadata: NovelistMetadata;
    wordCount: number;
    visibleColumns: Set<string>;
    allMetadataKeys: string[];
    onSave: (file: TFile, key: string, value: any) => void;
    isReadOnly: boolean;
    isSelected: boolean;
    onRowClick: () => void;
}

export const OutlinerRow: React.FC<OutlinerRowProps> = ({ 
    app, file, metadata, wordCount, visibleColumns, allMetadataKeys, 
    onSave, isReadOnly, isSelected, onRowClick 
}) => {
    const [title, setTitle] = useState(file.basename);
    const [synopsis, setSynopsis] = useState(metadata.synopsis);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
        id: file.path,
        disabled: isReadOnly
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    };

    useEffect(() => {
        setTitle(file.basename);
        setSynopsis(metadata.synopsis);
    }, [file.basename, metadata.synopsis]);

    const handleTitleBlur = async () => {
        if (isReadOnly || !title.trim() || title === file.basename) {
            setTitle(file.basename);
            return;
        }
        const newPath = `${file.parent?.path}/${title.trim()}.md`;
        try {
            await app.fileManager.renameFile(file, newPath);
        } catch {
            new Notice("Rename failed. File may already exist.");
            setTitle(file.basename);
        }
    };
    
    // Helper to ensure selecting an input also selects the row
    const handleFocus = () => {
        if (!isSelected) onRowClick();
    };

    return (
        <tr 
            ref={setNodeRef} 
            style={style} 
            className={`novelist-outliner-row ${isDragging ? 'is-dragging' : ''} ${isSelected ? 'is-selected' : ''}`}
            onClick={onRowClick}
        >
            {!isReadOnly && (
                <td className="col-drag" {...attributes} {...listeners}>
                    <GripVertical size={16} />
                </td>
            )}

            {visibleColumns.has('title') && (
                <td>
                    <input 
                        type="text" value={title} 
                        disabled={isReadOnly}
                        onChange={e => setTitle(e.target.value)} 
                        onBlur={handleTitleBlur} 
                        onFocus={handleFocus}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                </td>
            )}
            
            {visibleColumns.has('synopsis') && (
                <td>
                    <textarea 
                        value={synopsis}
                        disabled={isReadOnly}
                        onChange={e => setSynopsis(e.target.value)}
                        onBlur={() => onSave(file, 'synopsis', synopsis)}
                        onFocus={handleFocus}
                        rows={1}
                    />
                </td>
            )}
            
            {visibleColumns.has('label') && (
                <td>
                    <select 
                        value={metadata.label} 
                        disabled={isReadOnly}
                        onChange={e => onSave(file, 'label', e.target.value)}
                        onFocus={handleFocus}
                    >
                         <option value="Chapter">Chapter</option>
                         <option value="Scene">Scene</option>
                         <option value="Research">Research</option>
                         <option value="Idea">Idea</option>
                         <option value="Character">Character</option>
                         <option value="Location">Location</option>
                    </select>
                </td>
            )}

            {visibleColumns.has('status') && (
                <td>
                    <select 
                        value={metadata.status} 
                        disabled={isReadOnly}
                        onChange={e => onSave(file, 'status', e.target.value)}
                        onFocus={handleFocus}
                    >
                        <option value="Draft">Draft</option>
                        <option value="Revised">Revised</option>
                        <option value="Final">Final</option>
                        <option value="Done">Done</option>
                    </select>
                </td>
            )}
            
            {visibleColumns.has('wordCount') && (
                <td className="col-wordcount">{wordCount.toLocaleString()}</td>
            )}
            
            {allMetadataKeys.map(key => visibleColumns.has(key) && (
                <td key={key}>
                    <input 
                        type="text"
                        disabled={isReadOnly}
                        defaultValue={(app.metadataCache.getFileCache(file)?.frontmatter || {})[key] || ''} 
                        onBlur={e => onSave(file, key, e.target.value)}
                        onFocus={handleFocus}
                    />
                </td>
            ))}
        </tr>
    );
};