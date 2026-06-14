import { describe, expect, it } from 'vitest';
import { totalValues } from '../../src/core/graph';

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
});
