import { App } from 'obsidian';
import { GraphStats } from './types';

export function totalValues(record: Record<string, number> | undefined): number {
	return Object.values(record ?? {}).reduce((sum, count) => sum + count, 0);
}

export function graphStats(app: App): GraphStats {
	const links: Record<string, number> = {};
	const backlinks: Record<string, number> = {};
	const resolvedLinks = app.metadataCache.resolvedLinks;

	for (const [source, targets] of Object.entries(resolvedLinks)) {
		links[source] = totalValues(targets);
		for (const [target, count] of Object.entries(targets)) {
			backlinks[target] = (backlinks[target] ?? 0) + count;
		}
	}

	return { links, backlinks };
}

export function getAdjacencyList(app: App): Record<string, string[]> {
	const resolved = app.metadataCache.resolvedLinks;
	const adjacency: Record<string, string[]> = {};

	for (const [src, targets] of Object.entries(resolved)) {
		if (!adjacency[src]) adjacency[src] = [];
		for (const tgt of Object.keys(targets)) {
			adjacency[src].push(tgt);
			if (!adjacency[tgt]) adjacency[tgt] = [];
			adjacency[tgt].push(src);
		}
	}

	return adjacency;
}


export function entryPoints(app: App, graph: GraphStats) {
	return app.vault
		.getMarkdownFiles()
		.map((file) => {
			const links = graph.links[file.path] ?? 0;
			const backlinks = graph.backlinks[file.path] ?? 0;
			return { path: file.path, score: links + backlinks * 2, mtime: file.stat.mtime };
		})
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score);
}

export function unresolvedLinksCount(app: App): number {
	let count = 0;
	for (const targets of Object.values(app.metadataCache.unresolvedLinks)) {
		count += totalValues(targets);
	}
	return count;
}
