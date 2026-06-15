import { App } from 'obsidian';
import { AgentBootstrapRequest, AgentBootstrapResponse } from '../core/types';
import { buildBrief } from '../memory/brief';
import { search } from './engine';

export async function agentBootstrap(app: App, payload: AgentBootstrapRequest): Promise<AgentBootstrapResponse> {
	const brief = buildBrief(app);
	const searchResult = await search(app, { 
		query: payload.query, 
		limit: payload.limit ?? 10,
		filters: payload.filters,
		intent: 'bootstrap'
	});

	let notes = searchResult.results;

	// 1. Budget logic (character limit for excerpts)
	const budget = payload.budget ?? 12000;
	let currentLen = 0;
	notes = notes.map(note => {
		if (!note.excerpt) return note;
		if (currentLen >= budget) {
			return { ...note, excerpt: '' }; // Exceeded budget
		}
		let excerpt = note.excerpt;
		if (currentLen + excerpt.length > budget) {
			excerpt = excerpt.slice(0, budget - currentLen) + '...';
		}
		currentLen += excerpt.length;
		return { ...note, excerpt };
	});

	// 2. Extract relevantLinks via resolved links from retrieved notes
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const relevantLinkCounts: Record<string, number> = {};
	for (const note of notes) {
		const targets = resolvedLinks[note.path];
		if (targets) {
			for (const [target, count] of Object.entries(targets)) {
				// Don't count links to notes already in the search results
				if (!notes.some(n => n.path === target)) {
					relevantLinkCounts[target] = (relevantLinkCounts[target] ?? 0) + count;
				}
			}
		}
	}
	const relevantLinks = Object.entries(relevantLinkCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 7)
		.map(e => e[0]);

	// 3. Open Questions heuristics
	const openQuestions: string[] = [];
	if (notes.length === 0) {
		openQuestions.push('No notes found for this query. Consider using `obsidian_knowledge_smart_search` with different keywords or no filters.');
	} else {
		let totalUnresolved = 0;
		for (const note of notes) {
			const unres = app.metadataCache.unresolvedLinks[note.path];
			if (unres) totalUnresolved += Object.keys(unres).length;
		}
		if (totalUnresolved > 2) {
			openQuestions.push(`There are ${totalUnresolved} unresolved links in these notes. Would you like to create missing notes?`);
		}
	}

	return {
		status: 'ok',
		brief: {
			filesCount: brief.filesCount,
			topTags: brief.topTags,
			entryPoints: brief.entryPoints
		},
		notes,
		relevantLinks,
		openQuestions,
		suggestedTools: [
			'obsidian_get_note',
			'obsidian_knowledge_smart_search'
		]
	};
}
