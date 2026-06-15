import { App } from 'obsidian';
import { BenchmarkCase, BenchmarkCaseResult, BenchmarkReport } from '../core/types';
import { search } from '../search/engine';

export async function runQueryBenchmark(app: App, cases: BenchmarkCase[]): Promise<BenchmarkReport> {
	if (!cases || cases.length === 0) {
		return { pass: true, topKHitRate: 100, cases: [] };
	}

	const results: BenchmarkCaseResult[] = [];
	let passedCount = 0;

	for (const testCase of cases) {
		const limit = Math.max(testCase.minTopK || 5, 50);
		let hits: import('../core/types').SearchHit[] = [];
		try {
			const searchResult = await search(app, { query: testCase.query, limit });
			hits = searchResult.results;
		} catch {
			hits = [];
		}

		const missingPaths: string[] = [];
		const rankingDrift: Record<string, number> = {};
		
		for (const expected of testCase.expectedPaths) {
			const index = hits.findIndex(h => h.path === expected);
			if (index === -1 || index >= testCase.minTopK) {
				missingPaths.push(expected);
				if (index !== -1) {
					rankingDrift[expected] = index + 1; // 1-based rank
				} else {
					rankingDrift[expected] = -1; // Not found in top `limit`
				}
			} else {
				rankingDrift[expected] = index + 1;
			}
		}

		const pass = missingPaths.length === 0;
		if (pass) passedCount++;

		results.push({
			query: testCase.query,
			pass,
			missingPaths,
			rankingDrift
		});
	}

	const topKHitRate = Math.round((passedCount / cases.length) * 100);

	return {
		pass: passedCount === cases.length,
		topKHitRate,
		cases: results
	};
}
