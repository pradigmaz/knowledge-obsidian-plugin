import { App, TFile, FrontMatterCache, parseYaml } from 'obsidian';
import { HygieneViolation } from '../core/types';
import { checkRules, RuleContext } from './rules';
import { extractTags } from '../utils/tags';

export interface LintWriteRequest {
	path: string;
	content?: string;
}

export interface LintWriteResponse {
	valid: boolean;
	violations: HygieneViolation[];
}

function isFrontMatterCache(value: unknown): value is FrontMatterCache {
	return !!value && typeof value === 'object';
}

export async function lintWrite(app: App, req: LintWriteRequest): Promise<LintWriteResponse> {
	let frontmatter: FrontMatterCache | null = null;
	let tags: string[] = [];
	let contentLength = 0;
	
	// Default to optimistic values for new files
	let linksOut = 0;
	let backlinks = 0;
	let unresolvedLinksOut = 0;
	let isDuplicateTitle = false;
	const mtime = Date.now();
	const now = Date.now();
	const roles: string[] = [];

	const abstractFile = app.vault.getAbstractFileByPath(req.path);
	const file = abstractFile instanceof TFile ? abstractFile : null;
	
	if (req.content !== undefined) {
		// IN-MEMORY DRY RUN (for new files or full overwrites)
		contentLength = req.content.length;
		
		// Parse frontmatter
		const match = req.content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (match && match[1]) {
			try {
				const parsed: unknown = parseYaml(match[1]);
				if (isFrontMatterCache(parsed)) {
					frontmatter = parsed;
				}
			} catch {
				// Invalid YAML.
			}
		}
		
		tags = extractTags(null, frontmatter);
		
		// Heuristics for roles based on new content
		if (frontmatter?.status) roles.push('project');
		if (req.path.includes('Daily') || req.path.includes('Journal')) roles.push('daily');
		
	} else {
		// ON-DISK VALIDATION (for patch / append)
		if (!file) {
			throw new Error(`File not found: ${req.path}`);
		}
		
		contentLength = file.stat.size;
		const cache = app.metadataCache.getFileCache(file);
		frontmatter = cache?.frontmatter || null;
		tags = extractTags(cache, frontmatter);
		
		const unres = app.metadataCache.unresolvedLinks[file.path];
		unresolvedLinksOut = unres ? Object.keys(unres).length : 0;
		
		if (frontmatter?.status) roles.push('project');
		if (file.path.includes('Daily') || file.path.includes('Journal')) roles.push('daily');
	}

	const basename = req.path.split('/').pop()?.replace('.md', '') || 'unknown';

	// Duplicate title check (heuristic)
	if (!file) {
		const files = app.vault.getMarkdownFiles();
		isDuplicateTitle = files.some(f => f.basename === basename && f.path !== req.path);
	}

	const ctx: RuleContext = {
		app,
		file,
		path: req.path,
		frontmatter,
		tags,
		contentLength,
		linksOut,
		backlinks,
		unresolvedLinksOut,
		mtime,
		now,
		roles,
		isDuplicateTitle
	};

	const violations = checkRules(ctx);
	const highViolations = violations.filter(v => v.severity === 'high');

	return {
		valid: highViolations.length === 0,
		violations: highViolations
	};
}
