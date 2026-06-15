import { describe, expect, it } from 'vitest';
import { buildHealthReport } from '../../src/health/report';

function appFor(path: string, frontmatter: Record<string, unknown>) {
  const file = { path, basename: path.replace(/\.md$/, ''), parent: { path: '/' }, stat: { mtime: 1, size: 100 } };
  return {
    vault: {
      getMarkdownFiles: () => [file],
      cachedRead: async () => '',
      adapter: {
        exists: async () => false
      }
    },
    metadataCache: {
      resolvedLinks: {},
      unresolvedLinks: {},
      getFileCache: () => ({ frontmatter })
    }
  } as any;
}

describe('buildHealthReport', () => {
  it('does not reuse a previous app report', async () => {
    const first = await buildHealthReport(appFor('Missing.md', {}));
    const second = await buildHealthReport(appFor('Typed.md', { type: 'concept' }));

    expect(first.hotspots.map(h => h.path)).toEqual(['Missing.md']);
    expect(second.hotspots.map(h => h.path)).toEqual(['Typed.md']);
  });

  it('reports credential-like note content', async () => {
    const file = { path: 'Secret.md', basename: 'Secret', parent: { path: '/' }, stat: { mtime: Date.now(), size: 100 } };
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: async () => 'token = abc123',
        adapter: { exists: async () => false }
      },
      metadataCache: {
        resolvedLinks: {},
        unresolvedLinks: {},
        getFileCache: () => ({ frontmatter: { type: 'concept', title: 'Secret', description: 'Test' } })
      }
    } as any;

    const report = await buildHealthReport(app);

    expect(report.hotspots[0]?.violations.map(v => v.ruleId)).toContain('sensitive_data');
    expect(report.severityCounts.high).toBeGreaterThan(0);
  });
});
