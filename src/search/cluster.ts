import { App, TFile } from 'obsidian';
import { ConceptClusterRequest, ConceptClusterResult } from '../core/types';
import { getAdjacencyList } from '../core/graph';
import { extractTags } from '../utils/tags';

const MAX_NODES = 2000;

export async function conceptCluster(app: App, payload: ConceptClusterRequest): Promise<ConceptClusterResult> {
	const concept = payload.concept.trim();
	const depth = Math.max(0, payload.depth ?? 1);

	if (!concept) {
		throw new Error('concept is required');
	}

	const isTag = concept.startsWith('#');
	const allMarkdownFiles = app.vault.getMarkdownFiles();
	const totalFiles = allMarkdownFiles.length;

	let cluster: string[] = [];
	const cleanConcept = concept.replace(/^#/, '').toLowerCase();

	if (isTag) {
		cluster = allMarkdownFiles.filter(file => {
			const cache = app.metadataCache.getFileCache(file);
			const tags = extractTags(cache);
			return tags.some(t => t.toLowerCase() === cleanConcept);
		}).map(file => file.path);
	} else {
		const adjacency = getAdjacencyList(app);
		
		let conceptKey = concept;
		if (!adjacency[conceptKey]) {
			const lowerConcept = concept.toLowerCase();
			const match = Object.keys(adjacency).find(k => 
				k.toLowerCase() === lowerConcept || 
				k.split('/').pop()?.replace(/\.md$/i, '').toLowerCase() === lowerConcept
			);
			if (match) conceptKey = match;
		}

		if (adjacency[conceptKey]) {
			if (depth === 0) {
				cluster = [conceptKey];
			} else {
				const focalNeighbors = new Set(adjacency[conceptKey] || []);
				const eligible = collectWithinDepth(adjacency, conceptKey, depth);
				const scored = Array.from(eligible)
					.filter(path => path !== conceptKey)
					.map(path => {
						const neighbors = new Set(adjacency[path] || []);
						let shared = 0;
						for (const neighbor of neighbors) {
							if (focalNeighbors.has(neighbor)) shared++;
						}
						const direct = focalNeighbors.has(path) ? 1 : 0;
						return { path, score: shared * 2 + direct };
					})
					.filter(item => item.score > 0)
					.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
					.slice(0, MAX_NODES - 1)
					.map(item => item.path);
				cluster = [conceptKey, ...scored];
			}
		} else {
			const lowerConcept = concept.toLowerCase();
			const file = allMarkdownFiles.find(f => 
				f.path.toLowerCase() === lowerConcept || 
				f.basename.toLowerCase() === lowerConcept
			);
			if (file) {
				cluster = [file.path];
			}
		}
	}

	const tagCounts: Record<string, number> = {};

	for (const path of cluster) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;

		const cache = app.metadataCache.getFileCache(file);
		const tags = extractTags(cache);

		for (const tag of tags) {
			const lowerTag = tag.toLowerCase();
			tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1;
		}
	}

	const relatedConcepts = Object.entries(tagCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(entry => entry[0]);

	const centralityScore = totalFiles > 0 ? (cluster.length / totalFiles) : 0;

	return {
		seed: { seed: concept, seed_kind: isTag ? 'tag' : 'note' },
		variants: cluster.map(c => ({ id: c, entry_anchor: { path: c, language: 'md' }, route: [], constraints: [], related_tests: [], confidence: 1, gaps: [] })),
		cluster_summary: { variant_count: cluster.length, languages: ['md'], route_kinds: ['vault'] },
		gaps: [], capability_status: 'ok', unsupported_sources: [], confidence: 1,
		concept,
		cluster,
		relatedConcepts,
		centralityScore
	};
}

function collectWithinDepth(adjacency: Record<string, string[]>, source: string, maxDepth: number): Set<string> {
	const visited = new Set<string>([source]);
	let level = [source];

	for (let depth = 0; depth < maxDepth; depth++) {
		const next: string[] = [];
		for (const node of level) {
			for (const neighbor of adjacency[node] || []) {
				if (visited.has(neighbor)) continue;
				visited.add(neighbor);
				next.push(neighbor);
				if (visited.size >= MAX_NODES) return visited;
			}
		}
		level = next;
	}

	return visited;
}
