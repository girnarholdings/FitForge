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
 * One document per user, last-write-wins, with two guards that matter.
 *
 *   1. This device only ADOPTS the cloud copy when the cloud is genuinely newer than what this
 *      device last pushed, or when this browser has no training data of its own. Anything else
 *      pushes. That deliberately favours "the data in front of you", because the failure people
 *      cannot forgive is opening the app after a workout and finding the sets gone.
 *
 *   2. When both sides hold real training and this browser has never pushed to THIS account, no
 *      timestamp is a fair tie-break — the two histories are unrelated. Sync stops and ASKS
 *      (merge / take the account's copy / keep this device's), writing nothing to either side
 *      until it is answered. See {@link SyncConflict}.
 *
 * ─── it is never load-bearing ───────────────────────────────────────────────────────────────
 * Every function resolves to a status and never throws. Offline, rules misconfigured, quota
 * exhausted — the app keeps working exactly as it does with no account at all, because the
 * localStorage copy remains the one the UI reads. Sync is a convenience laid on top, not the
 * source of truth.
 */
import {
  exportAllState,
  importAllState,
  inspectBackup,
  isOnboarded,
  localSummary,
  subscribe,
  type BackupSummary,
  type ImportMode,
} from '@/lib/demo/store';
import { subscribeWorkoutLog } from '@/components/features/shared/workoutLog';
import { decideReconcile, mayPushToCloud } from './reconcileRule';
import { isAuthConfigured, getDb } from './firebase';

/** When this device last pushed, so "is the cloud newer than us?" has an answer. */
const LAST_PUSH_KEY = 'fitforge.cloudPushedAt.v1';
/**
 * WHOSE account that push went to. Without it, a browser that had synced with one account looked
 * identical to one that had synced with the account now signing in — so a second athlete signing
 * in on a shared device (or an athlete signing in after restoring someone else's export) inherited
 * a sync history it never had, and the reconcile silently picked a winner. Both keys are excluded
 * from backups and from the cloud bundle: they describe this device, not the training.
 */
const LAST_PUSH_UID_KEY = 'fitforge.cloudPushedUid.v1';
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
function lastPushedUid(): string | null {
  try {
    return window.localStorage.getItem(LAST_PUSH_UID_KEY);
  } catch {
    return null;
  }
}
function markPushed(at: number, uid: string) {
  try {
    window.localStorage.setItem(LAST_PUSH_KEY, String(at));
    window.localStorage.setItem(LAST_PUSH_UID_KEY, uid);
  } catch {
    /* private mode — sync still works, it just re-pulls more eagerly */
  }
}

/** The bundle, compacted. `exportAllState` pretty-prints for humans; the wire does not need it.
 *  `forSync` applies the health/cycle/readiness denylist — those keys only leave the device via a
 *  deliberate file export, never the automatic sweep. */
function bundleForCloud(): string {
  return JSON.stringify(JSON.parse(exportAllState({ forSync: true })));
}

async function docRefFor(uid: string) {
  const db = await getDb();
  if (!db) return null;
  const { doc } = await import('firebase/firestore');
  return doc(db, 'users', uid);
}

/**
 * Latch set by {@link eraseCloudCopy}: after a deliberate erasure, NO code path may write the
 * account document again this session — most importantly the debounced mirror, whose pending
 * 4-second timer would otherwise quietly re-create the doc the user just asked us to destroy.
 * Cleared on the next {@link syncOnSignIn}, i.e. the next deliberate sign-in.
 */
let cloudWritesDisabled = false;

/**
 * HAS THIS SESSION EVER SUCCESSFULLY READ THE ACCOUNT?
 *
 * Uploading is only safe once we know what we would be replacing. When `syncOnSignIn` could not
 * read `users/{uid}` — a transient Firestore failure, an offline moment during sign-in, rules
 * briefly rejecting the read — the old code still released the app (correctly: nobody may be
 * trapped on a spinner) and then started the mirror. Four seconds later this device's state, which
 * on a new device is EMPTY, replaced the athlete's entire training history in the cloud. One
 * network wobble, everything gone, nothing on screen about it.
 *
 * So pushes are latched off until a read succeeds. The local copy is untouched and the UI is
 * unaffected; the only thing withheld is the authority to overwrite an account we have not seen.
 */
