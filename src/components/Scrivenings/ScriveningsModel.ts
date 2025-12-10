import { App, TFile, TFolder, Notice } from 'obsidian';
import { getRank } from '../../utils/metadata';
import matter from 'gray-matter';
import { updateNoteBody } from 'src/utils/metadata';
export interface FileSection {
file: TFile;
content: string;
frontmatter: string;
originalPath: string;
}
export class ScriveningsModel {
app: App;
folder: TFolder;
sections: FileSection[] = [];
static SEPARATOR = "\n\n<!-- SC_BREAK -->\n\n";
constructor(app: App, folder: TFolder) {
this.app = app;
this.folder = folder;
}
async load(): Promise<string> {
this.sections = [];
const parts: string[] = [];
const files = this.folder.children
.filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
.sort((a, b) => getRank(this.app, a) - getRank(this.app, b));
for (const file of files) {
const raw = await this.app.vault.read(file);
const parsed = matter(raw);
const body = parsed.content;
const frontmatterBlock = raw.slice(0, raw.length - body.length);
this.sections.push({
file,
content: body,
frontmatter: frontmatterBlock,
originalPath: file.path
});
parts.push(body);
}
return parts.join(ScriveningsModel.SEPARATOR);
}
async save(fullText: string) {
const parts = fullText.split(/(?:\r?\n)*<!-- SC_BREAK -->(?:\r?\n)*/);
if (parts.length !== this.sections.length) {
new Notice("Scrivenings Sync Warning: Section count mismatch. Save aborted.");
console.error("Scrivenings mismatch:", { expected: this.sections.length, found: parts.length });
return;
}
const promises = this.sections.map(async (section, index) => {
let newContent = parts[index];
if (newContent !== section.content) {
newContent = newContent.replace(/^(?:\ufeff)?\s*---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*[\r\n]*/, '');
await updateNoteBody(this.app, section.file, newContent);
section.content = parts[index];
}
});
await Promise.all(promises);
}
}