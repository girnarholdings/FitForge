import Link from 'next/link';

/**
 * THE 404 IS PART OF THE WORLD. The static host serves this for every unknown URL — a typo'd
 * link, a stale bookmark, a guessed path like /workouts/ — and the framework default it replaces
 * was a white page with no way back: the one screen in the product that broke the dark-iron
 * world and then stranded the visitor in it. Same surface, same faces, one door home.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-6 text-center">
      <div>
        <p className="font-display text-display font-bold text-foreground">Nothing forged here</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          This page doesn&rsquo;t exist — the link may be old or mistyped. Your training is where
          you left it.
        </p>
        <Link
          href="/today"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-field bg-accent px-5 font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Back to Today
        </Link>
      </div>
    </main>
  );
}
