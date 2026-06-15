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

    expect(out.result).toMatchObject({
      path: ['A.md', 'B.md', 'C.md'],
      distance: 2
    });
  });
});
