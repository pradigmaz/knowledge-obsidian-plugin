import { App } from 'obsidian';
import { graphStats, entryPoints, unresolvedLinksCount } from '../core/graph';

let cachedReport: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000;

export function buildHealthReport(app: App) {
	const now = Date.now();
	if (cachedReport && now - cachedReport.timestamp < CACHE_TTL_MS) {
		return cachedReport.data;
	}

	const graph = graphStats(app);
	const isolatedNotes = app.vault
		.getMarkdownFiles()
		.filter((file) => (graph.links[file.path] ?? 0) === 0 && (graph.backlinks[file.path] ?? 0) === 0)
		.map((file) => file.path);
	const hotspots = entryPoints(app, graph)
		.slice(0, 20)
		.map(({ path }) => ({
			path,
			links: graph.links[path] ?? 0,
			backlinks: graph.backlinks[path] ?? 0,
		}));

	const data = {
		status: 'ok',
		unresolvedLinksCount: unresolvedLinksCount(app),
		isolatedNotes,
		hotspots,
	};
	cachedReport = { data, timestamp: now };
	return data;
}
