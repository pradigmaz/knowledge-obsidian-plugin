import { App, Notice } from 'obsidian';
import { SignalDecision, SignalMemoryEntry, SignalMemoryMarkRequest, SignalMemoryStatusData } from '../core/types';

const SIGNAL_DECISIONS = new Set<SignalDecision>(['open', 'accepted', 'ignored', 'resolved']);

export class SignalMemoryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	get filePath(): string {
		return `${this.app.vault.configDir}/knowledge-signal-memory.json`;
	}

	async loadSignals(): Promise<SignalMemoryEntry[]> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.filePath))) {
			return [];
		}
		try {
			const data = await adapter.read(this.filePath);
			const parsed = JSON.parse(data) as unknown;
			return Array.isArray(parsed) ? parsed as SignalMemoryEntry[] : [];
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			new Notice(`Failed to load signal memory: ${message}`);
			return [];
		}
	}

	async saveSignals(entries: SignalMemoryEntry[]): Promise<void> {
		const adapter = this.app.vault.adapter;
		await adapter.write(this.filePath, JSON.stringify(entries, null, 2));
	}

	async markSignal(req: SignalMemoryMarkRequest): Promise<SignalMemoryEntry> {
		if (!req.signalKey?.trim() || !req.ruleId?.trim() || !req.path?.trim() || !SIGNAL_DECISIONS.has(req.decision)) {
			throw new Error('signalKey, ruleId, path, and valid decision are required');
		}
		const entries = await this.loadSignals();
		const filtered = entries.filter(e => e.signalKey !== req.signalKey);
		
		const updated: SignalMemoryEntry = {
			signalKey: req.signalKey,
			ruleId: req.ruleId,
			path: req.path,
			decision: req.decision,
			reason: req.reason,
			updatedAt: new Date().toISOString()
		};

		filtered.push(updated);
		await this.saveSignals(filtered);
		return updated;
	}

	async getStatus(): Promise<SignalMemoryStatusData> {
		const entries = await this.loadSignals();
		const countsByState: Record<SignalDecision, number> = {
			open: 0,
			accepted: 0,
			ignored: 0,
			resolved: 0
		};

		let staleOpenSignals = 0;
		let recentlyResolved = 0;
		const now = Date.now();
		const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
		const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

		for (const entry of entries) {
			countsByState[entry.decision] = (countsByState[entry.decision] || 0) + 1;
			
			const updatedAt = new Date(entry.updatedAt).getTime();
			if (entry.decision === 'open' && (now - updatedAt) > THIRTY_DAYS) {
				staleOpenSignals++;
			}
			if (entry.decision === 'resolved' && (now - updatedAt) < SEVEN_DAYS) {
				recentlyResolved++;
			}
		}

		return {
			countsByState,
			staleOpenSignals,
			recentlyResolved
		};
	}
}

export async function getSignals(app: App): Promise<SignalMemoryEntry[]> {
	const service = new SignalMemoryService(app);
	return await service.loadSignals();
}

export async function markSignal(app: App, req: SignalMemoryMarkRequest): Promise<SignalMemoryEntry> {
	const service = new SignalMemoryService(app);
	return await service.markSignal(req);
}

export async function getSignalStatus(app: App): Promise<SignalMemoryStatusData> {
	const service = new SignalMemoryService(app);
	return await service.getStatus();
}
