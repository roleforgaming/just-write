import React, { useState, useRef, useEffect } from 'react';
import { Plus, Columns } from 'lucide-react';

interface OutlinerToolbarProps {
    visibleColumns: Set<string>;
    allMetadataKeys: string[];
    onColumnToggle: (key: string) => void;
    onAdd: () => void;
    isReadOnly: boolean;
}

export const OutlinerToolbar: React.FC<OutlinerToolbarProps> = ({ 
    visibleColumns, allMetadataKeys, onColumnToggle, onAdd, isReadOnly 
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const standardColumns = ['title', 'synopsis', 'label', 'status', 'wordCount'];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const ColumnToggle = ({ colKey, label }: { colKey: string; label: string }) => (
        <label className="novelist-dropdown-item">
            <input 
                type="checkbox"
                checked={visibleColumns.has(colKey)}
                onChange={() => onColumnToggle(colKey)}
            />
            {label}
        </label>
    );

    return (
        <div className="novelist-outliner-toolbar">
            <button className="novelist-add-btn" onClick={onAdd} disabled={isReadOnly}>
                <Plus size={16} /> New Document
            </button>

            <div className="novelist-separator"></div>

            <div className="novelist-dropdown-container" ref={dropdownRef}>
                <button className="novelist-tool-btn" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                    <Columns size={14} /> Columns
                </button>
                {isDropdownOpen && (
                    <div className="novelist-dropdown-menu" style={{ right: 'auto', left: 0 }}>
                        <div className="novelist-dropdown-section">Standard</div>
                        {standardColumns.map(key => (
                            <ColumnToggle key={key} colKey={key} label={key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} />
                        ))}
                        {allMetadataKeys.length > 0 && (
                            <>
                                <div className="novelist-dropdown-separator"></div>
                                <div className="novelist-dropdown-section">Custom</div>
                                {allMetadataKeys.map(key => (
                                    <ColumnToggle key={key} colKey={key} label={key} />
                                ))}
                            </>
                        )}
                    </div>
                )}
            </div>
             {isReadOnly && <span className="novelist-toolbar-info">(Read Only)</span>}
        </div>
    );
};