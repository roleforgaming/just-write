import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { App, TFile } from 'obsidian';
import { getMetadata, NovelistMetadata } from '../../utils/metadata';
import { CardToolbar } from './CardToolbar';
import * as Lucide from 'lucide-react';
import { Move } from 'lucide-react';

interface CardProps {
    file: TFile;
    app: App;
    size: 'small' | 'medium' | 'large';
    readOnly?: boolean;
}

export const Card: React.FC<CardProps> = ({ file, app, size, readOnly = false }) => {
    const [meta, setMeta] = useState<NovelistMetadata>(getMetadata(app, file));
    const [title, setTitle] = useState(file.basename);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: file.path, disabled: readOnly });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : (readOnly ? 0.8 : 1),
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
        const eventRef = app.metadataCache.on('changed', (changedFile) => { if (changedFile.path === file.path) refresh(); });
        const renameRef = app.vault.on('rename', (renamedFile) => { 
            if (renamedFile.path === file.path) {
                 if (renamedFile instanceof TFile) setTitle(renamedFile.basename);
                 else setTitle(renamedFile.name);
            }
        });
        return () => { app.metadataCache.offref(eventRef); app.vault.offref(renameRef); };
    }, [file]);

    const handleRename = async () => {
        if (readOnly) return;
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
        if (readOnly) return;
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm.synopsis = meta.synopsis;
        });
    };

    const handleOptimisticUpdate = (key: keyof NovelistMetadata, value: any) => {
        if (readOnly) return;
        setMeta(prev => ({ ...prev, [key]: value }));
    };

    // @ts-ignore
    const IconComponent = Lucide[meta.icon.charAt(0).toUpperCase() + meta.icon.slice(1)] || Lucide.FileText;

    const handleSingleClick = () => {
        (app.workspace as any).trigger('novelist:select-file', file);
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`novelist-index-card card-size-${size}`}
            onClick={handleSingleClick}
            onDoubleClick={() => app.workspace.getLeaf(false).openFile(file)}
        >
            <div className="novelist-card-accent" style={{ backgroundColor: meta.accentColor || '#ccc' }} />

            {!readOnly && (
                <div className="novelist-drag-handle-corner" {...attributes} {...listeners} title="Drag to reorder">
                    <Move size={14} />
                </div>
            )}

            <div className="novelist-card-header">
                {/* @ts-ignore */}
                <IconComponent size={16} className="novelist-card-icon" />
                
                <input 
                    className="novelist-card-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleRename}
                    disabled={readOnly}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
            </div>

            <textarea 
                className="novelist-card-body-input"
                value={meta.synopsis}
                placeholder={readOnly ? "No synopsis" : "Write synopsis..."}
                onChange={(e) => setMeta({ ...meta, synopsis: e.target.value })}
                onBlur={handleSaveSynopsis}
                disabled={readOnly}
                onMouseDown={(e) => e.stopPropagation()}
            />
            
            {!readOnly && (
                <div className="novelist-card-footer">
                    <CardToolbar 
                        file={file} 
                        app={app} 
                        currentStatus={meta.status} 
                        currentIcon={meta.icon}
                        onOptimisticUpdate={handleOptimisticUpdate}
                    />
                </div>
            )}
        </div>
    );
};