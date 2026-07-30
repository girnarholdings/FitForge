'use client';

/**
 * QUOTA-AWARE localStorage writes — the shared write path for every `fitforge.*` store.
 *
 * `setItem` at quota (or in a private-mode implementation with a zero budget) THROWS, and a store
 * that swallows the throw turns it into silent data loss: the UI confirms a food log or check-in,
 * nothing reaches disk, and the gap only surfaces on reload. So every store writes through
 * {@link safeSetItem}, which keeps one app-wide health flag; the single "storage is full" surface
 * (`components/ui/StorageFullBanner`) subscribes to it. The in-memory copy still serves the
 * session either way — a full disk must not also break the screen the athlete is on.
 *
 * ONE FLAG, NOT PER-KEY STATUS. The user-facing fact is "this browser cannot save right now",
 * which is the same fact whichever key tripped it; per-feature toasts would say it five ways.
 */
import * as React from 'react';

const listeners = new Set<() => void>();
let storageFull = false;

/**
 * Stores self-heal during render (`load()` runs inside `getSnapshot`), so a failed write can
 * happen mid-render — notifying synchronously would setState into a rendering component. A
 * microtask runs after the current synchronous work and is safe from both call sites.
 */
function setStorageFull(next: boolean): void {
  if (storageFull === next) return;
  storageFull = next;
  queueMicrotask(() => {
    for (const l of listeners) l();
  });
}

/**
 * Write-through that reports rather than swallowing. Returns whether the value is on disk.
 * On the server there is no disk; `false` without flagging (writes are no-ops there by design).
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    setStorageFull(true);
    return false;
  }
  // A later write that fits means space was freed — the warning must not outlive the problem.
  setStorageFull(false);
  return true;
}

export function isStorageFull(): boolean {
  return storageFull;
}

export function subscribeStorageHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The health flag as reactive state; the server snapshot is "fine" (no disk to be full). */
export function useStorageFull(): boolean {
  return React.useSyncExternalStore(subscribeStorageHealth, isStorageFull, () => false);
}
