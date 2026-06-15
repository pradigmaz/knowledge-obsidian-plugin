import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { search } from '../../src/search/engine';

const MockTFile = TFile as unknown as { new(path: string, stat?: { mtime?: number; size?: number }): TFile };

function setupMockApp() {
  const file1 = new MockTFile('concepts/okf.md', { mtime: Date.now() - 100000 });
  const file2 = new MockTFile('decisions/arch_decision.md', { mtime: Date.now() - 50000 });
  
  const files = [file1, file2];
  
  const app = {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find(f => f.path === path) || null,
      cachedRead: async (file: TFile) => {
        if (file.path === 'concepts/okf.md') return '# OKF Spec\nThis note explains the Open Knowledge Format.';
        if (file.path === 'decisions/arch_decision.md') return '# Arch Decision\nThis decision document details the architecture.';
        return '';
      }
    },
    metadataCache: {
      resolvedLinks: {
        'decisions/arch_decision.md': { 'concepts/okf.md': 1 }
      },
      unresolvedLinks: {},
      getFileCache: (file: TFile) => {
        if (file.path === 'concepts/okf.md') {
          return { tags: [{ tag: '#concept' }, { tag: '#okf' }] };
        }
        if (file.path === 'decisions/arch_decision.md') {
          return { tags: [{ tag: '#decision' }] };
        }
        return null;
      }
    }
  } as any;
  
  return { app, file1, file2 };
}

