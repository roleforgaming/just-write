import React, { useState, useEffect, useMemo } from 'react';
import { App } from 'obsidian';
import { ProjectManager } from '../../utils/projectManager';
import { CreateProjectModal } from '../../modals/CreateProjectModal';
import { ProjectCard } from './ProjectCard';
import { ProjectList } from './ProjectList';
import { Plus, ChevronDown, ChevronRight, Filter, ArrowUpDown, LayoutGrid, List } from 'lucide-react';
import NovelistPlugin from '../../main';

interface DashboardProps {
    app: App;
    plugin: NovelistPlugin;
}

type ViewMode = 'grid' | 'list';
type SortKey = 'modified' | 'created' | 'name' | 'wordCount' | 'status';

export const Dashboard: React.FC<DashboardProps> = ({ app, plugin }) => {
    const [projects, setProjects] = useState<any[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(plugin.settings.dashboardDefaultView || 'grid');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ 
        key: plugin.settings.dashboardDefaultSort || 'modified', 
        direction: 'desc' 
    });
    const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
    const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});

    // Use memo to ensure ProjectManager uses latest plugin instance
    const pm = useMemo(() => new ProjectManager(app, plugin), [app, plugin]);

    const load = async () => {
        const folders = pm.getAllProjects();
        const data = folders.map(f => ({
            folder: f,
            meta: pm.getProjectMetadata(f)
        })).filter(p => p.meta !== null);
        setProjects(data);

        const counts: Record<string, number> = {};
        const tCounts: Record<string, number> = {};
        const todayStr = new Date().toISOString().split('T')[0];

        for (const p of data) {
            const count = await pm.getProjectWordCount(p.folder);
            counts[p.folder.path] = count;
            tCounts[p.folder.path] = Number(p.meta.writingHistory?.[todayStr] || 0);
        }
        setWordCounts(counts);
        setTodayCounts(tCounts);
    };

    useEffect(() => {
        load();
        const events = [
            app.vault.on('modify', load),
            app.vault.on('rename', load),
            app.vault.on('delete', load),
            app.vault.on('create', load),
            app.metadataCache.on('resolved', load)
        ];
        return () => events.forEach(e => app.vault.offref(e));
    }, []);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key: key as SortKey,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const processedProjects = useMemo(() => {
        let filtered = [...projects];

        if (filterStatus !== 'All') {
            filtered = filtered.filter(p => p.meta.status === filterStatus);
        }

        if (!showArchived) {
            filtered = filtered.filter(p => !p.meta.isArchived);
        }

        return filtered.sort((a, b) => {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;
            
            switch (sortConfig.key) {
                case 'name':
                    return a.meta.name.localeCompare(b.meta.name) * dir;
                case 'status':
                    return a.meta.status.localeCompare(b.meta.status) * dir;
                case 'wordCount':
                    const wa = wordCounts[a.folder.path] || 0;
                    const wb = wordCounts[b.folder.path] || 0;
                    return (wa - wb) * dir;
                case 'created':
                    return (a.meta.createdTime - b.meta.createdTime) * dir;
                case 'modified':
                default:
                    return (a.meta.lastModified - b.meta.lastModified) * dir;
            }
        });
    }, [projects, filterStatus, sortConfig, wordCounts, showArchived]);

    const handleCreate = () => {
        new CreateProjectModal(app, plugin, () => load()).open();
    };

    return (
        <div className="novelist-dashboard">
            <div className="novelist-dashboard-header">
                <h1>My Projects</h1>
                <div style={{display:'flex', gap: 10}}>
                    <div className="novelist-view-switcher">
                        <button 
                            className={viewMode === 'grid' ? 'is-active' : ''} 
                            onClick={() => setViewMode('grid')} 
                            title="Grid View"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button 
                            className={viewMode === 'list' ? 'is-active' : ''} 
                            onClick={() => setViewMode('list')} 
                            title="List View"
                        >
                            <List size={16} />
                        </button>
                    </div>
                    <button className="novelist-create-btn" onClick={handleCreate}>
                        <Plus size={18} /> New Project
                    </button>
                </div>
            </div>

            <div className="novelist-dashboard-toolbar">
                <div className="novelist-toolbar-group">
                    <Filter size={14} className="toolbar-icon" />
                    <select 
                        value={filterStatus} 
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="novelist-dashboard-select"
                    >
                        <option value="All">All Statuses</option>
                        <option value="Planning">Planning</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>

                <div className="novelist-toolbar-group">
                    <ArrowUpDown size={14} className="toolbar-icon" />
                    <select 
                        value={sortConfig.key} 
                        onChange={(e) => setSortConfig({ key: e.target.value as any, direction: 'desc' })}
                        className="novelist-dashboard-select"
                    >
                        <option value="modified">Last Modified</option>
                        <option value="created">Date Created</option>
                        <option value="name">Project Name</option>
                        <option value="wordCount">Word Count</option>
                    </select>
                </div>
            </div>

            {viewMode === 'grid' && (
                <>
                    <div className="novelist-section-title">Projects ({processedProjects.length})</div>
                    <div className="novelist-project-grid">
                        {processedProjects.map(p => (
                            <ProjectCard 
                                key={p.folder.path} 
                                app={app} 
                                folder={p.folder} 
                                meta={p.meta} 
                                wordCount={wordCounts[p.folder.path] || 0}
                                todayCount={todayCounts[p.folder.path] || 0}
                            />
                        ))}
                        {processedProjects.length === 0 && (
                            <div className="novelist-empty-state-card" onClick={handleCreate}>
                                <Plus size={40} />
                                <p>Create your first novel</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {viewMode === 'list' && (
                <ProjectList 
                    app={app} 
                    projects={processedProjects} 
                    onSort={handleSort}
                    sortConfig={sortConfig}
                    wordCounts={wordCounts}
                />
            )}

            {projects.some(p => p.meta.isArchived) && (
                <div className="novelist-archive-section">
                    <div 
                        className="novelist-section-title clickable" 
                        onClick={() => setShowArchived(!showArchived)}
                        style={{marginTop: 40}}
                    >
                        {showArchived ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} 
                        Archived Projects
                    </div>
                    
                    {showArchived && (
                        <div className={viewMode === 'grid' ? "novelist-project-grid" : ""}>
                            {viewMode === 'grid' ? (
                                projects.filter(p => p.meta.isArchived).map(p => (
                                    <ProjectCard 
                                        key={p.folder.path} 
                                        app={app} 
                                        folder={p.folder} 
                                        meta={p.meta}
                                        wordCount={wordCounts[p.folder.path] || 0}
                                        todayCount={todayCounts[p.folder.path] || 0}
                                    />
                                ))
                            ) : (
                                <ProjectList 
                                    app={app} 
                                    projects={projects.filter(p => p.meta.isArchived)}
                                    onSort={handleSort}
                                    sortConfig={sortConfig}
                                    wordCounts={wordCounts}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};