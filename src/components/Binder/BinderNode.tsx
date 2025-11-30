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
}

export const BinderNode: React.FC<BinderNodeProps> = ({ app, item, depth, activeFile, version, currentProject }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(item.name);

    const isFolder = item instanceof TFolder;
    const isFile = item instanceof TFile;
    const isActive = activeFile && activeFile.path === item.path;

    const projectManager = new ProjectManager(app);
    const inTrash = projectManager.isInTrash(item);
    const isTrashFolder = currentProject && item.path === `${currentProject.path}/Trash`;

    // --- Drag and Drop Logic ---
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver
    } = useSortable({ 
        id: item.path,
        disabled: inTrash || isTrashFolder || isRenaming
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: inTrash ? 0.7 : 1
    };

    // --- Rename Handler ---
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

    // --- Context Menu Handler ---
    const handleContextMenu = (e: React.MouseEvent) => {
        // Crucial: Stop Immediate Propagation prevents events from bubbling to global 
        // Obsidian handlers that might trigger navigation or other unintended side effects.
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation(); 

        const menu = new Menu();
        
        // 1. TRASH FOLDER OPTIONS
        if (isTrashFolder) {
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle("Empty Trash")
                    .setIcon("trash-2")
                    .setWarning(true)
                    .onClick(() => {
                        new ConfirmModal(
                            app, 
                            "Empty Project Trash", 
                            "Are you sure you want to permanently delete all items in the Trash? This cannot be undone.",
                            () => projectManager.emptyTrash(item as TFolder)
                        ).open();
                    });
            });
            menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            return;
        }

        // 2. ITEMS INSIDE TRASH OPTIONS
        if (inTrash) {
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle("Restore to Original Location")
                    .setIcon("rotate-ccw")
                    .onClick(() => projectManager.restoreFromTrash(item));
            });
            
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle("Delete Permanently")
                    .setIcon("x-circle")
                    .setWarning(true)
                    .onClick(() => {
                        new ConfirmModal(
                            app, 
                            "Delete Permanently", 
                            `Are you sure you want to delete "${item.name}"?`,
                            () => projectManager.permanentlyDelete(item)
                        ).open();
                    });
            });

            menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            return;
        }

        // 3. STANDARD OPTIONS (Not in trash)
        
        menu.addItem((menuItem) => {
            menuItem
                .setTitle("Rename")
                .setIcon("pencil")
                .onClick(() => setIsRenaming(true));
        });

        menu.addSeparator();

        menu.addItem((menuItem) => {
            menuItem
                .setTitle("New Document")
                .setIcon("file-plus")
                .onClick(() => {
                    const targetFolder = isFolder ? (item as TFolder) : item.parent;
                    if(targetFolder) projectManager.createNewItem(targetFolder, 'file');
                });
        });

        menu.addItem((menuItem) => {
            menuItem
                .setTitle("New Folder")
                .setIcon("folder-plus")
                .onClick(() => {
                    const targetFolder = isFolder ? (item as TFolder) : item.parent;
                    if(targetFolder) projectManager.createNewItem(targetFolder, 'folder');
                });
        });

        menu.addSeparator();

        // Move to Trash Option
        if (currentProject && item.name !== "project.md") {
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle("Move to Project Trash")
                    .setIcon("trash-2")
                    .onClick(() => {
                        projectManager.moveToTrash(item, currentProject);
                    });
            });
        }

        menu.addSeparator();

        // Trigger Native Obsidian Context Menu
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

    const handleFileClick = (e: React.MouseEvent) => {
        // Prevent right-clicks from triggering click logic
        if (e.button !== 0) return;

        e.stopPropagation();
        if (isRenaming) return;

        if (isFile) {
            app.workspace.getLeaf(false).openFile(item as TFile);
        } else {
            setCollapsed(!collapsed);
        }
    };

    // --- Recursion & Sorting Logic ---
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

    const rankDisplay = isFile ? getRank(app, item as TFile) : null;

    return (
        <div 
            className="novelist-binder-item"
            ref={setNodeRef}
            style={style}
        >
            <div 
                className={`novelist-binder-row ${isActive ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''} ${isOver && !isDragging ? 'is-over' : ''}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleFileClick}
                onContextMenu={handleContextMenu}
                {...attributes}
                {...listeners}
            >
                {/* Collapse Icon */}
                <div 
                    className={`novelist-binder-collapse-icon ${collapsed ? 'is-collapsed' : ''}`}
                    onClick={(e) => { 
                        if(e.button !== 0) return;
                        e.stopPropagation(); 
                        setCollapsed(!collapsed); 
                    }}
                    style={{ visibility: isFolder ? 'visible' : 'hidden' }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <ChevronDown size={14} />
                </div>

                {/* Icon */}
                <div className="novelist-binder-icon">
                    {item.name === "Trash" ? <Trash2 size={14} /> : (
                        isFolder ? (
                            collapsed ? <Folder size={14} /> : <FolderOpen size={14} />
                        ) : (
                            <FileText size={14} />
                        )
                    )}
                </div>

                {/* Title / Rename Input */}
                <div className="novelist-binder-title">
                    {isRenaming ? (
                        <input 
                            autoFocus
                            value={renameValue}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit();
                                if (e.key === 'Escape') {
                                    setRenameValue(item.name);
                                    setIsRenaming(false);
                                }
                            }}
                            style={{ width: '100%' }}
                        />
                    ) : (
                        item.name
                    )}
                </div>

                {/* Read Only Badge if in Trash */}
                {inTrash && <span style={{fontSize: '0.7em', opacity: 0.5, marginLeft: 5}}>(Read Only)</span>}

                {rankDisplay !== 999999 && !isFolder && (
                    <div className="novelist-rank-badge">#{rankDisplay}</div>
                )}
            </div>

            {/* Children Recursion */}
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
                                currentProject={currentProject}
                            />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
};