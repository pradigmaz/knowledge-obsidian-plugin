import { App, TFile } from 'obsidian';
import { SearchRequest, SearchHit, GraphStats, QueryReport } from '../core/types';
import { graphStats } from '../core/graph';
import { extractTags } from '../utils/tags';

export async function search(app: App, payload: SearchRequest) {
	const query = payload.query?.trim();
	if (!query) throw new Error('query is required');

	const limit = Math.min(Math.max(payload.limit ?? 20, 1), 50);
	const graph = graphStats(app);
	const omni = getOmnisearchApi();
	const warnings: string[] = [];
	let source = 'omnisearch';
	let fallbackUsed = false;
	let hits: SearchHit[];
	if (omni) {
		try {
			hits = await searchOmnisearch(query);
		} catch (error) {
			source = 'vault-text';
			fallbackUsed = true;
			warnings.push(`Omnisearch failed. Used capped vault text search. ${errorMessage(error)}`);
			hits = await fallbackVaultTextSearch(app, query);
		}
	} else {
		source = 'vault-text';
		fallbackUsed = true;
		warnings.push('Omnisearch plugin is not available. Used capped vault text search.');
		hits = await fallbackVaultTextSearch(app, query);
	}
	const filtered = applyFilters(app, hits, payload.filters);
	const results = filtered
		.map((hit) => scoreHit(hit, graph, payload.intent, app))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	const queryReport: QueryReport = {
		query_id: Date.now().toString(),
		timestamp_utc: new Date().toISOString(),
		project_root: app.vault.getName ? app.vault.getName() : 'vault',
		resolved_mode: 'entrypoint_map',
		mode_source: 'default',
		budget: { max_tokens: 4000, used_estimate: results.length * 100, hard_truncated: false },
		retrieval_pipeline: [
			{ stage: 'omnisearch', candidates: hits.length, kept: filtered.length },
			{ stage: 'graph_rerank', candidates: filtered.length, kept: results.length }
		],
		selected_context: results.map((hit, index) => ({
			path: hit.path,
			score: hit.score,
			chars: (hit.excerpt ?? '').length,
			chunk_idx: index,
			chunk_source: source,
			why: hit.why,
			explain: {
				lexical: hit.scoreParts?.omnisearch ?? hit.originalScore,
				graph: hit.graphScore ?? 0,
				semantic: 0,
				rrf: 0,
				graph_rrf: 0,
				rank_before: index + 1,
				rank_after: index + 1,
				semantic_source: 'none',
				semantic_outcome: 'not_used',
				graph_seed_path: hit.path,
				graph_edge_kinds: [],
				graph_hops: 0
			},
			provenance: {
				basis: fallbackUsed ? 'preview_fallback' : 'mixed',
				derivation: 'reranked',
				freshness: 'fresh',
				strength: fallbackUsed ? 'fallback_only' : 'high',
				reasons: hit.why
			}
		})),
		provenance: { basis: 'omnisearch', derivation: 'reranked', freshness: 'fresh', strength: 'high', reasons: [] },
		confidence: {
			overall: 0.8, reasons: [],
			signals: { margin_top1_top2: 0, explain_coverage: 1, semantic_coverage: 1, semantic_outcome: 'ok', stage_drop_ratio: 0, hard_truncated: false }
		},
		gaps: [],
		index_telemetry: { last_index_lock_wait_ms: 0, last_embedding_cache_hits: 0, last_embedding_cache_misses: 0, chunk_coverage: 1, chunk_source: 'omnisearch' },
		degradation_reasons: fallbackUsed ? ['chunk_preview_fallback'] : [],
		deepen_available: true,

		// Legacy
		source,
		fallbackUsed,
		resultCount: results.length,
		warnings,
		filters: payload.filters,
		topRankingFactors: topRankingFactors(results),
		degradation: fallbackUsed ? ['vault-text'] : []
	};

	return { status: 'ok', query, results, queryReport };
}

