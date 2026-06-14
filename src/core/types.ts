import { TFile } from 'obsidian';

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
}

export interface AgentBootstrapResponse {
	status: 'ok' | 'error';
	brief: unknown;
	notes: SearchHit[];
	suggestedTools: string[];
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
