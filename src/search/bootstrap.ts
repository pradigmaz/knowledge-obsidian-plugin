import { App } from 'obsidian';
import { AgentBootstrapRequest, AgentBootstrapResponse } from '../core/types';
import { buildBrief } from '../memory/brief';
import { search } from './engine';

export async function agentBootstrap(app: App, payload: AgentBootstrapRequest): Promise<AgentBootstrapResponse> {
	const startMs = Date.now();
	const profile = payload.profile ?? 'fast';
	const degradationReasons: AgentBootstrapResponse['degradation_reasons'] = [];
	const trimmedSections: string[] = [];
	const briefStartMs = Date.now();
	const brief = buildBrief(app);
	const briefMs = Date.now() - briefStartMs;
	const searchStartMs = Date.now();
	const searchResult = await search(app, { 
		query: payload.query, 
		limit: payload.limit ?? 10,
		filters: payload.filters,
		intent: 'bootstrap'
	});
	const searchMs = Date.now() - searchStartMs;

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
			if (!degradationReasons.includes('budget_truncated')) degradationReasons.push('budget_truncated');
			if (!trimmedSections.includes('notes.excerpt')) trimmedSections.push('notes.excerpt');
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
		profile,
		degradation_reasons: degradationReasons,
		deepen_available: notes.length > 0,
		deepen_hint: notes.length > 0 ? 'Use obsidian_knowledge_smart_search for deeper context.' : undefined,
		query_bundle: {
			query: payload.query,
			limit: payload.limit ?? 10,
			semantic: false,
			resolved_mode: 'lexical_graph',
			mode_source: 'knowledge_plugin',
			max_chars: budget,
			max_tokens: Math.ceil(budget / 4),
			hits: notes,
			context: { notes },
			provenance: { source: 'knowledge-obsidian-plugin', generated_at: new Date().toISOString() },
			followups: openQuestions,
			report: searchResult.queryReport
		},
		timings: {
			index_ready_ms: 0,
			brief_ms: briefMs,
			search_ms: searchMs,
			context_ms: 0,
			investigation_ms: 0,
			report_ms: 0,
			total_ms: Date.now() - startMs
		},
		trimmed_sections: trimmedSections,
		suggestedTools: [
			'obsidian_get_note',
			'obsidian_knowledge_smart_search'
		]
	};

	return fitResponseToBudget(response, budget);
}

function fitResponseToBudget(response: AgentBootstrapResponse, budget: number): AgentBootstrapResponse {
	const markTrimmed = (section: string) => {
		if (!response.trimmed_sections.includes(section)) response.trimmed_sections.push(section);
		if (!response.degradation_reasons.includes('budget_truncated')) {
			response.degradation_reasons.push('budget_truncated');
		}
	};
	while (JSON.stringify(response).length > budget) {
		const note = [...response.notes].reverse().find(item => item.excerpt);
		if (!note) break;
		const overflow = JSON.stringify(response).length - budget;
		if ((note.excerpt?.length ?? 0) <= overflow) {
			note.excerpt = '';
		} else {
			note.excerpt = note.excerpt?.slice(0, -overflow);
		}
		response.query_bundle.hits = response.notes;
		response.query_bundle.context.notes = response.notes;
		markTrimmed('notes.excerpt');
	}
	if (JSON.stringify(response).length > budget) {
		response.openQuestions = [];
		response.query_bundle.followups = [];
		markTrimmed('openQuestions');
	}
	if (JSON.stringify(response).length > budget) {
		response.relevantLinks = [];
		markTrimmed('relevantLinks');
	}
	if (JSON.stringify(response).length > budget) {
		response.relevantBacklinks = [];
		markTrimmed('relevantBacklinks');
	}
	if (JSON.stringify(response).length > budget) {
		response.query_bundle.report = undefined;
		markTrimmed('query_bundle.report');
	}
	if (JSON.stringify(response).length > budget) {
		response.brief = {};
		markTrimmed('brief');
	}
	if (JSON.stringify(response).length > budget) {
		response.suggestedTools = [];
		markTrimmed('suggestedTools');
	}
	while (JSON.stringify(response).length > budget && response.notes.length > 0) {
		response.notes.pop();
		response.query_bundle.hits = response.notes;
		response.query_bundle.context.notes = response.notes;
		markTrimmed('notes');
	}
	return response;
}
