/**
 * THE SIGN-IN RECONCILE RULE, as a pure function.
 *
 * Deciding what happens when a device and an account both hold training is the most consequential
 * branch in the app: get it wrong and somebody's logged workouts disappear. It used to be three
 * conditions inlined in an async Firestore function, which made it effectively untestable — the
 * only way to exercise it was to stand up a fake Firestore over gRPC. So the decision moved here,
 * with no imports and no I/O, and {@link syncOnSignIn} became the thing that merely obeys it.
 *
 * The three outcomes:
 *   push — this device's data becomes the account's copy
 *   pull — the account's copy replaces this device's
 *   ask  — two unrelated histories; stop and put the choice to the athlete
 */
export type ReconcileAction = 'push' | 'pull' | 'ask';

export interface ReconcileFacts {
  /** the uid signing in */
  uid: string;
  /** does `users/{uid}` exist at all? */
  cloudExists: boolean;
  /** is that document readable — i.e. is there anything we could actually adopt? */
  cloudHasBundle: boolean;
  /** the document's `updatedAt`, 0 when absent */
  cloudAt: number;
  /** true when this browser has no finished onboarding: nothing to lose */
  localIsEmpty: boolean;
  /** this device's last push stamp, 0 if it has never pushed */
  lastPushedAt: number;
  /**
   * The uid that push went to. `null` means "a push happened before this key existed" — an app
   * upgrade, not a stranger — and is treated as belonging to whoever is signing in, so upgrading
   * does not greet every existing user with a conflict sheet.
   */
  lastPushedUid: string | null;
}

export function decideReconcile(f: ReconcileFacts): ReconcileAction {
  // Nothing in the account yet: this device's data becomes the account's data.
  if (!f.cloudExists) return 'push';

  // A browser with no finished onboarding has nothing to lose and everything to gain. This is the
  // new-device case, and the one where pulling is unambiguously right.
  if (f.localIsEmpty) return 'pull';

  // An unreadable document is not a choice worth offering — there is no second history to adopt,
  // so the data in front of the athlete stands and gets uploaded.
  if (!f.cloudHasBundle) return 'push';

  /**
   * DIVERGENCE, not progress. This browser holds real training and has never pushed to THIS
   * account: a second athlete on a shared laptop, an export restored from elsewhere, a different
   * account signed into a device already in use. No timestamp is a fair tie-break between two
   * unrelated histories, so ask.
   */
  const participated = f.lastPushedAt > 0 && (f.lastPushedUid === null || f.lastPushedUid === f.uid);
  if (!participated) return 'ask';

  // Same account, shared history: "newer than my last push" means a sibling device moved us
  // forward, and adopting that is the ordinary multi-device case. It must stay silent.
  return f.cloudAt > f.lastPushedAt ? 'pull' : 'push';
}
