import React, { useState, useMemo } from 'react';
import { TAbstractFile, TFile, TFolder, App, Menu, Notice } from 'obsidian';
import { ChevronDown, Folder, FolderOpen, Trash2, FileQuestion } from 'lucide-react';
import * as icons from 'lucide-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { IconPickerModal } from '../../modals/IconPickerModal';

// Helper to convert kebab-case to PascalCase
const toPascalCase = (str: string) => str.replace(/(^\w|-\w)/g, g => g.replace('-', '').toUpperCase());

// Helper to determine default icon based on extension
// Helper to determine default icon based on extension
const getFileIcon = (extension: string) => {
    const ext = extension.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return icons.FileImage;
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return icons.FileAudio;
    if (['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'].includes(ext)) return icons.FileVideo;
    if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) return icons.FileText;
    if (ext === 'pdf') return icons.ScrollText; // Updated PDF icon
    if (['js', 'ts', 'css', 'html', 'json', 'py', 'rb'].includes(ext)) return icons.FileCode;
    if (['csv', 'xls', 'xlsx'].includes(ext)) return icons.FileSpreadsheet;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return (icons as any).FileArchive || icons.Archive;
    if (ext === 'canvas') return (icons as any).LayoutTemplate || icons.Layout;
    return icons.File; // Generic fallback
};

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
    expandedPaths: Set<string>;
    onToggleExpand: (path: string) => void;
    iconMap: Record<string, string>;
    onSetIcon: (itemPath: string, iconName: string | null) => void;
    iconColorMap: Record<string, string>;
    onSetIconColor: (itemPath: string, color: string | null) => void;
}

