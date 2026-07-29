'use client';

/**
 * CLOUD SYNC of the Local Mode bundle.
 *
 * ─── what is stored ─────────────────────────────────────────────────────────────────────────
 * Exactly the bytes Settings → Export data already produces: `exportAllState()` serialises the
 * demo state, the full workout log and every ancillary `fitforge.*` cache, and `importAllState()`
 * validates the lot before writing a single key. Reusing that pair rather than inventing a
 * Firestore schema means the cloud copy is a BACKUP FILE — restorable by hand, inspectable, and
 * already covered by the shape validation that exists because localStorage is user-writable. A
 * hostile document from the network gets the same treatment as a hostile file from disk.
 *
 * ─── the conflict rule, stated plainly ──────────────────────────────────────────────────────
 * One document per user, last-write-wins, with one guard that matters: this device only ADOPTS
 * the cloud copy when the cloud is genuinely newer than what this device last pushed, or when
 * this browser has no training data of its own. Anything else pushes. That deliberately favours
 * "the data in front of you", because the failure people cannot forgive is opening the app after
 * a workout and finding the sets gone.
 *
 * ─── it is never load-bearing ───────────────────────────────────────────────────────────────
 * Every function resolves to a status and never throws. Offline, rules misconfigured, quota
 * exhausted — the app keeps working exactly as it does with no account at all, because the
 * localStorage copy remains the one the UI reads. Sync is a convenience laid on top, not the
 * source of truth.
 */
import { exportAllState, importAllState, isOnboarded, subscribe } from '@/lib/demo/store';
import { subscribeWorkoutLog } from '@/components/features/shared/workoutLog';
import { isAuthConfigured, getDb } from './firebase';

/** When this device last pushed, so "is the cloud newer than us?" has an answer. */
const LAST_PUSH_KEY = 'fitforge.cloudPushedAt.v1';
/**
 * Firestore's hard limit is 1 MiB per document. Stopping short of it with a real message beats a
 * write that fails at the edge every few seconds for a user who cannot see why.
 */
const MAX_BYTES = 900_000;

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced'; at: number; direction: 'push' | 'pull' | 'none' }
  | { state: 'error'; detail: string };

let status: SyncStatus = { state: 'idle' };
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  status = next;
  for (const l of listeners) l();
}

