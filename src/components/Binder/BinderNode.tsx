import React, { useState, useMemo } from 'react';
import { TAbstractFile, TFile, TFolder, App, Menu } from 'obsidian';
import { ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getRank } from '../../utils/metadata';

interface BinderNodeProps {
    app: App;
    item: TAbstractFile;
    depth: number;
    activeFile: TFile | null;
    version: number; // New prop to force re-sort
}

export const BinderNode: React.FC<BinderNodeProps> = ({ app, item, depth, activeFile, version }) => {
    const [collapsed, setCollapsed] = useState(false);

    const isFolder = item instanceof TFolder;
    const isFile = item instanceof TFile;
    const isActive = activeFile && activeFile.path === item.path;

    // --- Drag and Drop Logic ---
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver
    } = useSortable({ id: item.path });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // --- Interaction Handlers ---

    const handleFileClick = (e: React.MouseEvent) => {
        // Don't trigger if dragging (handled by sensors, but safe check)
        e.stopPropagation();
        if (isFile) {
            app.workspace.getLeaf(false).openFile(item as TFile);
        } else {
            setCollapsed(!collapsed);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu();
        app.workspace.trigger(
            "file-menu",
            menu,
            item,
            "file-explorer",
            app.workspace.getLeaf(false)
        );

        menu.showAtPosition({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY
        });
    };

    // --- Recursion & Sorting Logic ---

    // Calculate children strictly for rendering recursion
    // We include 'version' in dependency array to force re-calc when file system updates
    const sortedChildren = useMemo(() => {
        if (!isFolder) return [];
        const folder = item as TFolder;
        
        return [...folder.children].sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;

            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;

            if (aIsFolder && bIsFolder) {
                return a.name.localeCompare(b.name);
            }

            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    }, [item, app, isFolder, version]); 

    // Rank display for debugging/info
    const rankDisplay = isFile ? getRank(app, item as TFile) : null;

    return (
        <div 
            className="novelist-binder-item"
            ref={setNodeRef}
            style={style}
        >
            {/* The Row (Draggable Target) */}
            <div 
                className={`novelist-binder-row ${isActive ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''} ${isOver && !isDragging ? 'is-over' : ''}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleFileClick}
                onContextMenu={handleContextMenu}
                {...attributes}
                {...listeners} // The whole row is the drag handle
            >
                {/* Collapse Icon */}
                <div 
                    className={`novelist-binder-collapse-icon ${collapsed ? 'is-collapsed' : ''}`}
                    onClick={(e) => { 
                        // Stop propagation so we don't select/drag when collapsing
                        e.stopPropagation(); 
                        setCollapsed(!collapsed); 
                    }}
                    style={{ visibility: isFolder ? 'visible' : 'hidden' }}
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on collapse arrow
                >
                    <ChevronDown size={14} />
                </div>

                {/* Type Icon */}
                <div className="novelist-binder-icon">
                    {isFolder ? (
                        collapsed ? <Folder size={14} /> : <FolderOpen size={14} />
                    ) : (
                        <FileText size={14} />
                    )}
                </div>

                {/* Title */}
                <div className="novelist-binder-title">
                    {item.name}
                </div>

                {/* Debug Rank */}
                {rankDisplay !== 999999 && (
                    <div className="novelist-rank-badge">#{rankDisplay}</div>
                )}
            </div>

            {/* Recursion for Children */}
            {isFolder && !collapsed && sortedChildren.length > 0 && (
                <div className="novelist-binder-children">
                    <SortableContext 
                        items={sortedChildren.map(c => c.path)} 
                        strategy={verticalListSortingStrategy}
                    >
                        {sortedChildren.map(child => (
                            <BinderNode 
                                key={child.path} 
                                app={app} 
                                item={child} 
                                depth={depth + 1}
                                activeFile={activeFile}
                                version={version}
                            />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
};