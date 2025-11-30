import React, { useState, useEffect } from 'react';
import { App, TFile, Menu } from 'obsidian';
import { BinderNode } from './BinderNode';

interface BinderProps {
    app: App;
}

export const Binder: React.FC<BinderProps> = ({ app }) => {
    const [rootChildren, setRootChildren] = useState(app.vault.getRoot().children);
    const [activeFile, setActiveFile] = useState<TFile | null>(app.workspace.getActiveFile());

    const refresh = () => {
        // Force re-read of children
        setRootChildren([...app.vault.getRoot().children]);
    };

    useEffect(() => {
        // Listen for file changes that might affect sort order (rank changes)
        const metaRef = app.metadataCache.on('resolved', refresh);
        const modifyRef = app.vault.on('modify', refresh);
        const createRef = app.vault.on('create', refresh);
        const deleteRef = app.vault.on('delete', refresh);
        const renameRef = app.vault.on('rename', refresh);

        // Track active file for highlighting
        const activeLeafRef = app.workspace.on('file-open', (file) => {
            setActiveFile(file);
        });

        return () => {
            app.metadataCache.offref(metaRef);
            app.vault.offref(modifyRef);
            app.vault.offref(createRef);
            app.vault.offref(deleteRef);
            app.vault.offref(renameRef);
            app.workspace.offref(activeLeafRef);
        };
    }, [app]);

    // Handle right-click on the empty background area
    const handleBackgroundContextMenu = (e: React.MouseEvent) => {
        // Prevent default browser menu
        e.preventDefault();
        
        // Don't trigger if we clicked an item (BinderNode handles propagation)
        if (e.target !== e.currentTarget) return;

        const menu = new Menu();

        // Trigger file-menu for the Root Folder
        app.workspace.trigger(
            "file-menu",
            menu,
            app.vault.getRoot(),
            "file-explorer",
            app.workspace.getLeaf(false)
        );

        menu.showAtPosition({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY
        });
    };

    return (
        <div 
            className="novelist-binder-container"
            onContextMenu={handleBackgroundContextMenu}
        >
            {rootChildren.map(child => (
                <BinderNode 
                    key={child.path}
                    app={app}
                    item={child}
                    depth={0}
                    activeFile={activeFile}
                />
            ))}
        </div>
    );
};