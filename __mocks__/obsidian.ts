// __mocks__/obsidian.ts

// Re-export your modular classes
export { App } from '../test/mocks/App';
export { TFile } from '../test/mocks/TFile';
export { Vault } from '../test/mocks/Vault';

// Simple one-off mocks can stay here
export class Notice {
  constructor(public message: string) {
    console.log(`[Mock Notice]: ${message}`);
  }
}

// Mock other simple Obsidian utilities
export const normalizePath = (path: string) => path;