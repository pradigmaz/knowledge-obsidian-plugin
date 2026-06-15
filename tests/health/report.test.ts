import { describe, expect, it } from 'vitest';
import { buildHealthReport } from '../../src/health/report';

function appFor(path: string, frontmatter: Record<string, unknown>) {
  const file = { path, basename: path.replace(/\.md$/, ''), parent: { path: '/' }, stat: { mtime: 1, size: 100 } };
  return {
    vault: {
      getMarkdownFiles: () => [file],
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
});
