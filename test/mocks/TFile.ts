export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  parent: any; // Important for your Project discovery logic

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.split('.')[0];
    this.extension = this.name.split('.').pop() || '';
    
    // Mock the parent folder structure based on path string
    const parts = path.split('/');
    parts.pop(); // remove filename
    this.parent = {
      path: parts.join('/'),
      name: parts.length > 0 ? parts[parts.length - 1] : '/'
    };
  }
}