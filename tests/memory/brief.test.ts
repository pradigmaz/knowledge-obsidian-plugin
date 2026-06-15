import { describe, expect, it } from 'vitest';
import { buildBrief } from '../../src/memory/brief';

function appFor(path: string, tags: string[]) {
  const file = { path, basename: path.replace(/\.md$/, ''), parent: { path: '/' }, stat: { mtime: 1, size: 10 } };
  const source = { path: 'Source.md', basename: 'Source', parent: { path: '/' }, stat: { mtime: 0, size: 10 } };
  return {
    vault: {
      getName: () => 'vault',
      getMarkdownFiles: () => [file, source],
      getFiles: () => [file, source]
    },
    metadataCache: {
      resolvedLinks: { 'Source.md': { [path]: 2 } },
      unresolvedLinks: {},
      getFileCache: (f: { path: string }) => ({ frontmatter: { tags: f.path === path ? tags : [] } })
    }
  } as any;
}

describe('buildBrief', () => {
  it('does not reuse a previous app brief', () => {
    expect(buildBrief(appFor('A.md', ['alpha'])).recentNotes[0]).toBe('A.md');
    expect(buildBrief(appFor('B.md', ['beta'])).recentNotes[0]).toBe('B.md');
  });

  it('counts frontmatter tags and project notes', () => {
    const brief = buildBrief(appFor('Project.md', ['project']));

    expect(brief.topTags).toEqual([{ tag: 'project', count: 1 }]);
    expect(brief.projectNotes).toEqual(['Project.md']);
    expect(brief.backlinkHubs).toEqual([{ path: 'Project.md', backlinks: 2 }]);
  });
});