export function subscribeSync(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getSyncStatus(): SyncStatus {
  return status;
}

/**
 * HAS THE FIRST RECONCILE FINISHED FOR THIS SESSION?
 *
 * Distinct from `SyncStatus`, which describes the last transfer. This answers a different and
 * more consequential question: "may the app act on what is currently in localStorage yet?"
 *
 * It exists because the answer was previously assumed to be yes, always. A signed-in user opening
 * FitForge on a new device has an empty local store for the second or two it takes to fetch their
 * account — and the app read that empty store, concluded they were a new user, and marched them
 * into onboarding while their real plan was in flight. Anything that branches on "does this
 * browser have training data" must wait for `'done'` first.
 *
 *   idle      — nobody is signed in, or the reconcile has not started.
 *   restoring — a reconcile is in flight; local state is not yet trustworthy for routing.
 *   done      — settled, either way. NOT a claim that it succeeded: a failed restore still has to
 *               release the app, or a Firestore outage would trap everyone on a spinner.
 */
export type RestorePhase = 'idle' | 'restoring' | 'done';

export interface RestoreState {
  phase: RestorePhase;
  /**
   * A cloud document was successfully imported into this browser during this session.
   *
   * Deliberately NOT the same question as "does the store have a finished plan". Onboarding writes
   * `completedAt` on the plan-preview screen, while the user is still reviewing what was built for
   * them — so anything that treats a finished-looking store as "onboarding is over" throws them
   * out of the wizard one screen early. (That is not hypothetical: it is what the first version of
   * this did, and the onboarding walk failed immediately.) This flag flips only when data actually
   * arrived from the account, which is the event worth reacting to.
   */
  pulled: boolean;
}

let restoreState: RestoreState = { phase: 'idle', pulled: false };
const restoreListeners = new Set<() => void>();

function patchRestore(next: Partial<RestoreState>) {
  restoreState = { ...restoreState, ...next };
  for (const l of restoreListeners) l();
}

export function subscribeRestore(l: () => void): () => void {
  restoreListeners.add(l);
  return () => restoreListeners.delete(l);
}
export function getRestoreState(): RestoreState {
  return restoreState;
}

function lastPushedAt(): number {
  try {
    return Number(window.localStorage.getItem(LAST_PUSH_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function markPushed(at: number) {
  try {
    window.localStorage.setItem(LAST_PUSH_KEY, String(at));
  } catch {
    /* private mode — sync still works, it just re-pulls more eagerly */
  }
}

/** The bundle, compacted. `exportAllState` pretty-prints for humans; the wire does not need it. */
function bundleForCloud(): string {
  return JSON.stringify(JSON.parse(exportAllState()));
}

async function docRefFor(uid: string) {
  const db = await getDb();
  if (!db) return null;
  const { doc } = await import('firebase/firestore');
  return doc(db, 'users', uid);
}

/** Upload this device's state. Resolves false when it could not be written. */
export async function pushToCloud(uid: string): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  try {
    const ref = await docRefFor(uid);
    if (!ref) return false;
    const bundle = bundleForCloud();
    if (bundle.length > MAX_BYTES) {
      setStatus({
        state: 'error',
        detail: 'Your training history is too large to sync. Export a backup from Settings.',
      });
      return false;
    }
    const { setDoc } = await import('firebase/firestore');
    const at = Date.now();
    await setDoc(ref, { bundle, updatedAt: at, schema: 2 });
    markPushed(at);
    setStatus({ state: 'synced', at, direction: 'push' });
    return true;
  } catch (err) {
    setStatus({ state: 'error', detail: describe(err) });
    return false;
  }
}

/** Adopt the cloud copy. Resolves false when there was nothing to adopt or it would not validate. */
export async function pullFromCloud(uid: string): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  try {
    const ref = await docRefFor(uid);
    if (!ref) return false;
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() as { bundle?: unknown; updatedAt?: unknown }) : null;
    if (!data || typeof data.bundle !== 'string') return false;

    // The SAME validator the file importer uses. A document that fails it is left alone rather
    // than partially applied — a half-restored account is worse than an un-restored one.
    const result = importAllState(data.bundle);
    if (!result.ok) {
      setStatus({ state: 'error', detail: `Cloud copy could not be read: ${result.error}` });
      return false;
    }
    const at = typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();
    markPushed(at);
    setStatus({ state: 'synced', at, direction: 'pull' });
    // The account's data is now in this browser. Anything still showing a "you look new" flow —
    // onboarding, most obviously — should stand down.
    patchRestore({ pulled: true });
    return true;
  } catch (err) {
    setStatus({ state: 'error', detail: describe(err) });
    return false;
  }
}

/**
 * Reconcile once, at sign-in. See the conflict rule in the file header.
 */
export async function syncOnSignIn(uid: string): Promise<void> {
  if (!isAuthConfigured()) return;
  setStatus({ state: 'syncing' });
  patchRestore({ phase: 'restoring' });
  try {
    const ref = await docRefFor(uid);
    if (!ref) return setStatus({ state: 'idle' });
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // First sign-in on this account: this device's data becomes the account's data.
      await pushToCloud(uid);
      return;
    }

    const data = snap.data() as { updatedAt?: unknown };
    const cloudAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
    // A browser with no finished onboarding has nothing to lose and everything to gain — this is
    // the new-device case, and it is the one where pulling is unambiguously right.
    const localIsEmpty = !isOnboarded();
    if (localIsEmpty || cloudAt > lastPushedAt()) await pullFromCloud(uid);
    else await pushToCloud(uid);
  } catch (err) {
    setStatus({ state: 'error', detail: describe(err) });
  } finally {
    // ALWAYS, including on failure. The routing gate waits on this, so leaving it unset on an
    // error path would strand a signed-in user on a loading screen forever.
    patchRestore({ phase: 'done' });
  }
}

/**
 * Mirror local changes up, debounced.
 *
 * DEBOUNCED HARD (4s) because the store notifies on every keystroke-ish edit — a set logged, a
 * weight nudged — and Firestore's free tier is metered in document WRITES. A workout is hundreds
 * of state changes and should cost a handful of writes, not hundreds.
 */
export function startCloudMirror(uid: string): () => void {
  if (!isAuthConfigured()) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pushToCloud(uid), 4000);
  };
  // BOTH STORES. The plan, profile and preferences live in the demo store; finished workouts live
  // in a separate one with its own listeners. Watching only the first meant a logged session was
  // uploaded solely by luck — whenever some unrelated edit happened to fire afterwards — which is
  // indistinguishable from "my workouts are not being saved", because most of the time they were
  // not. `exportAllState` always included the log; nothing was ever asking for it to be sent.
  const unsubscribes = [subscribe(schedule), subscribeWorkoutLog(schedule)];
  return () => {
    if (timer) clearTimeout(timer);
    for (const off of unsubscribes) off();
  };
}

function describe(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === 'permission-denied')
    return 'Firestore rules rejected the write — see docs/FIREBASE-SETUP.md.';
  if (code === 'unavailable') return 'Offline — your data is safe in this browser and will sync later.';
  return String((err as { message?: string }).message ?? err).slice(0, 140);
}
