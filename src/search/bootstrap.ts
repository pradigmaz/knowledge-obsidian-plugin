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

	// 1. Budget logic
	const budget = Math.max(0, payload.budget ?? 12000);
	let currentLen = 0;
	notes = notes.map(note => {
		if (!note.excerpt) return note;
		if (currentLen >= budget) {
			return { ...note, excerpt: '' };
		}
		let excerpt = note.excerpt;
		if (currentLen + excerpt.length > budget) {
			excerpt = excerpt.slice(0, budget - currentLen);
		}
		currentLen += excerpt.length;
		return { ...note, excerpt };
	});

	// 2. Extract relevantLinks via resolved links from retrieved notes
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const relevantLinkCounts: Record<string, number> = {};
	const relevantBacklinkCounts: Record<string, number> = {};
	const notePaths = new Set(notes.map((note) => note.path));
	for (const note of notes) {
		const targets = resolvedLinks[note.path];
		if (targets) {
			for (const [target, count] of Object.entries(targets)) {
				// Don't count links to notes already in the search results
				if (!notePaths.has(target)) {
					relevantLinkCounts[target] = (relevantLinkCounts[target] ?? 0) + count;
				}
			}
		}
	}
	for (const [source, targets] of Object.entries(resolvedLinks)) {
		if (notePaths.has(source)) continue;
		for (const [target, count] of Object.entries(targets)) {
			if (notePaths.has(target)) {
				relevantBacklinkCounts[source] = (relevantBacklinkCounts[source] ?? 0) + count;
			}
		}
	}
	const relevantLinks = Object.entries(relevantLinkCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 7)
		.map(e => e[0]);
	const relevantBacklinks = Object.entries(relevantBacklinkCounts)
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

	const response: AgentBootstrapResponse = {
		status: 'ok',
		brief: {
			filesCount: brief.filesCount,
			topTags: brief.topTags,
			entryPoints: brief.entryPoints
		},
		notes,
		relevantLinks,
		relevantBacklinks,
		openQuestions,
		suggestedTools: [
			'obsidian_get_note',
			'obsidian_knowledge_smart_search'
		]
	};

	return fitResponseToBudget(response, budget);
}

function fitResponseToBudget(response: AgentBootstrapResponse, budget: number): AgentBootstrapResponse {
	while (JSON.stringify(response).length > budget) {
		const note = [...response.notes].reverse().find(item => item.excerpt);
		if (!note) break;
		const overflow = JSON.stringify(response).length - budget;
		if ((note.excerpt?.length ?? 0) <= overflow) {
			note.excerpt = '';
		} else {
			note.excerpt = note.excerpt?.slice(0, -overflow);
		}
	}
	if (JSON.stringify(response).length > budget) response.openQuestions = [];
	if (JSON.stringify(response).length > budget) response.relevantLinks = [];
	if (JSON.stringify(response).length > budget) response.relevantBacklinks = [];
	if (JSON.stringify(response).length > budget) response.brief = {};
	if (JSON.stringify(response).length > budget) response.suggestedTools = [];
	while (JSON.stringify(response).length > budget && response.notes.length > 0) {
		response.notes.pop();
	}
	return response;
}
