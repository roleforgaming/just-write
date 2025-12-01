import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { App, TFile, TAbstractFile, TFolder } from 'obsidian';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverlay, defaultDropAnimationSideEffects, DropAnimation } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { BinderNode } from './BinderNode';
import { getRank } from '../../utils/metadata';
import { ProjectManager } from '../../utils/projectManager';
import { CreateProjectModal } from '../../modals/CreateProjectModal';
import { Book, FilePlus, FolderPlus, LayoutDashboard, FileText, Search, X } from 'lucide-react';

interface BinderProps {
    app: App;
}

interface ContentSearchResult {
    file: TFile;
    matches: {
        start: number;
        end: number;
        context: string;
    }[];
}

export const Binder: React.FC<BinderProps> = ({ app }) => {
    const projectManager = new ProjectManager(app);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [currentProject, setCurrentProject] = useState<TFolder | null>(null);
    const [availableProjects, setAvailableProjects] = useState<TFolder[]>([]);
    const [rootChildren, setRootChildren] = useState<TAbstractFile[]>([]);
    const [activeFile, setActiveFile] = useState<TFile | null>(app.workspace.getActiveFile());
    const [fileSystemVersion, setFileSystemVersion] = useState(0);

    // --- Filter & Search State ---
    const [nameFilter, setNameFilter] = useState('');
    const [contentQuery, setContentQuery] = useState('');
    const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // --- Selection & Expansion State ---
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    
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

    // Centralized sort function used by Binder and BinderNode (implicitly via rendering order)
    // To ensure keyboard navigation matches visual order, this logic must be consistent.
    const sortChildren = useCallback((children: TAbstractFile[]) => {
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
    }, [app]);

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
        }, 500); 

        return () => clearTimeout(delayDebounceFn);
    }, [contentQuery, currentProject]);

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
    const handleNodeClick = useCallback((e: React.MouseEvent, file: TAbstractFile) => {
        e.stopPropagation();
        selectNode(file, e.shiftKey, e.metaKey || e.ctrlKey);
    }, [selectedPaths, lastSelectedPath, app]);

    const selectNode = (file: TAbstractFile, isShift: boolean, isCtrl: boolean) => {
        const path = file.path;
        const newSelection = new Set(selectedPaths);

        if (isShift && lastSelectedPath) {
            newSelection.add(path); // Simplified range
        } else if (isCtrl) {
            if (newSelection.has(path)) newSelection.delete(path);
            else newSelection.add(path);
        } else {
            newSelection.clear();
            newSelection.add(path);
            
            if (file instanceof TFile) {
                app.workspace.getLeaf(false).openFile(file);
            }
        }

        setSelectedPaths(newSelection);
        setLastSelectedPath(path);
    };

    const toggleExpansion = (path: string) => {
        const newExpanded = new Set(expandedPaths);
        if (newExpanded.has(path)) newExpanded.delete(path);
        else newExpanded.add(path);
        setExpandedPaths(newExpanded);
    };

    // --- Keyboard Navigation Logic ---

    // Helper to flatten visible tree for keyboard navigation
    const getFlattenedVisibleNodes = useCallback((): TAbstractFile[] => {
        const flatten = (nodes: TAbstractFile[]): TAbstractFile[] => {
            let result: TAbstractFile[] = [];
            const sorted = sortChildren(nodes);
            
            for (const node of sorted) {
                // Apply Name filter if exists
                if (nameFilter && !node.name.toLowerCase().includes(nameFilter.toLowerCase())) {
                    // If folder, check children before skipping
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
                    // If filtering, always expand. If not filtering, check expanded state.
                    if (nameFilter || expandedPaths.has(node.path)) {
                        result = result.concat(flatten(node.children));
                    }
                }
            }
            return result;
        };
        
        return currentProject ? flatten(currentProject.children) : [];
    }, [currentProject, expandedPaths, nameFilter, sortChildren]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (contentQuery) return; // Disable tree nav during full search
        if (e.target instanceof HTMLInputElement) return; // Don't hijack input typing

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
                        } else {
                            // If already expanded, move down
                            nextIndex = Math.min(visibleNodes.length - 1, currentIndex + 1);
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
                        // Move to parent
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
                return; // Don't trigger selection update on enter only
            default:
                return;
        }

        if (nextIndex !== currentIndex && visibleNodes[nextIndex]) {
            const target = visibleNodes[nextIndex];
            
            // Update selection
            const newSelection = new Set<string>();
            if (e.shiftKey) {
                // Simple shift selection not implemented for keyboard list logic here, 
                // falling back to single select for navigation safety
                newSelection.add(target.path); 
            } else {
                newSelection.add(target.path);
            }
            
            setSelectedPaths(newSelection);
            setLastSelectedPath(target.path);

            // Scroll into view logic would go here (requires refs to nodes)
            // A simple hack is to rely on the DOM id if set, or let React handle updates
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

        // 1. Reparenting
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

        // 2. Reordering
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

    const handleSearchClick = () => {
        // Focus the search input
        const searchInput = document.querySelector('.novelist-binder-filter input.has-icon') as HTMLInputElement;
        if (searchInput) searchInput.focus();
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

                {/* Filter and Search Inputs */}
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
                    <button onClick={() => triggerExternalCommand('Open Project Dashboard')} title="Open Project Dashboard"><LayoutDashboard size={16} /></button>
                    <button onClick={handleSearchClick} title="Search in Project Content" style={{marginRight: 5}}><Search size={16} /></button>
                    <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--background-modifier-border)', margin: '0 5px' }}></div>
                    <button onClick={() => currentProject && projectManager.createNewItem(currentProject, 'file')} title="New Document"><FilePlus size={16} /></button>
                    <button onClick={() => currentProject && projectManager.createNewItem(currentProject, 'folder')} title="New Folder"><FolderPlus size={16} /></button>
                </div>
            </div>

            {/* Conditional Render: Search Results vs Binder Tree */}
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
                                expandedPaths={expandedPaths} // Pass expanded state
                                onToggleExpand={toggleExpansion} // Pass toggler
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