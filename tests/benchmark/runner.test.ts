import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { runQueryBenchmark } from '../../src/benchmark/runner';

const MockTFile = TFile as unknown as { new(path: string, stat?: { mtime?: number; size?: number }): TFile };

afterEach(() => {
  delete (globalThis as any).window;
});

describe('runQueryBenchmark', () => {
  it('does not pass an empty benchmark set', async () => {
    const report = await runQueryBenchmark({ vault: { configDir: '.obsidian' } } as never, { cases: [] });

    expect(report).toMatchObject({ pass: false, topKHitRate: 0, cases: [] });
    expect(report).toMatchObject({
      dataset_path: '.obsidian/knowledge-benchmarks.json',
      query_count: 0,
      k: 1,
      runs_count: 1,
      median_rule: 'single_run',
      enforce_gates: false
    });
  });

  it('reports missing expected paths', async () => {
    (globalThis as any).window = {
      omnisearch: {
        search: async () => [{ path: 'Found.md', score: 1 }]
      }
    };
    const app = {
      metadataCache: { resolvedLinks: {} },
      vault: {
        configDir: '.obsidian',
        getAbstractFileByPath: (path: string) => (
          path === 'Found.md' ? { extension: 'md', stat: { mtime: 1 } } : null
        )
      }
    } as any;

    const report = await runQueryBenchmark(app, { cases: [
      { query: 'q', expectedPaths: ['Missing.md'], minTopK: 1 }
    ]});

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
        configDir: '.obsidian',
        getAbstractFileByPath: (path: string) => (
          path === 'Found.md' ? { extension: 'md', stat: { mtime: 1 } } : null
        )
      }
    } as any;

    const report = await runQueryBenchmark(app, { cases: [
      { query: 'q', expectedPaths: ['Found.md'], minTopK: 1 }
    ]});

    expect(report.pass).toBe(true);
    expect(report.cases[0]).toMatchObject({
      missingPaths: [],
      rankingDrift: { 'Found.md': 1 },
      mrr_at_k: 1,
      ndcg_at_k: 1,
      recall_at_k: 1
    });
    expect(report).toMatchObject({
      dataset_path: '.obsidian/knowledge-benchmarks.json',
      query_count: 1,
      k: 1,
      runs_count: 1,
      median_rule: 'single_run',
      recall_at_k: 1,
      mrr_at_k: 1,
      ndcg_at_k: 1,
      candidate: { runs: [expect.any(Object)], median: expect.any(Object) }
    });
    expect(report.avg_estimated_tokens).toBeGreaterThan(0);
    expect(report.latency_p50_ms).toBeGreaterThanOrEqual(0);
    expect(report.latency_p95_ms).toBeGreaterThanOrEqual(0);
  });

  it('applies baseline and threshold gates', async () => {
    (globalThis as any).window = {
      omnisearch: {
        search: async () => [{ path: 'Other.md', score: 1 }]
      }
    };
    const baselineFile = new MockTFile('meta/benchmarks.json', { mtime: 1000, size: 100 });
    const baseline = {
      dataset_path: 'dataset.json',
      k: 1,
      query_count: 1,
      recall_at_k: 1,
      mrr_at_k: 1,
      ndcg_at_k: 1,
      avg_estimated_tokens: 1,
      latency_p50_ms: 1,
      latency_p95_ms: 1,
      cases: []
    };
    const app = {
      metadataCache: { resolvedLinks: {} },
      vault: {
        configDir: '.obsidian',
        getAbstractFileByPath: (path: string) => (path === 'meta/benchmarks.json' ? baselineFile : null),
        read: async () => `\uFEFF${JSON.stringify(baseline)}`,
        modify: async () => undefined
      }
    } as any;

    const report = await runQueryBenchmark(app, {
      cases: [{ query: 'q', expectedPaths: ['Found.md'], minTopK: 1 }],
      baselinePath: 'meta/benchmarks.json',
      enforceGates: true,
      thresholds: { min_recall_at_k: 0.9 }
    });

    expect(report.pass).toBe(false);
    expect(report.baseline?.path).toBe('meta/benchmarks.json');
    expect(report.diff?.recall_at_k).toBeLessThan(0);
    expect(report.enforce_gates).toBe(true);
  });
});
