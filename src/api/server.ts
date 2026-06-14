import * as http from 'http';
import { App, Notice } from 'obsidian';
import { buildBrief } from '../memory/brief';
import { buildHealthReport } from '../health/report';
import { search, getOmnisearchApi } from '../search/engine';
import { agentBootstrap } from '../search/bootstrap';
import { SearchRequest, AgentBootstrapRequest, SCHEMA_VERSION, KnowledgeStatus, CapabilityDescriptor } from '../core/types';

export class KnowledgeServer {
	port = 27125;
	server: http.Server | null = null;
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	start() {
		this.server = http.createServer((req, res) => {
			void this.handleRequest(req, res);
		});

		this.server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				new Notice(`Knowledge Plugin: Port ${this.port} is already in use.`);
			} else {
				console.error('Knowledge Plugin HTTP server error:', err);
			}
		});

		this.server.listen(this.port, '127.0.0.1', () => {
			console.log(`Knowledge Analytics Server listening on http://127.0.0.1:${this.port}`);
		});
	}

	stop() {
		if (!this.server) return;
		this.server.close();
		this.server = null;
		console.log('Knowledge Analytics Server stopped');
	}

	async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
		res.setHeader('X-Schema-Version', SCHEMA_VERSION);

		const headerSchema = req.headers['x-schema-version'];
		const clientSchema = Array.isArray(headerSchema) ? headerSchema[0] : headerSchema;
		if (!clientSchema) {
			this.sendJson(res, { error: 'Missing X-Schema-Version header' }, 400);
			return;
		}
		if (clientSchema !== SCHEMA_VERSION && !clientSchema.startsWith('0.')) {
			this.sendJson(res, { error: `Schema version mismatch. Expected ${SCHEMA_VERSION}, got ${clientSchema}` }, 400);
			return;
		}

		if (req.method === 'POST' || req.method === 'PUT') {
			const contentType = req.headers['content-type'] || '';
			if (!contentType.includes('application/json')) {
				this.sendJson(res, { error: 'Content-Type must be application/json' }, 415);
				return;
			}
			const headerOrigin = req.headers['origin'];
			const origin = Array.isArray(headerOrigin) ? headerOrigin[0] : headerOrigin;
			if (origin && !origin.startsWith('app://') && origin !== 'http://127.0.0.1' && origin !== 'http://localhost') {
				this.sendJson(res, { error: 'Origin not allowed' }, 403);
				return;
			}
		}

		try {
			if (req.method === 'GET' && req.url === '/api/status') {
				this.sendJson(res, this.buildStatus());
			} else if (req.method === 'GET' && req.url === '/api/capabilities') {
				this.sendJson(res, this.buildCapabilities());
			} else if (req.method === 'GET' && req.url === '/api/brief') {
				this.sendJson(res, buildBrief(this.app));
			} else if (req.method === 'GET' && req.url === '/api/health') {
				this.sendJson(res, buildHealthReport(this.app));
			} else if (req.method === 'POST' && req.url === '/api/search') {
				const payload = await this.readJson<SearchRequest>(req);
				this.sendJson(res, await search(this.app, payload));
			} else if (req.method === 'POST' && req.url === '/api/bootstrap') {
				const payload = await this.readJson<AgentBootstrapRequest>(req);
				this.sendJson(res, await agentBootstrap(this.app, payload));
			} else {
				this.sendJson(res, { error: 'Not found' }, 404);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Request failed';
			this.sendJson(res, { error: message }, 400);
		}
	}

	buildStatus(): KnowledgeStatus {
		const omni = getOmnisearchApi();
		
		return {
			status: 'ready',
			schemaVersion: SCHEMA_VERSION,
			vaultName: this.app.vault.getName(),
			enabledModules: ['core', 'search', 'health', 'memory'],
			omnisearchAvailable: !!omni,
			warnings: [],
		};
	}

	buildCapabilities(): CapabilityDescriptor[] {
		return [
			{
				id: 'knowledge-core',
				name: 'Knowledge Core',
				version: SCHEMA_VERSION,
				status: 'ready',
				endpoints: ['/api/status', '/api/capabilities'],
				tools: [],
				dependencies: []
			},
			{
				id: 'knowledge-search',
				name: 'Knowledge Search',
				version: SCHEMA_VERSION,
				status: 'ready',
				endpoints: ['/api/search'],
				tools: ['obsidian_knowledge_smart_search'],
				dependencies: ['knowledge-core']
			},
			{
				id: 'knowledge-health',
				name: 'Knowledge Health',
				version: SCHEMA_VERSION,
				status: 'ready',
				endpoints: ['/api/health'],
				tools: ['obsidian_knowledge_health_report'],
				dependencies: ['knowledge-core']
			},
			{
				id: 'knowledge-memory',
				name: 'Knowledge Memory',
				version: SCHEMA_VERSION,
				status: 'ready',
				endpoints: ['/api/brief'],
				tools: ['obsidian_knowledge_workspace_brief'],
				dependencies: ['knowledge-core']
			}
		];
	}

	readJson<T>(req: http.IncomingMessage): Promise<T> {
		return new Promise((resolve, reject) => {
			let body = '';
			let isDone = false;

			const cleanup = () => {
				req.removeListener('data', onData);
				req.removeListener('end', onEnd);
				req.removeListener('error', onError);
			};

			const onData = (chunk: Buffer) => {
				if (isDone) return;
				body += chunk.toString();
				if (body.length > 64_000) {
					isDone = true;
					cleanup();
					reject(new Error('request body too large'));
					req.destroy();
				}
			};

			const onEnd = () => {
				if (isDone) return;
				isDone = true;
				cleanup();
				try {
					resolve(JSON.parse(body) as T);
				} catch (err) {
					reject(err);
				}
			};

			const onError = (err: Error) => {
				if (isDone) return;
				isDone = true;
				cleanup();
				reject(err);
			};

			req.on('data', onData);
			req.on('end', onEnd);
			req.on('error', onError);
		});
	}

	sendJson(res: http.ServerResponse, payload: unknown, statusCode = 200) {
		res.statusCode = statusCode;
		res.end(JSON.stringify(payload));
	}
}
