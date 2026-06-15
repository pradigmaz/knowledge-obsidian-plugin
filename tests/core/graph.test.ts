import { describe, expect, it } from 'vitest';
import { getAdjacencyList, graphStats, totalValues } from '../../src/core/graph';

describe('graph module', () => {
  it('totalValues calculates correct sum of record values', () => {
    const input: Record<string, number> = {
      a: 1,
      b: 2,
      c: 5
    };
    expect(totalValues(input)).toBe(8);
  });

  it('totalValues returns 0 for empty record', () => {
    expect(totalValues({})).toBe(0);
  });

  it('does not reuse graph stats across app instances', () => {
    const first = {
      metadataCache: { resolvedLinks: { 'A.md': { 'B.md': 1 } } }
    } as any;
    const second = {
      metadataCache: { resolvedLinks: { 'C.md': { 'D.md': 2 } } }
    } as any;

    expect(graphStats(first).links).toEqual({ 'A.md': 1 });
    expect(graphStats(second).links).toEqual({ 'C.md': 2 });
  });

  it('does not reuse adjacency across app instances', () => {
    const first = {
      metadataCache: { resolvedLinks: { 'A.md': { 'B.md': 1 } } }
    } as any;
    const second = {
      metadataCache: { resolvedLinks: { 'C.md': { 'D.md': 1 } } }
    } as any;

    expect(getAdjacencyList(first)).toEqual({ 'A.md': ['B.md'], 'B.md': ['A.md'] });
    expect(getAdjacencyList(second)).toEqual({ 'C.md': ['D.md'], 'D.md': ['C.md'] });
  });
});
