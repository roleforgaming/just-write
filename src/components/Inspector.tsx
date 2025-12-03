import * as React from 'react';
import { App, TFile, Notice } from 'obsidian';
import { ProjectManager } from '../utils/projectManager';
import { BookOpen, NotebookPen, Tags, Camera, Plus, Trash2, RotateCcw, FileDiff, Search, X, ArrowUp, ArrowDown, Pin } from 'lucide-react';
import NovelistPlugin from '../main';
import { Snapshot } from '../utils/snapshotManager';
import { ConfirmModal } from '../modals/ConfirmModal';
import { SnapshotCompareModal } from '../modals/SnapshotCompareModal';

interface InspectorProps {
    app: App;
    plugin: NovelistPlugin;
    file: TFile;
}

type Tab = 'synopsis' | 'notes' | 'metadata' | 'snapshots';

// HELPER COMPONENT
const SnapshotTimeDisplay: React.FC<{ timestamp: number }> = ({ timestamp }) => {
    const moment = (window as any).moment;
    const relativeTime = moment(timestamp).fromNow();
    const exactTime = moment(timestamp).format('ddd MMM DD, YYYY @ h:mm A');

    return (
        <span className="snapshot-time-container">
            <span className="time-relative">{relativeTime}</span>
            <span className="time-exact" title={exactTime}>{exactTime}</span>
        </span>
    );
};

