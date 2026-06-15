import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { agentBootstrap } from '../../src/search/bootstrap';

const MockTFile = TFile as unknown as { new(path: string, stat?: { mtime?: number; size?: number }): TFile };

afterEach(() => {
	delete (globalThis as any).window;
});

describe('agentBootstrap', () => {
	it('keeps serialized response under budget by trimming optional context', async () => {
		(globalThis as any).window = {};
		const file = new MockTFile('Notes/Alpha.md', { mtime: 1000, size: 100 });
		const app = {
			vault: {
				getName: () => 'vault',
				getMarkdownFiles: () => [file],
				getFiles: () => [file],
				getAbstractFileByPath: () => file,
				cachedRead: async () => 'alpha '.repeat(100)
			},
			metadataCache: {
				resolvedLinks: {},
				unresolvedLinks: {},
				getFileCache: () => ({ frontmatter: { type: 'concept' } })
			}
		} as any;

		const response = await agentBootstrap(app, { query: 'alpha', budget: 200 });

		expect(JSON.stringify(response).length).toBeLessThanOrEqual(200);
	});

	it('includes nearby backlinks for retrieved notes', async () => {
		(globalThis as any).window = {};
		const file = new MockTFile('Notes/Alpha.md', { mtime: 1000, size: 100 });
		const app = {
			vault: {
				getName: () => 'vault',
				getMarkdownFiles: () => [file],
				getFiles: () => [file],
				getAbstractFileByPath: () => file,
				cachedRead: async () => 'alpha'
			},
			metadataCache: {
				resolvedLinks: {
					'Notes/Alpha.md': { 'Notes/Beta.md': 1 },
					'Notes/Gamma.md': { 'Notes/Alpha.md': 2 }
				},
				unresolvedLinks: {},
				getFileCache: () => ({ frontmatter: { type: 'concept' } })
			}
		} as any;

		const response = await agentBootstrap(app, { query: 'alpha', budget: 2000 });

		expect(response.relevantLinks).toEqual(['Notes/Beta.md']);
		expect(response.relevantBacklinks).toEqual(['Notes/Gamma.md']);
	});
});
