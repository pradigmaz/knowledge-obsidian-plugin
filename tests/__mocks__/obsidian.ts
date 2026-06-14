export class App {
  vault: any = {
    getMarkdownFiles: () => []
  };
  metadataCache: any = {
    getFileCache: () => null
  };
}

export class TFile {
  path: string;
  stat: any;
  constructor(path: string) {
    this.path = path;
    this.stat = { mtime: Date.now() };
  }
}
