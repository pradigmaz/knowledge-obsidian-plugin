export interface SearchFilters {
	pathPrefix?: string;
	tags?: string[];
	fileTypes?: string[];
	modifiedAfter?: number;
	modifiedBefore?: number;
}

export type SearchIntent = 'lookup' | 'research' | 'decision' | 'cleanup' | 'bootstrap';

export interface SearchRequest {
	limit?: number;
	query?: string;
	filters?: SearchFilters;
	intent?: SearchIntent;
}

export interface SearchHit {
	excerpt?: string;
	graphScore: number;
	matches?: unknown[];
	originalScore: number;
	path: string;
	score: number;
	scoreParts?: SearchScoreParts;
	source: string;
	title: string;
	why: string[];
}

export interface SearchScoreParts {
	omnisearch: number;
	backlinks: number;
	outgoingLinks: number;
	tagFolder: number;
	recency: number;
	apiSurface: number;
	generatedPenalty: number;
}

export interface QueryReportProvenance {
	basis: 'indexed' | 'preview_fallback' | 'graph_derived' | 'heuristic' | 'mixed' | 'omnisearch';
	derivation: string;
	freshness: string;
	strength: 'strong' | 'moderate' | 'weak' | 'fallback_only' | 'high';
	reasons: string[];
}

export interface QueryReportExplain {
	lexical: number;
	graph: number;
	semantic: number;
	rrf: number;
	graph_rrf: number;
	rank_before: number;
	rank_after: number;
	semantic_source: string;
	semantic_outcome: string;
	graph_seed_path: string;
	graph_edge_kinds: string[];
	graph_hops: number;
}

export interface QueryReportSelectedContext {
	path: string;
	score: number;
	chars: number;
	chunk_idx: number;
	chunk_source: string;
	why: string[];
	explain: QueryReportExplain;
	provenance: QueryReportProvenance;
}

export interface QueryReport {
	// RMU fields
	query_id: string;
	timestamp_utc: string;
	project_root: string;
	resolved_mode: string;
	mode_source: string;
	budget: {
		max_tokens: number;
		used_estimate: number;
		hard_truncated: boolean;
	};
	retrieval_pipeline: Array<{ stage: string; candidates: number; kept: number }>;
	selected_context: QueryReportSelectedContext[];
	provenance: QueryReportProvenance;
	confidence: {
		overall: number;
		reasons: string[];
		signals: {
			margin_top1_top2: number;
			explain_coverage: number;
			semantic_coverage: number;
			semantic_outcome: string;
			stage_drop_ratio: number;
			hard_truncated: boolean;
		};
	};
	gaps: string[];
	index_telemetry: {
		last_index_lock_wait_ms: number;
		last_embedding_cache_hits: number;
		last_embedding_cache_misses: number;
		chunk_coverage: number;
		chunk_source: string;
	};
	degradation_reasons: string[];
	deepen_available: boolean;

	// Legacy fields (optional)
	source?: string;
	fallbackUsed?: boolean;
	resultCount?: number;
	warnings?: string[];
	filters?: SearchFilters;
	topRankingFactors?: string[];
	degradation?: string[];
}

export interface AgentBootstrapRequest {
	query: string;
	limit?: number;
	budget?: number;
	profile?: 'fast' | 'investigation_summary' | 'report' | 'full';
	filters?: SearchFilters;
}

export interface WorkspaceBriefData {
	status: 'ok' | 'error';
	vaultName: string;
	filesCount: number;
	attachmentCount: number;
	linksCount: number;
	unresolvedLinksCount: number;
	isolatedNotes: number;
	backlinkHubs: Array<{ path: string; backlinks: number }>;
	topFolders: Array<{ folder: string; count: number }>;
	topTags: Array<{ tag: string; count: number }>;
	commonProperties: Array<{ property: string; count: number }>;
	missingKeyProperties: number;
	recentNotes: string[];
	staleHighCentralityNotes: string[];
	entryPoints: Array<{ path: string; score: number }>;
	projectNotes: string[];
}

export interface AgentBootstrapResponse {
	status: 'ok' | 'error';
	brief: Partial<WorkspaceBriefData>;
	notes: SearchHit[];
	relevantLinks?: string[];
	relevantBacklinks?: string[];
	openQuestions?: string[];
	profile: 'fast' | 'investigation_summary' | 'report' | 'full';
	degradation_reasons: Array<'semantic_fail_open' | 'chunk_preview_fallback' | 'budget_truncated' | 'profile_limited'>;
	deepen_available: boolean;
	deepen_hint?: string;
	query_bundle: {
		query: string;
		limit: number;
		semantic: boolean;
		resolved_mode: string;
		mode_source: string;
		max_chars: number;
		max_tokens: number;
		hits: SearchHit[];
		context: { notes: SearchHit[] };
		provenance: { source: string; generated_at: string };
		followups: string[];
		report?: unknown;
	};
	timings: {
		index_ready_ms: number;
		brief_ms: number;
		search_ms: number;
		context_ms: number;
		investigation_ms: number;
		report_ms: number;
		total_ms: number;
	};
	trimmed_sections: string[];
	suggestedTools: string[];
}

export type HygieneRuleId = 
	| 'isolated_note' 
	| 'unresolved_links' 
	| 'missing_tags' 
	| 'missing_props' 
	| 'missing_okf'
	| 'oversized' 
	| 'stale_hub' 
	| 'empty' 
	| 'duplicate_title'
	| 'arch_violation_layering'
	| 'sensitive_data';

export type Severity = 'info' | 'warn' | 'high';

export interface HygieneViolation {
	ruleId: HygieneRuleId;
	severity: Severity;
	evidence: string;
	suggestedStep: string;
	expectedEffortMin: number;
}

