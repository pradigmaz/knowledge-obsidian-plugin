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
  basename: string;
  extension: string;
  stat: { mtime: number; size: number };

  constructor(path: string, stat: { mtime?: number; size?: number } = {}) {
    this.path = path;
    this.basename = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? path;
    this.extension = path.split('.').pop() ?? '';
    this.stat = { mtime: stat.mtime ?? Date.now(), size: stat.size ?? 0 };
  }
}
