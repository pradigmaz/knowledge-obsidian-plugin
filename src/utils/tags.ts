import { CachedMetadata, FrontMatterCache } from 'obsidian';

/**
 * Extracts and normalizes all tags from Obsidian cache.
 * Returns an array of unique tags with the '#' prefix removed.
 */
export function extractTags(cache: CachedMetadata | null, frontmatter?: FrontMatterCache | null): string[] {
	const tagSet = new Set<string>();

	if (cache?.tags) {
		for (const t of cache.tags) {
			const tag = t.tag.replace(/^#/, '');
			if (tag) tagSet.add(tag);
		}
	}

	const fm = frontmatter || cache?.frontmatter;
	if (fm?.tags) {
		const fmTags = Array.isArray(fm.tags) ? fm.tags : [fm.tags];
		for (const t of fmTags) {
			if (typeof t === 'string' && t) tagSet.add(t.replace(/^#/, ''));
		}
	} else if (fm?.tag) {
		if (typeof fm.tag === 'string' && fm.tag) tagSet.add(fm.tag.replace(/^#/, ''));
	}

	return Array.from(tagSet);
}
