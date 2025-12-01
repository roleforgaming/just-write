import * as React from 'react';
import { App, TFile } from 'obsidian';
import { ProjectManager } from '../utils/projectManager';
import { BookOpen, NotebookPen, Tags, Camera, Plus, Trash2, X } from 'lucide-react';

interface InspectorProps {
    app: App;
    file: TFile;
}

type Tab = 'synopsis' | 'notes' | 'metadata' | 'snapshots';

export const Inspector: React.FC<InspectorProps> = ({ app, file }) => {
    const [activeTab, setActiveTab] = React.useState<Tab>('synopsis');
    
    // Document State
    const [synopsis, setSynopsis] = React.useState('');
    const [status, setStatus] = React.useState('Draft');
    const [label, setLabel] = React.useState('Chapter');
    const [notes, setNotes] = React.useState('');
    const [customMeta, setCustomMeta] = React.useState<[string, any][]>([]);

    // New Metadata State
    const [newMetaKey, setNewMetaKey] = React.useState('');
    const [newMetaValue, setNewMetaValue] = React.useState('');

    // Check Read-Only Status
    const pm = new ProjectManager(app);
    const isReadOnly = pm.isInTrash(file);

    const ignoredKeys = React.useMemo(() => new Set([
        'synopsis', 'status', 'label', 'notes', 'rank', 'icon', 
        'accentColor', 'type', 'tags', 'position', 'description', 
        'created', 'modified', 'archived', 'author', 'deadline'
    ]), []);

    const refresh = React.useCallback(() => {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        
        setSynopsis(frontmatter?.synopsis || '');
        setStatus(frontmatter?.status || 'Draft');
        setLabel(frontmatter?.label || 'Chapter');
        setNotes(frontmatter?.notes || '');

        // Custom Metadata
        const custom: [string, any][] = [];
        if (frontmatter) {
            for (const key in frontmatter) {
                if (!ignoredKeys.has(key)) {
                    custom.push([key, frontmatter[key]]);
                }
            }
        }
        setCustomMeta(custom);
    }, [file, app.metadataCache, ignoredKeys]);

    React.useEffect(() => {
        refresh();
        // Subscribe to changes
        const eventRef = app.metadataCache.on('changed', (f) => {
            if (f.path === file.path) refresh();
        });
        return () => { app.metadataCache.offref(eventRef); };
    }, [file, refresh, app.metadataCache]); // Added dependencies

    const handleSave = async (key: string, value: any) => {
        if (isReadOnly) return;
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm[key] = value;
        });
    };

    const handleAddMetadata = async () => {
        if (!newMetaKey.trim() || isReadOnly) return;
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            fm[newMetaKey.trim()] = newMetaValue;
        });
        setNewMetaKey('');
        setNewMetaValue('');
    };

    const handleDeleteMetadata = async (key: string) => {
        if (isReadOnly) return;
        await app.fileManager.processFrontMatter(file, (fm: any) => {
            delete fm[key];
        });
    };

    return (
        <div className="novelist-inspector-container">
            <h3 className="novelist-inspector-title">
                {file.basename} 
                {isReadOnly && <span style={{fontSize: '0.6em', color: 'var(--text-error)', marginLeft: 5}}> [READ-ONLY]</span>}
            </h3>
            
            {/* Tabs */}
            <div className="novelist-inspector-tabs">
                <div className={`novelist-inspector-tab ${activeTab === 'synopsis' ? 'active' : ''}`} 
                     onClick={() => setActiveTab('synopsis')} title="Synopsis & General">
                    <BookOpen size={16} />
                </div>
                <div className={`novelist-inspector-tab ${activeTab === 'notes' ? 'active' : ''}`} 
                     onClick={() => setActiveTab('notes')} title="Document Notes">
                    <NotebookPen size={16} />
                </div>
                <div className={`novelist-inspector-tab ${activeTab === 'metadata' ? 'active' : ''}`} 
                     onClick={() => setActiveTab('metadata')} title="Custom Metadata">
                    <Tags size={16} />
                </div>
                <div className={`novelist-inspector-tab ${activeTab === 'snapshots' ? 'active' : ''}`} 
                     onClick={() => setActiveTab('snapshots')} title="Snapshots">
                    <Camera size={16} />
                </div>
            </div>

            <div className="novelist-inspector-content">
                {/* Tab 1: Synopsis */}
                {activeTab === 'synopsis' && (
                    <>
                        <div className="novelist-group">
                            <div className="novelist-label-header">Synopsis</div>
                            <textarea 
                                className="novelist-textarea"
                                rows={6}
                                value={synopsis}
                                disabled={isReadOnly}
                                onChange={(e) => setSynopsis(e.target.value)}
                                onBlur={(e) => handleSave('synopsis', e.target.value)}
                            />
                        </div>

                        <div className="novelist-group">
                            <div className="novelist-label-header">Status</div>
                            <select 
                                className="novelist-input"
                                value={status}
                                disabled={isReadOnly}
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
                                disabled={isReadOnly}
                                onChange={(e) => {
                                    setLabel(e.target.value);
                                    handleSave('label', e.target.value);
                                }}
                            >
                                <option value="Chapter">Chapter</option>
                                <option value="Scene">Scene</option>
                                <option value="Research">Research</option>
                                <option value="Idea">Idea</option>
                                <option value="Character">Character</option>
                                <option value="Location">Location</option>
                            </select>
                        </div>
                    </>
                )}

                {/* Tab 2: Notes */}
                {activeTab === 'notes' && (
                    <div className="novelist-group" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                        <div className="novelist-label-header">Document Notes</div>
                        <textarea 
                            className="novelist-textarea"
                            style={{flexGrow: 1, resize: 'none'}}
                            value={notes}
                            disabled={isReadOnly}
                            placeholder="Internal scratchpad..."
                            onChange={(e) => setNotes(e.target.value)}
                            onBlur={(e) => handleSave('notes', e.target.value)}
                        />
                    </div>
                )}

                {/* Tab 3: Custom Metadata */}
                {activeTab === 'metadata' && (
                    <div className="novelist-group">
                        <div className="novelist-label-header">Custom Properties</div>
                        
                        {customMeta.length === 0 && (
                            <div style={{fontStyle: 'italic', color: 'var(--text-muted)', margin: '10px 0'}}>No custom metadata.</div>
                        )}

                        <div className="novelist-metadata-list">
                            {customMeta.map(([key, val]) => (
                                <div key={key} className="novelist-metadata-row">
                                    <div className="novelist-metadata-key" title={key}>{key}</div>
                                    <input 
                                        className="novelist-input novelist-metadata-value"
                                        value={String(val)}
                                        disabled={isReadOnly}
                                        onChange={(e) => {
                                            // Optimistic update local state only for input
                                            const next = [...customMeta];
                                            const idx = next.findIndex(i => i[0] === key);
                                            if (idx > -1) next[idx][1] = e.target.value;
                                            setCustomMeta(next);
                                        }}
                                        onBlur={(e) => handleSave(key, e.target.value)}
                                    />
                                    {!isReadOnly && (
                                        <button className="novelist-icon-btn" onClick={() => handleDeleteMetadata(key)}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {!isReadOnly && (
                            <div className="novelist-metadata-add" style={{marginTop: 15, borderTop: '1px solid var(--background-modifier-border)', paddingTop: 10}}>
                                <div className="novelist-label-header">Add New</div>
                                <div style={{display: 'flex', gap: 5, marginBottom: 5}}>
                                    <input 
                                        className="novelist-input" 
                                        placeholder="Key (e.g. POV)" 
                                        value={newMetaKey}
                                        onChange={e => setNewMetaKey(e.target.value)}
                                    />
                                </div>
                                <div style={{display: 'flex', gap: 5}}>
                                    <input 
                                        className="novelist-input" 
                                        placeholder="Value" 
                                        value={newMetaValue}
                                        onChange={e => setNewMetaValue(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddMetadata()}
                                    />
                                    <button className="novelist-add-btn" onClick={handleAddMetadata} disabled={!newMetaKey}>
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 4: Snapshots */}
                {activeTab === 'snapshots' && (
                    <div className="novelist-group" style={{textAlign: 'center', padding: 20, color: 'var(--text-muted)'}}>
                        <Camera size={40} style={{opacity: 0.3, marginBottom: 10}} />
                        <p>Snapshots coming soon...</p>
                        <p style={{fontSize: '0.8em'}}>Version history and rollback capability will be available here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};