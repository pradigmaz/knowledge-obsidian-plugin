import { describe, expect, it } from 'vitest';
import { routeTrace } from '../../src/search/route-trace';

describe('routeTrace', () => {
  it('finds an undirected path by basename', async () => {
    const app = {
      metadataCache: {
        resolvedLinks: {
          'A.md': { 'B.md': 1 },
          'B.md': { 'C.md': 1 }
        }
      }
    } as any;

    const out = await routeTrace(app, { source: 'A', target: 'C' });

    expect(out).toMatchObject({
      path: ['A.md', 'B.md', 'C.md'],
      distance: 2,
      found: true
    });
  });

  it('returns a reason when target is missing', async () => {
    const app = {
      metadataCache: {
        resolvedLinks: {
          'A.md': { 'B.md': 1 }
        }
      }
    } as any;

    const out = await routeTrace(app, { source: 'A', target: 'Missing' });

    expect(out).toMatchObject({
      path: [],
      found: false,
      reason: 'target_not_found'
    });
  });

  it('finds a direct route', async () => {
    const app = {
      metadataCache: {
        resolvedLinks: {
          'A.md': { 'B.md': 1 }
        }
      }
    } as any;

    const out = await routeTrace(app, { source: 'A', target: 'B' });
    expect(out).toMatchObject({
      path: ['A.md', 'B.md'],
      distance: 1,
      found: true
    });
  });

  it('handles max depth behavior (fails if route is too long)', async () => {
    // Construct a path of length 11 (A0 -> A1 -> ... -> A11)
    const resolvedLinks: Record<string, Record<string, number>> = {};
    for (let i = 0; i <= 10; i++) {
      resolvedLinks[`A${i}.md`] = { [`A${i+1}.md`]: 1 };
    }
    const app = { metadataCache: { resolvedLinks } } as any;

    const out = await routeTrace(app, { source: 'A0', target: 'A11' });
    expect(out).toMatchObject({
      path: [],
      found: false,
      reason: 'no_path'
    });
  });

  it('provides empty alternate routes for current implementation', async () => {
    const app = {
      metadataCache: {
        resolvedLinks: {
          'A.md': { 'B.md': 1, 'C.md': 1 },
          'C.md': { 'B.md': 1 }
        }
      }
    } as any;

    const out = await routeTrace(app, { source: 'A', target: 'B' });
    expect(out.alternate_routes).toEqual([]);
    expect(out.path).toEqual(['A.md', 'B.md']);
  });
});
