import React, { useRef, useEffect, useState } from 'react';
import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { ScriveningsModel } from './ScriveningsModel';
import matter from 'gray-matter'; 
import { ProjectManager } from '../../utils/projectManager';

// CodeMirror Imports
import { EditorState, RangeSetBuilder, StateField, Transaction } from "@codemirror/state";
import { EditorView, keymap, highlightSpecialChars, drawSelection, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data"; 
import { livePreviewExtension } from './LivePreviewExtension'; 

// --- 1. The Separator Widget (Unchanged) ---
class HeaderWidget extends WidgetType {
    constructor(readonly title: string) { super(); }

    toDOM() {
        const wrap = document.createElement("div");
        wrap.className = "scrivenings-separator";
        wrap.innerHTML = `<s(pan class="scrivenings-label">${this.title}</span>`;
        return wrap;
    }

    ignoreEvent() { return true; }
}

// --- 2. Change Filter (Unchanged) ---
const protectSeparators = EditorState.changeFilter.of((tr: Transaction) => {
    if (!tr.docChanged) return true;

    const marker = "<!-- SC_BREAK -->";
    const text = tr.startState.doc.toString();
    let allow = true;

    tr.changes.iterChanges((fromA: number, toA: number) => {
        if (!allow) return;

        let pos = 0;
        while ((pos = text.indexOf(marker, pos)) !== -1) {
            const markerStart = pos;
            const markerEnd = pos + marker.length;

            if (fromA < markerEnd && toA > markerStart) {
                allow = false;
                break;
            }
            pos += marker.length;
        }
    });

    return allow;
});

// --- 3. The Decorator Logic (For Separators) ---
function buildDecorations(state: EditorState, model: ScriveningsModel): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const docString = state.doc.toString();
    const marker = "<!-- SC_BREAK -->";
    
    // 1. Header for the first file
    if (model.sections.length > 0) {
        builder.add(
            0, 
            0, 
            Decoration.widget({
                widget: new HeaderWidget(model.sections[0].file.basename),
                side: -1, 
                block: true 
            })
        );
    }

    // 2. Headers for subsequent files
    let pos = 0;
    let index = 0;

    while ((pos = docString.indexOf(marker, pos)) !== -1) {
        const nextFile = model.sections[index + 1]?.file;
        const title = nextFile ? nextFile.basename : "Section";

        let startReplace = pos;
        let endReplace = pos + marker.length;

        // Visual adjustment to hide surrounding newlines
        if (startReplace > 0 && docString[startReplace - 1] === '\n') {
            startReplace--;
        }

        if (endReplace < docString.length && docString[endReplace] === '\n') {
            endReplace++;
        }

        builder.add(
            startReplace, 
            endReplace, 
            Decoration.replace({
                widget: new HeaderWidget(title),
                block: true,
                inclusive: false 
            })
        );
        
        pos += marker.length;
        index++;
    }
    return builder.finish();
}

const separatorField = (model: ScriveningsModel) => StateField.define<DecorationSet>({
    create(state) {
        return buildDecorations(state, model);
    },
    update(decorations, transaction) {
        if (transaction.docChanged) {
            return buildDecorations(transaction.state, model);
        }
        return decorations.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field)
});

// --- 4. The React Component ---
interface EditorProps {
    app: App;
    folder: TFolder;
}

