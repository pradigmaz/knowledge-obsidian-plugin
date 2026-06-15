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
	source: string;
	title: string;
	why: string[];
}

export interface QueryReport {
	source: string;
	fallbackUsed: boolean;
	resultCount: number;
	warnings: string[];
}

export interface AgentBootstrapRequest {
	query: string;
	limit?: number;
	budget?: number;
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
	openQuestions?: string[];
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
	| 'arch_violation_layering';

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
	vaultName: string;
	enabledModules: string[];
	omnisearchAvailable: boolean;
	warnings: string[];
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
}

export interface BenchmarkReport {
	pass: boolean;
	topKHitRate: number;
	cases: BenchmarkCaseResult[];
}

export interface RouteTraceRequest {
	source: string;
	target: string;
}

export interface RouteTraceResult {
	source: string;
	target: string;
	path: string[];
	distance: number;
}

export interface ConceptClusterRequest {
	concept: string;
	depth?: number;
}

export interface ConceptClusterResult {
	clusterTags: string[];
	relatedNotes: string[];
	centralityScore: number;
}

export interface JanitorScanRequest {
	folder?: string;
}

export interface JanitorScanResult {
	unstructuredNotes: string[];
	scannedCount: number;
}