async function fallbackVaultTextSearch(app: App, query: string): Promise<SearchHit[]> {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	const files = app.vault.getMarkdownFiles().slice(0, 500);
	const hits: SearchHit[] = [];

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const haystack = `${file.basename} ${content}`.toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (haystack.includes(term)) score++;
		}
		if (score === 0) continue;

		hits.push({
			path: file.path,
			title: file.basename,
			originalScore: score / terms.length,
			score,
			graphScore: 0,
			source: 'vault-text',
			excerpt: normalizeExcerpt(content.slice(0, 500)),
			why: ['Vault text fallback match']
		});
	}

	return hits.sort((a, b) => b.originalScore - a.originalScore);
}

async function searchOmnisearch(query: string): Promise<SearchHit[]> {
	const api = getOmnisearchApi();
	if (!api) return [];

	const raw = await api.search(query);
	if (!Array.isArray(raw)) return [];

	return raw.map((item: unknown) => {
		const row = item as Record<string, unknown>;
		const path = pathFromOmnisearch(item);
		const originalScore = Number(row.score ?? row.bm25Score ?? 0);
		return {
			path,
			title: titleFromPath(path),
			originalScore,
			score: originalScore,
			graphScore: 0,
			source: 'omnisearch',
			excerpt: normalizeExcerpt(stringValue(row.excerpt) || stringValue(row.context)),
			matches: Array.isArray(row.matches) ? row.matches : undefined,
			why: [],
		};
	});
}


export function scoreHit(hit: SearchHit, graph: GraphStats, intent?: import('../core/types').SearchIntent, app?: App): SearchHit {
	const links = graph.links[hit.path] ?? 0;
	const backlinks = graph.backlinks[hit.path] ?? 0;

	// Intent multipliers
	const intentWeights: Record<string, { o: number; g: number }> = {
		lookup: { o: 1.5, g: 0.5 },
		research: { o: 0.8, g: 1.5 },
		decision: { o: 1.0, g: 1.2 },
		cleanup: { o: 1.0, g: 0.5 },
		bootstrap: { o: 1.0, g: 0.8 }
	};

	const weights = intent && intentWeights[intent] ? intentWeights[intent] : { o: 1.0, g: 1.0 };
	const outgoingScore = Math.log1p(links) * 0.15 * weights.g;
	const backlinkScore = Math.log1p(backlinks) * 0.35 * weights.g;
	const tagFolderScore = tagFolderBoost(hit.path, app);
	const recencyScore = recencyBoost(hit.path, app);
	const apiSurfaceScore = apiSurfaceBoost(hit.path);
	const graphScore = outgoingScore + backlinkScore + tagFolderScore + recencyScore + apiSurfaceScore;
	let finalOriginalScore = hit.originalScore * weights.o;

	// Generated Lineage Demotion
	const lowerPath = hit.path.toLowerCase();
	const isGenerated = lowerPath.includes('log.md') || lowerPath.includes('imports.md') || lowerPath.includes('logs/');
	if (isGenerated) {
		finalOriginalScore *= 0.1;
	}
	
	const generatedPenalty = isGenerated ? 0.1 : 1;
	const finalGraphScore = graphScore * generatedPenalty;
	
	const why = [
		`Base score: ${finalOriginalScore.toFixed(3)} (${hit.source})`
	];

	if (intent) why.push(`${intent.charAt(0).toUpperCase() + intent.slice(1)} intent applied`);
	if (links > 0) why.push(`Outgoing links boost: ${links}`);
	if (backlinks > 0) why.push(`Backlinks boost: ${backlinks}`);
	if (tagFolderScore > 0) why.push(`Tag/folder boost: ${tagFolderScore.toFixed(2)}`);
	if (recencyScore > 0) why.push(`Recency boost: ${recencyScore.toFixed(2)}`);
	if (apiSurfaceScore > 0) why.push(`API-surface boost: ${apiSurfaceScore.toFixed(2)}`);
	if (isGenerated) why.push(`Generated Lineage Demotion applied (-90%)`);

	return {
		...hit,
		graphScore: finalGraphScore,
		score: finalOriginalScore + finalGraphScore,
		scoreParts: {
			omnisearch: finalOriginalScore,
			backlinks: backlinkScore * generatedPenalty,
			outgoingLinks: outgoingScore * generatedPenalty,
			tagFolder: tagFolderScore * generatedPenalty,
			recency: recencyScore * generatedPenalty,
			apiSurface: apiSurfaceScore * generatedPenalty,
			generatedPenalty
		},
		why
	};
}

