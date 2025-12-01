import { 
    Decoration, 
    DecorationSet, 
    EditorView, 
    ViewPlugin, 
    ViewUpdate, 
    WidgetType 
} from "@codemirror/view";
import { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { App, MarkdownRenderer, Component } from "obsidian";
import { ScriveningsModel } from "./ScriveningsModel";

// A dummy component to manage the lifecycle of the renderer
class RenderComponent extends Component {}

// 1. WIDGET FOR BLOCK ELEMENTS (Headers, Blockquotes, Images)
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

export const livePreviewPlugin = (app: App, model: ScriveningsModel) => {
    const component = new RenderComponent();
    component.load();

    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        destroy() {
            component.unload();
        }

        buildDecorations(view: EditorView) {
            const builder: Range<Decoration>[] = [];
            const { state } = view;
            const doc = state.doc;
            const selection = state.selection;

            const getSourcePath = (_pos: number) => {
                return model.sections[0]?.file.path || "";
            };

            for (const { from, to } of view.visibleRanges) {
                syntaxTree(state).iterate({
                    from,
                    to,
                    enter: (node) => {
                        const typeName = node.type.name;
                        
                        // 1. BLOCK-LEVEL REPLACEMENTS
                        const isHeading = typeName.startsWith("ATXHeading");
                        const isBlockquote = typeName === "Blockquote";
                        const isHR = typeName === "HorizontalRule";
                        const isImage = typeName === "Image";

                        if (isHeading || isBlockquote || isHR || isImage) {
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
                                const cssClass = isImage ? "image" : typeName.toLowerCase();

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
                                return false; 
                            }
                        }

                        // 2. INLINE FORMATTING (Bold, Italic, Code)
                        const isBold = typeName === "StrongEmphasis";
                        const isItalic = typeName === "Emphasis";
                        const isInlineCode = typeName === "InlineCode";

                        if (isBold || isItalic || isInlineCode) {
                            let isCursorInside = false;
                            for (const range of selection.ranges) {
                                if (range.head >= node.from && range.head <= node.to) {
                                    isCursorInside = true;
                                    break;
                                }
                            }

                            // If cursor is NOT inside, we apply "Live Preview" style
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
                                }

                                if (prefixLen > 0 && suffixLen > 0) {
                                    // A. Hide the prefix markers
                                    builder.push(
                                        Decoration.replace({}).range(node.from, node.from + prefixLen)
                                    );

                                    // B. EXPLICITLY STYLE THE CONTENT
                                    // We must manually add the 'cm-strong', 'cm-em' classes here because
                                    // standard highlighting might be disrupted by the replacement decorations.
                                    let styleClass = "";
                                    let styleAttributes = {};

                                    if (isBold) {
                                        styleClass = "cm-strong";
                                        styleAttributes = { style: "font-weight: bold;" }; // Fallback
                                    } else if (isItalic) {
                                        styleClass = "cm-em";
                                        styleAttributes = { style: "font-style: italic;" }; // Fallback
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

                                    // C. Hide the suffix markers
                                    builder.push(
                                        Decoration.replace({}).range(node.to - suffixLen, node.to)
                                    );
                                }
                            }
                        }
                    }
                });
            }

            return Decoration.set(builder, true);
        }
    }, {
        decorations: v => v.decorations
    });
};