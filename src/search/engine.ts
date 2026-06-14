import { App, TFile } from 'obsidian';
import { SearchRequest, SearchHit, GraphStats, QueryReport } from '../core/types';
import { graphStats } from '../core/graph';

export async function search(app: App, payload: SearchRequest) {
	const query = payload.query?.trim();
	if (!query) throw new Error('query is required');

	if (!getOmnisearchApi()) {
		throw new Error('Omnisearch plugin is not available. Please install and enable it for search capabilities.');
	}

	const limit = Math.min(Math.max(payload.limit ?? 20, 1), 50);
	const graph = graphStats(app);
	const hits = await searchOmnisearch(query);
	const filtered = applyFilters(app, hits, payload.filters);
	const results = filtered
		.map((hit) => scoreHit(hit, graph, payload.intent))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	const queryReport: QueryReport = {
		source: 'omnisearch',
		fallbackUsed: false,
		resultCount: results.length,
		warnings: []
	};

	return { status: 'ok', query, results, queryReport };
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
			excerpt: normalizeExcerpt(String(row.excerpt ?? row.context ?? '')),
			matches: Array.isArray(row.matches) ? row.matches : undefined,
			why: [],
		};
	});
}


export function scoreHit(hit: SearchHit, graph: GraphStats, intent?: import('../core/types').SearchIntent): SearchHit {
	const links = graph.links[hit.path] ?? 0;
	const backlinks = graph.backlinks[hit.path] ?? 0;

	// Intent multipliers
	let originalWeight = 1.0;
	let graphWeight = 1.0;

	if (intent === 'lookup') {
		originalWeight = 1.5;
		graphWeight = 0.5;
	} else if (intent === 'research') {
		originalWeight = 0.8;
		graphWeight = 1.5;
	} else if (intent === 'decision') {
		graphWeight = 1.2;
	} else if (intent === 'cleanup') {
		graphWeight = 0.5;
	} else if (intent === 'bootstrap') {
		originalWeight = 1.0;
		graphWeight = 0.8;
	}

	const graphScore = (Math.log1p(links) * 0.15 + Math.log1p(backlinks) * 0.35) * graphWeight;
	const finalOriginalScore = hit.originalScore * originalWeight;
	
	const why = [
		`Base score: ${finalOriginalScore.toFixed(3)} (${hit.source})`
	];

	if (intent) why.push(`${intent.charAt(0).toUpperCase() + intent.slice(1)} intent applied`);
	if (links > 0) why.push(`Outgoing links boost: ${links}`);
	if (backlinks > 0) why.push(`Backlinks boost: ${backlinks}`);

	return {
		...hit,
		graphScore,
		score: finalOriginalScore + graphScore,
		why
	};
}

export function getOmnisearchApi(): { search(query: string): Promise<unknown[]> } | null {
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
	return String(row.basename ?? 'unknown.md');
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
		if (!file) return false;

		const ext = (file as any).extension;
		if (filters.fileTypes && filters.fileTypes.length > 0 && !filters.fileTypes.includes(ext)) {
			return false;
		}

		const stat = (file as any).stat;
		if (stat) {
			if (filters.modifiedAfter && stat.mtime < filters.modifiedAfter) return false;
			if (filters.modifiedBefore && stat.mtime > filters.modifiedBefore) return false;
		}

		if (filters.tags && filters.tags.length > 0) {
			const cache = app.metadataCache.getFileCache(file as TFile);
			const fileTags = cache?.tags?.map(t => t.tag) || [];
			const hasMatchingTag = filters.tags.some(tag => fileTags.includes(tag));
			if (!hasMatchingTag) return false;
		}

		return true;
	});
}


