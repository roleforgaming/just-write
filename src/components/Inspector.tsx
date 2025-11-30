import * as React from 'react';
import { App, TFile } from 'obsidian';

interface InspectorProps {
    app: App;
    file: TFile;
}

export const Inspector: React.FC<InspectorProps> = ({ app, file }) => {
    const [synopsis, setSynopsis] = React.useState('');
    const [status, setStatus] = React.useState('Draft');
    const [label, setLabel] = React.useState('Chapter');
    const [notes, setNotes] = React.useState(''); // New State

    React.useEffect(() => {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        
        setSynopsis(frontmatter?.synopsis || '');
        setStatus(frontmatter?.status || 'Draft');
        setLabel(frontmatter?.label || 'Chapter');
        setNotes(frontmatter?.notes || ''); // Load Notes
    }, [file, app.metadataCache]);

    const handleSave = async (key: string, value: string) => {
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm[key] = value;
        });
    };

    return (
        <div className="novelist-inspector-container">
            <h3 className="novelist-inspector-title">{file.basename}</h3>
            
            {/* Synopsis */}
            <div className="novelist-group">
                <div className="novelist-label-header">Synopsis</div>
                <textarea 
                    className="novelist-textarea"
                    rows={6}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    onBlur={(e) => handleSave('synopsis', e.target.value)}
                />
            </div>

            {/* Metadata Controls */}
            <div className="novelist-group">
                <div className="novelist-label-header">Status</div>
                <select 
                    className="novelist-input"
                    value={status}
                    onChange={(e) => {
                        setStatus(e.target.value);
                        handleSave('status', e.target.value);
                    }}
                >
                    <option value="Draft">Draft</option>
                    <option value="Revised">Revised</option>
                    <option value="Final">Final</option>
                    <option value="Done">Done</option>
                </select>
            </div>
            
            <div className="novelist-group">
                <div className="novelist-label-header">Label</div>
                <select 
                    className="novelist-input"
                    value={label}
                    onChange={(e) => {
                        setLabel(e.target.value);
                        handleSave('label', e.target.value);
                    }}
                >
                    <option value="Chapter">Chapter</option>
                    <option value="Scene">Scene</option>
                    <option value="Research">Research</option>
                    <option value="Idea">Idea</option>
                </select>
            </div>

            {/* Document Notes */}
            <div className="novelist-group">
                <div className="novelist-label-header">Document Notes</div>
                <textarea 
                    className="novelist-textarea"
                    rows={8} // Taller area for notes
                    value={notes}
                    placeholder="Internal scratchpad..."
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={(e) => handleSave('notes', e.target.value)}
                />
            </div>
        </div>
    );
};