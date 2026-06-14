import { App } from 'obsidian';
import { AgentBootstrapRequest, AgentBootstrapResponse } from '../core/types';
import { buildBrief } from '../memory/brief';
import { search } from './engine';

export async function agentBootstrap(app: App, payload: AgentBootstrapRequest): Promise<AgentBootstrapResponse> {
	const brief = buildBrief(app);
	const searchResult = await search(app, { query: payload.query, limit: payload.limit ?? 10 });

	return {
		status: 'ok',
		brief: {
			filesCount: brief.filesCount,
			topTags: brief.topTags,
			entryPoints: brief.entryPoints
		},
		notes: searchResult.results,
		suggestedTools: [
			'obsidian_get_note',
			'obsidian_knowledge_smart_search'
		]
	};
}
