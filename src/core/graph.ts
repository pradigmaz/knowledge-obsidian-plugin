import { App } from 'obsidian';
import { GraphStats } from './types';

let cachedGraph: { stats: GraphStats; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000;

export function totalValues(record: Record<string, number> | undefined): number {
	return Object.values(record ?? {}).reduce((sum, count) => sum + count, 0);
}

export function graphStats(app: App): GraphStats {
	const now = Date.now();
	if (cachedGraph && now - cachedGraph.timestamp < CACHE_TTL_MS) {
		return cachedGraph.stats;
	}

	const links: Record<string, number> = {};
	const backlinks: Record<string, number> = {};
	const resolvedLinks = app.metadataCache.resolvedLinks;

	for (const [source, targets] of Object.entries(resolvedLinks)) {
		links[source] = totalValues(targets);
		for (const [target, count] of Object.entries(targets)) {
			backlinks[target] = (backlinks[target] ?? 0) + count;
		}
	}

	const stats = { links, backlinks };
	cachedGraph = { stats, timestamp: now };
	return stats;
}

let cachedEntries: { entries: Array<{ path: string; score: number }>; timestamp: number } | null = null;

export function entryPoints(app: App, graph: GraphStats) {
	const now = Date.now();
	if (cachedEntries && now - cachedEntries.timestamp < CACHE_TTL_MS) {
		return cachedEntries.entries;
	}

	const entries = app.vault
		.getMarkdownFiles()
		.map((file) => {
			const links = graph.links[file.path] ?? 0;
			const backlinks = graph.backlinks[file.path] ?? 0;
			return { path: file.path, score: links + backlinks * 2 };
		})
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score);

	cachedEntries = { entries, timestamp: now };
	return entries;
}

export function unresolvedLinksCount(app: App): number {
	let count = 0;
	for (const targets of Object.values(app.metadataCache.unresolvedLinks)) {
		count += totalValues(targets);
	}
	return count;
}
