import { describe, expect, it } from 'vitest';
import { runJanitorScan } from '../../src/health/janitor';

const files = [
	{ path: 'HasType.md' },
	{ path: 'MissingType.md' },
	{ path: 'Knowledge/index.md' },
	{ path: 'Project/OnlyType.md' },
];

function makeApp(frontmatterByPath: Record<string, unknown>) {
	return {
		vault: {
			getMarkdownFiles: () => files
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: frontmatterByPath[file.path]
			})
		}
	} as any;
}

describe('runJanitorScan', () => {
	it('requires only OKF type and accepts missing recommended metadata', async () => {
		const app = makeApp({
			'HasType.md': { type: 'architecture', title: 'Has Type', description: 'Complete note' },
			'MissingType.md': { title: 'Missing Type', description: 'No type' },
			'Project/OnlyType.md': { type: 'ordinary note' }
		});

		const result = await runJanitorScan(app, {});

		expect(result.scannedCount).toBe(4);
		expect(result.unstructuredNotes).toEqual(['MissingType.md']);
	});

	it('applies folder filtering before checking notes', async () => {
		const app = makeApp({
			'HasType.md': { type: 'architecture' },
			'MissingType.md': {},
			'Project/OnlyType.md': { type: 'ordinary note' }
		});

		const result = await runJanitorScan(app, { folder: 'Project' });

		expect(result.scannedCount).toBe(1);
		expect(result.unstructuredNotes).toEqual([]);
	});
});
