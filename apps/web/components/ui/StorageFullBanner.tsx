'use client';

/**
 * THE one "storage is full" surface (see `lib/storage/safeWrite`).
 *
 * Mounted once in the app layout rather than per feature: the failed write can come from any
 * store — food log, readiness, custom foods — and the screen that triggered it should not need to
 * know storage exists. Renders nothing until a write actually fails, and clears itself the moment
 * a later write fits again.
 *
 * Fixed above all chrome (the top bar is z-30, the tab pill z-40) so the sentence that says "your
 * change did not save" can never be covered by the UI that just claimed it did. Danger is the
 * honest hue here: this is a true failure state, not emphasis.
 */
import { useStorageFull } from '@/lib/storage/safeWrite';

export function StorageFullBanner() {
  const full = useStorageFull();
  if (!full) return null;
  return (
    <div
      role="alert"
      data-testid="storage-full-banner"
      className="fixed inset-x-0 top-0 z-50 border-b border-danger bg-surface-2 px-4 py-2.5 shadow-[var(--shadow-card)]"
    >
      <p className="mx-auto max-w-[720px] text-xs leading-snug text-muted-foreground">
        <span className="font-semibold text-danger">
          This browser&apos;s storage is full — that change didn&apos;t save.{' '}
        </span>
        Changes are only kept until you leave. Free up space, or export your data from Settings.
      </p>
    </div>
  );
}
