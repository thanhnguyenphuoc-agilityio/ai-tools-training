import { describe, expect, it, vi } from 'vitest';
import { attachDeviceGroups, type AttachApi } from '../../src/ownerAttach';
import type { HistoryEntry } from '../../src/history';

const entry = (code: string): HistoryEntry => ({ code, name: `Group ${code}`, visitedAt: '2026-10-28T01:00:00.000Z' });

describe('attachDeviceGroups', () => {
  it('asks the server for each device group in order and returns the codes it attached', async () => {
    const calls: string[] = [];
    const api: AttachApi = {
      attachOwner: vi.fn(async (code: string) => {
        calls.push(code);
        return { ok: true as const, attached: code !== 'grp-2' };
      }),
    };

    const attached = await attachDeviceGroups(api, [entry('grp-1'), entry('grp-2'), entry('grp-3')]);

    expect(calls).toEqual(['grp-1', 'grp-2', 'grp-3']);
    expect(attached).toEqual(['grp-1', 'grp-3']);
  });

  it('ignores a failing group and still attaches the others', async () => {
    const api: AttachApi = {
      attachOwner: vi.fn(async (code: string) => {
        if (code === 'grp-fail') throw new Error('network');
        return { ok: true as const, attached: true };
      }),
    };

    const attached = await attachDeviceGroups(api, [entry('grp-fail'), entry('grp-ok')]);

    expect(api.attachOwner).toHaveBeenCalledTimes(2);
    expect(attached).toEqual(['grp-ok']);
  });

  it('makes no call for an empty history', async () => {
    const api: AttachApi = { attachOwner: vi.fn(async () => ({ ok: true as const, attached: true })) };

    expect(await attachDeviceGroups(api, [])).toEqual([]);
    expect(api.attachOwner).not.toHaveBeenCalled();
  });
});
