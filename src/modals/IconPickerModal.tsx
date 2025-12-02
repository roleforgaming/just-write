import { App, Modal } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as icons from 'lucide-react';
import { useState, useMemo } from 'react';

// Helper removed, as it's not used in this file.

// --- React Component for the Picker UI ---

interface IconPickerProps {
    onSelect: (iconName: string) => void;
}

const IconPickerComponent: React.FC<IconPickerProps> = ({ onSelect }) => {
    const [filter, setFilter] = useState('');

    const iconList = useMemo(() => {
        const excludedKeys = ['createLucideIcon', 'LucideProvider', 'icons', 'default'];
        return Object.keys(icons).filter(key => 
            !excludedKeys.includes(key) && key[0] === key[0].toUpperCase()
        );
    }, []);
    
    const filteredIcons = useMemo(() => {
        if (!filter) return iconList;
        return iconList.filter(name => name.toLowerCase().includes(filter.toLowerCase()));
    }, [filter, iconList]);

    const handleSelect = (pascalCaseName: string) => {
        const kebabCaseName = pascalCaseName.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
        onSelect(kebabCaseName);
    };

    return (
        <div className="novelist-icon-picker">
            <input
                type="text"
                className="novelist-icon-picker-search"
                placeholder="Search for an icon..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
            />
            <div className="novelist-icon-picker-grid">
                {filteredIcons.slice(0, 100).map(iconName => {
                    const IconComponent = (icons as any)[iconName];
                    return (
                        <div
                            key={iconName}
                            className="novelist-icon-picker-item"
                            title={iconName}
                            onClick={() => handleSelect(iconName)}
                        >
                            <IconComponent size={24} />
                        </div>
                    );
                })}
            </div>
            {filteredIcons.length === 0 && <div className="novelist-icon-picker-empty">No icons found.</div>}
        </div>
    );
};

// --- Obsidian Modal Wrapper ---

export class IconPickerModal extends Modal {
    root: Root | null = null;
    onSelect: (iconName: string) => void;

    constructor(app: App, onSelect: (iconName: string) => void) {
        super(app);
        this.onSelect = onSelect;
    }

    onOpen() {
        this.titleEl.setText('Select an Icon');
        this.root = createRoot(this.contentEl);
        this.root.render(
            <IconPickerComponent 
                onSelect={(iconName) => {
                    this.onSelect(iconName);
                    this.close();
                }}
            />
        );
    }

    onClose() {
        this.root?.unmount();
        this.contentEl.empty();
    }
}