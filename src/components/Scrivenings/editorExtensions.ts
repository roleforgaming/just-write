// src/components/Scrivenings/editorExtensions.ts
import { 
    Decoration, 
    DecorationSet, 
    EditorView, 
    ViewPlugin, 
    ViewUpdate, 
    WidgetType 
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { ScriveningsModel } from "./ScriveningsModel";

// 1. The Widget (Visual Header)
class HeaderWidget extends WidgetType {
    constructor(readonly filename: string) { super(); }

    toDOM() {
        const wrap = document.createElement("div");
        wrap.className = "scrivenings-header-separator";
        wrap.innerHTML = `<span>${this.filename}</span>`;
        return wrap;
    }
}

// 2. The Decorator (Logic to find breaks and insert widgets)
const separatorPlugin = (model: ScriveningsModel) => ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const docString = view.state.doc.toString();
        const separator = ScriveningsModel.SEPARATOR;
        
        // Find all occurrences of the separator
        let pos = 0;
        let index = 0;
        
        // Note: This is a simplified search. In production, use a cursor or smarter regex
        while ((pos = docString.indexOf(separator, pos)) !== -1) {
            // Identify which file follows this break
            // We might need to look up the model.sections based on index
            const nextSection = model.sections[index + 1]; 
            const title = nextSection ? nextSection.file.basename : "End";

            // Create a "Replacement Decoration"
            // This effectively hides the text range and shows the widget
            builder.add(
                pos, 
                pos + separator.length, 
                Decoration.replace({
                    widget: new HeaderWidget(title),
                    block: true,
                    inclusive: false // Cursor skips this
                })
            );
            
            pos += separator.length;
            index++;
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

export const scriveningsExtensions = (model: ScriveningsModel) => [
    separatorPlugin(model),
    EditorView.theme({
        ".scrivenings-header-separator": {
            borderBottom: "1px dashed var(--text-muted)",
            color: "var(--text-muted)",
            fontWeight: "bold",
            padding: "20px 0 5px 0",
            marginBottom: "10px",
            userSelect: "none"
        }
    })
];