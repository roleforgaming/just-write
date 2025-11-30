import React, { useState, useEffect } from 'react';
import { App, TFile, TAbstractFile, TFolder } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { Book } from 'lucide-react';

interface BinderProps {
    app: App;
}

export const Binder: React.FC<BinderProps> = ({ app }) => {
    const projectManager = new ProjectManager(app);
    
    // State: Current Active Project (Folder)
    const [currentProject, setCurrentProject] = useState<TFolder | null>(null);
    const [availableProjects, setAvailableProjects] = useState<TFolder[]>([]);
    
    const [rootChildren, setRootChildren] = useState<TAbstractFile[]>([]);
    const [activeFile, setActiveFile] = useState<TFile | null>(app.workspace.getActiveFile());
    const [fileSystemVersion, setFileSystemVersion] = useState(0);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // --- Project Detection & Loading ---

    const loadProjects = () => {
        const projects = projectManager.getAllProjects();
        setAvailableProjects(projects);
        
        // Auto-select project if active file belongs to one
        if (activeFile && !currentProject) {
            const parentProject = projectManager.getProjectForFile(activeFile);
            if (parentProject) setCurrentProject(parentProject);
        }
        // If no project selected and we have projects, select first
        else if (!currentProject && projects.length > 0) {
            setCurrentProject(projects[0]);
        }
    };

    // --- File Sorting ---
    
    const sortChildren = (children: TAbstractFile[]) => {
        return [...children].sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;

            // Sort folders top
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;

            if (aIsFolder && bIsFolder) {
                // Fixed Scrivener Order: Manuscript -> Research -> Trash
                const fixedOrder = ['Manuscript', 'Research', 'Story Bible', 'Trash'];
                const aIndex = fixedOrder.indexOf(a.name);
                const bIndex = fixedOrder.indexOf(b.name);
                
                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                if (aIndex !== -1) return -1;
                if (bIndex !== -1) return 1;
                
                return a.name.localeCompare(b.name);
            }

            // Both are files, sort by rank
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    };

    const refresh = () => {
        // If a project is selected, show its children. Otherwise show nothing or instruction.
        if (currentProject) {
            setRootChildren(sortChildren(currentProject.children));
        } else {
            setRootChildren([]);
        }
        setFileSystemVersion(v => v + 1);
    };

    useEffect(() => {
        loadProjects();
    }, []); // On Mount

    useEffect(() => {
        refresh();
        
        const metaRef = app.metadataCache.on('resolved', () => { loadProjects(); refresh(); });
        const cacheRef = app.metadataCache.on('changed', refresh);
        const modifyRef = app.vault.on('modify', refresh);
        // Important: Create might add a new Project
        const createRef = app.vault.on('create', () => { loadProjects(); refresh(); });
        const deleteRef = app.vault.on('delete', refresh);
        const renameRef = app.vault.on('rename', refresh);

        const activeLeafRef = app.workspace.on('file-open', (file) => {
            setActiveFile(file);
            // Auto-switch binder if user creates/opens file in different project
            if (file) {
                const proj = projectManager.getProjectForFile(file);
                if (proj && proj.path !== currentProject?.path) {
                    setCurrentProject(proj);
                }
            }
        });

        return () => {
            app.metadataCache.offref(metaRef);
            app.metadataCache.offref(cacheRef);
            app.vault.offref(modifyRef);
            app.vault.offref(createRef);
            app.vault.offref(deleteRef);
            app.vault.offref(renameRef);
            app.workspace.offref(activeLeafRef);
        };
    }, [app, currentProject]);

    // --- Drag and Drop Logic (Restored) ---
    
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

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        // Basic validation
        if (!over || active.id === over.id) return;

        const activeFile = app.vault.getAbstractFileByPath(active.id as string);
        const overFile = app.vault.getAbstractFileByPath(over.id as string);

        if (!activeFile || !overFile) return;

        // Ensure we are dragging within the same folder (Sibling reordering)
        if (activeFile.parent?.path !== overFile.parent?.path) {
            return; 
        }

        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        // Get current sorted order to determine indices
        const siblings = sortChildren(parentFolder.children);
        
        const oldIndex = siblings.findIndex(x => x.path === activeFile.path);
        const newIndex = siblings.findIndex(x => x.path === overFile.path);

        if (oldIndex === -1 || newIndex === -1) return;

        // Create the new array order
        const newOrder = arrayMove(siblings, oldIndex, newIndex);

        // Update Ranks based on new index (0, 10, 20...)
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
    };

    // --- Render ---

    return (
        <div className="novelist-binder-container">
            {/* Project Selector Header */}
            <div className="novelist-project-selector" style={{ 
                padding: '10px', 
                borderBottom: '1px solid var(--background-modifier-border)',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
            }}>
                <Book size={16} />
                <select 
                    value={currentProject?.path || ""}
                    onChange={(e) => {
                        const proj = availableProjects.find(p => p.path === e.target.value);
                        setCurrentProject(proj || null);
                    }}
                    style={{ flexGrow: 1, background: 'transparent', border: 'none', fontWeight: 'bold' }}
                >
                    <option value="" disabled>Select Project...</option>
                    {availableProjects.map(p => (
                        <option key={p.path} value={p.path}>{p.name}</option>
                    ))}
                </select>
            </div>

            {/* Standard Tree */}
            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext 
                    items={rootChildren.map(c => c.path)} 
                    strategy={verticalListSortingStrategy}
                >
                    {rootChildren.map(child => (
                        <BinderNode 
                            key={child.path}
                            app={app}
                            item={child}
                            depth={0}
                            activeFile={activeFile}
                            version={fileSystemVersion}
                        />
                    ))}
                </SortableContext>
            </DndContext>
            
            {availableProjects.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No Projects found. <br/> Use command "Create New Novelist Project".
                </div>
            )}
        </div>
    );
};