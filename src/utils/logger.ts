import { Plugin } from 'obsidian';

export class Logger {
    private plugin: Plugin;
    private prefix: string;
    public isVerbose: boolean = true; // Toggle false for production

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.prefix = `[${this.plugin.manifest.name}]`;
    }

    log(...args: any[]) {
        if (this.isVerbose) {
            console.log(this.prefix, ...args);
        }
    }

    error(...args: any[]) {
        console.error(this.prefix, ...args);
    }
}