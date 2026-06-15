import { App } from 'obsidian';
import { JanitorScanRequest, JanitorScanResult } from '../core/types';

export async function runJanitorScan(app: App, payload: JanitorScanRequest): Promise<{ status: string; result: JanitorScanResult }> {
	const folderFilter = payload.folder?.trim();
	let allMarkdownFiles = app.vault.getMarkdownFiles();

	if (folderFilter) {
		allMarkdownFiles = allMarkdownFiles.filter(file => file.path.startsWith(folderFilter + '/'));
	}

	const unstructuredNotes: string[] = [];

	for (const file of allMarkdownFiles) {
		const basename = file.path.split('/').pop()?.toLowerCase();
		if (basename === 'index.md' || basename === 'log.md') {
			continue;
		}

		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;

		const isStructured = Boolean(fm && typeof fm.type === 'string' && fm.type.trim() !== '');

		if (!isStructured) {
			unstructuredNotes.push(file.path);
		}
	}

	return {
		status: 'ok',
		result: {
			unstructuredNotes,
			scannedCount: allMarkdownFiles.length
		}
	};
}