let cloudReadOk = false;
/** Guards the deferred reconcile in {@link pushToCloud} against a burst of mirror pushes. */
let reconcileInFlight = false;

/* ═══════════════════════════════════════════════════ the sign-in conflict prompt ══════════════
 *
 * Two sets of real training and one account: this browser's, and the one already in the account.
 * The old rule resolved that by timestamp and told nobody. It is the same irreversible decision
 * the file importer used to make, and it deserves the same treatment — show both, then ask.
 *
 * While a conflict is unanswered NOTHING is written on either side: the cloud document stays as it
 * is (the mirror is latched off) and this browser keeps showing its own data, which is the copy the
 * athlete can see and would miss.
 */
export interface SyncConflict {
  uid: string;
  /** the cloud bundle, held verbatim so whichever choice is made reads the same bytes */
  bundle: string;
  cloudAt: number;
  cloud: BackupSummary;
  local: BackupSummary;
}

/** How to settle it: fold both together, take the account's copy, or keep this device's. */
export type ConflictResolution = 'merge' | 'cloud' | 'local';

let conflict: SyncConflict | null = null;
const conflictListeners = new Set<() => void>();

export function subscribeConflict(l: () => void): () => void {
  conflictListeners.add(l);
  return () => conflictListeners.delete(l);
}
export function getSyncConflict(): SyncConflict | null {
  return conflict;
}
function setConflict(next: SyncConflict | null) {
  conflict = next;
  for (const l of conflictListeners) l();
}

/**
 * Apply the athlete's answer. Every branch ends with the two sides agreeing and the marker
 * recorded, so the next sign-in on this device is an ordinary silent reconcile.
 */
export async function resolveSyncConflict(choice: ConflictResolution): Promise<boolean> {
  const pending = conflict;
  if (!pending) return false;
  setStatus({ state: 'syncing' });

  if (choice !== 'local') {
    const mode: ImportMode = choice === 'merge' ? 'merge' : 'overwrite';
    const result = importAllState(pending.bundle, mode);
    if (!result.ok) {
      setStatus({ state: 'error', detail: `Cloud copy could not be read: ${result.error}` });
      return false;
    }
    patchRestore({ pulled: true });
  }

  // Clearing the conflict un-latches pushes — so it happens BEFORE the upload, and after the
  // import, which means the bytes going up are the post-decision state in every branch.
  setConflict(null);
  if (choice === 'cloud') {
    // Nothing changed relative to the account, so record agreement instead of re-uploading it.
    markPushed(pending.cloudAt, pending.uid);
    setStatus({ state: 'synced', at: pending.cloudAt, direction: 'pull' });
    return true;
  }
  return pushToCloud(pending.uid);
}

/** Upload this device's state. Resolves false when it could not be written. */
export async function pushToCloud(uid: string): Promise<boolean> {
  // An unanswered conflict blocks every upload, the debounced mirror included: its 4-second timer
  // would otherwise overwrite the account copy the athlete is still being asked about.
  if (
    !mayPushToCloud({
      configured: isAuthConfigured(),
      erased: cloudWritesDisabled,
      conflictPending: conflict !== null,
      // Handled below rather than here: an unread account is a reason to GO AND READ IT, not a
      // reason to give up for the session.
      readOk: true,
    })
  )
    return false;

  /**
   * NEVER SEEN THIS ACCOUNT? RECONCILE — DO NOT OVERWRITE.
   *
   * A failed sign-in read must not mute this device for the rest of the session; someone briefly
   * offline at the wrong moment would silently stop syncing until they thought to reload. What it
   * means is that the decision was never made, so make it now: {@link syncOnSignIn} reads the
   * account, applies the same pull/push/ask rule as always, and earns the right to write if the
   * read lands. If it fails again there is still nothing to safely overwrite with, so nothing is
   * written — which is the whole point.
   *
   * `reconcileInFlight` keeps a burst of mirror pushes from stacking reconciles. The recursion
   * terminates either way: a successful reconcile sets `cloudReadOk`, a failed one leaves it false
   * and the next call returns here.
   */
  if (!cloudReadOk) {
    if (reconcileInFlight) return false;
    await syncOnSignIn(uid);
    // That call already pushed or pulled as the rule required; this one's work is done.
    return cloudReadOk;
  }
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
    markPushed(at, uid);
    setStatus({ state: 'synced', at, direction: 'push' });
    return true;
  } catch (err) {
    setStatus({ state: 'error', detail: describe(err) });
    return false;
  }
}

