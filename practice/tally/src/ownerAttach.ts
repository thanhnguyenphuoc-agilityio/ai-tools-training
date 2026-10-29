import type { HistoryEntry } from './history';

export interface AttachApi {
  attachOwner: (code: string) => Promise<{ ok: true; attached: boolean }>;
}

/**
 * Asks the server to attach each group of the device history to the signed-in account, one after another.
 * A failure for one group (network, refusal, server error) is ignored so the others still run.
 * Returns the codes that were attached by this call.
 */
export async function attachDeviceGroups(api: AttachApi, history: readonly HistoryEntry[]): Promise<string[]> {
  const attached: string[] = [];
  for (const entry of history) {
    try {
      const res = await api.attachOwner(entry.code);
      if (res.attached) attached.push(entry.code);
    } catch {
      // Not owned here, no owner key on this device, or offline: skipped silently.
    }
  }
  return attached;
}
