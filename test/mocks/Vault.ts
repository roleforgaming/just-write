import { TFile } from './TFile';

export class Vault {
    files: TFile[] = [];

    constructor() {
        this.files = [];
    }

    getFiles(): TFile[] {
        return this.files;
    }

    getMarkdownFiles(): TFile[] {
        return this.files.filter(f => f.extension === 'md');
    }

    read(file: TFile): Promise<string> {
        return Promise.resolve(`Mock content for ${file.path}`);
    }

    cachedRead(file: TFile): Promise<string> {
        return this.read(file);
    }

    // These are now just plain methods
    createBinary(path: string, data: any): Promise<void> {
        return Promise.resolve();
    }

    createFolder(path: string): Promise<void> {
        return Promise.resolve();
    }

    // Helper for your tests to inject files easily
    _injectFile(path: string) {
        this.files.push(new TFile(path));
    }
}