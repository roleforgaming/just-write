import React from 'react';
import { App, TFolder, Menu } from 'obsidian';
import { FolderOpen, MoreVertical, Tag, ChevronDown, Target, Clock } from 'lucide-react';
import { ProjectManager } from '../../utils/projectManager';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { ProjectSettingsModal } from '../../modals/ProjectSettingsModal';

interface ProjectCardProps {
    app: App;
    folder: TFolder;
    meta: any; 
    wordCount?: number;
    todayCount?: number;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ app, folder, meta, wordCount = 0, todayCount = 0 }) => {
    const pm = new ProjectManager(app);

    const handleOpen = (e: React.MouseEvent) => {
        // This function can be called by multiple elements, so stop propagation if it's not the base card
        if ((e.target as HTMLElement).closest('button, .clickable')) {
            e.stopPropagation();
        }
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
                     [
                         { text: 'Cancel', action: () => {} },
                         { text: 'Delete Project', action: () => pm.permanentlyDelete(folder), warning: true }
                     ]
                     ).open();
                });
        });

        menu.showAtPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    };

    const getStatusColor = (s: string) => {
        switch(s) {
            case 'Planning': return 'var(--text-muted)';
            case 'In Progress': return 'var(--interactive-accent)';
            case 'Completed': return 'var(--color-green)';
            case 'Archived': return 'var(--text-faint)';
            default: return 'var(--text-normal)';
        }
    };

    // Progress Logic
    const target = meta.targetWordCount || 0;
    const percent = target > 0 ? Math.min(100, Math.round((wordCount / target) * 100)) : 0;

    // Session Progress Logic
    const sessionTarget = meta.targetSessionCount || 0;
    const sessionPercent = sessionTarget > 0 ? Math.min(100, Math.round((todayCount / sessionTarget) * 100)) : 0;

    return (
        <div 
            className={`novelist-project-card ${meta.isArchived ? 'is-archived' : ''}`}
            onClick={handleOpen}
        >
            
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

            {/* Content Body */}
            <div className="novelist-card-content">
                <h3 className="novelist-card-title">{meta.name}</h3>
                <p className="novelist-card-desc">{meta.description}</p>
                
                <div className="novelist-card-tags">
                    {meta.tags.map((t: string) => (
                        <span key={t} className="novelist-tag"><Tag size={10}/> {t}</span>
                    ))}
                </div>
            </div>

            {/* Progress Bar Section */}
            {(target > 0 || sessionTarget > 0) && (
                 <div className="novelist-card-progress-section">
                    {target > 0 && (
                        <div className="novelist-manuscript-progress" title={`Total: ${wordCount.toLocaleString()} / ${target.toLocaleString()} words`}>
                            <div className="novelist-progress-labels">
                                <span className="progress-icon"><Target size={10}/> {percent}%</span>
                                <span className="progress-count">{wordCount.toLocaleString()} words</span>
                            </div>
                            <div className="novelist-progress-bar-bg">
                                <div 
                                    className="novelist-progress-bar-fill" 
                                    style={{ width: `${percent}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    {sessionTarget > 0 && (
                        <div className="novelist-session-progress" title={`Session: ${todayCount.toLocaleString()} / ${sessionTarget.toLocaleString()} words`}>
                            <div className="novelist-progress-labels small">
                                <span className="progress-icon"><Clock size={10}/> Session</span>
                                <span className="progress-count">{todayCount.toLocaleString()} / {sessionTarget.toLocaleString()}</span>
                            </div>
                            <div className="novelist-progress-bar-bg small">
                                <div 
                                    className="novelist-progress-bar-fill session" 
                                    style={{ width: `${sessionPercent}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Actions Footer */}
            <div className="novelist-card-actions">
                <button className="primary-action-btn" onClick={handleOpen}>
                    <FolderOpen size={16} /> Open Project
                </button>
            </div>
        </div>
    );
};