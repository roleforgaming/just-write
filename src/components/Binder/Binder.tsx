import React, { useState, useEffect, useCallback } from 'react';
import { App, TFile, TAbstractFile, TFolder } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverlay, defaultDropAnimationSideEffects, DropAnimation } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { CreateProjectModal } from '../../modals/CreateProjectModal';
import { Book, FilePlus, FolderPlus, LayoutDashboard, FileText } from 'lucide-react';

interface BinderProps {
    app: App;
}

export const Binder: React.FC<BinderProps> = ({ app }) => {
    const projectManager = new ProjectManager(app);
    
    const [currentProject, setCurrentProject] = useState<TFolder | null>(null);
    const [availableProjects, setAvailableProjects] = useState<TFolder[]>([]);
    const [rootChildren, setRootChildren] = useState<TAbstractFile[]>([]);
    const [activeFile, setActiveFile] = useState<TFile | null>(app.workspace.getActiveFile());
    const [fileSystemVersion, setFileSystemVersion] = useState(0);

    // Multi-Select State
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
    
    // Drag State
    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // --- Project Loading & Sorting ---
    const loadProjects = () => {
        const projects = projectManager.getAllProjects();
        setAvailableProjects(projects);
        if (activeFile && !currentProject) {
            const parentProject = projectManager.getProjectForFile(activeFile);
            if (parentProject) setCurrentProject(parentProject);
        } else if (!currentProject && projects.length > 0) {
            setCurrentProject(projects[0]);
        }
    };

    const sortChildren = (children: TAbstractFile[]) => {
        return [...children].sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;

            if (aIsFolder && bIsFolder) {
                const fixedOrder = ['Manuscript', 'Research', 'Story Bible', 'Trash'];
                const aIndex = fixedOrder.indexOf(a.name);
                const bIndex = fixedOrder.indexOf(b.name);
                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                if (aIndex !== -1) return -1;
                if (bIndex !== -1) return 1;
                return a.name.localeCompare(b.name);
            }
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    };

    const refresh = () => {
        if (currentProject) setRootChildren(sortChildren(currentProject.children));
        else setRootChildren([]);
        setFileSystemVersion(v => v + 1);
    };

    useEffect(() => { loadProjects(); }, []);
    useEffect(() => {
        refresh();
        const events = [
            app.metadataCache.on('resolved', () => { loadProjects(); refresh(); }),
            app.metadataCache.on('changed', refresh),
            app.vault.on('modify', refresh),
            app.vault.on('create', () => { loadProjects(); refresh(); }),
            app.vault.on('delete', refresh),
            app.vault.on('rename', refresh),
            app.workspace.on('file-open', (file) => {
                setActiveFile(file);
                if (file) {
                    const proj = projectManager.getProjectForFile(file);
                    if (proj && proj.path !== currentProject?.path) setCurrentProject(proj);
                }
            })
        ];
        return () => events.forEach(ref => app.vault.offref(ref as any));
    }, [app, currentProject]);

    // --- Selection Logic (Multi-Select) ---
    const handleNodeClick = useCallback((e: React.MouseEvent, file: TAbstractFile) => {
        e.stopPropagation();

        const path = file.path;
        const newSelection = new Set(selectedPaths);

        if (e.shiftKey && lastSelectedPath) {
            // Simple range fallback: Add to selection
            newSelection.add(path);
        } else if (e.metaKey || e.ctrlKey) {
            // Toggle Selection
            if (newSelection.has(path)) newSelection.delete(path);
            else newSelection.add(path);
        } else {
            // Single Selection
            newSelection.clear();
            newSelection.add(path);
            
            // Open file if it's a file
            if (file instanceof TFile) {
                app.workspace.getLeaf(false).openFile(file);
            }
        }

        setSelectedPaths(newSelection);
        setLastSelectedPath(path);
    }, [selectedPaths, lastSelectedPath, app]);

    // --- Drag & Drop Logic ---

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveDragId(active.id as string);

        if (!selectedPaths.has(active.id as string)) {
            setSelectedPaths(new Set([active.id as string]));
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        const overItem = app.vault.getAbstractFileByPath(overId);
        if (!overItem) return;

        const activeItem = app.vault.getAbstractFileByPath(activeId);
        if (!activeItem) return;

        const itemsToMove = new Set<TAbstractFile>();
        if (selectedPaths.has(activeId)) {
            selectedPaths.forEach(path => {
                const f = app.vault.getAbstractFileByPath(path);
                if(f) itemsToMove.add(f);
            });
        } else {
            itemsToMove.add(activeItem);
        }

        // 1. Reparenting: Dropping *ON* a folder
        const isOverFolder = overItem instanceof TFolder;
        
        // Heuristic: Drop into folder if hovering over it (not siblings sorting)
        if (isOverFolder && itemsToMove.size > 0) {
            const targetFolder = overItem as TFolder;
            let moved = false;

            for (const item of Array.from(itemsToMove)) {
                if (item.parent?.path !== targetFolder.path && item.path !== targetFolder.path) {
                    if (item instanceof TFolder && targetFolder.path.startsWith(item.path)) continue;

                    const newPath = `${targetFolder.path}/${item.name}`;
                    try {
                        await app.fileManager.renameFile(item, newPath);
                        moved = true;
                    } catch (err) {
                        console.error(`Failed to move ${item.name}`, err);
                    }
                }
            }
            
            if (moved) {
                refresh();
                return;
            }
        }

        // 2. Reordering (Sorting siblings)
        if (activeItem.parent?.path === overItem.parent?.path) {
            const parentFolder = activeItem.parent;
            if (!parentFolder) return;

            const siblings = sortChildren(parentFolder.children);
            const oldIndex = siblings.findIndex(x => x.path === activeId);
            const newIndex = siblings.findIndex(x => x.path === overId);

            if (oldIndex !== newIndex) {
                const newOrder = arrayMove(siblings, oldIndex, newIndex);

                const updatePromises = newOrder.map((file, index) => {
                    if (file instanceof TFile && file.extension === 'md') {
                        return app.fileManager.processFrontMatter(file, (fm) => {
                            fm.rank = index * 10;
                        });
                    }
                    return Promise.resolve();
                });

                await Promise.all(updatePromises);
                triggerExternalCommand("Custom File Explorer sorting: Enable and apply the custom sorting, (re)parsing the sorting configuration first. Sort-on.");
            }
        }
    };

    const triggerExternalCommand = (name: string) => {
        // @ts-ignore
        const commands = app.commands;
        // @ts-ignore
        const commandsList = Object.values(commands.commands);
        const foundCommand = commandsList.find((cmd: any) => cmd.name === name);
        if(foundCommand) {
            // @ts-ignore
            commands.executeCommandById((foundCommand as any).id);
        }
    };

    const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === '__CREATE_NEW__') {
            new CreateProjectModal(app, (folder) => { loadProjects(); setCurrentProject(folder); }).open();
            return;
        }
        const proj = availableProjects.find(p => p.path === val);
        setCurrentProject(proj || null);
    };

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: { opacity: '0.5' },
            },
        }),
    };

    return (
        <div className="novelist-binder-container">
            <div className="novelist-binder-header">
                <div className="novelist-project-selector">
                    <Book size={16} />
                    <select value={currentProject?.path || ""} onChange={handleProjectChange}>
                        <option value="__CREATE_NEW__" style={{ fontWeight: 'bold', color: 'var(--interactive-accent)' }}>+ Create New Project...</option>
                        <option disabled>──────────────</option>
                        <option value="" disabled>Select Project...</option>
                        {availableProjects.map(p => <option key={p.path} value={p.path}>{p.name}</option>)}
                    </select>
                </div>
                <div className="novelist-binder-actions">
                    <button onClick={() => triggerExternalCommand('Open Project Dashboard')} title="Open Project Dashboard"><LayoutDashboard size={16} /></button>
                    <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--background-modifier-border)', margin: '0 5px' }}></div>
                    <button onClick={() => currentProject && projectManager.createNewItem(currentProject, 'file')} title="New Document"><FilePlus size={16} /></button>
                    <button onClick={() => currentProject && projectManager.createNewItem(currentProject, 'folder')} title="New Folder"><FolderPlus size={16} /></button>
                </div>
            </div>

            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={rootChildren.map(c => c.path)} strategy={verticalListSortingStrategy}>
                    {rootChildren.map(child => (
                        <BinderNode 
                            key={child.path}
                            app={app}
                            item={child}
                            depth={0}
                            activeFile={activeFile}
                            version={fileSystemVersion}
                            currentProject={currentProject}
                            selectedPaths={selectedPaths}
                            onNodeClick={handleNodeClick}
                        />
                    ))}
                </SortableContext>

                <DragOverlay dropAnimation={dropAnimation}>
                    {activeDragId ? (
                        <div className="novelist-drag-overlay">
                            {selectedPaths.size > 1 ? (
                                <div className="novelist-drag-stack">
                                    <FileText size={16} /> 
                                    <span>{selectedPaths.size} items</span>
                                </div>
                            ) : (
                                <div className="novelist-drag-single">
                                    <FileText size={16} />
                                    <span>{app.vault.getAbstractFileByPath(activeDragId)?.name}</span>
                                </div>
                            )}
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
};