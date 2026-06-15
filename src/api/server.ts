import * as http from 'http';
import { App, Notice, TFile } from 'obsidian';
import { buildBrief } from '../memory/brief';
import { getSignals, markSignal, getSignalStatus } from '../memory/signals';
import { buildHealthReport } from '../health/report';
import { search, getOmnisearchApi } from '../search/engine';
import { agentBootstrap } from '../search/bootstrap';
import { runQueryBenchmark } from '../benchmark/runner';
import { routeTrace } from '../search/route-trace';
import { conceptCluster } from '../search/cluster';
import { runJanitorScan } from '../health/janitor';
import { SearchRequest, AgentBootstrapRequest, SCHEMA_VERSION, KnowledgeStatus, CapabilityDescriptor, SignalMemoryMarkRequest, BenchmarkCase, RouteTraceRequest, ConceptClusterRequest, JanitorScanRequest } from '../core/types';
import type { LintWriteRequest } from '../health/lint-write';

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
				new Notice(`Knowledge Plugin HTTP server error: ${err.message}`);
			}
		});

		this.server.listen(this.port, '127.0.0.1');
	}

	stop() {
		if (!this.server) return;
		this.server.close();
		this.server = null;
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
			const contentType = req.headers['content-type'] ?? '';
			if (!contentType.includes('application/json')) {
				this.sendJson(res, { error: 'Content-Type must be application/json' }, 415);
				return;
			}
			const origin = this.headerValue(req.headers.origin);
			if (origin && !origin.startsWith('app://') && origin !== 'http://127.0.0.1' && origin !== 'http://localhost') {
				this.sendJson(res, { error: 'Origin not allowed' }, 403);
				return;
			}
		}

		try {
			const isHeavyEndpoint = req.url === '/api/search' || req.url === '/api/route-trace' || req.url === '/api/concept-cluster';
			if (isHeavyEndpoint && req.headers['x-gatekeeper-strict'] === 'true') {
				const health = await buildHealthReport(this.app);
				const hasCriticals = health.hotspots.some(h => h.violations.some(v => v.severity === 'high'));
				if (hasCriticals) {
					this.sendJson(res, {
						error: 'Precondition Required',
						message: 'Strict Gatekeeper: Vault health has critical violations (e.g., oversized notes). Please run health report and fix issues manually.'
					}, 428);
					return;
				}
			}

			if (req.method === 'GET' && req.url === '/api/status') {
				this.sendJson(res, this.buildStatus());
			} else if (req.method === 'GET' && req.url === '/api/capabilities') {
				this.sendJson(res, this.buildCapabilities());
			} else if (req.method === 'GET' && req.url === '/api/brief') {
				this.sendJson(res, buildBrief(this.app));
			} else if (req.method === 'GET' && req.url === '/api/health') {
				this.sendJson(res, await buildHealthReport(this.app));
			} else if (req.method === 'POST' && req.url === '/api/search') {
				const payload = await this.readJson<SearchRequest>(req);
				this.sendJson(res, await search(this.app, payload));
			} else if (req.method === 'POST' && req.url === '/api/bootstrap') {
				const payload = await this.readJson<AgentBootstrapRequest>(req);
				this.sendJson(res, await agentBootstrap(this.app, payload));
			} else if (req.method === 'GET' && req.url === '/api/signals') {
				this.sendJson(res, await getSignals(this.app));
			} else if (req.method === 'GET' && req.url === '/api/signals/status') {
				this.sendJson(res, await getSignalStatus(this.app));
			} else if (req.method === 'POST' && req.url === '/api/signals/mark') {
				const payload = await this.readJson<SignalMemoryMarkRequest>(req);
				this.sendJson(res, await markSignal(this.app, payload));
			} else if (req.method === 'POST' && req.url === '/api/benchmark') {
				let payload = await this.readJson<BenchmarkCase[]>(req).catch(() => null);
				if (!payload || payload.length === 0) {
					const file = this.app.vault.getAbstractFileByPath(`${this.app.vault.configDir}/knowledge-benchmarks.json`);
					if (file instanceof TFile) {
						const content = await this.app.vault.read(file);
						const parsed = JSON.parse(content) as unknown;
						payload = Array.isArray(parsed) ? parsed as BenchmarkCase[] : [];
					}
				}
				this.sendJson(res, await runQueryBenchmark(this.app, payload || []));
			} else if (req.method === 'POST' && req.url === '/api/route-trace') {
				const payload = await this.readJson<RouteTraceRequest>(req);
				this.sendJson(res, await routeTrace(this.app, payload));
			} else if (req.method === 'POST' && req.url === '/api/concept-cluster') {
				const payload = await this.readJson<ConceptClusterRequest>(req);
				this.sendJson(res, await conceptCluster(this.app, payload));
			} else if (req.method === 'POST' && req.url === '/api/janitor-scan') {
				const payload = await this.readJson<JanitorScanRequest>(req);
				this.sendJson(res, await runJanitorScan(this.app, payload));
			} else if (req.method === 'POST' && req.url === '/api/lint-write') {
				const { lintWrite } = await import('../health/lint-write');
				const payload = await this.readJson<LintWriteRequest>(req);
				const result = await lintWrite(this.app, payload);
				this.sendJson(res, result, result.valid ? 200 : 422);
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
			status: omni ? 'ready' : 'degraded',
			schemaVersion: SCHEMA_VERSION,
			vaultName: this.app.vault.getName(),
			enabledModules: ['core', 'search', 'health', 'memory'],
			omnisearchAvailable: !!omni,
			warnings: omni ? [] : ['Omnisearch plugin is not available. Search endpoints are degraded.'],
		};
	}

	buildCapabilities(): CapabilityDescriptor[] {
		const omni = getOmnisearchApi();
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
				status: omni ? 'ready' : 'degraded',
				endpoints: ['/api/search', '/api/benchmark'],
				tools: ['obsidian_knowledge_smart_search', 'obsidian_knowledge_query_benchmark'],
				dependencies: ['knowledge-core'],
				...(omni ? {} : { degradedReasons: ['Omnisearch plugin is not available'] })
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
				endpoints: ['/api/brief', '/api/signals', '/api/signals/status', '/api/signals/mark'],
				tools: ['obsidian_knowledge_workspace_brief', 'obsidian_knowledge_signal_memory'],
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
					reject(err instanceof Error ? err : new Error('invalid JSON'));
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

	private headerValue(value: unknown): string {
		if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
		return typeof value === 'string' ? value : '';
	}
}
