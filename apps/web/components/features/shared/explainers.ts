'use client';

/**
 * FIRST-USE EXPLAINERS — "show this once, then never again".
 *
 * A one-time card that appears the first time a screen actually needs explaining, and stays gone
 * afterwards. Distinct from the glossary (which is always available on demand) and from onboarding
 * (which happens before the user has seen anything to explain).
 *
 * WHY ITS OWN localStorage SLICE RATHER THAN `lib/demo/store.ts`: the same reason
 * `workoutLog.ts` keeps one — the demo store is owned by a different workstream and is being
 * extended concurrently, and a dismissal flag has no business forcing a shared-schema change.
 * This slice is additive, versioned, tiny, and SSR-safe.
 *
 * THE SSR TRAP, and why the server snapshot says "seen": this app is a STATIC EXPORT. Anything
 * derived at render time gets baked into the prerendered HTML and shown to everyone until
 * hydration replaces it. A server snapshot of "not seen yet" would therefore flash the explainer
 * card at every returning user on every page load. Defaulting the server snapshot to SEEN means
 * the prerendered HTML never contains the card, and a genuine first-timer gets it a frame after
 * hydration instead. Wrong-but-invisible beats right-but-flashing.
 */
import * as React from 'react';

export const EXPLAINERS_KEY = 'fitforge.explainers.v1';

/** Every one-time explainer in the app. A closed union so a typo cannot silently never fire. */
export type ExplainerId =
  | 'workout-first-set'
  /** "rather not ≠ removed" — first visit to the disliked tab of the preference picker */
  | 'prefs-disliked-meaning';

interface ExplainerState {
  version: 1;
  /** ids the user has dismissed (or grown out of) */
  seen: string[];
}

const EMPTY: ExplainerState = { version: 1, seen: [] };

/* ─────────────────────────────────────────────────────────────────────────── read / write ── */

function read(): ExplainerState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(EXPLAINERS_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    // Local Mode data is user-writable (hand-edited, restored from a truncated backup, left over
    // from an older build). Never assume a shape — a bad value degrades to "show it again",
    // which is the harmless direction to fail in.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return EMPTY;
    const seen = (parsed as { seen?: unknown }).seen;
    if (!Array.isArray(seen)) return EMPTY;
    return { version: 1, seen: seen.filter((s): s is string => typeof s === 'string') };
  } catch {
    return EMPTY;
  }
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Mark an explainer as seen. Idempotent — dismissing twice writes once. */
export function dismissExplainer(id: ExplainerId): void {
  if (typeof window === 'undefined') return;
  const state = read();
  if (state.seen.includes(id)) return;
  const next: ExplainerState = { version: 1, seen: [...state.seen, id] };
  try {
    window.localStorage.setItem(EXPLAINERS_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked storage quota must never break the workout the user is in the middle of.
    // The card simply comes back next session, which is annoying rather than broken.
  }
  emit();
}

/** Re-arm every explainer. Exposed for tests and for a future "show me the basics again". */
export function resetExplainers(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EXPLAINERS_KEY);
  } catch {
    /* see above */
  }
  emit();
}

/* ─────────────────────────────────────────────────────────────────────────────── the hook ── */

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab dismissing it should not leave this one showing a card that is already gone.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === EXPLAINERS_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * `true` once the user has dismissed this explainer. Always `true` during SSR / prerender — see
 * the header note; this is what stops the card being baked into the static HTML.
 */
export function useExplainerSeen(id: ExplainerId): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => read().seen.includes(id),
    () => true,
  );
}
