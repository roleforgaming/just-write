import React, { useState, useEffect } from 'react';
import { App, TFile, TAbstractFile, TFolder, Notice } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { CreateProjectModal } from '../../modals/CreateProjectModal'; // Import Modal
import { Book, FilePlus, FolderPlus, PlusCircle } from 'lucide-react';

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
        
        if (activeFile && !currentProject) {
            const parentProject = projectManager.getProjectForFile(activeFile);
            if (parentProject) setCurrentProject(parentProject);
        }
        else if (!currentProject && projects.length > 0) {
            setCurrentProject(projects[0]);
        }
    };

    // --- File Sorting ---
    
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
        if (currentProject) {
            setRootChildren(sortChildren(currentProject.children));
        } else {
            setRootChildren([]);
        }
        setFileSystemVersion(v => v + 1);
    };

    useEffect(() => {
        loadProjects();
    }, []);

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

    // --- Actions ---

    const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === '__CREATE_NEW__') {
            new CreateProjectModal(app, (folder) => {
                loadProjects();
                setCurrentProject(folder);
            }).open();
            return;
        }

        const proj = availableProjects.find(p => p.path === val);
        setCurrentProject(proj || null);
    };

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

    const handleCreateButton = async (type: 'file' | 'folder') => {
        if (!currentProject) {
            new Notice("No project selected.");
            return;
        }
        await projectManager.createNewItem(currentProject, type);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const activeFile = app.vault.getAbstractFileByPath(active.id as string);
        const overFile = app.vault.getAbstractFileByPath(over.id as string);

        if (!activeFile || !overFile) return;

        if (activeFile.parent?.path !== overFile.parent?.path) {
            return; 
        }

        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        const siblings = sortChildren(parentFolder.children);
        
        const oldIndex = siblings.findIndex(x => x.path === activeFile.path);
        const newIndex = siblings.findIndex(x => x.path === overFile.path);

        if (oldIndex === -1 || newIndex === -1) return;

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
    };

    // --- Render ---

    return (
        <div className="novelist-binder-container">
            {/* Header Area */}
            <div className="novelist-binder-header">
                {/* Project Selector */}
                <div className="novelist-project-selector">
                    <Book size={16} />
                    <select 
                        value={currentProject?.path || ""}
                        onChange={handleProjectChange}
                    >
                        <option value="__CREATE_NEW__" style={{ fontWeight: 'bold', color: 'var(--interactive-accent)' }}>
                            + Create New Project...
                        </option>
                        <option disabled>──────────────</option>
                        <option value="" disabled>Select Project...</option>
                        {availableProjects.map(p => (
                            <option key={p.path} value={p.path}>{p.name}</option>
                        ))}
                    </select>
                </div>

                {/* Creation Buttons */}
                <div className="novelist-binder-actions">
                    <button onClick={() => handleCreateButton('file')} title="New Document in Root">
                        <FilePlus size={16} />
                    </button>
                    <button onClick={() => handleCreateButton('folder')} title="New Folder in Root">
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
                    No Projects found. <br/> Click "Create New Project" above.
                </div>
            )}
        </div>
    );
};