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

/**
 * MAY THIS DEVICE OVERWRITE THE ACCOUNT RIGHT NOW?
 *
 * Four independent reasons to refuse, each of which cost something real before it existed:
 *
 *   · `configured`  — no Firebase project; there is no account to write to.
 *   · `erased`      — the athlete deleted their cloud copy this session. A queued mirror push
 *                     would quietly recreate the document they asked us to destroy.
 *   · `conflictPending` — two histories are on screen awaiting an answer. Writing either one
 *                     before they choose makes the question a lie.
 *   · `readOk`      — WE HAVE NEVER SEEN THIS ACCOUNT. Uploading is only safe once we know what
 *                     it would replace. When the sign-in reconcile could not read `users/{uid}`
 *                     (a Firestore hiccup, a moment offline) the app still released the user —
 *                     correctly — and then mirrored this device's EMPTY state over their entire
 *                     training history four seconds later.
 */
export interface PushGuardFacts {
  configured: boolean;
  erased: boolean;
  conflictPending: boolean;
  readOk: boolean;
}

export function mayPushToCloud(f: PushGuardFacts): boolean {
  return f.configured && !f.erased && !f.conflictPending && f.readOk;
}

/**
 * SHOULD A CLOUD RESTORE END ONBOARDING?
 *
 * Only when the restore actually brought a finished plan. A pull on its own is not enough, and
 * assuming it was created a redirect loop: a new Google account's document is written FROM the
 * signing-in device's empty store, so the next reconcile pulls back a bundle with no plan in it.
 * "A pull happened" then sent the athlete to the app, whose own gate saw no plan and sent them
 * back to the wizard, forever. The two rules now partition cleanly — the app ejects people
 * without a plan, this ejects people with one.
 */
export function shouldLeaveOnboarding(pulled: boolean, hasFinishedPlan: boolean): boolean {
  return pulled && hasFinishedPlan;
}

export function decideReconcile(f: ReconcileFacts): ReconcileAction {
  /**
   * WHOSE TRAINING IS ON THIS DEVICE? Asked before anything else, because the answer changes what
   * "this device's data" even means.
   *
   * A device that last pushed to a DIFFERENT account is holding someone else's training. On a
   * shared phone that is the ordinary case: one athlete signs out, the next signs in, and the
   * store still holds the first one's history. The empty-account branch below used to upload it
   * without a word — a brand-new account's first act was to adopt a stranger's workouts, and the
   * stranger's sets now lived in an account they had never heard of.
   *
   * Asking is the only honest move: the two histories are unrelated, and no timestamp can rank
   * them. (`lastPushedUid === null` is an app upgrade, not a stranger — see the field's doc.)
   */
  const foreignData =
    !f.localIsEmpty && f.lastPushedUid !== null && f.lastPushedUid !== f.uid;
  if (foreignData) return 'ask';

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
