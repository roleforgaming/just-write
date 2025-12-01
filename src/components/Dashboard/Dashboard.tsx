import React, { useState, useEffect, useMemo } from 'react';
import { App, TFolder } from 'obsidian';
import { ProjectManager } from '../../utils/projectManager';
import { CreateProjectModal } from '../../modals/CreateProjectModal';
import { ProjectCard } from './ProjectCard';
import { Plus, ChevronDown, ChevronRight, Filter, ArrowUpDown } from 'lucide-react';

interface DashboardProps {
    app: App;
}

export const Dashboard: React.FC<DashboardProps> = ({ app }) => {
    const [projects, setProjects] = useState<any[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    
    // Sorting and Filtering State
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [sortType, setSortType] = useState<'modified' | 'name'>('modified');

    const pm = new ProjectManager(app);

    const load = () => {
        const folders = pm.getAllProjects();
        const data = folders.map(f => ({
            folder: f,
            meta: pm.getProjectMetadata(f)
        })).filter(p => p.meta !== null);
        setProjects(data);
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

    // Derived Logic: Sort and Filter
    const activeProjects = useMemo(() => {
        let filtered = projects.filter(p => !p.meta.isArchived);

        // 1. Filter by Status
        if (filterStatus !== 'All') {
            filtered = filtered.filter(p => p.meta.status === filterStatus);
        }

        // 2. Sort
        return filtered.sort((a, b) => {
            if (sortType === 'name') {
                return a.meta.name.localeCompare(b.meta.name);
            } else {
                // Default: Modified (Newest first)
                return b.meta.lastModified - a.meta.lastModified;
            }
        });
    }, [projects, filterStatus, sortType]);

    const archivedProjects = useMemo(() => {
        return projects.filter(p => p.meta.isArchived).sort((a, b) => b.meta.lastModified - a.meta.lastModified);
    }, [projects]);

    const handleCreate = () => {
        new CreateProjectModal(app, () => load()).open();
    };

    return (
        <div className="novelist-dashboard">
            <div className="novelist-dashboard-header">
                <h1>My Projects</h1>
                <button className="novelist-create-btn" onClick={handleCreate}>
                    <Plus size={18} /> New Project
                </button>
            </div>

            {/* Toolbar: Filter & Sort */}
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
                        value={sortType} 
                        onChange={(e) => setSortType(e.target.value as any)}
                        className="novelist-dashboard-select"
                    >
                        <option value="modified">Last Modified</option>
                        <option value="name">Project Name</option>
                    </select>
                </div>
            </div>

            {/* Active Section */}
            <div className="novelist-section-title">Active Projects ({activeProjects.length})</div>
            <div className="novelist-project-grid">
                {activeProjects.map(p => (
                    <ProjectCard key={p.folder.path} app={app} folder={p.folder} meta={p.meta} />
                ))}
                
                {/* Empty State / Create */}
                {activeProjects.length === 0 && filterStatus === 'All' && (
                    <div className="novelist-empty-state-card" onClick={handleCreate}>
                        <Plus size={40} />
                        <p>Create your first novel</p>
                    </div>
                )}

                {activeProjects.length === 0 && filterStatus !== 'All' && (
                     <div style={{color: 'var(--text-muted)', fontStyle: 'italic', gridColumn: '1 / -1'}}>
                        No projects found with status "{filterStatus}".
                     </div>
                )}
            </div>

            {/* Archive Section */}
            {archivedProjects.length > 0 && (
                <div className="novelist-archive-section">
                    <div 
                        className="novelist-section-title clickable" 
                        onClick={() => setShowArchived(!showArchived)}
                        style={{marginTop: 40}}
                    >
                        {showArchived ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} 
                        Archived Projects ({archivedProjects.length})
                    </div>
                    
                    {showArchived && (
                        <div className="novelist-project-grid">
                            {archivedProjects.map(p => (
                                <ProjectCard key={p.folder.path} app={app} folder={p.folder} meta={p.meta} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};