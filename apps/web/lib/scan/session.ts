'use client';

/**
 * IN-MEMORY hand-off of the scan result from ai_photos to ai_confirm.
 *
 * A module-level variable, ON PURPOSE, and the privacy law is the reason (contract Law 4 / §F1):
 * the model's raw pre-confirmation guesses must never touch localStorage — only the buckets the
 * user CONFIRMS on the next screen are stored, and those go through the normal draft. The two
 * screens are separate routes, so this singleton is the only channel between them that survives
 * an SPA navigation and dies with the tab.
 *
 * A hard reload between the screens loses the result. That is the correct behaviour, not a bug:
 * ai_confirm renders with nothing pre-filled and every question still answerable by hand.
 */
import type { BodyScan } from './client';

let current: BodyScan | null = null;

export function stashScan(scan: BodyScan): void {
  current = scan;
}

/** Read without clearing — going back to retake photos must not wipe a good scan. */
export function peekScan(): BodyScan | null {
  return current;
}

/** Called once the confirm screen has committed user-confirmed buckets to the draft. */
export function clearScan(): void {
  current = null;
}
