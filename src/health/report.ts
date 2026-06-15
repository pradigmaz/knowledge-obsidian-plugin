import { App } from 'obsidian';
import { graphStats } from '../core/graph';
import { VaultHealthReport, NoteHotspot } from '../core/types';
import { checkRules, RuleContext } from './rules';
import { getSignals } from '../memory/signals';
import { extractTags } from '../utils/tags';

export async function buildHealthReport(app: App): Promise<VaultHealthReport> {
	const now = Date.now();
	const graph = graphStats(app);
	const files = app.vault.getMarkdownFiles();
	const signals = await getSignals(app);
	
	// Create a quick lookup for ignored/accepted signals
	const resolvedSignals = new Set(
		signals
			.filter(s => s.decision === 'ignored' || s.decision === 'accepted' || s.decision === 'resolved')
			.map(s => `${s.ruleId}:${s.path}`)
	);

	// Pre-compute duplicate titles
	const titleCounts = new Map<string, number>();
	for (const file of files) {
		titleCounts.set(file.basename, (titleCounts.get(file.basename) ?? 0) + 1);
	}

	const hotspots: NoteHotspot[] = [];
	const groupedByFolder: Record<string, NoteHotspot[]> = {};
	const groupedByTag: Record<string, NoteHotspot[]> = {};

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter || null;
		
		const allTags = extractTags(cache, frontmatter);

		const linksOut = graph.links[file.path] ?? 0;
		const backlinks = graph.backlinks[file.path] ?? 0;
		const unres = app.metadataCache.unresolvedLinks[file.path];
		const unresolvedLinksOut = unres ? Object.keys(unres).length : 0;
		
		// Determine roles
		const roles: string[] = [];
		if (frontmatter?.status) roles.push('project'); // Heuristic
		if (linksOut + backlinks > 10) roles.push('hub');
		if (file.path.includes('Daily') || file.path.includes('Journal')) roles.push('daily');

		const isDuplicateTitle = (titleCounts.get(file.basename) ?? 0) > 1;

		const ctx: RuleContext = {
			app,
			file,
			path: file.path,
			frontmatter,
			tags: allTags,
			contentLength: file.stat.size,
			linksOut,
			backlinks,
			unresolvedLinksOut,
			mtime: file.stat.mtime,
			now,
			roles,
			isDuplicateTitle
		};

		let violations = checkRules(ctx);
		
		// Filter out ignored violations based on signal memory
		violations = violations.filter(v => {
			const key = `${v.ruleId}:${file.path}`;
			return !resolvedSignals.has(key);
		});
		
		if (violations.length > 0) {
			// Calculate score
			let score = 0;
			for (const v of violations) {
				if (v.severity === 'high') score += 10;
				else if (v.severity === 'warn') score += 5;
				else score += 1;
			}
			
			// Boost score based on role
			if (roles.includes('hub')) score += 5;
			if (roles.includes('project')) score += 3;

			const hotspot: NoteHotspot = {
				path: file.path,
				score,
				roles,
				violations
			};

			hotspots.push(hotspot);

			// Group by folder
			const folder = file.parent?.path || '/';
			if (!groupedByFolder[folder]) groupedByFolder[folder] = [];
			groupedByFolder[folder].push(hotspot);

			// Group by tags
			for (const tag of allTags) {
				if (!groupedByTag[tag]) groupedByTag[tag] = [];
				groupedByTag[tag].push(hotspot);
			}
		}
	}

	hotspots.sort((a, b) => b.score - a.score);
	
	// Sort groups internally
	for (const folder in groupedByFolder) {
		groupedByFolder[folder]?.sort((a, b) => b.score - a.score);
	}
	for (const tag in groupedByTag) {
		groupedByTag[tag]?.sort((a, b) => b.score - a.score);
	}

	return {
		status: 'ok',
		hotspots,
		groupedByFolder,
		groupedByTag
	};
}