export const BinderNode: React.FC<BinderNodeProps> = ({ 
    app, item, depth, activeFile, version, currentProject, 
    selectedPaths, onNodeClick, filterQuery = '',
    expandedPaths, onToggleExpand, iconMap, onSetIcon,
    iconColorMap, onSetIconColor
}) => {
    // Determine the display name (Basename for files, Name for folders)
    const displayName = item instanceof TFile ? item.basename : item.name;

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(displayName);

    const isFolder = item instanceof TFolder;
    const isFile = item instanceof TFile;
    const isActive = activeFile && activeFile.path === item.path;
    const isSelected = selectedPaths.has(item.path);
    const isExpanded = expandedPaths.has(item.path);

    const projectManager = new ProjectManager(app);
    const inTrash = projectManager.isInTrash(item);
    const isTrashFolder = currentProject && item.path === `${currentProject.path}/Trash`;

    // Folder Note Check (uses index.md via ProjectManager)
    const folderNote = useMemo(() => {
        if (!isFolder) return null;
        return projectManager.getFolderNote(item as TFolder);
    }, [isFolder, item, version]);

    const isFolderNoteActive = activeFile && folderNote && activeFile.path === folderNote.path;

    const matchesFilter = (node: TAbstractFile, query: string): boolean => {
        if (!query) return true;
        if (node.name.toLowerCase().includes(query.toLowerCase())) return true;
        if (node instanceof TFolder) {
            return node.children.some(child => matchesFilter(child, query));
        }
        return false;
    };

    const isVisible = useMemo(() => matchesFilter(item, filterQuery), [item, filterQuery, version]);
    
    const effectiveExpanded = useMemo(() => {
        if (filterQuery) {
             if (!isFolder) return false;
             return (item as TFolder).children.some(child => matchesFilter(child, filterQuery));
        }
        return isExpanded;
    }, [isExpanded, filterQuery, item, version]);

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
        disabled: inTrash || isTrashFolder || isRenaming || !!filterQuery
    });

    const isDropTarget = isOver && !isDragging && isFolder && active && active.id !== item.path;

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : (inTrash ? 0.7 : 1),
    };

    const handleRenameSubmit = async () => {
        setIsRenaming(false);
        const trimmed = renameValue.trim();

        if (trimmed === displayName || !trimmed) {
            setRenameValue(displayName);
            return;
        }

        // Handle File Extension preservation
        let newName = trimmed;
        if (isFile) {
            // Append extension if user didn't type it (assuming they are renaming just basename)
            // But renameValue currently holds just the basename, so we must add extension.
            // Obsidian's renameFile expects the full name with extension.
            newName = `${trimmed}.${(item as TFile).extension}`;
        }

        const newPath = item.parent ? `${item.parent.path}/${newName}` : newName;
        
        try {
            await app.fileManager.renameFile(item, newPath);
            
            // Folder Note Rename Logic
            // If it's a folder, we need to update the title property in index.md
            if (isFolder && folderNote) {
                // The folder note itself is still named index.md, but we want to update the 'title' metadata
                await app.fileManager.processFrontMatter(folderNote, (fm) => {
                    fm.title = trimmed;
                });
            }

        } catch {
            new Notice("Rename failed.");
            setRenameValue(displayName);
        }
    };

    // Handle clicking the text itself
    const handleTitleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onNodeClick(e, item);
        
        // If it is a folder and has a folder note, open it
        if (isFolder && folderNote) {
            app.workspace.getLeaf(false).openFile(folderNote);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); 

        const menu = new Menu();

        if (isTrashFolder) {
            menu.addItem((i) => i.setTitle("Empty Trash").setIcon("trash-2").setWarning(true)
                .onClick(() => new ConfirmModal(app, "Empty Trash", "Are you sure you want to delete all items in the trash? This cannot be undone.", [
                    { text: 'Cancel', action: () => {} },
                    { text: 'Empty Trash', action: () => projectManager.emptyTrash(item as TFolder), warning: true }
                ]).open()));
            menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            return;
        }

        if (inTrash) {
            menu.addItem((i) => i.setTitle("Restore").setIcon("rotate-ccw").onClick(() => projectManager.restoreFromTrash(item)));
            menu.addItem((i) => i.setTitle("Delete Permanently").setIcon("x-circle").setWarning(true)
                .onClick(() => new ConfirmModal(app, "Delete Permanently", `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`, [
                    { text: 'Cancel', action: () => {} },
                    { text: 'Delete Permanently', action: () => projectManager.permanentlyDelete(item), warning: true }
                ]).open()));
            menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            return;
        }

        // Folder Note Option
        if (isFolder) {
            if (folderNote) {
                menu.addItem((i) => i.setTitle("Open Folder Note").setIcon("file-text")
                    .onClick(() => app.workspace.getLeaf(false).openFile(folderNote)));
            } else {
                menu.addItem((i) => i.setTitle("Create Folder Note").setIcon("file-plus-2")
                    .onClick(async () => {
                        const note = await projectManager.createFolderNote(item as TFolder);
                        app.workspace.getLeaf(false).openFile(note);
                    }));
            }
            menu.addSeparator();
        }

        menu.addItem((i) => i.setTitle("Change Icon").setIcon("image-plus")
            .onClick(() => {
                new IconPickerModal(app, (iconName) => {
                    onSetIcon(item.path, iconName);
                }).open();
            })
        );

        menu.addItem((i) => i.setTitle("Set Icon Color").setIcon("palette")
            .onClick(() => {
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.style.display = 'none';
                if (iconColorMap[item.path]) colorInput.value = iconColorMap[item.path];

                colorInput.onchange = () => {
                    onSetIconColor(item.path, colorInput.value);
                    document.body.removeChild(colorInput);
                };
                
                colorInput.onblur = () => { try { document.body.removeChild(colorInput); } catch {} };
                document.body.appendChild(colorInput);
                colorInput.click();
            })
        );
        
        if (iconMap[item.path] || iconColorMap[item.path]) {
            menu.addSeparator();
            if (iconMap[item.path]) menu.addItem((i) => i.setTitle("Remove Icon").setIcon("x-circle").onClick(() => onSetIcon(item.path, null)));
            if (iconColorMap[item.path]) menu.addItem((i) => i.setTitle("Remove Icon Color").setIcon("x-circle").onClick(() => onSetIconColor(item.path, null)));
        }
        
        menu.addSeparator();
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
        const leaf = app.workspace.getMostRecentLeaf();
        app.workspace.trigger("file-menu", menu, item, "file-explorer", leaf);
        
        if (currentProject && item.path !== currentProject.path && item.name !== "project.md") {
            menu.addSeparator();
            menu.addItem((i) => i.setTitle("Delete Permanently").setIcon("x-circle").setWarning(true)
                .onClick(() => {
                    new ConfirmModal(app, 
                        `Permanently delete "${item.name}"?`,
                        "This action cannot be undone. Are you sure you want to permanently delete this item?",
                        [
                            { text: 'Cancel', action: () => {} },
                            {
                                text: 'Move to Project Trash Instead?',
                                action: () => {
                                    if (currentProject) projectManager.moveToTrash(item, currentProject);
                                    else new Notice("Could not find project context to move to trash.");
                                }
                            },
                            { text: 'Delete Permanently', action: () => projectManager.permanentlyDelete(item), warning: true }
                        ]
                    ).open();
                })
            );
        }
        
        menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            onToggleExpand(item.path);
        }
    };

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
    const customIconName = iconMap[item.path];
    const customIconColor = iconColorMap[item.path]; 
    
    // Determine Icon Component
    let IconComponent: any;
    if (customIconName) {
        IconComponent = (icons as any)[toPascalCase(customIconName)] || FileQuestion;
    } else if (item.name === "Trash") {
        IconComponent = Trash2;
    } else if (isFolder) {
        IconComponent = !effectiveExpanded ? Folder : FolderOpen;
    } else {
        IconComponent = getFileIcon((item as TFile).extension);
    }

    if (!isVisible) return null;

    return (
        <div className="novelist-binder-item" ref={setNodeRef} style={style}>
            <div 
                className={`novelist-binder-row 
                    ${isActive || isFolderNoteActive ? 'is-active' : ''} 
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

                <div className="novelist-binder-icon" style={{ color: customIconColor || 'inherit', position: 'relative' }}>
                    <IconComponent size={14} />
                </div>

                <div className="novelist-binder-title" onClick={handleTitleClick}>
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
                    ) : displayName}
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
                                iconMap={iconMap}
                                onSetIcon={onSetIcon}
                                iconColorMap={iconColorMap} 
                                onSetIconColor={onSetIconColor} 
                            />
                        ))}
                    </SortableContext>
                </div>
            )}
        </div>
    );
};