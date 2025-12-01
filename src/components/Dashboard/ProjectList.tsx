import React from 'react';
import { App, TFolder } from 'obsidian';
import { FolderOpen, ArrowUp, ArrowDown } from 'lucide-react';

interface ProjectListProps {
    app: App;
    projects: any[];
    onSort: (key: string) => void;
    sortConfig: { key: string; direction: 'asc' | 'desc' };
    wordCounts: Record<string, number>;
}

export const ProjectList: React.FC<ProjectListProps> = ({ app, projects, onSort, sortConfig, wordCounts }) => {
    
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    const handleOpen = (folder: TFolder) => {
        const marker = folder.children.find(c => c.name === 'project.md');
        if (marker) app.workspace.getLeaf(false).openFile(marker as any);
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return null;
        return sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
    };

    return (
        <div className="novelist-list-container">
            <table className="novelist-project-table">
                <thead>
                    <tr>
                        <th onClick={() => onSort('name')}>Project Name <SortIcon column="name" /></th>
                        <th onClick={() => onSort('status')}>Status <SortIcon column="status" /></th>
                        <th onClick={() => onSort('wordCount')}>Word Count <SortIcon column="wordCount" /></th>
                        <th onClick={() => onSort('created')}>Created <SortIcon column="created" /></th>
                        <th onClick={() => onSort('modified')}>Last Opened <SortIcon column="modified" /></th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((p) => (
                        <tr key={p.folder.path} onClick={() => handleOpen(p.folder)} className="clickable-row">
                            <td className="col-name">
                                <div className="fw-bold">{p.meta.name}</div>
                                <div className="text-muted small">{p.meta.tags.join(', ')}</div>
                            </td>
                            <td>
                                <span className={`status-badge status-${p.meta.status.toLowerCase().replace(' ', '-')}`}>
                                    {p.meta.status}
                                </span>
                            </td>
                            <td>
                                {wordCounts[p.folder.path] !== undefined 
                                    ? wordCounts[p.folder.path].toLocaleString() + " words" 
                                    : "..."}
                            </td>
                            <td>{formatDate(p.meta.createdTime)}</td>
                            <td>{formatDate(p.meta.lastModified)}</td>
                            <td>
                                <button className="novelist-icon-btn" title="Open Project">
                                    <FolderOpen size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};