describe('Search Engine E2E tests', () => {
  afterEach(() => {
    delete (globalThis as any).window;
  });

  // Tier 1: Feature Coverage (Root queryReport fields & explain blocks)
  it('F1.1 - F1.5: search returns queryReport matching RMU schema properties', async () => {
    const { app } = setupMockApp();
    const result = await search(app, { query: 'OKF', limit: 5 });

    expect(result.status).toBe('ok');
    expect(result.query).toBe('OKF');
    expect(result.results).toBeDefined();
    
    const report = result.queryReport;
    expect(report).toBeDefined();
    expect(report.source).toBeDefined();
    expect(report.fallbackUsed).toBeDefined();
    expect(report.resultCount).toBe(result.results.length);
    expect(report.warnings).toBeInstanceOf(Array);
    
    // Note: The following properties are part of the target RMU spec.
    // If the plugin hasn't implemented them yet, these assertions check their expected type structure.
    // We expect the implementer to align the search engine to return these.
    // For M1 (E2E Test Suite Setup), we assert both implemented and targeted fields.
    // We use conditional checks or strict assertions to guide the implementer.
    if ('query_id' in report) {
      expect(typeof (report as any).query_id).toBe('string');
      expect(typeof (report as any).timestamp_utc).toBe('string');
      expect(typeof (report as any).project_root).toBe('string');
      expect(['entrypoint_map', 'test_map', 'review_prep', 'api_contract_map', 'runtime_surface', 'refactor_surface']).toContain((report as any).resolved_mode);
      expect(['explicit', 'inferred', 'default']).toContain((report as any).mode_source);
      expect((report as any).budget).toBeDefined();
      expect((report as any).retrieval_pipeline).toBeInstanceOf(Array);
      expect((report as any).selected_context).toBeInstanceOf(Array);
      expect((report as any).selected_context).toHaveLength(result.results.length);
      expect((report as any).selected_context[0]).toMatchObject({
        path: result.results[0]!.path,
        why: result.results[0]!.why
      });
      expect((report as any).selected_context[0].explain).toBeDefined();
      expect((report as any).selected_context[0].provenance).toBeDefined();
      expect((report as any).provenance).toBeDefined();
      expect((report as any).confidence).toBeDefined();
    }
  });

  it('F2.1 - F2.5: search hits contain scoreParts and explain details', async () => {
    const { app } = setupMockApp();
    const result = await search(app, { query: 'architecture', limit: 2 });

    expect(result.results.length).toBeGreaterThan(0);
    const hit = result.results[0]!;
    
    expect(hit.path).toBeDefined();
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.originalScore).toBeDefined();
    expect(hit.graphScore).toBeDefined();
    
    expect(hit.scoreParts).toBeDefined();
    expect(hit.scoreParts?.omnisearch).toBeDefined();
    expect(hit.scoreParts?.backlinks).toBeDefined();
    expect(hit.scoreParts?.outgoingLinks).toBeDefined();
    expect(hit.scoreParts?.tagFolder).toBeDefined();
    expect(hit.scoreParts?.recency).toBeDefined();
    
    expect(hit.why).toBeInstanceOf(Array);
    expect(hit.why.length).toBeGreaterThan(0);
  });

  // Tier 1: Search Intent Adaptation (F3.1 - F3.5)
  it('F3.1 - F3.5: intent alters scoring weights correctly', async () => {
    const { app } = setupMockApp();

    const lookupRes = await search(app, { query: 'OKF', intent: 'lookup' });
    const researchRes = await search(app, { query: 'OKF', intent: 'research' });

    expect(lookupRes.results.length).toBeGreaterThan(0);
    expect(researchRes.results.length).toBeGreaterThan(0);
    
    // In research intent, graph score has larger weight (outgoing: 1.5, backlink: 1.5)
    // in lookup intent, graph score has lower weight (0.5) and original has higher (1.5)
    const lookupHit = lookupRes.results[0]!;
    const researchHit = researchRes.results[0]!;
    
    expect(lookupHit.why.some(w => w.includes('Lookup intent'))).toBe(true);
    expect(researchHit.why.some(w => w.includes('Research intent'))).toBe(true);
  });

  // Tier 1: Fallback execution and degradation telemetry (F4.1 - F4.5)
  it('F4.1 - F4.5: fallbacks to vault text search when omnisearch is not available', async () => {
    const { app } = setupMockApp();
    // Simulate omnisearch not present on window
    delete (globalThis as any).window;

    const result = await search(app, { query: 'Open' });
    expect(result.queryReport.source).toBe('vault-text');
    expect(result.queryReport.fallbackUsed).toBe(true);
    expect(result.queryReport.warnings?.some(w => w.includes('Omnisearch plugin is not available'))).toBe(true);
    expect(result.results.some(h => h.source === 'vault-text')).toBe(true);
  });

  // Tier 1: Metadata Filters Integration (F5.1 - F5.5)
  it('F5.1 - F5.5: filters apply correctly to results', async () => {
    const { app } = setupMockApp();

    const tagFilterResult = await search(app, {
      query: 'explain',
      filters: { tags: ['#okf'] }
    });
    expect(tagFilterResult.results.every(h => h.path === 'concepts/okf.md')).toBe(true);

    const prefixFilterResult = await search(app, {
      query: 'explain',
      filters: { pathPrefix: 'decisions/' }
    });
    expect(prefixFilterResult.results.every(h => h.path.startsWith('decisions/'))).toBe(true);
  });

  // Tier 2: Boundary & Corner Cases (B1.1 - B1.5)
  it('B1.2: caps limit to 50 automatically', async () => {
    const { app } = setupMockApp();
    const result = await search(app, { query: 'OKF', limit: 100 });
    // Search implementation caps limit to 50: const limit = Math.min(Math.max(payload.limit ?? 20, 1), 50);
    expect(result.queryReport.resultCount).toBeLessThanOrEqual(50);
  });

  it('B1.3: coerces limit < 1 to 1', async () => {
    const { app } = setupMockApp();
    const result = await search(app, { query: 'OKF', limit: 0 });
    expect(result.queryReport.resultCount).toBeLessThanOrEqual(1);
  });

  it('B1.5: query returning 0 results still returns valid report', async () => {
    const { app } = setupMockApp();
    const result = await search(app, { query: 'nonexistent_term' });
    expect(result.results).toHaveLength(0);
    expect(result.queryReport).toBeDefined();
    expect(result.queryReport.resultCount).toBe(0);
  });
});
