import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedOnboarded } from './helpers';

/**
 * THE SHELL HANDSHAKE, END TO END — a fake `window.ForgeShell` planted before the app boots,
 * driving the REAL bridge in the REAL build through the whole v1 conversation:
 *
 *   page: bridge/hello  →  (we ack with the frozen helloAck fixture)
 *   page: health/requestSync  →  (we push the frozen batch-quantity fixture)
 *   page: health/ackBatch  +  `fitforge.health.v1` holds the batch's points
 *
 * The native side is simulated with the SAME fixtures the Swift DecodingTests decode, so this
 * spec proves the two halves speak one wire format, not merely that the web half is
 * self-consistent. Detection is the GLOBAL (contract law): no user-agent tricks anywhere.
 */

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/forgebridge',
);
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));

/** Envelope traffic the fake shell captured, page→native order preserved. */
type SentEnvelope = { v: number; id: string; type: string; payload: Record<string, unknown> };

declare global {
  interface Window {
    __shellSent: SentEnvelope[];
  }
}

async function sentTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__shellSent.map((e) => e.type));
}

async function sentOfType(page: Page, type: string): Promise<SentEnvelope[]> {
  return page.evaluate((t) => window.__shellSent.filter((e) => e.type === t), type);
}

/** Deliver a native→page envelope exactly the way the shell does: through ForgeShell._receive. */
async function receiveFromNative(page: Page, envelope: unknown): Promise<void> {
  await page.evaluate((env) => {
    (window as unknown as { ForgeShell: { _receive: (raw: unknown) => void } }).ForgeShell._receive(env);
  }, envelope);
}

test.beforeEach(async ({ page }) => {
  // Before ANY app script: the shell injects ForgeShell + the webkit message handler at
  // documentStart, and the bridge's whole detection story is that global already existing.
  await page.addInitScript(() => {
    window.__shellSent = [];
    (window as unknown as { ForgeShell: object }).ForgeShell = {};
    (window as unknown as { webkit: object }).webkit = {
      messageHandlers: {
        forgebridge: {
          postMessage: (envelope: SentEnvelope) => {
            window.__shellSent.push(envelope);
          },
        },
      },
    };
  });
});

test('hello → helloAck → requestSync → batch → ackBatch, with the store populated', async ({
  page,
}) => {
  await seedOnboarded(page);

  // 1. The page said hello, unprompted — native pushes NOTHING before this.
  await expect.poll(() => sentTypes(page)).toContain('bridge/hello');
  const hello = (await sentOfType(page, 'bridge/hello'))[0]!;
  expect(hello.v).toBe(1);
  expect(hello.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  expect(hello.payload).toEqual({ pageBridgeVersion: 1 });

  // 2. Native acks with the 'health' capability → the page must ask to sync, telling native
  //    what it already has (a fresh store: every mark null, the cue for the 90-day backfill).
  await receiveFromNative(page, fixture('helloAck'));
  await expect.poll(() => sentTypes(page)).toContain('health/requestSync');
  const sync = (await sentOfType(page, 'health/requestSync'))[0]!;
  const haveUpTo = sync.payload.haveUpTo as Record<string, string | null>;
  expect(haveUpTo.restingHeartRate).toBeNull();
  expect(haveUpTo.sleep).toBeNull();

  // 3. Native streams a quantity batch (the frozen fixture) → ingest, then ack BY batchId.
  await receiveFromNative(page, fixture('batch-quantity'));
  await expect
    .poll(async () => (await sentOfType(page, 'health/ackBatch')).map((e) => e.payload.batchId))
    .toContain('b-0001');

  // 4. The batch landed in `fitforge.health.v1` exactly as sent — the store the selectors read.
  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem('fitforge.health.v1');
    return raw ? (JSON.parse(raw) as { daily: Record<string, unknown[]> }) : null;
  });
  expect(stored).not.toBeNull();
  expect(stored!.daily.restingHeartRate).toEqual([
    { date: '2026-07-29', value: 51, unit: 'count/min' },
    { date: '2026-07-30', value: 54, unit: 'count/min' },
  ]);

  // 5. A sample batch (sleep) lands by the same path, keyed by hkUuid.
  await receiveFromNative(page, fixture('batch-samples'));
  await expect
    .poll(async () => (await sentOfType(page, 'health/ackBatch')).map((e) => e.payload.batchId))
    .toContain('b-0002');
  const sleep = await page.evaluate(() => {
    const raw = window.localStorage.getItem('fitforge.health.v1');
    const parsed = raw ? (JSON.parse(raw) as { samples: { sleep?: Array<{ hkUuid: string }> } }) : null;
    return parsed?.samples.sleep ?? [];
  });
  expect(sleep).toHaveLength(1);
  expect(sleep[0]!.hkUuid).toBe('11111111-2222-4333-8444-555555555555');

  // 6. Idempotency over the wire: native re-sends the un-acked-in-its-view batch; the store
  //    must not double a single day of history.
  await receiveFromNative(page, fixture('batch-quantity'));
  const rhrCount = await page.evaluate(() => {
    const raw = window.localStorage.getItem('fitforge.health.v1');
    const parsed = raw ? (JSON.parse(raw) as { daily: { restingHeartRate?: unknown[] } }) : null;
    return parsed?.daily.restingHeartRate?.length ?? 0;
  });
  expect(rhrCount).toBe(2);
});
