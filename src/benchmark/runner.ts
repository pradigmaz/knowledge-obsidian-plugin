import { App, TFile } from 'obsidian';
import { BenchmarkMetrics, BenchmarkRequest, BenchmarkCaseResult, BenchmarkReport } from '../core/types';
import { search } from '../search/engine';

export async function runQueryBenchmark(app: App, request: BenchmarkRequest): Promise<BenchmarkReport> {
	const cases = request.cases || [];
	const targetHitRate = request.targetTopKHitRate;
	const datasetPath = request.datasetPath ?? `${app.vault.configDir}/knowledge-benchmarks.json`;
	const k = request.k ?? Math.max(...cases.map(testCase => testCase.minTopK), 1);
	const thresholds = request.thresholds ?? {};
	const enforceGates = request.enforceGates ?? targetHitRate !== undefined;
	if (cases.length === 0) {
		return {
			pass: false,
			dataset_path: datasetPath,
			k,
			query_count: 0,
			runs_count: request.runsCount ?? 1,
			median_rule: request.medianRule ?? 'single_run',
			topKHitRate: 0,
			targetTopKHitRate: targetHitRate,
			mrr_at_k: 0,
			ndcg_at_k: 0,
			recall_at_k: 0,
			avg_estimated_tokens: 0,
			latency_p50_ms: 0,
			latency_p95_ms: 0,
			thresholds,
			enforce_gates: enforceGates,
			cases: []
		};
	}

	const results: BenchmarkCaseResult[] = [];
	let passedCount = 0;
	let totalMrr = 0;
	let totalNdcg = 0;
	let totalRecall = 0;
	let totalTokens = 0;
	const latencies: number[] = [];

	for (const testCase of cases) {
		const limit = Math.max(testCase.minTopK || k, 50);
		let hits: import('../core/types').SearchHit[] = [];
		const start = Date.now();
		try {
			const searchResult = await search(app, { query: testCase.query, limit });
			hits = searchResult.results;
		} catch {
			hits = [];
		}
		const latency_ms = Date.now() - start;
		const avg_estimated_tokens = Math.ceil(JSON.stringify(hits).length / 4);

		const missingPaths: string[] = [];
		const rankingDrift: Record<string, number> = {};
		let hitsCount = 0;
		let mrr = 0;
		let dcg = 0;
		
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
				hitsCount++;
				if (mrr === 0) mrr = 1 / (index + 1);
				dcg += 1 / Math.log2(index + 2);
			}
		}

		let idcg = 0;
		for (let i = 0; i < Math.min(testCase.expectedPaths.length, testCase.minTopK); i++) {
			idcg += 1 / Math.log2(i + 2);
		}
		const ndcg = idcg > 0 ? dcg / idcg : 0;
		const recall = testCase.expectedPaths.length > 0 ? hitsCount / testCase.expectedPaths.length : 0;

		const pass = missingPaths.length === 0;
		if (pass) passedCount++;

		totalMrr += mrr;
		totalNdcg += ndcg;
		totalRecall += recall;
		latencies.push(latency_ms);
		totalTokens += avg_estimated_tokens;

		results.push({
			query: testCase.query,
			pass,
			missingPaths,
			rankingDrift,
			mrr_at_k: mrr,
			ndcg_at_k: ndcg,
			recall_at_k: recall,
			avg_estimated_tokens,
			latency_ms,
			latency_p50_ms: latency_ms,
			latency_p95_ms: latency_ms
		});
	}

	const topKHitRate = Math.round((passedCount / cases.length) * 100);
	const numCases = cases.length;
	const latencyP50 = percentile(latencies, 0.5);
	const latencyP95 = percentile(latencies, 0.95);

	let pass = targetHitRate !== undefined 
		? topKHitRate >= targetHitRate 
		: passedCount === cases.length;

	const metrics: BenchmarkMetrics = {
		dataset_path: datasetPath,
		k,
		query_count: numCases,
		recall_at_k: totalRecall / numCases,
		mrr_at_k: totalMrr / numCases,
		ndcg_at_k: totalNdcg / numCases,
		avg_estimated_tokens: totalTokens / numCases,
		latency_p50_ms: latencyP50,
		latency_p95_ms: latencyP95
	};

	const report: BenchmarkReport = {
		pass,
		dataset_path: datasetPath,
		k,
		query_count: numCases,
		runs_count: request.runsCount ?? 1,
		median_rule: request.medianRule ?? 'single_run',
		topKHitRate,
		targetTopKHitRate: targetHitRate,
		mrr_at_k: metrics.mrr_at_k,
		ndcg_at_k: metrics.ndcg_at_k,
		recall_at_k: metrics.recall_at_k,
		avg_estimated_tokens: metrics.avg_estimated_tokens,
		latency_p50_ms: metrics.latency_p50_ms,
		latency_p95_ms: metrics.latency_p95_ms,
		candidate: { runs: [metrics], median: metrics },
		thresholds,
		enforce_gates: enforceGates,
		cases: results
	};

	try {
		const baselinePath = request.baselinePath ?? `${app.vault.configDir}/knowledge-benchmark-baseline.json`;
		const baselineFile = app.vault.getAbstractFileByPath(baselinePath);
		if (baselineFile instanceof TFile) {
			const baselineContent = (await app.vault.read(baselineFile)).replace(/^\uFEFF/, '');
			const baseline = JSON.parse(baselineContent) as BenchmarkReport;
			const baselineMetrics = metricsFromReport(baseline, baselinePath);
			const maxRecallDrop = thresholds.max_recall_drop ?? 0.05;
			report.baseline = { path: baselinePath, metrics: baselineMetrics };
			report.diff = diffMetrics(baselineMetrics, metrics);
			if (enforceGates && metrics.recall_at_k < baselineMetrics.recall_at_k - maxRecallDrop) {
				report.pass = false;
			}
		}
		if (enforceGates && thresholdFailed(metrics, thresholds)) report.pass = false;
		
		const reportPath = `${app.vault.configDir}/knowledge-benchmark-report.json`;
		const file = app.vault.getAbstractFileByPath(reportPath);
		if (file instanceof TFile) {
			await app.vault.modify(file, JSON.stringify(report, null, 2));
		} else {
			await app.vault.create(reportPath, JSON.stringify(report, null, 2));
		}
	} catch {
		// Benchmark result remains valid if vault summary write is unavailable.
	}

	return report;
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

