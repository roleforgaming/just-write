import { 
    Decoration, 
    DecorationSet, 
    EditorView, 
    WidgetType,
    ViewPlugin 
} from "@codemirror/view";
import { Range, StateField, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ScriveningsModel } from "./ScriveningsModel";

// 1. WIDGET FOR BLOCK ELEMENTS
class MarkdownBlockWidget extends WidgetType {
    constructor(
        readonly content: string,
        readonly app: App,
        readonly sourcePath: string,
        readonly component: Component,
        readonly cls: string
    ) {
        super();
    }

    toDOM(_view: EditorView) {
        const div = document.createElement("div");
        div.className = `novelist-live-preview-block ${this.cls}`;
        
        if (this.cls === "image") {
            div.style.display = "inline-block";
            div.style.maxWidth = "100%";
        }

        MarkdownRenderer.render(
            this.app,
            this.content,
            div,
            this.sourcePath,
            this.component
        );

        return div;
    }

    eq(other: MarkdownBlockWidget) {
        return other.content === this.content && other.sourcePath === this.sourcePath;
    }
}

// 2. HELPER TO BUILD DECORATIONS
function buildDecorations(state: any, app: App, model: ScriveningsModel, component: Component): DecorationSet {
    const builder: Range<Decoration>[] = [];
    const doc = state.doc;
    const selection = state.selection;

    const getSourcePath = (_pos: number) => {
        return model.sections[0]?.file.path || "";
    };

    syntaxTree(state).iterate({
        from: 0,
        to: doc.length,
        enter: (node) => {
            const typeName = node.type.name;
            
            // --- 1. BLOCK-LEVEL REPLACEMENTS (Render HTML) ---
            // Added: Table, FencedCode
            const isHeading = typeName.startsWith("ATXHeading");
            const isBlockquote = typeName === "Blockquote";
            const isHR = typeName === "HorizontalRule";
            const isImage = typeName === "Image";
            const isTable = typeName === "Table";
            const isCodeBlock = typeName === "FencedCode";

            if (isHeading || isBlockquote || isHR || isImage || isTable || isCodeBlock) {
                let isCursorInside = false;
                
                for (const range of selection.ranges) {
                    if (range.head >= node.from && range.head <= node.to) {
                        isCursorInside = true;
                        break;
                    }
                }

                if (!isCursorInside) {
                    const textContent = doc.sliceString(node.from, node.to);
                    const sourcePath = getSourcePath(node.from);
                    
                    // Map node type to a CSS class for the wrapper
                    let cssClass = typeName.toLowerCase();
                    if(isImage) cssClass = "image";
                    if(isCodeBlock) cssClass = "code-block";
                    if(isTable) cssClass = "table";

                    builder.push(
                        Decoration.replace({
                            widget: new MarkdownBlockWidget(
                                textContent,
                                app,
                                sourcePath,
                                component,
                                cssClass
                            ),
                            block: !isImage, 
                        }).range(node.from, node.to)
                    );
                    return false; // Skip checking children of these blocks
                }
            }

            // --- 2. INLINE FORMATTING (Hide syntax, style text) ---
            // Added: Link
            const isBold = typeName === "StrongEmphasis";
            const isItalic = typeName === "Emphasis";
            const isInlineCode = typeName === "InlineCode";
            const isLink = typeName === "Link";

            if (isBold || isItalic || isInlineCode || isLink) {
                let isCursorInside = false;
                for (const range of selection.ranges) {
                    if (range.head >= node.from && range.head <= node.to) {
                        isCursorInside = true;
                        break;
                    }
                }

                if (!isCursorInside) {
                    const text = doc.sliceString(node.from, node.to);
                    let prefixLen = 0;
                    let suffixLen = 0;

                    if (isBold) {
                        if (text.startsWith("**") || text.startsWith("__")) prefixLen = 2;
                        if (text.endsWith("**") || text.endsWith("__")) suffixLen = 2;
                    } else if (isItalic) {
                        if (text.startsWith("*") || text.startsWith("_")) prefixLen = 1;
                        if (text.endsWith("*") || text.endsWith("_")) suffixLen = 1;
                    } else if (isInlineCode) {
                        const match = text.match(/^(`+)/);
                        if (match) {
                            prefixLen = match[1].length;
                            suffixLen = prefixLen; 
                        }
                    } else if (isLink) {
                        // Regex to find standard markdown links [text](url)
                        // This identifies the '][' or '](' split
                        const match = text.match(/^\[(.*?)\](\(.*\))$/);
                        if (match) {
                            // match[1] is the text, match[2] is the (url)
                            // We want to hide the first char '[' and the last part '](...)'
                            prefixLen = 1; // Hide '['
                            suffixLen = match[2].length + 1; // Hide '](url)' ... roughly
                            
                            // To be safer with CM ranges, let's use exact positions based on match indices
                            // But for this simple implementation, we'll assume standard formatting
                            if(text.endsWith(")")) {
                                const splitIdx = text.lastIndexOf("](");
                                if(splitIdx === -1) {
                                     // Try standard Obsidian link [text](url)
                                     const standardSplit = text.lastIndexOf("]("); 
                                     // Actually simple regex is safer:
                                     const parts = /^\[(.*?)\](\(.*\))$/.exec(text);
                                     if(parts) {
                                         builder.push(Decoration.replace({}).range(node.from, node.from + 1)); // Hide [
                                         builder.push(Decoration.mark({ class: "cm-link" }).range(node.from + 1, node.to - parts[2].length - 1)); // Style text
                                         builder.push(Decoration.replace({}).range(node.to - parts[2].length - 1, node.to)); // Hide ](url)
                                         return; // Special return because we handled ranges manually
                                     }
                                     return; 
                                }
                            }
                        }
                    }

                    if (prefixLen > 0 && suffixLen > 0) {
                        // Hide prefix
                        builder.push(Decoration.replace({}).range(node.from, node.from + prefixLen));
                        
                        // Style Content
                        let styleClass = "";
                        let styleAttributes = {};

                        if (isBold) {
                            styleClass = "cm-strong";
                            styleAttributes = { style: "font-weight: bold;" };
                        } else if (isItalic) {
                            styleClass = "cm-em";
                            styleAttributes = { style: "font-style: italic;" };
                        } else if (isInlineCode) {
                            styleClass = "cm-inline-code";
                            styleAttributes = { 
                                style: "background-color: var(--background-modifier-code); font-family: var(--font-monospace); padding: 0 3px; border-radius: 3px;" 
                            };
                        }

                        builder.push(
                            Decoration.mark({ 
                                class: styleClass,
                                attributes: styleAttributes
                            }).range(node.from + prefixLen, node.to - suffixLen)
                        );

                        // Hide suffix
                        builder.push(Decoration.replace({}).range(node.to - suffixLen, node.to));
                    }
                }
            }
        }
    });

    return Decoration.set(builder, true);
}

// 3. THE EXPORTED EXTENSION
export const livePreviewExtension = (app: App, model: ScriveningsModel) => {
    // We create a Component to manage the lifecycle of MarkdownRenderer
    const component = new Component();

    // 1. StateField handles the Decorations (calculates what to hide/show)
    const decorationField = StateField.define<DecorationSet>({
        create(state) {
            return buildDecorations(state, app, model, component);
        },
        update(oldDecos, tr: Transaction) {
            if (tr.docChanged || tr.selection) {
                return buildDecorations(tr.state, app, model, component);
            }
            return oldDecos;
        },
        provide: (f) => EditorView.decorations.from(f)
    });

    // 2. ViewPlugin handles the Lifecycle (loading/unloading the component)
    const lifecyclePlugin = ViewPlugin.fromClass(class {
        constructor() {
            component.load();
        }
        destroy() {
            component.unload();
        }
    });

    return [
        decorationField,
        lifecyclePlugin
    ];
};