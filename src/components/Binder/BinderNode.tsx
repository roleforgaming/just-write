import React, { useState } from 'react';
import { TAbstractFile, TFile, TFolder, App } from 'obsidian';
import { ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { getRank } from '../../utils/metadata';

interface BinderNodeProps {
    app: App;
    item: TAbstractFile;
    depth: number;
    activeFile: TFile | null;
}

export const BinderNode: React.FC<BinderNodeProps> = ({ app, item, depth, activeFile }) => {
    const [collapsed, setCollapsed] = useState(false);

    const isFolder = item instanceof TFolder;
    const isFile = item instanceof TFile;
    const isActive = activeFile && activeFile.path === item.path;

    const handleFileClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFile) {
            app.workspace.getLeaf(false).openFile(item as TFile);
        } else {
            setCollapsed(!collapsed);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        // Trigger Obsidian's native file menu
        const evt = e.nativeEvent;
        // @ts-ignore - internal API
        app.workspace.trigger('file-menu', null, item, "file-explorer", app.workspace.getLeaf(false));
    };

    const getChildren = () => {
        if (!isFolder) return [];
        const folder = item as TFolder;
        
        // Sort: Folders first (alpha), then Files (by Rank)
        // You can adjust this to mix them if preferred
        const children = [...folder.children];
        
        return children.sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;

            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;

            if (aIsFolder && bIsFolder) {
                return a.name.localeCompare(b.name);
            }

            // Both are files, sort by rank
            return getRank(app, a as TFile) - getRank(app, b as TFile);
        });
    };

    // Calculate rank for display if it's a file
    const rankDisplay = isFile ? getRank(app, item as TFile) : null;

    return (
        <div className="novelist-binder-item">
            <div 
                className={`novelist-binder-row ${isActive ? 'is-active' : ''}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleFileClick}
                onContextMenu={handleContextMenu}
            >
                {/* Collapse Icon */}
                <div 
                    className={`novelist-binder-collapse-icon ${collapsed ? 'is-collapsed' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                    style={{ visibility: isFolder ? 'visible' : 'hidden' }}
                >
                    <ChevronDown size={14} />
                </div>

                {/* Type Icon */}
                <div className="novelist-binder-icon">
                    {isFolder ? (
                        collapsed ? <Folder size={14} /> : <FolderOpen size={14} />
                    ) : (
                        <FileText size={14} />
                    )}
                </div>

                {/* Title */}
                <div className="novelist-binder-title">
                    {item.name}
                </div>

                {/* Debug Rank (Visible on Hover via CSS) */}
                {rankDisplay !== 999999 && (
                    <div className="novelist-rank-badge">#{rankDisplay}</div>
                )}
            </div>

            {/* Recursion for Children */}
            {isFolder && !collapsed && (
                <div className="novelist-binder-children">
                    {getChildren().map(child => (
                        <BinderNode 
                            key={child.path} 
                            app={app} 
                            item={child} 
                            depth={depth + 1}
                            activeFile={activeFile}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};