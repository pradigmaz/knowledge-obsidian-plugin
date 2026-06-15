import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { conceptCluster } from '../../src/search/cluster';

function makeApp() {
  const files = [
    new TFile('A.md'),
    new TFile('B.md'),
    new TFile('C.md')
  ];
  return {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find(file => file.path === path) ?? null
    },
    metadataCache: {
      resolvedLinks: {
        'A.md': { 'B.md': 1 },
        'B.md': { 'C.md': 1 }
      },
      getFileCache: () => ({ frontmatter: { tags: ['cluster'] } })
    }
  } as any;
}

describe('conceptCluster', () => {
  it('honors depth 0', async () => {
    const out = await conceptCluster(makeApp(), { concept: 'A', depth: 0 });

    expect(out.result.relatedNotes).toEqual(['A.md']);
  });

  it('collects tags from file-like objects', async () => {
    const out = await conceptCluster(makeApp(), { concept: 'A', depth: 1 });

    expect(out.result.clusterTags).toEqual(['cluster']);
  });
});