export const Inspector: React.FC<InspectorProps> = ({ app, plugin, file }) => {
    const [activeTab, setActiveTab] = React.useState<Tab>('synopsis');
    
    // Document State
    const [synopsis, setSynopsis] = React.useState('');
    const [status, setStatus] = React.useState('Draft');
    const [label, setLabel] = React.useState('Chapter');
    const [notes, setNotes] = React.useState('');
    const [customMeta, setCustomMeta] = React.useState<[string, any][]>([]);

    // Metadata State
    const [newMetaKey, setNewMetaKey] = React.useState('');
    const [newMetaValue, setNewMetaValue] = React.useState('');

    // Snapshot State
    const [snapshots, setSnapshots] = React.useState<Snapshot[]>([]);
    const [snapshotNote, setSnapshotNote] = React.useState('');
    const [isSnapshotsLoading, setIsSnapshotsLoading] = React.useState(false);
    const [snapshotQuery, setSnapshotQuery] = React.useState('');
    const [snapshotSortKey, setSnapshotSortKey] = React.useState<'timestamp' | 'wordCount' | 'note'>('timestamp');
    const [snapshotSortDirection, setSnapshotSortDirection] = React.useState<'desc' | 'asc'>('desc');

    const pm = React.useMemo(() => new ProjectManager(app), [app]);
    const isReadOnly = pm.isInTrash(file);

    const ignoredKeys = React.useMemo(() => new Set([
        'synopsis', 'status', 'label', 'notes', 'rank', 'icon', 
        'accentColor', 'type', 'tags', 'position', 'description', 
        'created', 'modified', 'archived', 'author', 'deadline',
        'templates', 'mappings', 'icons', 'iconColors', 'targetWordCount',
        'targetSessionCount', 'targetDeadline', 'writingHistory', 'wordCountFolders'
    ]), []);

    const refresh = React.useCallback(() => {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        
        setSynopsis(frontmatter?.synopsis || '');
        setStatus(frontmatter?.status || 'Draft');
        setLabel(frontmatter?.label || 'Chapter');
        setNotes(frontmatter?.notes || '');

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

    const loadSnapshots = React.useCallback(async () => {
        setIsSnapshotsLoading(true);
        const list = await plugin.snapshotManager.getSnapshots(file);
        setSnapshots(list);
        setIsSnapshotsLoading(false);
    }, [file, plugin]);

    React.useEffect(() => {
        refresh();
        if (activeTab === 'snapshots') {
            loadSnapshots();
        }

        const eventRef = app.metadataCache.on('changed', (f) => {
            if (f.path === file.path) refresh();
        });
        return () => { app.metadataCache.offref(eventRef); };
    }, [file, refresh, loadSnapshots, activeTab]);

    React.useEffect(() => {
        const handleRefresh = () => {
            if (activeTab === 'snapshots') {
                loadSnapshots();
            }
        };

        // FIX: Cast app.workspace to `any` to allow custom event strings
        (app.workspace as any).on('novelist-ui-refresh', handleRefresh);

        return () => {
            (app.workspace as any).off('novelist-ui-refresh', handleRefresh);
        };
    }, [app.workspace, loadSnapshots, activeTab]);

    const filteredAndSortedSnapshots = React.useMemo(() => {
        let list = snapshots;
        
        if (snapshotQuery) {
            const query = snapshotQuery.toLowerCase();
            list = list.filter(snap => 
                (snap.note || '').toLowerCase().includes(query) ||
                (window as any).moment(snap.timestamp).format('YYYY-MM-DD HH:mm').includes(query)
            );
        }
        
        return list.sort((a, b) => {
            const dir = snapshotSortDirection === 'asc' ? 1 : -1;
            let aValue: any, bValue: any;
            switch (snapshotSortKey) {
                case 'wordCount': aValue = a.wordCount; bValue = b.wordCount; break;
                case 'note': aValue = (a.note || '').toLowerCase(); bValue = (b.note || '').toLowerCase(); break;
                default: aValue = a.timestamp; bValue = b.timestamp; break;
            }
            if (typeof aValue === 'string') return aValue.localeCompare(bValue) * dir;
            return (aValue - bValue) * dir;
        });
    }, [snapshots, snapshotQuery, snapshotSortKey, snapshotSortDirection]);

    const handleTakeSnapshot = async () => {
        if (isReadOnly) return;
        setIsSnapshotsLoading(true);
        try {
            await plugin.snapshotManager.createSnapshot(file, snapshotNote);
            setSnapshotNote('');
            new Notice("Snapshot saved.");
            await loadSnapshots();
        } catch (e) {
            new Notice("Failed to save snapshot.");
            console.error(e);
        } finally {
            setIsSnapshotsLoading(false);
        }
    };

    const handleRestore = (snapshot: Snapshot) => {
        if (isReadOnly) return;
        new ConfirmModal(app, "Restore Snapshot", 
            `Are you sure you want to restore the snapshot from ${(window as any).moment(snapshot.timestamp).fromNow()}? Current content will be backed up automatically.`, 
            [
                { text: 'Cancel', action: () => {} },
                { 
                    text: 'Restore', 
                    warning: true, 
                    action: async () => {
                        await plugin.snapshotManager.restoreSnapshot(file, snapshot);
                        new Notice("File restored.");
                        refresh();
                        loadSnapshots();
                    } 
                }
            ]
        ).open();
    };

    const handleCompare = async (snapshot: Snapshot) => {
        const currentContent = await app.vault.read(file);
        try {
            const raw = await app.vault.adapter.read(snapshot.path);
            const parts = raw.split('\n---\n');
            const snapBody = parts.length > 1 ? parts.slice(1).join('\n---\n').trimStart() : raw;
            const dateStr = (window as any).moment(snapshot.timestamp).format('MMM D, h:mm a');
            new SnapshotCompareModal(app, file, dateStr, currentContent, snapBody).open();
        } catch (e) {
            new Notice("Failed to read snapshot content.");
            console.error("Error reading snapshot file:", e);
        }
    };

    const handlePinSnapshot = async (snapshot: Snapshot, pin: boolean) => {
        if (isReadOnly) return;
        setSnapshots(prev => prev.map(s => s.path === snapshot.path ? { ...s, isPinned: pin } : s));
        setIsSnapshotsLoading(true);
        try {
            await plugin.snapshotManager.updateSnapshotMetadata(snapshot, { isPinned: pin });
            new Notice(pin ? "Snapshot pinned. It will be excluded from auto-pruning." : "Snapshot unpinned.");
            await loadSnapshots(); 
        } catch (e) {
            new Notice("Failed to update pin status.");
            console.error("Snapshot Pin Failure:", e);
            setSnapshots(prev => prev.map(s => s.path === snapshot.path ? { ...s, isPinned: !pin } : s));
        } finally {
            setIsSnapshotsLoading(false);
        }
    };

    const handleDeleteSnapshot = (snapshot: Snapshot) => {
        if (isReadOnly) return;
        let message = "Permanently delete this version?";
        let warningText = 'Delete';
        if (snapshot.isPinned) {
            message = `Are you sure you want to permanently delete this PINNED snapshot? It was explicitly protected from auto-pruning.`;
            warningText = 'Permanently Delete Pinned';
        }
        new ConfirmModal(app, "Delete Snapshot", message, [ 
            { text: 'Cancel', action: () => {} },
            { 
                text: warningText, 
                warning: true, 
                action: async () => {
                    await plugin.snapshotManager.deleteSnapshot(snapshot);
                    loadSnapshots();
                } 
            }
        ]).open();
    };

    const handleSave = async (key: string, value: any) => { if(!isReadOnly) app.fileManager.processFrontMatter(file, (fm: any) => { fm[key] = value; }); };
    const handleAddMetadata = async () => { if(!newMetaKey.trim() || isReadOnly) return; await app.fileManager.processFrontMatter(file, (fm: any) => { fm[newMetaKey.trim()] = newMetaValue; }); setNewMetaKey(''); setNewMetaValue(''); };
    const handleDeleteMetadata = async (key: string) => { if(!isReadOnly) await app.fileManager.processFrontMatter(file, (fm: any) => { delete fm[key]; }); };

    return (
        <div className="novelist-inspector-container">
            <h3 className="novelist-inspector-title">
                {file.basename} 
                {isReadOnly && <span style={{fontSize: '0.6em', color: 'var(--text-error)', marginLeft: 5}}> [READ-ONLY]</span>}
            </h3>
            
            <div className="novelist-inspector-tabs">
                <div className={`novelist-inspector-tab ${activeTab === 'synopsis' ? 'active' : ''}`} onClick={() => setActiveTab('synopsis')} title="Synopsis"><BookOpen size={16} /></div>
                <div className={`novelist-inspector-tab ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')} title="Notes"><NotebookPen size={16} /></div>
                <div className={`novelist-inspector-tab ${activeTab === 'metadata' ? 'active' : ''}`} onClick={() => setActiveTab('metadata')} title="Metadata"><Tags size={16} /></div>
                <div className={`novelist-inspector-tab ${activeTab === 'snapshots' ? 'active' : ''}`} onClick={() => setActiveTab('snapshots')} title="Snapshots"><Camera size={16} /></div>
            </div>

            <div className="novelist-inspector-content">
                {activeTab === 'synopsis' && (
                    <>
                        <div className="novelist-group">
                            <div className="novelist-label-header">Synopsis</div>
                            <textarea className="novelist-textarea" rows={6} value={synopsis} disabled={isReadOnly} onChange={(e) => setSynopsis(e.target.value)} onBlur={(e) => handleSave('synopsis', e.target.value)} />
                        </div>
                        <div className="novelist-group">
                            <div className="novelist-label-header">Status</div>
                            <select className="novelist-input" value={status} disabled={isReadOnly} onChange={(e) => { setStatus(e.target.value); handleSave('status', e.target.value); }}>
                                {plugin.settings.inspectorStatusOptions.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                         <div className="novelist-group">
                            <div className="novelist-label-header">Label</div>
                            <select className="novelist-input" value={label} disabled={isReadOnly} onChange={(e) => { setLabel(e.target.value); handleSave('label', e.target.value); }}>
                                {plugin.settings.inspectorLabelOptions.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </>
                )}

                {activeTab === 'notes' && (
                    <div className="novelist-group" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                        <div className="novelist-label-header">Document Notes</div>
                        <textarea className="novelist-textarea" style={{flexGrow: 1, resize: 'none'}} value={notes} disabled={isReadOnly} placeholder="Internal scratchpad..." onChange={(e) => setNotes(e.target.value)} onBlur={(e) => handleSave('notes', e.target.value)} />
                    </div>
                )}

                {activeTab === 'metadata' && (
                    <div className="novelist-group">
                        <div className="novelist-label-header">Custom Properties</div>
                        {customMeta.length === 0 && <div style={{fontStyle: 'italic', color: 'var(--text-muted)', margin: '10px 0'}}>No custom metadata.</div>}
                        <div className="novelist-metadata-list">
                            {customMeta.map(([key, val]) => (
                                <div key={key} className="novelist-metadata-row">
                                    <div className="novelist-metadata-key" title={key}>{key}</div>
                                    <input className="novelist-input novelist-metadata-value" value={String(val)} disabled={isReadOnly} onChange={(e) => { const next = [...customMeta]; const idx = next.findIndex(i => i[0] === key); if (idx > -1) next[idx][1] = e.target.value; setCustomMeta(next); }} onBlur={(e) => handleSave(key, e.target.value)} />
                                    {!isReadOnly && <button className="novelist-icon-btn" onClick={() => handleDeleteMetadata(key)}><Trash2 size={14} /></button>}
                                </div>
                            ))}
                        </div>
                        {!isReadOnly && (
                            <div className="novelist-metadata-add" style={{marginTop: 15, borderTop: '1px solid var(--background-modifier-border)', paddingTop: 10}}>
                                <div className="novelist-label-header">Add New</div>
                                <div style={{display: 'flex', gap: 5, marginBottom: 5}}>
                                    <input className="novelist-input" placeholder="Key (e.g. POV)" value={newMetaKey} onChange={e => setNewMetaKey(e.target.value)} />
                                </div>
                                <div style={{display: 'flex', gap: 5}}>
                                    <input className="novelist-input" placeholder="Value" value={newMetaValue} onChange={e => setNewMetaValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMetadata()} />
                                    <button className="novelist-add-btn" onClick={handleAddMetadata} disabled={!newMetaKey}><Plus size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'snapshots' && (
                    <>
                        <div className="snapshot-create-section">
                            <input 
                                className="novelist-input" 
                                placeholder="Snapshot note (optional)..."
                                value={snapshotNote}
                                onChange={(e) => setSnapshotNote(e.target.value)}
                                disabled={isReadOnly}
                            />
                            <button className="novelist-add-btn full-width" onClick={handleTakeSnapshot} disabled={isReadOnly || isSnapshotsLoading}>
                                <Camera size={14} /> Save Snapshot
                            </button>
                        </div>
                        <div className="novelist-snapshots-container">
                            <div className="novelist-snapshots-toolbar">
                                <div className="novelist-binder-filter">
                                    <Search size={12} className="search-icon-input" />
                                    <input 
                                        type="text" 
                                        placeholder="Search note/date..." 
                                        value={snapshotQuery}
                                        onChange={(e) => setSnapshotQuery(e.target.value)}
                                        className="has-icon"
                                    />
                                    {snapshotQuery && <X size={12} className="clear-filter" onClick={() => setSnapshotQuery('')} />}
                                </div>
                                <select
                                    value={snapshotSortKey}
                                    onChange={(e) => setSnapshotSortKey(e.target.value as any)}
                                    style={{minWidth: '100px', padding: '4px 8px', fontSize: '0.85em', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px'}}
                                >
                                    <option value="timestamp">Date</option>
                                    <option value="wordCount">Words</option>
                                    <option value="note">Note</option>
                                </select>
                                <button 
                                    onClick={() => setSnapshotSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                                    title={`Sort ${snapshotSortDirection === 'asc' ? 'Descending' : 'Ascending'}`}
                                    style={{background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', padding: '4px', display: 'flex', alignItems: 'center'}}
                                >
                                    {snapshotSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                </button>
                            </div>

                            <div className="snapshot-list">
                                {isSnapshotsLoading && <div style={{textAlign:'center', color: 'var(--text-muted)', marginTop: 10}}>Loading history...</div>}
                                {!isSnapshotsLoading && filteredAndSortedSnapshots.length === 0 && (
                                    <div style={{textAlign:'center', color: 'var(--text-muted)', marginTop: 20, fontStyle:'italic'}}>
                                        {snapshotQuery ? 'No snapshots match your query.' : 'No snapshots yet.'}
                                    </div>
                                )}
                                
                                {filteredAndSortedSnapshots.map(snap => (
                                <div key={snap.timestamp} className="snapshot-item">
                                    <div className="snapshot-header">
                                        <SnapshotTimeDisplay timestamp={snap.timestamp} /> 
                                        <span className="snapshot-words">{snap.wordCount} words</span>
                                    </div>
                                    
                                    {snap.note && <div className="snapshot-note">{snap.note}</div>}
                                    
                                    <div className="snapshot-status-indicators">
                                         {snap.isPinned && (
                                            <span title="Excluded from Pruning">
                                                <Pin size={14} className="is-pinned-icon"/>
                                            </span>
                                         )}
                                    </div>

                                    <div className="snapshot-actions">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                handlePinSnapshot(snap, !snap.isPinned); 
                                            }} 
                                            disabled={isReadOnly}
                                            title={snap.isPinned ? "Unpin (Allow Pruning)" : "Pin (Exclude from Pruning)"}
                                            className={`pin-toggle-btn ${snap.isPinned ? 'is-pinned' : ''}`}
                                        >
                                            <Pin size={14}/>
                                        </button>

                                        <button onClick={() => handleCompare(snap)} title="Compare"><FileDiff size={14}/></button>
                                        <button onClick={() => handleRestore(snap)} disabled={isReadOnly} title="Restore"><RotateCcw size={14}/></button>
                                        <button onClick={() => handleDeleteSnapshot(snap)} disabled={isReadOnly} title="Delete" className="danger"><Trash2 size={14}/></button>
                                    </div>
                                </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};