import React, { useState, useEffect } from 'react';
import { App, TFile, TAbstractFile, TFolder, Notice } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { Book, FilePlus, FolderPlus } from 'lucide-react';

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

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // ... [Previous loadProjects function remains the same]
    const loadProjects = () => {
        const projects = projectManager.getAllProjects();
        setAvailableProjects(projects);
        
        if (activeFile && !currentProject) {
            const parentProject = projectManager.getProjectForFile(activeFile);
            if (parentProject) setCurrentProject(parentProject);
<<<<<<< HEAD
        } else if (!currentProject && projects.length > 0) {
=======
        }
        else if (!currentProject && projects.length > 0) {
>>>>>>> project-trash
            setCurrentProject(projects[0]);
        }
    };

    // ... [Previous sortChildren function remains the same]
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
<<<<<<< HEAD
=======

>>>>>>> project-trash
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    };

    const refresh = () => {
        if (currentProject) {
            setRootChildren(sortChildren(currentProject.children));
        } else {
            setRootChildren([]);
        }
        setFileSystemVersion(v => v + 1);
    };

<<<<<<< HEAD
    // ... [Previous useEffects for listeners remain the same]
    useEffect(() => { loadProjects(); }, []);
=======
    useEffect(() => {
        loadProjects();
    }, []);

>>>>>>> project-trash
    useEffect(() => {
        refresh();
        const metaRef = app.metadataCache.on('resolved', () => { loadProjects(); refresh(); });
        const cacheRef = app.metadataCache.on('changed', refresh);
        const modifyRef = app.vault.on('modify', refresh);
        const createRef = app.vault.on('create', () => { loadProjects(); refresh(); });
        const deleteRef = app.vault.on('delete', refresh);
        const renameRef = app.vault.on('rename', refresh);
        const activeLeafRef = app.workspace.on('file-open', (file) => {
            setActiveFile(file);
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

<<<<<<< HEAD
    // --- New Creation Handlers ---

    const handleCreateButton = async (type: 'file' | 'folder') => {
        if (!currentProject) {
            new Notice("No project selected.");
            return;
=======
    // --- Actions ---

    const triggerExternalCommand = (name: string) => {
        // @ts-ignore
        const commands = app.commands;
        // @ts-ignore
        const foundCommand = Object.values(commands.commands).find((cmd: any) => cmd.name === name);
        if (foundCommand) {
            // @ts-ignore
            commands.executeCommandById(foundCommand.id);
>>>>>>> project-trash
        }

        // Default to "Manuscript" folder if available, otherwise Project Root
        const manuscriptFolder = currentProject.children.find(c => c.name === "Manuscript" && c instanceof TFolder) as TFolder;
        const targetFolder = manuscriptFolder || currentProject;

        await projectManager.createNewItem(targetFolder, type);
    };

<<<<<<< HEAD
    // ... [Previous handleDragEnd remains the same]
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
=======
    const handleCreateButton = async (type: 'file' | 'folder') => {
        if (!currentProject) {
            new Notice("No project selected.");
            return;
        }
        await projectManager.createNewItem(currentProject, type);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

>>>>>>> project-trash
        if (!over || active.id === over.id) return;

        const activeFile = app.vault.getAbstractFileByPath(active.id as string);
        const overFile = app.vault.getAbstractFileByPath(over.id as string);

        if (!activeFile || !overFile) return;
<<<<<<< HEAD
        if (activeFile.parent?.path !== overFile.parent?.path) return;
=======

        if (activeFile.parent?.path !== overFile.parent?.path) {
            return; 
        }
>>>>>>> project-trash

        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        const siblings = sortChildren(parentFolder.children);
        const oldIndex = siblings.findIndex(x => x.path === activeFile.path);
        const newIndex = siblings.findIndex(x => x.path === overFile.path);

        if (oldIndex === -1 || newIndex === -1) return;

        const newOrder = arrayMove(siblings, oldIndex, newIndex);
<<<<<<< HEAD
=======

>>>>>>> project-trash
        const updatePromises = newOrder.map((file, index) => {
            if (file instanceof TFile && file.extension === 'md') {
                return app.fileManager.processFrontMatter(file, (fm) => {
                    fm.rank = index * 10;
                });
            }
            return Promise.resolve();
        });

        await Promise.all(updatePromises);
        // @ts-ignore
        app.commands.executeCommandById("file-explorer:sort-by-name"); // Trigger generic sort
    };

    return (
        <div className="novelist-binder-container">
            {/* Header Area */}
            <div className="novelist-binder-header">
                {/* Project Selector */}
                <div className="novelist-project-selector">
                    <Book size={16} />
                    <select 
                        value={currentProject?.path || ""}
                        onChange={(e) => {
                            const proj = availableProjects.find(p => p.path === e.target.value);
                            setCurrentProject(proj || null);
                        }}
                    >
                        <option value="" disabled>Select Project...</option>
                        {availableProjects.map(p => (
                            <option key={p.path} value={p.path}>{p.name}</option>
                        ))}
                    </select>
                </div>

                {/* Creation Buttons */}
                <div className="novelist-binder-actions">
<<<<<<< HEAD
                    <button onClick={() => handleCreateButton('file')} title="New Document">
                        <FilePlus size={16} />
                    </button>
                    <button onClick={() => handleCreateButton('folder')} title="New Folder">
=======
                    <button onClick={() => handleCreateButton('file')} title="New Document in Root">
                        <FilePlus size={16} />
                    </button>
                    <button onClick={() => handleCreateButton('folder')} title="New Folder in Root">
>>>>>>> project-trash
                        <FolderPlus size={16} />
                    </button>
                </div>
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
                            currentProject={currentProject} // Pass down project context
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