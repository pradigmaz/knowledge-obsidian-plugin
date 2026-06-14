import { App } from 'obsidian';
import { graphStats, entryPoints, totalValues, unresolvedLinksCount } from '../core/graph';

let cachedBrief: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000;

export function buildBrief(app: App) {
	const now = Date.now();
	if (cachedBrief && now - cachedBrief.timestamp < CACHE_TTL_MS) {
		return cachedBrief.data;
	}

	const files = app.vault.getMarkdownFiles();
	const graph = graphStats(app);
	const tags = topTags(app);
	const recentNotes = [...files]
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, 10)
		.map((file) => file.path);
	const entries = entryPoints(app, graph).slice(0, 10);

	const data = {
		status: 'ok',
		filesCount: files.length,
		linksCount: totalValues(graph.links),
		unresolvedLinksCount: unresolvedLinksCount(app),
		topTags: tags,
		recentNotes,
		entryPoints: entries,
	};
	cachedBrief = { data, timestamp: now };
	return data;
}

export function topTags(app: App) {
	const counts = new Map<string, number>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		for (const tag of cache?.tags ?? []) {
			counts.set(tag.tag, (counts.get(tag.tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([tag, count]) => ({ tag, count }));
}
