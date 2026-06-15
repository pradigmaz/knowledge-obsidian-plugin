import { describe, expect, it } from 'vitest';
import { buildBrief } from '../../src/memory/brief';

function appFor(path: string, tags: string[]) {
  const file = { path, basename: path.replace(/\.md$/, ''), parent: { path: '/' }, stat: { mtime: 1, size: 10 } };
  return {
    vault: {
      getName: () => 'vault',
      getMarkdownFiles: () => [file],
      getFiles: () => [file]
    },
    metadataCache: {
      resolvedLinks: {},
      unresolvedLinks: {},
      getFileCache: () => ({ frontmatter: { tags } })
    }
  } as any;
}

describe('buildBrief', () => {
  it('does not reuse a previous app brief', () => {
    expect(buildBrief(appFor('A.md', ['alpha'])).recentNotes).toEqual(['A.md']);
    expect(buildBrief(appFor('B.md', ['beta'])).recentNotes).toEqual(['B.md']);
  });

  it('counts frontmatter tags and project notes', () => {
    const brief = buildBrief(appFor('Project.md', ['project']));

    expect(brief.topTags).toEqual([{ tag: 'project', count: 1 }]);
    expect(brief.projectNotes).toEqual(['Project.md']);
  });
});
