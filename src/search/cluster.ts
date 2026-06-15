import { App, TFile } from 'obsidian';
import { ConceptClusterRequest, ConceptClusterResult } from '../core/types';
import { getAdjacencyList } from '../core/graph';
import { extractTags } from '../utils/tags';

const MAX_NODES = 2000;

export async function conceptCluster(app: App, payload: ConceptClusterRequest): Promise<{ status: string; result: ConceptClusterResult }> {
	const concept = payload.concept.trim();
	const depth = Math.max(0, payload.depth ?? 1);

	if (!concept) {
		throw new Error('concept is required');
	}

	const isTag = concept.startsWith('#');
	const allMarkdownFiles = app.vault.getMarkdownFiles();
	const totalFiles = allMarkdownFiles.length;

	let relatedNotes: string[] = [];
	const cleanConcept = concept.replace(/^#/, '').toLowerCase();

	if (isTag) {
		relatedNotes = allMarkdownFiles.filter(file => {
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
			const visited = new Set<string>();
			visited.add(conceptKey);

			let currentLevel = [conceptKey];
			let visitedCount = 1;

			for (let i = 0; i < depth; i++) {
				const nextLevel: string[] = [];
				for (const node of currentLevel) {
					const neighbors = adjacency[node] || [];
					for (const neighbor of neighbors) {
						if (!visited.has(neighbor)) {
							visited.add(neighbor);
							nextLevel.push(neighbor);
							visitedCount++;
							if (visitedCount >= MAX_NODES) break;
						}
					}
					if (visitedCount >= MAX_NODES) break;
				}
				if (visitedCount >= MAX_NODES) break;
				currentLevel = nextLevel;
			}
			relatedNotes = Array.from(visited);
		} else {
			const lowerConcept = concept.toLowerCase();
			const file = allMarkdownFiles.find(f => 
				f.path.toLowerCase() === lowerConcept || 
				f.basename.toLowerCase() === lowerConcept
			);
			if (file) {
				relatedNotes = [file.path];
			}
		}
	}

	const tagCounts: Record<string, number> = {};

	for (const path of relatedNotes) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;

		const cache = app.metadataCache.getFileCache(file);
		const tags = extractTags(cache);

		for (const tag of tags) {
			const lowerTag = tag.toLowerCase();
			tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1;
		}
	}

	const clusterTags = Object.entries(tagCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(entry => entry[0]);

	const centralityScore = totalFiles > 0 ? (relatedNotes.length / totalFiles) : 0;

	return {
		status: 'ok',
		result: {
			clusterTags,
			relatedNotes,
			centralityScore
		}
	};
}
