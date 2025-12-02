import React, { useState, useMemo } from 'react';
import { TAbstractFile, TFile, TFolder, App, Menu, Notice } from 'obsidian';
import { ChevronDown, FileText, Folder, FolderOpen, Trash2 } from 'lucide-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { ConfirmModal } from '../../modals/ConfirmModal';

interface BinderNodeProps {
    app: App;
    item: TAbstractFile;
    depth: number;
    activeFile: TFile | null;
    version: number;
    currentProject: TFolder | null;
    selectedPaths: Set<string>;
    onNodeClick: (e: React.MouseEvent, file: TAbstractFile) => void;
    filterQuery?: string;
    expandedPaths: Set<string>; // Lifted state
    onToggleExpand: (path: string) => void; // Lifted toggler
}

export const BinderNode: React.FC<BinderNodeProps> = ({ 
    app, item, depth, activeFile, version, currentProject, 
    selectedPaths, onNodeClick, filterQuery = '',
    expandedPaths, onToggleExpand
}) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(item.name);

    const isFolder = item instanceof TFolder;
    const isFile = item instanceof TFile;
    const isActive = activeFile && activeFile.path === item.path;
    const isSelected = selectedPaths.has(item.path);
    const isExpanded = expandedPaths.has(item.path); // Check lifted state

    const projectManager = new ProjectManager(app);
    const inTrash = projectManager.isInTrash(item);
    const isTrashFolder = currentProject && item.path === `${currentProject.path}/Trash`;

    // --- Filter Logic ---
    const matchesFilter = (node: TAbstractFile, query: string): boolean => {
        if (!query) return true;
        if (node.name.toLowerCase().includes(query.toLowerCase())) return true;
        if (node instanceof TFolder) {
            return node.children.some(child => matchesFilter(child, query));
        }
        return false;
    };

    const isVisible = useMemo(() => matchesFilter(item, filterQuery), [item, filterQuery, version]);
    
    // If filtering, force expansion if needed
    const effectiveExpanded = useMemo(() => {
        if (filterQuery) {
             if (!isFolder) return false;
             return (item as TFolder).children.some(child => matchesFilter(child, filterQuery));
        }
        return isExpanded;
    }, [isExpanded, filterQuery, item, version]);

    // --- Drag and Drop Logic ---
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
        active
    } = useSortable({ 
        id: item.path,
        data: {
            type: isFolder ? 'folder' : 'file',
            path: item.path,
            parent: item.parent?.path
        },
        disabled: inTrash || isTrashFolder || isRenaming || !!filterQuery // Disable DND during filter
    });

    // Determine drop visual feedback
    const isDropTarget = isOver && !isDragging && isFolder && active && active.id !== item.path;

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : (inTrash ? 0.7 : 1),
    };

    // --- Handlers ---

    const handleRenameSubmit = async () => {
        setIsRenaming(false);
        if (renameValue === item.name || !renameValue.trim()) {
            setRenameValue(item.name);
            return;
        }
        const newPath = item.parent ? `${item.parent.path}/${renameValue.trim()}` : renameValue.trim();
        try {
            await app.fileManager.renameFile(item, newPath);
        } catch {
            new Notice("Rename failed.");
            setRenameValue(item.name);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); 

        const menu = new Menu();

        if (isTrashFolder) {
            menu.addItem((i) => i.setTitle("Empty Trash").setIcon("trash-2").setWarning(true)
                .onClick(() => new ConfirmModal(app, "Empty Trash", "Delete all?", () => projectManager.emptyTrash(item as TFolder)).open()));
            menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            return;
        }

        if (inTrash) {
            menu.addItem((i) => i.setTitle("Restore").setIcon("rotate-ccw").onClick(() => projectManager.restoreFromTrash(item)));
            menu.addItem((i) => i.setTitle("Delete Permanently").setIcon("x-circle").setWarning(true)
                .onClick(() => new ConfirmModal(app, "Delete", `Delete "${item.name}"?`, () => projectManager.permanentlyDelete(item)).open()));
            menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            return;
        }

        menu.addItem((i) => i.setTitle("Rename").setIcon("pencil").onClick(() => setIsRenaming(true)));
        menu.addSeparator();
        menu.addItem((i) => i.setTitle("New Document").setIcon("file-plus")
            .onClick(() => { const t = isFolder ? item as TFolder : item.parent; if(t) projectManager.createNewItem(t, 'file'); }));
        menu.addItem((i) => i.setTitle("New Folder").setIcon("folder-plus")
            .onClick(() => { const t = isFolder ? item as TFolder : item.parent; if(t) projectManager.createNewItem(t, 'folder'); }));
        
        if (currentProject && item.name !== "project.md") {
            menu.addSeparator();
            menu.addItem((i) => i.setTitle("Move to Trash").setIcon("trash-2")
                .onClick(() => projectManager.moveToTrash(item, currentProject)));
        }

        menu.addSeparator();
        
        // Fix: Use getMostRecentLeaf() instead of getLeaf(false) to avoid unwanted creation of new tabs
        const leaf = app.workspace.getMostRecentLeaf();
        app.workspace.trigger("file-menu", menu, item, "file-explorer", leaf);
        
        menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            onToggleExpand(item.path);
        }
    };

    // --- Sorting Recursion ---
    const sortedChildren = useMemo(() => {
        if (!isFolder) return [];
        const folder = item as TFolder;
        
        return [...folder.children].sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            if (aIsFolder && bIsFolder) return a.name.localeCompare(b.name);
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    }, [item, app, isFolder, version]); 

    const rankDisplay = isFile ? getRank(app, item as TFile) : null;

    if (!isVisible) return null;

    return (
        <div className="novelist-binder-item" ref={setNodeRef} style={style}>
            <div 
                className={`novelist-binder-row 
                    ${isActive ? 'is-active' : ''} 
                    ${isSelected ? 'is-selected' : ''}
                    ${isDropTarget ? 'is-drop-target' : ''}
                `}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={(e) => onNodeClick(e, item)}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                {...attributes}
                {...listeners}
            >
                <div 
                    className={`novelist-binder-collapse-icon ${!effectiveExpanded ? 'is-collapsed' : ''}`}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if(isFolder) onToggleExpand(item.path); 
                    }}
                    style={{ visibility: isFolder ? 'visible' : 'hidden' }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <ChevronDown size={14} />
                </div>

                <div className="novelist-binder-icon">
                    {item.name === "Trash" ? <Trash2 size={14} /> : (
                        isFolder ? (!effectiveExpanded ? <Folder size={14} /> : <FolderOpen size={14} />) : <FileText size={14} />
                    )}
                </div>

                <div className="novelist-binder-title">
                    {isRenaming ? (
                        <input 
                            autoFocus value={renameValue}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={(e) => { if(e.key === 'Enter') handleRenameSubmit(); if(e.key==='Escape') setIsRenaming(false); }}
                            style={{ width: '100%' }}
                        />
                    ) : item.name}
                </div>

                {inTrash && <span style={{fontSize: '0.7em', opacity: 0.5, marginLeft: 5}}>(Read Only)</span>}
                {rankDisplay !== 999999 && !isFolder && <div className="novelist-rank-badge">#{rankDisplay}</div>}
            </div>

            {isFolder && effectiveExpanded && (
                <div className="novelist-binder-children">
                    <SortableContext items={sortedChildren.map(c => c.path)} strategy={verticalListSortingStrategy} disabled={!!filterQuery}>
                        {sortedChildren.map(child => (
                            <BinderNode 
                                key={child.path} 
                                app={app} 
                                item={child} 
                                depth={depth + 1}
                                activeFile={activeFile}
                                version={version}
                                currentProject={currentProject}
                                selectedPaths={selectedPaths}
                                onNodeClick={onNodeClick}
                                filterQuery={filterQuery}
                                expandedPaths={expandedPaths}
                                onToggleExpand={onToggleExpand}
                            />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
};