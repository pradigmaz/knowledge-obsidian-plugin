import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import type { SearchHit } from '../../src/core/types';
import { normalizeExcerpt, search } from '../../src/search/engine';

afterEach(() => {
  delete (globalThis as any).window;
});

describe('normalizeExcerpt', () => {
  it('truncates excerpt to default length', () => {
    const longText = 'a'.repeat(300);
    const result = normalizeExcerpt(longText);
    expect(result.length).toBe(243); // 240 chars + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('collapses multiple whitespace characters', () => {
    const result = normalizeExcerpt('hello   \n\t  world');
    expect(result).toBe('hello world');
  });

  it('strips basic markdown formatting', () => {
    const result = normalizeExcerpt('**bold** and *italic* and [[link]]');
    expect(result).toBe('bold and italic and link');
  });
});

import { applyFilters } from '../../src/search/engine';

const MockTFile = TFile as unknown as { new(path: string, stat?: { mtime?: number; size?: number }): TFile };

function hit(path: string): SearchHit {
  return {
    path,
    title: path,
    originalScore: 1,
    score: 1,
    graphScore: 0,
    source: 'test',
    why: []
  };
}

describe('applyFilters', () => {
  const mockHits = [
    hit('folder1/file1.md'),
    hit('folder2/file2.png'),
    hit('folder1/sub/file3.md')
  ];

  const mockApp = {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (path === 'folder1/file1.md') return new MockTFile(path, { mtime: 1000 });
        if (path === 'folder2/file2.png') return new MockTFile(path, { mtime: 2000 });
        if (path === 'folder1/sub/file3.md') return new MockTFile(path, { mtime: 3000 });
        return null;
      }
    },
    metadataCache: {
      getFileCache: (file: any) => {
        if (file.extension === 'png') return null;
        if (file.stat.mtime === 1000) return { tags: [{ tag: '#project' }] };
        return { tags: [{ tag: '#archived' }] };
      }
    }
  } as any;

  it('returns all hits if no filters provided', () => {
    expect(applyFilters(mockApp, mockHits, undefined).length).toBe(3);
  });

  it('filters by pathPrefix', () => {
    const res = applyFilters(mockApp, mockHits, { pathPrefix: 'folder1/' });
    expect(res.length).toBe(2);
    expect(res[0]?.path).toBe('folder1/file1.md');
  });

  it('filters by fileTypes', () => {
    const res = applyFilters(mockApp, mockHits, { fileTypes: ['png'] });
    expect(res.length).toBe(1);
    expect(res[0]?.path).toBe('folder2/file2.png');
  });

  it('filters by tags', () => {
    const res = applyFilters(mockApp, mockHits, { tags: ['#project'] });
    expect(res.length).toBe(1);
    expect(res[0]?.path).toBe('folder1/file1.md');
  });

  it('filters by frontmatter tags', () => {
    const app = {
      vault: {
        getAbstractFileByPath: () => new MockTFile('N.md', { mtime: 1000 })
      },
      metadataCache: {
        getFileCache: () => ({ frontmatter: { tags: ['knowledge'] } })
      }
    } as any;

    const res = applyFilters(app, [hit('N.md')], { tags: ['knowledge'] });
    expect(res.map(hit => hit.path)).toEqual(['N.md']);
  });

  it('filters by modified date ranges', () => {
    const res = applyFilters(mockApp, mockHits, { modifiedAfter: 1500, modifiedBefore: 2500 });
    expect(res.length).toBe(1);
    expect(res[0]?.path).toBe('folder2/file2.png');
  });
});

import { scoreHit } from '../../src/search/engine';

describe('scoreHit with intents', () => {
  const baseHit = {
    path: 'test.md',
    title: 'test',
    originalScore: 1,
    score: 1,
    graphScore: 0,
    source: 'vault-text',
    why: []
  };

  const graph = {
    links: { 'test.md': 10 },
    backlinks: { 'test.md': 20 }
  };

  it('boosts graph score normally', () => {
    const scored = scoreHit(baseHit, graph);
    expect(scored.score).toBeGreaterThan(1);
    expect(scored.why.join(' ')).toContain('Backlinks boost');
  });

  it('applies research intent weight (graph emphasis)', () => {
    const scored = scoreHit(baseHit, graph, 'research');
    expect(scored.why.join(' ')).toContain('Research intent');
  });

  it('applies lookup intent weight (exact match emphasis)', () => {
    const scored = scoreHit(baseHit, graph, 'lookup');
    expect(scored.why.join(' ')).toContain('Lookup intent');
  });

  it('adds structured score parts for auditability', () => {
    const scored = scoreHit({ ...baseHit, path: 'Projects/index.md' }, graph, 'research');
    expect(scored.scoreParts).toMatchObject({
      backlinks: expect.any(Number),
      outgoingLinks: expect.any(Number),
      tagFolder: expect.any(Number),
      apiSurface: expect.any(Number)
    });
    expect(scored.scoreParts?.apiSurface).toBeGreaterThan(0);
  });
});

describe('search fallback', () => {
  it('uses vault text when Omnisearch is unavailable', async () => {
    (globalThis as any).window = {};
    const file = new MockTFile('Notes/Alpha.md', { mtime: 1000, size: 100 });
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        getAbstractFileByPath: () => file,
        cachedRead: async () => 'alpha beta'
      },
      metadataCache: {
        resolvedLinks: {},
        getFileCache: () => ({ frontmatter: { tags: ['knowledge'] } })
      }
    } as any;

    const result = await search(app, { query: 'alpha' });

    expect(result.queryReport).toMatchObject({ source: 'vault-text', fallbackUsed: true });
    expect(result.results.map(hit => hit.path)).toEqual(['Notes/Alpha.md']);
  });

  it('uses vault text fallback when Omnisearch search rejects', async () => {
    (globalThis as any).window = {
      omnisearch: {
        search: async () => {
          throw new Error('index not ready');
        }
      }
    };
    const file = new MockTFile('Notes/Alpha.md', { mtime: Date.now(), size: 10 });
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: async () => 'alpha beta',
        getAbstractFileByPath: () => file
      },
      metadataCache: {
        resolvedLinks: {},
        getFileCache: () => ({ frontmatter: { tags: ['knowledge'] } })
      }
    } as any;

    const result = await search(app, { query: 'alpha' });

    expect(result.queryReport).toMatchObject({ source: 'vault-text', fallbackUsed: true });
    expect(result.queryReport.warnings?.join(' ')).toContain('index not ready');
    expect(result.results[0]?.source).toBe('vault-text');
  });
});