function metricsFromReport(report: BenchmarkReport, path: string): BenchmarkMetrics {
	return {
		dataset_path: report.dataset_path ?? path,
		k: report.k ?? 1,
		query_count: report.query_count ?? report.cases?.length ?? 0,
		recall_at_k: report.recall_at_k,
		mrr_at_k: report.mrr_at_k,
		ndcg_at_k: report.ndcg_at_k,
		avg_estimated_tokens: report.avg_estimated_tokens,
		latency_p50_ms: report.latency_p50_ms,
		latency_p95_ms: report.latency_p95_ms
	};
}

function diffMetrics(baseline: BenchmarkMetrics, candidate: BenchmarkMetrics): BenchmarkReport['diff'] {
	return {
		recall_at_k: candidate.recall_at_k - baseline.recall_at_k,
		mrr_at_k: candidate.mrr_at_k - baseline.mrr_at_k,
		ndcg_at_k: candidate.ndcg_at_k - baseline.ndcg_at_k,
		avg_estimated_tokens: candidate.avg_estimated_tokens - baseline.avg_estimated_tokens,
		latency_p50_ms: candidate.latency_p50_ms - baseline.latency_p50_ms,
		latency_p95_ms: candidate.latency_p95_ms - baseline.latency_p95_ms
	};
}

function thresholdFailed(metrics: BenchmarkMetrics, thresholds: NonNullable<BenchmarkRequest['thresholds']>): boolean {
	return (
		(thresholds.min_recall_at_k !== undefined && metrics.recall_at_k < thresholds.min_recall_at_k) ||
		(thresholds.min_mrr_at_k !== undefined && metrics.mrr_at_k < thresholds.min_mrr_at_k) ||
		(thresholds.min_ndcg_at_k !== undefined && metrics.ndcg_at_k < thresholds.min_ndcg_at_k) ||
		(thresholds.max_avg_estimated_tokens !== undefined && metrics.avg_estimated_tokens > thresholds.max_avg_estimated_tokens) ||
		(thresholds.max_latency_p50_ms !== undefined && metrics.latency_p50_ms > thresholds.max_latency_p50_ms) ||
		(thresholds.max_latency_p95_ms !== undefined && metrics.latency_p95_ms > thresholds.max_latency_p95_ms)
	);
}
