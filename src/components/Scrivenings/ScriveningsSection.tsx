import React, { useState, useEffect, useRef } from 'react';
import { App, TFile, MarkdownRenderer, Component } from 'obsidian';

interface SectionProps {
    app: App;
    file: TFile;
    component: Component; // For lifecycle management of renderer
}

export const ScriveningsSection: React.FC<SectionProps> = ({ app, file, component }) => {
    const [content, setContent] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    // Load Content
    useEffect(() => {
        app.vault.read(file).then((text) => {
            // Strip frontmatter for display
            const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
            setContent(body);
        });
    }, [file]);

    // Render Markdown when not editing
    useEffect(() => {
        if (!isEditing && previewRef.current) {
            previewRef.current.empty();
            MarkdownRenderer.render(app, content, previewRef.current, file.path, component);
        }
    }, [content, isEditing]);

    const handleSave = async (newText: string) => {
        setContent(newText);
        // We need to preserve frontmatter when saving back
        const original = await app.vault.read(file);
        const frontmatterMatch = original.match(/^---\n[\s\S]*?\n---\n/);
        const frontmatter = frontmatterMatch ? frontmatterMatch[0] : "";
        
        await app.vault.modify(file, frontmatter + newText);
    };

    return (
        <div className="scrivenings-section">
            <div className="scrivener-header-row">
                <h3>{file.basename}</h3>
                <button onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? "Done" : "Edit"}
                </button>
            </div>

            {isEditing ? (
                <textarea 
                    className="scrivenings-editor"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onBlur={(e) => handleSave(e.target.value)}
                    autoFocus
                />
            ) : (
                <div 
                    ref={previewRef} 
                    className="scrivenings-preview"
                    onDoubleClick={() => setIsEditing(true)}
                />
            )}
            
            <hr className="scrivener-break" />
        </div>
    );
};