function tagFolderBoost(path: string, app?: App): number {
	const folderBoost = /(^|\/)(projects|knowledge|architecture|decisions?|index)(\/|$)/i.test(path) ? 0.15 : 0;
	if (!app) return folderBoost;
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return folderBoost;
	const tags = extractTags(app.metadataCache.getFileCache(file));
	return folderBoost + (tags.length > 0 ? 0.1 : 0);
}

function recencyBoost(path: string, app?: App): number {
	if (!app) return 0;
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return 0;
	const ageDays = (Date.now() - file.stat.mtime) / 86_400_000;
	if (ageDays <= 7) return 0.2;
	if (ageDays <= 30) return 0.1;
	return 0;
}

function apiSurfaceBoost(path: string): number {
	return /(^|\/)(index|hub|decision|decisions|project|projects)(\.md|\/|$)/i.test(path) ? 0.25 : 0;
}

function topRankingFactors(results: SearchHit[]): string[] {
	const totals = new Map<string, number>();
	for (const hit of results) {
		const parts = hit.scoreParts;
		if (!parts) continue;
		totals.set('omnisearch', (totals.get('omnisearch') ?? 0) + parts.omnisearch);
		totals.set('backlinks', (totals.get('backlinks') ?? 0) + parts.backlinks);
		totals.set('outgoingLinks', (totals.get('outgoingLinks') ?? 0) + parts.outgoingLinks);
		totals.set('tagFolder', (totals.get('tagFolder') ?? 0) + parts.tagFolder);
		totals.set('recency', (totals.get('recency') ?? 0) + parts.recency);
		totals.set('apiSurface', (totals.get('apiSurface') ?? 0) + parts.apiSurface);
	}
	return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => key);
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message ? error.message : 'Unknown search error.';
}

export function getOmnisearchApi(): { search(query: string): Promise<unknown[]> } | null {
	if (typeof window === 'undefined') return null;
	const api = (window as unknown as { omnisearch?: { search?: unknown } }).omnisearch;
	return api && typeof api.search === 'function'
		? (api as { search(query: string): Promise<unknown[]> })
		: null;
}

function pathFromOmnisearch(item: unknown): string {
	const row = item as Record<string, unknown>;
	const path = row.path ?? row.filename ?? row.file;
	if (typeof path === 'string') return path;
	const file = row.file;
	if (file instanceof TFile) return file.path;
	return stringValue(row.basename) || 'unknown.md';
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function titleFromPath(path: string) {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

export function normalizeExcerpt(excerpt: string): string {
	if (!excerpt) return '';
	let clean = excerpt
		.replace(/\*\*([^*]+)\*\*/g, '$1') // remove bold
		.replace(/\*([^*]+)\*/g, '$1')     // remove italic
		.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1') // remove wiki links, keep text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links, keep text
		.replace(/\s+/g, ' ')              // collapse whitespace
		.trim();

	if (clean.length > 240) {
		clean = clean.slice(0, 240) + '...';
	}
	return clean;
}

export function applyFilters(app: App, hits: SearchHit[], filters?: import('../core/types').SearchFilters): SearchHit[] {
	if (!filters) return hits;

	return hits.filter(hit => {
		if (filters.pathPrefix) {
			const prefix = filters.pathPrefix.endsWith('/') ? filters.pathPrefix : filters.pathPrefix + '/';
			if (hit.path !== filters.pathPrefix && !hit.path.startsWith(prefix)) return false;
		}

		const file = app.vault.getAbstractFileByPath(hit.path);
		if (!(file instanceof TFile)) return false;

		const ext = file.extension;
		if (filters.fileTypes && filters.fileTypes.length > 0 && !filters.fileTypes.includes(ext)) {
			return false;
		}

		const stat = file.stat;
		if (stat) {
			if (filters.modifiedAfter && stat.mtime < filters.modifiedAfter) return false;
			if (filters.modifiedBefore && stat.mtime > filters.modifiedBefore) return false;
		}

		if (filters.tags && filters.tags.length > 0) {
			const cache = app.metadataCache.getFileCache(file);
			const fileTags = extractTags(cache);
			const hasMatchingTag = filters.tags.some(tag => fileTags.includes(tag.replace(/^#/, '')));
			if (!hasMatchingTag) return false;
		}

		return true;
	});
}
