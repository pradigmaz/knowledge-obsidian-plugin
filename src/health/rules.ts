import { App, TFile, FrontMatterCache } from 'obsidian';
import { HygieneViolation } from '../core/types';

const getStringProp = (fm: FrontMatterCache | null, key: string): string => {
	return typeof fm?.[key] === 'string' ? fm[key].trim() : '';
};

const getProp = (fm: FrontMatterCache | null, key: string): unknown => fm?.[key];

export interface RuleContext {
	app: App;
	file: TFile | null;
	path: string;
	frontmatter: FrontMatterCache | null;
	tags: string[];
	contentLength: number;
	linksOut: number;
	backlinks: number;
	unresolvedLinksOut: number;
	mtime: number;
	now: number;
	roles: string[];
	isDuplicateTitle: boolean;
}

export function checkRules(ctx: RuleContext): HygieneViolation[] {
	const violations: HygieneViolation[] = [];
	
	// rule: isolated_note
	if (ctx.linksOut === 0 && ctx.backlinks === 0 && ctx.roles.length === 0) {
		violations.push({
			ruleId: 'isolated_note',
			severity: 'warn',
			evidence: 'Note has 0 outgoing links and 0 backlinks.',
			suggestedStep: 'Link this note to an index/MOC or a related concept.',
			expectedEffortMin: 2
		});
	}

	// rule: unresolved_links
	if (ctx.unresolvedLinksOut > 0) {
		violations.push({
			ruleId: 'unresolved_links',
			severity: 'info',
			evidence: `Note contains ${ctx.unresolvedLinksOut} unresolved (missing) link(s).`,
			suggestedStep: 'Create the missing notes or remove the brackets.',
			expectedEffortMin: ctx.unresolvedLinksOut * 2
		});
	}

	// rule: missing_tags
	const hasTags = ctx.tags.length > 0;
	if (!hasTags && ctx.roles.length === 0) {
		violations.push({
			ruleId: 'missing_tags',
			severity: 'info',
			evidence: 'Note has no tags defined in frontmatter.',
			suggestedStep: 'Add relevant tags to improve discoverability.',
			expectedEffortMin: 1
		});
	}

	// rule: missing_okf & missing_props
	const hasOkfType = getStringProp(ctx.frontmatter, 'type') !== '';
	if (!hasOkfType) {
		violations.push({
			ruleId: 'missing_okf',
			severity: 'high',
			evidence: 'Note is missing the mandatory OKF "type" property in its frontmatter.',
			suggestedStep: 'Add "type: concept" (or another valid OKF type) to the YAML frontmatter.',
			expectedEffortMin: 1
		});
	} else {
		const hasTitle = getStringProp(ctx.frontmatter, 'title') !== '';
		const hasDescription = getStringProp(ctx.frontmatter, 'description') !== '' || getStringProp(ctx.frontmatter, 'summary') !== '';
		if (!hasTitle || !hasDescription) {
			violations.push({
				ruleId: 'missing_props',
				severity: 'warn',
				evidence: 'OKF note is missing recommended title or description metadata.',
				suggestedStep: 'Add title and description. Existing summary metadata is accepted as a legacy description alias.',
				expectedEffortMin: 2
			});
		}
	}

	const isProjectOrHub = ctx.roles.includes('project') || ctx.roles.includes('hub');
	if (isProjectOrHub) {
		const hasStatus = getProp(ctx.frontmatter, 'status');
		if (!hasStatus) {
			violations.push({
				ruleId: 'missing_props',
				severity: 'warn',
				evidence: 'Hub or Project note is missing a "status" property.',
				suggestedStep: 'Add a status property (e.g., "active", "archived").',
				expectedEffortMin: 1
			});
		}
	}

	// rule: oversized
	if (ctx.contentLength > 50000) {
		violations.push({
			ruleId: 'oversized',
			severity: 'high',
			evidence: `Note is very large (${Math.round(ctx.contentLength / 1024)} KB).`,
			suggestedStep: 'Refactor into smaller, focused atomic notes and link them.',
			expectedEffortMin: 15
		});
	}

	// rule: empty
	if (ctx.contentLength < 10) {
		violations.push({
			ruleId: 'empty',
			severity: 'warn',
			evidence: 'Note is empty or nearly empty.',
			suggestedStep: 'Flesh out the concept or delete the file if no longer needed.',
			expectedEffortMin: 5
		});
	}

	// rule: stale_hub
	if (ctx.roles.includes('hub')) {
		const daysSinceModified = (ctx.now - ctx.mtime) / (1000 * 60 * 60 * 24);
		if (daysSinceModified > 90) {
			violations.push({
				ruleId: 'stale_hub',
				severity: 'warn',
				evidence: `Hub note hasn't been updated in ${Math.round(daysSinceModified)} days.`,
				suggestedStep: 'Review the hub to ensure its links and structure are still relevant.',
				expectedEffortMin: 5
			});
		}
	}

	// rule: duplicate_title
	if (ctx.isDuplicateTitle) {
		violations.push({
			ruleId: 'duplicate_title',
			severity: 'high',
			evidence: 'Note shares its title (basename) with another note in a different folder.',
			suggestedStep: 'Rename one of the notes to ensure unambiguous linking.',
			expectedEffortMin: 3
		});
	}

	// rule: arch_violation_layering
	const currentStatus = getProp(ctx.frontmatter, 'status');
	if (currentStatus === 'archived' || currentStatus === 'archive') {
		const resolved = ctx.app.metadataCache.resolvedLinks[ctx.path];
		if (resolved) {
			let activeLinksCount = 0;
			for (const targetPath in resolved) {
				const targetFile = ctx.app.vault.getAbstractFileByPath(targetPath);
				if (targetFile && targetFile instanceof TFile) {
					const targetCache = ctx.app.metadataCache.getFileCache(targetFile);
					const targetStatus = getProp(targetCache?.frontmatter ?? null, 'status');
					if (targetStatus === 'active') {
						activeLinksCount++;
					}
				}
			}
			if (activeLinksCount > 0) {
				violations.push({
					ruleId: 'arch_violation_layering',
					severity: 'high',
					evidence: `Archived note contains ${activeLinksCount} link(s) to active projects/notes.`,
					suggestedStep: 'Remove links to active notes from archived notes to preserve layer separation.',
					expectedEffortMin: 5
				});
			}
		}
	}

	return violations;
}
