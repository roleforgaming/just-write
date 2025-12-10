import { Vault } from './Vault';

export class App {
  vault: Vault;
  workspace: any; // Add Workspace mock later when testing Views

  constructor() {
    this.vault = new Vault();
    this.workspace = {};
  }
}