export const SeamlessEditor: React.FC<EditorProps> = ({ app, folder }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const modelRef = useRef<ScriveningsModel>(new ScriveningsModel(app, folder));
    const isSavingRef = useRef(false);
    const lastActivePathRef = useRef<string | null>(null);
    
    // 2. ADD a ref to store cursor positions
    const cursorPositionsRef = useRef<Record<string, number>>({});

    const [stickyTitle, setStickyTitle] = useState<string>("");

    // 3. ADD a debounced save handler specifically for the cursor
    const debounceCursorSaveRef = useRef<NodeJS.Timeout | null>(null);
    const handleCursorSave = (filePath: string, position: number) => {
        if (debounceCursorSaveRef.current) clearTimeout(debounceCursorSaveRef.current);
        debounceCursorSaveRef.current = setTimeout(async () => {
            const projectManager = new ProjectManager(app);
            const project = projectManager.getProjectForFile(folder);
            if (!project) return;

            // Prevent saving if the position hasn't actually changed
            if (cursorPositionsRef.current[filePath] === position) return;

            const newPositions = { ...cursorPositionsRef.current, [filePath]: position };
            cursorPositionsRef.current = newPositions; // Update ref immediately

            await projectManager.updateProjectMetadata(project, { 
                cursorPositions: newPositions
            });
        }, 500); // A 500ms delay is good for cursor tracking
    };


    useEffect(() => {
        if (!editorRef.current) return;

        const init = async () => {
            const text = await modelRef.current.load();

            // 4. LOAD cursor positions from project metadata
            const projectManager = new ProjectManager(app);
            const project = projectManager.getProjectForFile(folder);
            if (project) {
                const meta = projectManager.getProjectMetadata(project);
                if (meta && meta.cursorPositions) {
                    cursorPositionsRef.current = meta.cursorPositions;
                }
            }
            
            let initialCursorPos = 0;
            if (modelRef.current.sections.length > 0) {
                const firstFile = modelRef.current.sections[0].file;
                lastActivePathRef.current = firstFile.path;
                setStickyTitle(firstFile.basename);
                (app.workspace as any).trigger('novelist:select-file', firstFile);

                // Get the saved position for the first file
                initialCursorPos = cursorPositionsRef.current[firstFile.path] || 0;
            }

            const state = EditorState.create({
                doc: text,
                // 5. SET the initial cursor position
                selection: { anchor: initialCursorPos },
                extensions: [
                    // ... (keep existing extensions)

                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            if (!update.transactions.some(tr => tr.annotation(Transaction.userEvent) === "sync")) {
                                handleSave(update.state.doc.toString());
                            }
                        }
                        // 6. MODIFY this block to call our new function on selection changes
                        if (update.selectionSet) {
                            detectActiveFileAndSaveCursor(update.state);
                        }
                        if (update.viewportChanged || update.docChanged) {
                            updateStickyHeader(update.view);
                        }
                    })
                ]
            });

            const view = new EditorView({ state, parent: editorRef.current });
            viewRef.current = view;
        };

        init();

        // 7. RENAME this function to reflect its new responsibility
        const detectActiveFileAndSaveCursor = (state: EditorState) => {
            const pos = state.selection.main.head;
            const docString = state.doc.toString();
            const regex = /<!-- SC_BREAK -->/g;
            const matches = [...docString.matchAll(regex)];
            let sectionIndex = 0;

            for (let i = 0; i < matches.length; i++) {
                const matchEnd = matches[i].index! + matches[i][0].length;
                if (pos >= matchEnd) {
                    sectionIndex = i + 1;
                } else {
                    break;
                }
            }

            const activeSection = modelRef.current.sections[sectionIndex];
            if (activeSection) {
                // 8. ADD the call to save the cursor position
                handleCursorSave(activeSection.file.path, pos);

                if (activeSection.file.path !== lastActivePathRef.current) {
                    lastActivePathRef.current = activeSection.file.path;
                    (app.workspace as any).trigger('novelist:select-file', activeSection.file);
                }
            }
        };

        const updateStickyHeader = (view: EditorView) => {
            const topPos = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 10).from;
            const docString = view.state.doc.toString();
            const regex = /<!-- SC_BREAK -->/g;
            const matches = [...docString.matchAll(regex)];
            let sectionIndex = 0;

            for (let i = 0; i < matches.length; i++) {
                const matchIndex = matches[i].index!;
                if (topPos > matchIndex) {
                    sectionIndex = i + 1;
                } else {
                    break;
                }
            }

            const activeSection = modelRef.current.sections[sectionIndex];
            if (activeSection) {
                setStickyTitle(activeSection.file.basename);
            }
        };

        const onVaultModify = async (file: TAbstractFile) => {
            if (isSavingRef.current) return; 
            if (!(file instanceof TFile) || file.extension !== 'md') return;

            const sectionIndex = modelRef.current.sections.findIndex(s => s.file.path === file.path);
            if (sectionIndex === -1) return;

            const rawContent = await app.vault.read(file);
            const parsed = matter(rawContent);
            const newBody = parsed.content;
            
            if (!viewRef.current) return;
            const currentDoc = viewRef.current.state.doc.toString();
            const regex = /(?:\r?\n)*<!-- SC_BREAK -->(?:\r?\n)*/g;
            const matches = [...currentDoc.matchAll(regex)];

            let startPos = 0;
            let endPos = currentDoc.length;

            if (sectionIndex === 0) {
                startPos = 0;
                endPos = matches.length > 0 ? matches[0].index! : currentDoc.length;
            } else {
                const prevMatch = matches[sectionIndex - 1];
                if (!prevMatch) return; 
                startPos = prevMatch.index! + prevMatch[0].length;
                const nextMatch = matches[sectionIndex];
                endPos = nextMatch ? nextMatch.index! : currentDoc.length;
            }

            const currentEditorContent = currentDoc.slice(startPos, endPos);

            if (currentEditorContent !== newBody) {
                viewRef.current.dispatch({
                    changes: { from: startPos, to: endPos, insert: newBody },
                    annotations: Transaction.userEvent.of("sync") 
                });
            }
        };

        const eventRef = app.vault.on('modify', onVaultModify);

        return () => {
            viewRef.current?.destroy();
            app.vault.offref(eventRef);
        };
    }, [folder]); 

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    
    const handleSave = (text: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            isSavingRef.current = true;
            await modelRef.current.save(text);
            setTimeout(() => { isSavingRef.current = false; }, 100); 
        }, 1000); 
    };

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            {stickyTitle && (
                <div className="novelist-sticky-header">
                    {stickyTitle}
                </div>
            )}
            <div ref={editorRef} style={{ height: '100%', overflow: 'hidden' }} />
        </div>
    );
};