import { Readable } from 'stream';
import { TFile } from 'obsidian';
import { afterEach, describe, expect, it } from 'vitest';
import { KnowledgeServer } from '../../src/api/server';
import { SCHEMA_VERSION } from '../../src/core/types';

const MockTFile = TFile as unknown as { new(path: string, stat?: { mtime?: number; size?: number }): TFile };

afterEach(() => {
  delete (globalThis as any).window;
});

describe('KnowledgeServer status', () => {
  it('reports degraded search when Omnisearch is unavailable', () => {
    (globalThis as any).window = {};
    const server = new KnowledgeServer({ vault: { getName: () => 'vault' } } as any, '1.0.0');

    expect(server.buildStatus()).toMatchObject({
      status: 'degraded',
      omnisearchAvailable: false,
      pluginVersion: '1.0.0',
      requiredCapabilities: expect.arrayContaining([
        expect.objectContaining({ id: 'knowledge-search', status: 'degraded' })
      ])
    });
    expect(server.buildCapabilities().find(cap => cap.id === 'knowledge-search')).toMatchObject({
      status: 'degraded'
    });
  });
});

function makeReq(method: string, url: string, headers: Record<string, string> = {}, body = '') {
  const req = Readable.from(body ? [body] : []);
  return Object.assign(req, { method, url, headers });
}

function makeRes() {
  const res = {
    headers: {} as Record<string, string | number | readonly string[]>,
    statusCode: 200,
    payload: '',
    setHeader(key: string, value: string | number | readonly string[]) {
      this.headers[key] = value;
    },
    end(payload = '') {
      this.payload = String(payload);
      this.done();
    },
    done() {}
  };
  return res;
}

function makeApp() {
  const files = [new MockTFile('A.md'), new MockTFile('B.md')];
  return {
    vault: {
      configDir: '.obsidian',
      getName: () => 'vault',
      getMarkdownFiles: () => files,
      getFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find(file => file.path === path) ?? null,
      cachedRead: async () => '',
      adapter: { exists: async () => false }
    },
    metadataCache: {
      resolvedLinks: { 'A.md': { 'B.md': 1 } },
      unresolvedLinks: {},
      getFileCache: () => ({ frontmatter: { type: 'concept', tags: ['cluster'] } })
    }
  };
}

async function call(server: KnowledgeServer, req: ReturnType<typeof makeReq>) {
  const res = makeRes();
  const done = new Promise<void>(resolve => {
    res.done = resolve;
  });
  await server.handleRequest(req as never, res as never);
  await done;
  return res;
}

describe('KnowledgeServer HTTP boundary', () => {
  it('allows local preflight without schema header', async () => {
    const server = new KnowledgeServer(makeApp() as never, '1.0.0');
    const res = await call(server, makeReq('OPTIONS', '/api/search', { origin: 'http://localhost' }));

    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost');
  });

  it('rejects mismatched schema versions', async () => {
    const server = new KnowledgeServer(makeApp() as never, '1.0.0');
    const res = await call(server, makeReq('GET', '/api/brief', { 'x-schema-version': '0.0.0' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toMatchObject({
      error: `Schema version mismatch. Expected ${SCHEMA_VERSION}, got 0.0.0`
    });
  });

  it('returns status without schema header and advertises compatibility headers', async () => {
    const server = new KnowledgeServer(makeApp() as never, '1.0.0');
    const res = await call(server, makeReq('GET', '/api/status'));
    const payload = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Knowledge-Plugin']).toBe('1');
    expect(res.headers['X-Schema-Version']).toBe(SCHEMA_VERSION);
    expect(payload).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      pluginVersion: '1.0.0',
      requiredCapabilities: expect.arrayContaining([
        expect.objectContaining({ id: 'knowledge-core' })
      ])
    });
  });

  it('rejects invalid benchmark JSON instead of returning an empty pass', async () => {
    const server = new KnowledgeServer(makeApp() as never, '1.0.0');
    const res = await call(server, makeReq('POST', '/api/benchmark', {
      'content-type': 'application/json',
      'x-schema-version': SCHEMA_VERSION
    }, '{bad json'));

    expect(res.statusCode).toBe(400);
  });

  it('returns unwrapped Part B endpoint payloads', async () => {
    const server = new KnowledgeServer(makeApp() as never, '1.0.0');
    const headers = { 'content-type': 'application/json', 'x-schema-version': SCHEMA_VERSION };

    const route = await call(server, makeReq('POST', '/api/route-trace', headers, JSON.stringify({ source: 'A', target: 'B' })));
    expect(JSON.parse(route.payload)).toMatchObject({ path: ['A.md', 'B.md'], distance: 1 });

    const cluster = await call(server, makeReq('POST', '/api/concept-cluster', headers, JSON.stringify({ concept: 'A', depth: 1 })));
    expect(JSON.parse(cluster.payload)).toMatchObject({ concept: 'A', cluster: ['A.md', 'B.md'] });

    const janitor = await call(server, makeReq('POST', '/api/janitor-scan', headers, JSON.stringify({})));
    expect(JSON.parse(janitor.payload)).toMatchObject({ unstructuredNotes: [], scannedCount: 2 });
  });

  it('advertises Part B capabilities', () => {
    const server = new KnowledgeServer(makeApp() as never, '1.0.0');
    const capabilities = server.buildCapabilities();

    expect(capabilities.flatMap(cap => cap.tools)).toEqual(expect.arrayContaining([
      'obsidian_knowledge_agent_bootstrap',
      'obsidian_knowledge_route_trace',
      'obsidian_knowledge_concept_cluster',
      'obsidian_knowledge_janitor_scan'
    ]));
  });
});
