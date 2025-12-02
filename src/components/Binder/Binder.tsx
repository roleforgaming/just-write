import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { App, TFile, TAbstractFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverlay, defaultDropAnimationSideEffects, DropAnimation } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { CreateProjectModal } from '../../modals/CreateProjectModal';
import { Book, FilePlus, FolderPlus, LayoutDashboard, FileText, Search, X } from 'lucide-react';
import NovelistPlugin from '../../main';

const VIEW_TYPE_DASHBOARD = "novelist-dashboard-view";

interface BinderProps {
    app: App;
    plugin: NovelistPlugin;
}

interface ContentSearchResult {
    file: TFile;
    matches: {
        start: number;
        end: number;
        context: string;
    }[];
}

export const Binder: React.FC<BinderProps> = ({ app, plugin }) => {
    const projectManager = useMemo(() => new ProjectManager(app), [app]);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State
    const [currentProject, setCurrentProject] = useState<TFolder | null>(null);
    const [availableProjects, setAvailableProjects] = useState<TFolder[]>([]);
    const [rootChildren, setRootChildren] = useState<TAbstractFile[]>([]);
    const [activeFile, setActiveFile] = useState<TFile | null>(app.workspace.getActiveFile());
    const [fileSystemVersion, setFileSystemVersion] = useState(0);

    // Refs for Event Listeners
    const currentProjectRef = useRef(currentProject);
    const activeFileRef = useRef(activeFile);
    const lastProcessedActivePath = useRef<string | null>(activeFile ? activeFile.path : null);

    // Sync Refs
    useEffect(() => { currentProjectRef.current = currentProject; }, [currentProject]);
    useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

    // --- Filter & Search State ---
    const [nameFilter, setNameFilter] = useState('');
    const [contentQuery, setContentQuery] = useState('');
    const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // --- NEW STATE for Icon Map ---
    const [iconMap, setIconMap] = useState<Record<string, string>>({});
    const [iconColorMap, setIconColorMap] = useState<Record<string, string>>({}); // NEW STATE

    // --- Selection & Expansion State ---
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
    const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    
    // Drag State
    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: plugin.settings.binderDragSensitivity || 8 } })
    );

    // --- Project Loading & Sorting ---
    const loadProjects = useCallback(() => {
        const projects = projectManager.getAllProjects();
        setAvailableProjects(projects);
        
        const current = currentProjectRef.current;
        const active = activeFileRef.current;

        if (current) {
            const stillExists = projects.find(p => p.path === current.path);
            if (stillExists) {
                if (stillExists !== current) setCurrentProject(stillExists);
                return; 
            }
        }

        if (active) {
            const parentProject = projectManager.getProjectForFile(active);
            if (parentProject) {
                setCurrentProject(parentProject);
                return;
            }
        } 

        if (projects.length > 0) {
            setCurrentProject(projects[0]);
        } else {
            setCurrentProject(null);
        }
    }, [projectManager]);

    // Centralized sort function
    const sortChildren = useCallback((children: TAbstractFile[]) => {
        return [...children].sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;

            if (aIsFolder && bIsFolder) {
                const fixedOrder = plugin.settings.binderSortOrder || ['Manuscript', 'Research', 'Story Bible', 'Trash'];
                const aIndex = fixedOrder.indexOf(a.name);
                const bIndex = fixedOrder.indexOf(b.name);
                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                if (aIndex !== -1) return -1;
                if (bIndex !== -1) return 1;
                return a.name.localeCompare(b.name);
            }
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    }, [app, plugin.settings.binderSortOrder]);

    const getFlattenedVisibleNodes = useCallback((): TAbstractFile[] => {
        const flatten = (nodes: TAbstractFile[]): TAbstractFile[] => {
            let result: TAbstractFile[] = [];
            const sorted = sortChildren(nodes);
            
            for (const node of sorted) {
                if (nameFilter && !node.name.toLowerCase().includes(nameFilter.toLowerCase())) {
                    if (node instanceof TFolder) {
                        const childMatches = flatten(node.children);
                        if (childMatches.length > 0) {
                            result.push(node);
                            result = result.concat(childMatches);
                        }
                    }
                    continue;
                }

                result.push(node);
                
                if (node instanceof TFolder) {
                    if (nameFilter || expandedPaths.has(node.path)) {
                        result = result.concat(flatten(node.children));
                    }
                }
            }
            return result;
        };
        
        return currentProject ? flatten(currentProject.children) : [];
    }, [currentProject, expandedPaths, nameFilter, sortChildren]);
    
    const refresh = useCallback(() => {
        const current = currentProjectRef.current;
        if (current) setRootChildren(sortChildren(current.children));
        else setRootChildren([]);
        setFileSystemVersion(v => v + 1);
    }, [sortChildren]);

    // --- Trigger View Refresh when Project Changes ---
    useEffect(() => {
        refresh();
        if (currentProject) {
            const meta = projectManager.getProjectMetadata(currentProject);
            setIconMap(meta?.icons || {});
            setIconColorMap(meta?.iconColors || {}); // NEW: Load colors
        } else {
            setIconMap({});
            setIconColorMap({}); // NEW: Clear colors
        }
    }, [currentProject, refresh]);

    // --- Initial Load & Listeners ---
    useEffect(() => {
        loadProjects();

        const handleResolved = () => { loadProjects(); refresh(); };
        const handleCreate = () => { loadProjects(); refresh(); };
        
        const handleFileOpen = (file: TFile | null) => {
            setActiveFile(file);
            
            if (file) {
                if (file.path !== lastProcessedActivePath.current) {
                    const proj = projectManager.getProjectForFile(file);
                    if (proj && proj.path !== currentProjectRef.current?.path) {
                        setCurrentProject(proj);
                    }
                    lastProcessedActivePath.current = file.path;
                }
            } else {
                lastProcessedActivePath.current = null;
            }
        };

        const events = [
            app.metadataCache.on('resolved', handleResolved),
            app.metadataCache.on('changed', refresh),
            app.vault.on('modify', refresh),
            app.vault.on('create', handleCreate),
            app.vault.on('delete', refresh),
            app.vault.on('rename', refresh),
            app.workspace.on('file-open', handleFileOpen)
        ];
        return () => events.forEach(ref => app.vault.offref(ref as any));
    }, [app, projectManager, loadProjects, refresh]);

    // --- Dashboard Navigation ---
    const openDashboard = async () => {
        const { workspace } = app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
            workspace.revealLeaf(leaf);
        } else {
            leaf = workspace.getLeaf('tab'); 
            await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
        }
    };

    // --- Content Search Logic ---
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (!contentQuery || contentQuery.length < 2 || !currentProject) {
                setContentResults([]);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            const results: ContentSearchResult[] = [];
            const files = getAllFilesRecursively(currentProject);

            for (const file of files) {
                if (file.extension !== 'md') continue;
                
                try {
                    const content = await app.vault.cachedRead(file);
                    const contentBody = content.replace(/^---\n[\s\S]*?\n---\n/, '');
                    
                    const matches = findMatches(contentBody, contentQuery);
                    if (matches.length > 0) {
                        results.push({ file, matches });
                    }
                } catch (e) {
                    console.error("Error searching file", file.path, e);
                }
            }

            setContentResults(results);
            setIsSearching(false);
        }, plugin.settings.advancedSearchDelay || 500); 

        return () => clearTimeout(delayDebounceFn);
    }, [contentQuery, currentProject, app.vault, plugin.settings.advancedSearchDelay]);

    const getAllFilesRecursively = (folder: TFolder): TFile[] => {
        let files: TFile[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile) files.push(child);
            else if (child instanceof TFolder) files = files.concat(getAllFilesRecursively(child));
        }
        return files;
    };

    const findMatches = (content: string, query: string) => {
        const matches = [];
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedQuery, 'gi');
        let match;

        while ((match = regex.exec(content)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            const contextStart = Math.max(0, start - 30);
            const contextEnd = Math.min(content.length, end + 30);
            const contextText = content.substring(contextStart, contextEnd);
            
            matches.push({ start, end, context: "..." + contextText + "..." });
            if (matches.length >= 2) break; 
        }
        return matches;
    };

    const highlightText = (text: string, query: string) => {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) => 
                    part.toLowerCase() === query.toLowerCase() ? 
                        <span key={i} style={{ backgroundColor: 'rgba(var(--interactive-accent-rgb), 0.3)', color: 'var(--text-normal)', borderRadius: 2, padding: '0 1px' }}>{part}</span> : 
                        part
                )}
            </span>
        );
    };

    // --- Selection Logic ---
    const selectNode = (file: TAbstractFile, isShift: boolean, isCtrl: boolean) => {
        const path = file.path;

        if (!isShift) {
            setSelectionAnchor(path);
        }

        if (isShift && selectionAnchor) {
            const visibleNodes = getFlattenedVisibleNodes();
            const anchorIndex = visibleNodes.findIndex(n => n.path === selectionAnchor);
            const currentIndex = visibleNodes.findIndex(n => n.path === path);

            if (anchorIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(anchorIndex, currentIndex);
                const end = Math.max(anchorIndex, currentIndex);
                const rangePaths = visibleNodes.slice(start, end + 1).map(n => n.path);
                
                const newSelection = isCtrl ? new Set(selectedPaths) : new Set<string>();
                rangePaths.forEach(p => newSelection.add(p));

                setSelectedPaths(newSelection);
                setLastSelectedPath(path);
                return;
            }
        } else if (isCtrl) {
            const newSelection = new Set(selectedPaths);
            if (newSelection.has(path)) {
                newSelection.delete(path);
            } else {
                newSelection.add(path);
            }
            setSelectedPaths(newSelection);
        } else {
            setSelectedPaths(new Set([path]));
            if (file instanceof TFile) {
                app.workspace.getLeaf(false).openFile(file);
            }
        }
        
        setLastSelectedPath(path);
    };

    const handleNodeClick = useCallback((e: React.MouseEvent, file: TAbstractFile) => {
        e.stopPropagation();
        
        if (e.button !== 0) return;

        if (e.shiftKey && (e.metaKey || e.ctrlKey)) {
            if (file instanceof TFile) {
                app.workspace.getLeaf('tab').openFile(file);
            }
            return;
        }

        selectNode(file, e.shiftKey, e.metaKey || e.ctrlKey);
    }, [selectedPaths, selectionAnchor, getFlattenedVisibleNodes]);

    const toggleExpansion = (path: string) => {
        const newExpanded = new Set(expandedPaths);
        if (newExpanded.has(path)) newExpanded.delete(path);
        else newExpanded.add(path);
        setExpandedPaths(newExpanded);
    };

    // --- Keyboard Navigation Logic ---
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (contentQuery) return;
        if (e.target instanceof HTMLInputElement) return;

        const visibleNodes = getFlattenedVisibleNodes();
        if (visibleNodes.length === 0) return;

        const currentIndex = lastSelectedPath 
            ? visibleNodes.findIndex(n => n.path === lastSelectedPath) 
            : -1;

        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = Math.min(visibleNodes.length - 1, currentIndex + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = Math.max(0, currentIndex - 1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (currentIndex >= 0) {
                    const item = visibleNodes[currentIndex];
                    if (item instanceof TFolder) {
                        if (!expandedPaths.has(item.path)) {
                            toggleExpansion(item.path);
                        } else if (currentIndex < visibleNodes.length - 1) {
                            nextIndex = currentIndex + 1;
                        }
                    }
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (currentIndex >= 0) {
                    const item = visibleNodes[currentIndex];
                    if (item instanceof TFolder && expandedPaths.has(item.path)) {
                        toggleExpansion(item.path);
                    } else if (item.parent && item.parent.path !== currentProject?.path) {
                        const parentIndex = visibleNodes.findIndex(n => n.path === item.parent?.path);
                        if (parentIndex !== -1) nextIndex = parentIndex;
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0) {
                    const item = visibleNodes[currentIndex];
                    if (item instanceof TFile) {
                        app.workspace.getLeaf(false).openFile(item);
                    } else if (item instanceof TFolder) {
                        toggleExpansion(item.path);
                    }
                }
                return;
            default:
                return;
        }

        if (nextIndex !== currentIndex && visibleNodes[nextIndex]) {
            const target = visibleNodes[nextIndex];
            selectNode(target, false, false);
        }
    };

    // --- Drag & Drop Logic ---
    const handleDragStart = (event: DragStartEvent) => {
        if (nameFilter || contentQuery) return; 
        const { active } = event;
        setActiveDragId(active.id as string);

        if (!selectedPaths.has(active.id as string)) {
            setSelectedPaths(new Set([active.id as string]));
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        if (nameFilter || contentQuery) return;
        const { active, over } = event;
        setActiveDragId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        const overItem = app.vault.getAbstractFileByPath(overId);
        const activeItem = app.vault.getAbstractFileByPath(activeId);

        if (!overItem || !activeItem) return;

        const itemsToMove = new Set<TAbstractFile>();
        if (selectedPaths.has(activeId)) {
            selectedPaths.forEach(path => {
                const f = app.vault.getAbstractFileByPath(path);
                if(f) itemsToMove.add(f);
            });
        } else {
            itemsToMove.add(activeItem);
        }

        const isOverFolder = overItem instanceof TFolder;
        
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
                
                if (plugin.settings.advancedReorderCommand) {
                    // @ts-ignore
                    const commands = app.commands;
                    // @ts-ignore
                    const foundCommand = Object.values(commands.commands).find((cmd: any) => cmd.name === plugin.settings.advancedReorderCommand) as any;
                    if (foundCommand) commands.executeCommandById(foundCommand.id);
                }
                
                (app as any).workspace.trigger('novelist:sort-update');
            }
        }
    };

    const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === '__CREATE_NEW__') {
            new CreateProjectModal(app, plugin, (folder) => { loadProjects(); setCurrentProject(folder); }).open();
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

    const handleSetIcon = async (itemPath: string, iconName: string | null) => {
        if (!currentProject) return;
        const newIconMap = { ...iconMap };
        if (iconName) {
            newIconMap[itemPath] = iconName;
        } else {
            delete newIconMap[itemPath];
        }
        setIconMap(newIconMap);
        await projectManager.updateProjectMetadata(currentProject, { icons: newIconMap });
    };

    // NEW: Callback to update icon colors
    const handleSetIconColor = async (itemPath: string, color: string | null) => {
        if (!currentProject) return;

        // Optimistic UI update
        const newColorMap = { ...iconColorMap };
        if (color) {
            newColorMap[itemPath] = color;
        } else {
            delete newColorMap[itemPath];
        }
        setIconColorMap(newColorMap);

        // Persist change
        await projectManager.updateProjectMetadata(currentProject, { iconColors: newColorMap });
    };


    return (
        <div 
            className="novelist-binder-container" 
            tabIndex={0} 
            onKeyDown={handleKeyDown}
            ref={containerRef}
        >
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

                <div className="novelist-binder-filter-group">
                    <div className="novelist-binder-filter">
                        <input 
                            type="text" 
                            placeholder="Filter files by name..." 
                            value={nameFilter}
                            onChange={(e) => setNameFilter(e.target.value)}
                        />
                        {nameFilter && <X size={12} className="clear-filter" onClick={() => setNameFilter('')} />}
                    </div>
                    <div className="novelist-binder-filter">
                        <Search size={12} className="search-icon-input" />
                        <input 
                            type="text" 
                            placeholder="Search project content..." 
                            value={contentQuery}
                            onChange={(e) => setContentQuery(e.target.value)}
                            className="has-icon"
                        />
                        {contentQuery && <X size={12} className="clear-filter" onClick={() => setContentQuery('')} />}
                    </div>
                </div>

                <div className="novelist-binder-actions">
                    <button onClick={openDashboard} title="Open Project Dashboard"><LayoutDashboard size={16} /></button>
                    <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--background-modifier-border)', margin: '0 5px' }}></div>
                    <button onClick={() => currentProject && projectManager.createNewItem(currentProject, 'file')} title="New Document"><FilePlus size={16} /></button>
                    <button onClick={() => currentProject && projectManager.createNewItem(currentProject, 'folder')} title="New Folder"><FolderPlus size={16} /></button>
                </div>
            </div>

            {contentQuery.length >= 2 ? (
                <div className="novelist-search-results-inline">
                    {isSearching && <div className="search-loading">Searching...</div>}
                    {!isSearching && contentResults.length === 0 && <div className="search-empty">No results found.</div>}
                    
                    {contentResults.map((res) => (
                        <div 
                            key={res.file.path} 
                            className="novelist-search-item"
                            onClick={() => app.workspace.getLeaf(false).openFile(res.file)}
                        >
                            <div className="search-item-title">
                                <FileText size={12} />
                                <span>{res.file.basename}</span>
                            </div>
                            <div className="search-item-matches">
                                {res.matches.map((m, i) => (
                                    <div key={i} className="search-match-context">
                                        {highlightText(m.context, contentQuery)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={rootChildren.map(c => c.path)} strategy={verticalListSortingStrategy} disabled={!!nameFilter}>
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
                                filterQuery={nameFilter}
                                expandedPaths={expandedPaths}
                                onToggleExpand={toggleExpansion}
                                iconMap={iconMap}
                                onSetIcon={handleSetIcon}
                                iconColorMap={iconColorMap} // NEW PROP
                                onSetIconColor={handleSetIconColor} // NEW PROP
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
            )}
        </div>
    );
};