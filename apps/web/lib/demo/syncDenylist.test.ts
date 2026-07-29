import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * THE SYNC DENYLIST, tested at its seam (compliance phase 1).
 *
 * This was briefly an e2e test that sniffed Firestore request bodies — which cannot work: with
 * the network blocked, the SDK queues mutations and the bundle payload never crosses the wire at
 * all, so the spec was asserting on a transport detail rather than on the code that decides what
 * syncs. The decision lives in `exportAllState({ forSync })`, so that is what gets tested: the
 * SAME function the cloud mirror serialises (`bundleForCloud` passes forSync: true) and the SAME
 * function the Settings file-export calls without it.
 */

// A minimal browser shim, installed BEFORE the store module loads (it feature-detects `window`).
const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
  },
};

const { exportAllState } = await import('./store');

test('health/cycle/readiness keys ride the FILE export but never the SYNC bundle', () => {
  storage.set('fitforge.health.v1', JSON.stringify({ days: { d1: 1 } }));
  storage.set('fitforge.cycle.v1', JSON.stringify({ optIn: false }));
  storage.set('fitforge.readiness.v1', JSON.stringify({ version: 1, entries: [] }));
  storage.set('fitforge.spectest.v1', JSON.stringify({ ok: true }));

  const fileBackup = JSON.parse(exportAllState()) as { extras: Record<string, string> };
  const syncBundle = JSON.parse(exportAllState({ forSync: true })) as {
    extras: Record<string, string>;
  };

  // The deliberate file export keeps everything — that action IS the consent, and a backup that
  // silently dropped health days would be lying about being a backup.
  for (const key of [
    'fitforge.health.v1',
    'fitforge.cycle.v1',
    'fitforge.readiness.v1',
    'fitforge.spectest.v1',
  ]) {
    assert.ok(fileBackup.extras[key], `file backup carries ${key}`);
  }

  // The automatic sweep must never carry the health-adjacent keys — and must still carry
  // ordinary caches, or the denylist would be an accidental sync outage.
  assert.ok(syncBundle.extras['fitforge.spectest.v1'], 'ordinary extras still sync');
  for (const key of ['fitforge.health.v1', 'fitforge.cycle.v1', 'fitforge.readiness.v1']) {
    assert.equal(syncBundle.extras[key], undefined, `${key} must never ride the sweep`);
  }
});
