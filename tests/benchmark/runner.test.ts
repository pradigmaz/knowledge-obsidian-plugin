import { afterEach, describe, expect, it } from 'vitest';
import { runQueryBenchmark } from '../../src/benchmark/runner';

afterEach(() => {
  delete (globalThis as any).window;
});

describe('runQueryBenchmark', () => {
  it('reports missing expected paths', async () => {
    (globalThis as any).window = {
      omnisearch: {
        search: async () => [{ path: 'Found.md', score: 1 }]
      }
    };
    const app = {
      metadataCache: { resolvedLinks: {} },
      vault: {
        getAbstractFileByPath: (path: string) => (
          path === 'Found.md' ? { extension: 'md', stat: { mtime: 1 } } : null
        )
      }
    } as any;

    const report = await runQueryBenchmark(app, [
      { query: 'q', expectedPaths: ['Missing.md'], minTopK: 1 }
    ]);

    expect(report.pass).toBe(false);
    expect(report.cases[0]).toMatchObject({
      missingPaths: ['Missing.md'],
      rankingDrift: { 'Missing.md': -1 }
    });
  });

  it('passes when the expected path is inside top K', async () => {
    (globalThis as any).window = {
      omnisearch: {
        search: async () => [{ path: 'Found.md', score: 1 }]
      }
    };
    const app = {
      metadataCache: { resolvedLinks: {} },
      vault: {
        getAbstractFileByPath: (path: string) => (
          path === 'Found.md' ? { extension: 'md', stat: { mtime: 1 } } : null
        )
      }
    } as any;

    const report = await runQueryBenchmark(app, [
      { query: 'q', expectedPaths: ['Found.md'], minTopK: 1 }
    ]);

    expect(report.pass).toBe(true);
    expect(report.cases[0]).toMatchObject({
      missingPaths: [],
      rankingDrift: { 'Found.md': 1 }
    });
  });
});
