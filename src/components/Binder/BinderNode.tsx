import React, { useState, useMemo } from 'react';
import { TAbstractFile, TFile, TFolder, App, Menu } from 'obsidian';
import { ChevronDown, FileText, Folder, FolderOpen, Trash2, FilePlus, FolderPlus } from 'lucide-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';

interface BinderNodeProps {
    app: App;
    item: TAbstractFile;
    depth: number;
    activeFile: TFile | null;
    version: number;
    currentProject: TFolder | null; // Receive project context
}

export const BinderNode: React.FC<BinderNodeProps> = ({ app, item, depth, activeFile, version, currentProject }) => {
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

    // --- Context Menu Handler ---
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu();
        const projectManager = new ProjectManager(app);

        // 1. Creation Options
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

        // 2. Move to Trash Option
        if (currentProject) {
            // Don't allow moving the Project Root or the Trash folder itself to Trash
            const isTrashFolder = item.name === "Trash" && item.parent?.path === currentProject.path;
            const isMarker = item.name === "project.md";
            
            if (!isTrashFolder && !isMarker) {
                menu.addItem((menuItem) => {
                    menuItem
                        .setTitle("Move to Project Trash")
                        .setIcon("trash-2")
                        .onClick(() => {
                            projectManager.moveToTrash(item, currentProject);
                        });
                });
            }
        }

        menu.addSeparator();

        // 3. Trigger Native Obsidian Context Menu
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
        e.stopPropagation();
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
                <div 
                    className={`novelist-binder-collapse-icon ${collapsed ? 'is-collapsed' : ''}`}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        setCollapsed(!collapsed); 
                    }}
                    style={{ visibility: isFolder ? 'visible' : 'hidden' }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <ChevronDown size={14} />
                </div>

                <div className="novelist-binder-icon">
                    {item.name === "Trash" ? <Trash2 size={14} /> : (
                        isFolder ? (
                            collapsed ? <Folder size={14} /> : <FolderOpen size={14} />
                        ) : (
                            <FileText size={14} />
                        )
                    )}
                </div>

                <div className="novelist-binder-title">
                    {item.name}
                </div>

                {rankDisplay !== 999999 && (
                    <div className="novelist-rank-badge">#{rankDisplay}</div>
                )}
            </div>

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