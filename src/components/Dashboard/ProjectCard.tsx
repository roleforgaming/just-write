import React from 'react';
import { App, TFolder, Menu } from 'obsidian';
import { FolderOpen, MoreVertical, Tag, ChevronDown } from 'lucide-react';
import { ProjectManager } from '../../utils/projectManager';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { ProjectSettingsModal } from '../../modals/ProjectSettingsModal';

interface ProjectCardProps {
    app: App;
    folder: TFolder;
    meta: any; // Result of getProjectMetadata
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ app, folder, meta }) => {
    const pm = new ProjectManager(app);

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        const marker = folder.children.find(c => c.name === 'project.md');
        if (marker) app.workspace.getLeaf(false).openFile(marker as any);
    };

    const handleStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const menu = new Menu();

        const statuses = ['Planning', 'In Progress', 'Completed', 'Archived'];

        statuses.forEach((statusOption) => {
            menu.addItem((item) => {
                item.setTitle(statusOption)
                    .setChecked(meta.status === statusOption)
                    .onClick(() => {
                        // If switching to Archived, set archived flag true, otherwise false
                        const isArchived = statusOption === 'Archived';
                        pm.updateProjectMetadata(folder, { 
                            status: statusOption, 
                            archived: isArchived 
                        });
                    });
            });
        });

        menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    };

    const handleMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        const menu = new Menu();

        menu.addItem(item => {
            item.setTitle("Edit Settings")
                .setIcon("edit")
                .onClick(() => new ProjectSettingsModal(app, folder).open());
        });

        // Toggle Archive logic based on current state
        if (meta.isArchived) {
             menu.addItem(item => {
                item.setTitle("Unarchive")
                    .setIcon("rotate-ccw")
                    .onClick(() => pm.updateProjectMetadata(folder, { archived: false, status: 'Planning' }));
            });
        } else {
             menu.addItem(item => {
                item.setTitle("Archive Project")
                    .setIcon("archive")
                    .onClick(() => pm.updateProjectMetadata(folder, { archived: true, status: 'Archived' }));
            });
        }

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle("Delete Project")
                .setIcon("trash-2")
                .setWarning(true)
                .onClick(() => {
                     new ConfirmModal(app, "Delete Project", 
                     `Are you sure you want to delete "${folder.name}" and all its contents? This cannot be undone.`,
                     () => pm.permanentlyDelete(folder)
                     ).open();
                });
        });

        menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    };

    // Color code status
    const getStatusColor = (s: string) => {
        switch(s) {
            case 'Planning': return 'var(--text-muted)';
            case 'In Progress': return 'var(--interactive-accent)';
            case 'Completed': return 'var(--color-green)';
            case 'Archived': return 'var(--text-faint)';
            default: return 'var(--text-normal)';
        }
    };

    return (
        <div className={`novelist-project-card ${meta.isArchived ? 'is-archived' : ''}`}>
            
            {/* Top Bar */}
            <div className="novelist-card-top">
                <div 
                    className="novelist-card-status clickable" 
                    onClick={handleStatusClick}
                    style={{color: getStatusColor(meta.status)}}
                    title="Change Status"
                >
                    <span className="status-dot" style={{backgroundColor: getStatusColor(meta.status)}}></span>
                    {meta.status}
                    <ChevronDown size={12} style={{ opacity: 0.5, marginLeft: 2 }}/>
                </div>
                
                <button className="novelist-card-menu-btn" onClick={handleMenu}>
                    <MoreVertical size={16} />
                </button>
            </div>

            {/* Content Body - Removed onClick logic */}
            <div className="novelist-card-content">
                <h3 className="novelist-card-title">{meta.name}</h3>
                <p className="novelist-card-desc">{meta.description}</p>
                
                <div className="novelist-card-tags">
                    {meta.tags.map((t: string) => (
                        <span key={t} className="novelist-tag"><Tag size={10}/> {t}</span>
                    ))}
                </div>
            </div>

            {/* Actions Footer */}
            <div className="novelist-card-actions">
                <button className="primary-action-btn" onClick={handleOpen}>
                    <FolderOpen size={16} /> Open Project
                </button>
            </div>
        </div>
    );
};