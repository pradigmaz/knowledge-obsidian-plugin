import { App } from 'obsidian';
import { RouteTraceRequest, RouteTraceResult } from '../core/types';
import { getAdjacencyList } from '../core/graph';

const MAX_HOPS = 10;
const MAX_NODES = 2000;

function resolveKey(adjacency: Record<string, string[]>, query: string): string {
	if (adjacency[query]) return query;
	const lower = query.toLowerCase();
	const exact = Object.keys(adjacency).find(k => 
		k.toLowerCase() === lower || 
		k.split('/').pop()?.replace(/\.md$/i, '').toLowerCase() === lower
	);
	return exact || query;
}

export async function routeTrace(app: App, payload: RouteTraceRequest): Promise<RouteTraceResult> {
	const source = payload.source.trim();
	const target = payload.target.trim();

	if (!source || !target) {
		throw new Error('source and target are required');
	}

	const adjacency = getAdjacencyList(app);

	const sourceKey = resolveKey(adjacency, source);
	const targetKey = resolveKey(adjacency, target);

	if (!adjacency[sourceKey]) {
		return { 
			seed: { seed: sourceKey, seed_kind: 'note' }, best_route: { segments: [], total_hops: 0, total_weight: 0, collapsed_hops: 0, confidence: 1 }, alternate_routes: [], unresolved_gaps: [], capability_status: 'ok', unsupported_sources: [], confidence: 1,
			source: sourceKey, target: targetKey, path: [], distance: 0, found: false, reason: 'source_not_found' 
		};
	}

	if (!adjacency[targetKey]) {
		return { 
			seed: { seed: sourceKey, seed_kind: 'note' }, best_route: { segments: [], total_hops: 0, total_weight: 0, collapsed_hops: 0, confidence: 1 }, alternate_routes: [], unresolved_gaps: [], capability_status: 'ok', unsupported_sources: [], confidence: 1,
			source: sourceKey, target: targetKey, path: [], distance: 0, found: false, reason: 'target_not_found' 
		};
	}

	if (sourceKey === targetKey) {
		return {
			seed: { seed: sourceKey, seed_kind: 'note' },
			best_route: { segments: [], total_hops: 0, total_weight: 0, collapsed_hops: 0, confidence: 1 },
			alternate_routes: [], unresolved_gaps: [], capability_status: 'ok', unsupported_sources: [], confidence: 1,
			source: sourceKey, target: targetKey, path: [sourceKey], distance: 0, found: true
		};
	}

	const queue: string[] = [sourceKey];
	let head = 0;
	
	const visited = new Set<string>();
	visited.add(sourceKey);

	const parentMap = new Map<string, string>();
	let nodesVisited = 0;

	while (head < queue.length) {
		const current = queue[head++];
		if (!current) continue;
		
		if (current === targetKey) {
			const path: string[] = [];
			let curr: string | undefined = targetKey;
			while (curr) {
				path.unshift(curr);
				curr = parentMap.get(curr);
			}
			return { 
				seed: { seed: sourceKey, seed_kind: 'note' }, best_route: { segments: path.map(p => ({ kind: 'link', path: p, language: 'md', evidence: '', relation_kind: 'reference', source_kind: 'vault', score: 1 })), total_hops: path.length - 1, total_weight: 1, collapsed_hops: 0, confidence: 1 }, alternate_routes: [], unresolved_gaps: [], capability_status: 'ok', unsupported_sources: [], confidence: 1,
				source: sourceKey, target: targetKey, path, distance: path.length - 1, found: true 
			};
		}

		// Reconstruct length to check depth
		let depth = 0;
		let p: string | undefined = current;
		while (p && p !== sourceKey) {
			depth++;
			p = parentMap.get(p);
		}
		if (depth >= MAX_HOPS) continue;
		
		nodesVisited++;
		if (nodesVisited > MAX_NODES) break;

		const neighbors = adjacency[current] || [];
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				parentMap.set(neighbor, current);
				queue.push(neighbor);
			}
		}
	}

	return { 
		seed: { seed: sourceKey, seed_kind: 'note' }, best_route: { segments: [], total_hops: 0, total_weight: 0, collapsed_hops: 0, confidence: 1 }, alternate_routes: [], unresolved_gaps: [], capability_status: 'ok', unsupported_sources: [], confidence: 1,
		source: sourceKey, target: targetKey, path: [], distance: 0, found: false, reason: 'no_path' 
	};
}
