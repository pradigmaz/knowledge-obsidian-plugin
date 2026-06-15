import { afterEach, describe, expect, it } from 'vitest';
import { KnowledgeServer } from '../../src/api/server';

afterEach(() => {
  delete (globalThis as any).window;
});

describe('KnowledgeServer status', () => {
  it('reports degraded search when Omnisearch is unavailable', () => {
    (globalThis as any).window = {};
    const server = new KnowledgeServer({ vault: { getName: () => 'vault' } } as any);

    expect(server.buildStatus()).toMatchObject({
      status: 'degraded',
      omnisearchAvailable: false
    });
    expect(server.buildCapabilities().find(cap => cap.id === 'knowledge-search')).toMatchObject({
      status: 'degraded'
    });
  });
});
