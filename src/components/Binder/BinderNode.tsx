import React, { useState } from 'react';
import { TAbstractFile, TFile, TFolder, App, Menu } from 'obsidian';
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
        // Prevent the browser's native context menu
        e.preventDefault();
        e.stopPropagation();

        const menu = new Menu();

        // Trigger the 'file-menu' event. 
        // This allows Obsidian Core (File Explorer) and other plugins to populate the menu
        // with actions like Rename, Delete, Make Copy, etc.
        app.workspace.trigger(
            "file-menu",
            menu,
            item,
            "file-explorer", // Source: mimics the native file explorer
            app.workspace.getLeaf(false)
        );

        // Show the menu at the cursor position
        menu.showAtPosition({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY
        });
    };

    const getChildren = () => {
        if (!isFolder) return [];
        const folder = item as TFolder;
        
        // Sort: Folders first (alpha), then Files (by Rank)
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