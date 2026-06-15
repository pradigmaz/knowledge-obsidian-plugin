import { describe, expect, it } from 'vitest';
import { markSignal } from '../../src/memory/signals';

function makeApp(initialData = '[]') {
  let data = initialData;
  return {
    vault: {
      adapter: {
        exists: async () => true,
        read: async () => data,
        write: async (_path: string, content: string) => {
          data = content;
        }
      }
    }
  } as any;
}

describe('signal memory', () => {
  it('rejects incomplete signal marks', async () => {
    await expect(markSignal(makeApp(), { signalKey: '', ruleId: 'r', path: 'N.md', decision: 'open' })).rejects.toThrow(
      'signalKey, ruleId, path, and valid decision are required'
    );
  });

  it('stores a valid signal mark', async () => {
    const out = await markSignal(makeApp(), { signalKey: 's1', ruleId: 'r', path: 'N.md', decision: 'open' });

    expect(out).toMatchObject({ signalKey: 's1', ruleId: 'r', path: 'N.md', decision: 'open' });
  });

  it('ignores non-array signal memory data', async () => {
    const out = await markSignal(makeApp('{"old":true}'), { signalKey: 's1', ruleId: 'r', path: 'N.md', decision: 'open' });

    expect(out).toMatchObject({ signalKey: 's1', ruleId: 'r', path: 'N.md', decision: 'open' });
  });
});
