import React, { useState, useEffect, useRef } from 'react';
import { App, TFile } from 'obsidian';
import { Palette, Smile, Activity, ChevronDown, FileText, Star, Heart, Zap, Flag } from 'lucide-react';
import { NovelistMetadata } from '../../utils/metadata'; // Import types

const STATUS_OPTIONS = ["Draft", "Revised", "Final", "Done"];
const ICON_OPTIONS = [
    { name: "file-text", icon: FileText },
    { name: "star", icon: Star },
    { name: "heart", icon: Heart },
    { name: "zap", icon: Zap },
    { name: "flag", icon: Flag },
];

interface CardToolbarProps {
    file: TFile;
    app: App;
    currentStatus: string;
    currentIcon: string;
    // Changed prop signature
    onOptimisticUpdate: (key: keyof NovelistMetadata, value: any) => void;
}

const ToolbarDropdown: React.FC<{
    trigger: React.ReactNode;
    children: (close: () => void) => React.ReactNode;
}> = ({ trigger, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="novelist-dropdown-container" ref={ref}>
            <div onClick={() => setIsOpen(!isOpen)} className="novelist-dropdown-trigger">
                {trigger}
            </div>
            {isOpen && (
                <div className="novelist-dropdown-menu">
                    {children(() => setIsOpen(false))}
                </div>
            )}
        </div>
    );
};

export const CardToolbar: React.FC<CardToolbarProps> = ({ file, app, currentStatus, onOptimisticUpdate }) => {

    const handleColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const color = e.target.value;
        onOptimisticUpdate('accentColor', color); // Update UI immediately
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm.accentColor = color;
        });
    };

    const updateStatus = async (newStatus: string) => {
        onOptimisticUpdate('status', newStatus); // Update UI immediately
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm.status = newStatus;
        });
    };

    const updateIcon = async (iconName: string) => {
        onOptimisticUpdate('icon', iconName); // Update UI immediately
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm.icon = iconName;
        });
    };

    return (
        <div className="novelist-card-tools">
            <ToolbarDropdown
                trigger={
                    <button className="novelist-tool-btn" title="Change Status">
                        <Activity size={12} /> {currentStatus} <ChevronDown size={10} />
                    </button>
                }
            >
                {(close) => STATUS_OPTIONS.map(status => (
                    <div 
                        key={status} 
                        className="novelist-dropdown-item"
                        onClick={() => {
                            updateStatus(status);
                            close();
                        }}
                    >
                        {status}
                    </div>
                ))}
            </ToolbarDropdown>

            <ToolbarDropdown
                trigger={
                    <button className="novelist-tool-btn" title="Change Icon">
                        <Smile size={12} /> <ChevronDown size={10} />
                    </button>
                }
            >
                {(close) => (
                    <div className="novelist-icon-grid">
                        {ICON_OPTIONS.map(opt => (
                            <div 
                                key={opt.name} 
                                className="novelist-icon-item"
                                onClick={() => {
                                    updateIcon(opt.name);
                                    close();
                                }}
                                title={opt.name}
                            >
                                <opt.icon size={16} />
                            </div>
                        ))}
                    </div>
                )}
            </ToolbarDropdown>

            <label className="novelist-tool-btn color-picker-label" title="Card Color">
                <Palette size={12} />
                <input 
                    type="color" 
                    className="novelist-hidden-color-input"
                    onChange={handleColorChange}
                />
            </label>
        </div>
    );
};