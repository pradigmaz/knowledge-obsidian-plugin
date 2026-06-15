import { App } from 'obsidian';
import { graphStats, entryPoints, totalValues, unresolvedLinksCount } from '../core/graph';
import { WorkspaceBriefData } from '../core/types';
import { extractTags } from '../utils/tags';

export function buildBrief(app: App): WorkspaceBriefData {
	const now = Date.now();
	const files = app.vault.getMarkdownFiles();
	const allFiles = app.vault.getFiles();
	const graph = graphStats(app);
	
	const folderCounts = new Map<string, number>();
	const propCounts = new Map<string, number>();
	const tagCounts = new Map<string, number>();
	
	let isolatedNotes = 0;
	const projectNotes: string[] = [];

	for (const file of files) {
		const folder = file.parent?.path || '/';
		folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);

		if ((graph.links[file.path] ?? 0) === 0 && (graph.backlinks[file.path] ?? 0) === 0) {
			isolatedNotes++;
		}

		const cache = app.metadataCache.getFileCache(file);
		if (cache) {
			for (const tag of extractTags(cache)) {
				tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
			}

			const frontmatter = cache.frontmatter;
			let hasProjectProp = false;
			if (frontmatter) {
				for (const key of Object.keys(frontmatter)) {
					if (key !== 'position') {
						propCounts.set(key, (propCounts.get(key) ?? 0) + 1);
					}
					if (key === 'project') hasProjectProp = true;
				}
			}

			const hasProjectTag = extractTags(cache).some((tag) => tag.toLowerCase().includes('project'));
			if (hasProjectTag || hasProjectProp) {
				projectNotes.push(file.path);
			}
		}
	}

	const recentNotes = [...files]
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, 10)
		.map((file) => file.path);
	
	const topFolders = [...folderCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([folder, count]) => ({ folder, count }));

	const backlinkHubs = [...Object.entries(graph.backlinks)]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([path, backlinks]) => ({ path, backlinks }));

	const topTags = [...tagCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([tag, count]) => ({ tag, count }));

	const commonProperties = [...propCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([property, count]) => ({ property, count }));

	const top3Props = commonProperties.slice(0, 3).map((p) => p.property);
	let missingKeyProperties = 0;
	if (top3Props.length > 0) {
		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter || {};
			const hasAllKeyProps = top3Props.every((p) => p in frontmatter);
			if (!hasAllKeyProps) {
				missingKeyProperties++;
			}
		}
	}

	const entries = entryPoints(app, graph);
	const topHubs = entries.slice(0, 10).map((e) => ({ path: e.path, score: e.score }));

	const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;
	const staleHighCentralityNotes = entries
		.filter((e) => e.mtime < twoMonthsAgo)
		.slice(0, 10)
		.map((e) => e.path);

	const vaultName = app.vault.getName();
	const attachmentCount = allFiles.length - files.length;

	return {
		status: 'ok',
		vaultName,
		filesCount: files.length,
		attachmentCount,
		linksCount: totalValues(graph.links),
		unresolvedLinksCount: unresolvedLinksCount(app),
		isolatedNotes,
		backlinkHubs,
		topFolders,
		topTags,
		commonProperties,
		missingKeyProperties,
		recentNotes,
		staleHighCentralityNotes,
		entryPoints: topHubs,
		projectNotes,
	};
}
