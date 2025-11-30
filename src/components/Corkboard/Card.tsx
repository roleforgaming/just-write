import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { App, TFile } from 'obsidian';
import { getMetadata, NovelistMetadata } from '../../utils/metadata';
import { CardToolbar } from './CardToolbar';
import * as Lucide from 'lucide-react';
import { Move } from 'lucide-react'; // Import the Move icon

interface CardProps {
    file: TFile;
    app: App;
    size: 'small' | 'medium' | 'large';
}

export const Card: React.FC<CardProps> = ({ file, app, size }) => {
    const [meta, setMeta] = useState<NovelistMetadata>(getMetadata(app, file));
    const [title, setTitle] = useState(file.basename);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: file.path });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 999 : 1,
        position: 'relative',
    };

    const refresh = () => {
        const newMeta = getMetadata(app, file);
        setMeta(newMeta);
        if (document.activeElement?.className !== 'novelist-card-title-input') {
             setTitle(file.basename);
        }
    };

    useEffect(() => {
        refresh();
        const eventRef = app.metadataCache.on('changed', (changedFile) => {
            if (changedFile.path === file.path) {
                refresh();
            }
        });
        
        const renameRef = app.vault.on('rename', (renamedFile) => {
            if (renamedFile.path === file.path) {
                 if (renamedFile instanceof TFile) {
                     setTitle(renamedFile.basename);
                 } else {
                     setTitle(renamedFile.name);
                 }
            }
        });

        return () => { 
            app.metadataCache.offref(eventRef); 
            app.vault.offref(renameRef);
        };
    }, [file]);

    const handleRename = async () => {
        if (!title || title.trim() === "" || title === file.basename) {
            setTitle(file.basename);
            return;
        }
        const newPath = file.parent ? `${file.parent.path}/${title.trim()}.md` : `${title.trim()}.md`;
        try {
            await app.fileManager.renameFile(file, newPath);
        } catch (e) {
            console.error("Rename failed", e);
            setTitle(file.basename);
        }
    };

    const handleSaveSynopsis = async () => {
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm.synopsis = meta.synopsis;
        });
    };

    const handleOptimisticUpdate = (key: keyof NovelistMetadata, value: any) => {
        setMeta(prev => ({ ...prev, [key]: value }));
    };

    // @ts-ignore
    const IconComponent = Lucide[meta.icon.charAt(0).toUpperCase() + meta.icon.slice(1)] || Lucide.FileText;

    const handleSingleClick = (e: React.MouseEvent) => {
        // Prevent triggering if we clicked a toolbar/input (handled by stopsPropagation usually, but good to be safe)
        // Trigger custom event for Inspector
        (app.workspace as any).trigger('novelist:select-file', file);
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`novelist-index-card card-size-${size}`}
            onClick={handleSingleClick}  // <--- Add this
            onDoubleClick={() => app.workspace.getLeaf(false).openFile(file)}
        >
            {/* Accent Bar */}
            <div className="novelist-card-accent" style={{ backgroundColor: meta.accentColor || '#ccc' }} />

            {/* 1. DEDICATED DRAG HANDLE (Upper Right) */}
            <div 
                className="novelist-drag-handle-corner" 
                {...attributes} 
                {...listeners}
                title="Drag to reorder"
            >
                <Move size={14} />
            </div>

            {/* Header (Title editing only, no drag) */}
            <div className="novelist-card-header">
                {/* @ts-ignore */}
                <IconComponent size={16} className="novelist-card-icon" />
                
                <input 
                    className="novelist-card-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    // No specific propagation stopping needed here anymore as parent isn't draggable
                />
            </div>

            <textarea 
                className="novelist-card-body-input"
                value={meta.synopsis}
                placeholder="Write synopsis..."
                onChange={(e) => setMeta({ ...meta, synopsis: e.target.value })}
                onBlur={handleSaveSynopsis}
                onMouseDown={(e) => e.stopPropagation()}
            />
            
            <div className="novelist-card-footer">
                <CardToolbar 
                    file={file} 
                    app={app} 
                    currentStatus={meta.status} 
                    currentIcon={meta.icon}
                    onOptimisticUpdate={handleOptimisticUpdate}
                />
            </div>
        </div>
    );
};