/**
 * Adopt the cloud copy. Resolves false when there was nothing to adopt or it would not validate.
 *
 * `mode` matters more than it looks. `'overwrite'` is right when this browser has nothing to lose
 * — the new-device case, which is most pulls. It is WRONG for the other pull: a device that has
 * pushed to this account before and finds the cloud newer. That device can still hold work the
 * cloud has never seen (a session logged at a gym with no signal, then the ride home), and
 * overwriting silently deleted exactly that — the athlete opened the app at home and the workout
 * was gone. Merging keeps both sides, which is the only answer that cannot lose a set.
 */
export async function pullFromCloud(
  uid: string,
  mode: ImportMode = 'overwrite',
): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  try {
    const ref = await docRefFor(uid);
    if (!ref) return false;
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(ref);
    // A successful read here counts too — this is the other door into the account (see cloudReadOk).
    cloudReadOk = true;
    const data = snap.exists() ? (snap.data() as { bundle?: unknown; updatedAt?: unknown }) : null;
    if (!data || typeof data.bundle !== 'string') return false;

    // The SAME validator the file importer uses. A document that fails it is left alone rather
    // than partially applied — a half-restored account is worse than an un-restored one.
    const result = importAllState(data.bundle, mode);
    if (!result.ok) {
      setStatus({ state: 'error', detail: `Cloud copy could not be read: ${result.error}` });
      return false;
    }
    const at = typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();
    markPushed(at, uid);
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
 * DELETE the account's cloud document — the erasure half of GDPR Art. 17, and the gap the
 * iOS/HealthKit prewalk flagged: "Erase all data" cleared localStorage while `users/{uid}`
 * survived forever. Must run while still signed in (the Firestore rules only let a user delete
 * their own doc), so Settings calls this BEFORE signing out and before wiping local state.
 *
 * Resolves false when the delete could not be confirmed — callers must NOT pretend the erase
 * succeeded, because "your data is gone" is the one claim this app can never afford to get wrong.
 */
export async function eraseCloudCopy(uid: string): Promise<boolean> {
  if (!isAuthConfigured()) return true; // no cloud configured → nothing exists to erase
  try {
    const ref = await docRefFor(uid);
    if (!ref) return false;
    // Latch BEFORE the delete: a mirror push racing the delete would otherwise resurrect the doc.
    cloudWritesDisabled = true;
    const { deleteDoc } = await import('firebase/firestore');
    /**
     * RACED AGAINST A DEADLINE, because Firestore writes never fail on a dead network — the SDK
     * queues the mutation and the promise just… waits, potentially forever. For every other
     * write in this app that behavior is a feature; for THIS one it is a trap: the confirm
     * button would show "Erasing…" until the heat death of the connection while the user's data
     * sat undeleted. No confirmation within the deadline = report failure (the latch stays set,
     * so a queued delete that lands later is harmless — deleting twice deletes once).
     */
    const confirmed = await Promise.race([
      deleteDoc(ref).then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    if (!confirmed) {
      setStatus({ state: 'error', detail: 'The delete could not be confirmed — are you offline?' });
      return false;
    }
    try {
      window.localStorage.removeItem(LAST_PUSH_KEY);
      window.localStorage.removeItem(LAST_PUSH_UID_KEY);
    } catch {
      /* private mode */
    }
    // Nothing left to reconcile against, so a question about the old document is moot.
    setConflict(null);
    setStatus({ state: 'idle' });
    return true;
  } catch (err) {
    // Leave the latch set: after a failed erase attempt, silently resuming uploads is the last
    // thing the user asked for. The next sign-in re-arms sync deliberately.
    setStatus({ state: 'error', detail: describe(err) });
    return false;
  }
}

/**
 * Reconcile once, at sign-in. See the conflict rule in the file header.
 */
export async function syncOnSignIn(uid: string): Promise<void> {
  if (!isAuthConfigured()) return;
  cloudWritesDisabled = false; // a fresh, deliberate sign-in re-arms cloud writes
  // Every sign-in re-earns the right to upload: until THIS reconcile has read the account, this
  // device may not overwrite it.
  cloudReadOk = false;
  reconcileInFlight = true;
  setConflict(null); // a new reconcile supersedes any question left over from the last one
  setStatus({ state: 'syncing' });
  patchRestore({ phase: 'restoring' });
  try {
    const ref = await docRefFor(uid);
    if (!ref) return setStatus({ state: 'idle' });
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(ref);
    // The read landed — whatever it said, including "no such document". We now know what an
    // upload would replace, which is the whole precondition for being allowed to make one.
    cloudReadOk = true;

    const data = (snap.exists() ? snap.data() : {}) as { updatedAt?: unknown; bundle?: unknown };
    const bundle = typeof data.bundle === 'string' ? data.bundle : null;
    // "Readable" means the document would actually survive the importer — an unreadable one is
    // nothing to adopt and nothing to ask about, so the check belongs in the facts, not after them.
    const inspected = bundle ? inspectBackup(bundle) : null;

    const localIsEmpty = !isOnboarded();
    const action = decideReconcile({
      uid,
      cloudExists: snap.exists(),
      cloudHasBundle: inspected?.ok === true,
      cloudAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      localIsEmpty,
      lastPushedAt: lastPushedAt(),
      lastPushedUid: lastPushedUid(),
    });

    if (action === 'ask' && bundle && inspected?.ok) {
      const cloudAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
      setConflict({
        uid,
        bundle,
        cloudAt,
        // The document has no `exportedAt` of its own — `updatedAt` IS when this copy was saved.
        cloud: { ...inspected.summary, exportedAt: new Date(cloudAt || Date.now()).toISOString() },
        local: localSummary(),
      });
      setStatus({ state: 'idle' });
      return;
    }

    if (action === 'pull') {
      /**
       * An empty browser has nothing to lose, so it takes the account wholesale. A browser that
       * already holds training is pulling because a SIBLING DEVICE moved the account forward —
       * and it may still be carrying work of its own that never reached the cloud. Merging is the
       * only outcome there that cannot delete a logged session.
       */
      await pullFromCloud(uid, localIsEmpty ? 'overwrite' : 'merge');
    } else {
      await pushToCloud(uid);
    }
  } catch (err) {
    setStatus({ state: 'error', detail: describe(err) });
  } finally {
    reconcileInFlight = false;
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
  /**
   * FLUSH WHEN THE APP GOES AWAY. The debounce is what keeps a workout from costing hundreds of
   * Firestore writes, but it also means the last 4 seconds of changes exist only in this browser —
   * and "the last thing I did" is exactly what a phone user does before locking the screen. The
   * worst case is the one that matters most: finishing onboarding and closing the app, where the
   * entire plan the account was created for never reaches it.
   *
   * `visibilitychange` rather than `unload`: it is the event iOS Safari actually delivers when an
   * app is backgrounded or a tab is swiped away, and it fires early enough for a real request.
   */
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    void pushToCloud(uid);
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  // BOTH STORES. The plan, profile and preferences live in the demo store; finished workouts live
  // in a separate one with its own listeners. Watching only the first meant a logged session was
  // uploaded solely by luck — whenever some unrelated edit happened to fire afterwards — which is
  // indistinguishable from "my workouts are not being saved", because most of the time they were
  // not. `exportAllState` always included the log; nothing was ever asking for it to be sent.
  const unsubscribes = [subscribe(schedule), subscribeWorkoutLog(schedule)];
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
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