export interface NoteHotspot {
	path: string;
	score: number;
	roles: string[];
	violations: HygieneViolation[];
}

export interface VaultHealthReport {
	status: 'ok' | 'error';
	hotspots: NoteHotspot[];
	groupedByFolder: Record<string, NoteHotspot[]>;
	groupedByTag: Record<string, NoteHotspot[]>;
	severityCounts: Record<Severity, number>;
}

export interface GraphStats {
	backlinks: Record<string, number>;
	links: Record<string, number>;
}

export const SCHEMA_VERSION = '0.1.0';

export interface CapabilityDescriptor {
	id: string;
	name: string;
	version: string;
	status: 'ready' | 'degraded' | 'unavailable';
	endpoints: string[];
	tools: string[];
	dependencies: string[];
	degradedReasons?: string[];
}

export interface KnowledgeStatus {
	status: 'ready' | 'degraded' | 'unavailable';
	schemaVersion: string;
	pluginVersion: string;
	vaultName: string;
	enabledModules: string[];
	requiredCapabilities: CapabilityDescriptor[];
	omnisearchAvailable: boolean;
	warnings: string[];
	errors?: string[];
	recoveryHint?: string;
}

export type SignalDecision = 'open' | 'accepted' | 'ignored' | 'resolved';

export interface SignalMemoryEntry {
	signalKey: string;
	ruleId: string;
	path: string;
	decision: SignalDecision;
	reason?: string;
	updatedAt: string;
}

export interface SignalMemoryMarkRequest {
	signalKey: string;
	ruleId: string;
	path: string;
	decision: SignalDecision;
	reason?: string;
}

export interface SignalMemoryStatusData {
	countsByState: Record<SignalDecision, number>;
	staleOpenSignals: number;
	recentlyResolved: number;
}

export interface BenchmarkRequest {
	cases?: BenchmarkCase[];
	targetTopKHitRate?: number;
	datasetPath?: string;
	k?: number;
	runsCount?: number;
	medianRule?: string;
	baselinePath?: string;
	thresholds?: BenchmarkThresholds;
	enforceGates?: boolean;
}

export interface BenchmarkThresholds {
	min_recall_at_k?: number;
	min_mrr_at_k?: number;
	min_ndcg_at_k?: number;
	max_avg_estimated_tokens?: number;
	max_latency_p50_ms?: number;
	max_latency_p95_ms?: number;
	max_recall_drop?: number;
}

export interface BenchmarkCase {
	query: string;
	expectedPaths: string[];
	minTopK: number;
	notes?: string;
}

export interface BenchmarkCaseResult {
	query: string;
	pass: boolean;
	missingPaths: string[];
	rankingDrift: Record<string, number>;
	mrr_at_k: number;
	ndcg_at_k: number;
	recall_at_k: number;
	avg_estimated_tokens: number;
	latency_ms: number;
	latency_p50_ms: number;
	latency_p95_ms: number;
}

export interface BenchmarkReport {
	pass: boolean;
	dataset_path: string;
	k: number;
	query_count: number;
	runs_count: number;
	median_rule: string;
	topKHitRate: number;
	targetTopKHitRate?: number;
	mrr_at_k: number;
	ndcg_at_k: number;
	recall_at_k: number;
	avg_estimated_tokens: number;
	latency_p50_ms: number;
	latency_p95_ms: number;
	baseline?: { path: string; metrics: BenchmarkMetrics };
	candidate?: { runs: BenchmarkMetrics[]; median: BenchmarkMetrics };
	diff?: Partial<Record<keyof BenchmarkMetrics, number>>;
	thresholds?: BenchmarkThresholds;
	enforce_gates: boolean;
	cases: BenchmarkCaseResult[];
}

export interface BenchmarkMetrics {
	dataset_path: string;
	k: number;
	query_count: number;
	recall_at_k: number;
	mrr_at_k: number;
	ndcg_at_k: number;
	avg_estimated_tokens: number;
	latency_p50_ms: number;
	latency_p95_ms: number;
}

export interface RouteTraceRequest {
	source: string;
	target: string;
}

export interface RouteTraceResult {
	seed: { seed: string; seed_kind: string };
	best_route: {
		segments: Array<{
			kind: string;
			path: string;
			language: string;
			evidence: string;
			relation_kind: string;
			source_kind: string;
			score: number;
		}>;
		total_hops: number;
		total_weight: number;
		collapsed_hops: number;
		confidence: number;
	};
	alternate_routes: unknown[];
	unresolved_gaps: unknown[];
	capability_status: string;
	unsupported_sources: string[];
	confidence: number;
	source: string;
	target: string;
	path: string[];
	distance: number;
	found?: boolean;
	reason?: 'source_not_found' | 'target_not_found' | 'no_path';
}

export interface ConceptClusterRequest {
	concept: string;
	depth?: number;
}

export interface ConceptClusterResult {
	seed: { seed: string; seed_kind: string };
	variants: Array<{
		id: string;
		entry_anchor: { path: string; language: string };
		route: unknown[];
		constraints: unknown[];
		related_tests: unknown[];
		confidence: number;
		gaps: unknown[];
	}>;
	cluster_summary: { variant_count: number; languages: string[]; route_kinds: string[] };
	gaps: string[];
	capability_status: string;
	unsupported_sources: string[];
	confidence: number;
	concept: string;
	cluster: string[];
	relatedConcepts: string[];
	centralityScore: number;
}

export interface JanitorScanRequest {
	folder?: string;
}

export interface JanitorScanResult {
	unstructuredNotes: string[];
	scannedCount: number;
}
