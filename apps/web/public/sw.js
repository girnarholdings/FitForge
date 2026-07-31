/**
 * FITFORGE SERVICE WORKER — conservative on purpose.
 *
 * Registered ONLY inside the iOS shell (see registerServiceWorker in lib/native/forgeBridge.ts);
 * the PWA-wide rollout waits until this caching story has soaked where we control the runtime.
 *
 * Two strategies, nothing clever:
 *   · NAVIGATIONS (HTML): network-first, cache fallback. HTML is the one thing that must be
 *     fresh when the network can provide it — a stale shell page pins users to old bundles —
 *     but a launch in a tunnel should still open the last app rather than an error page.
 *   · /_next/static/**: cache-first. Next content-hashes every filename there, so a cached
 *     entry can never be stale — its URL changes when its content does.
 * Everything else (API calls, fonts already inlined at build, cross-origin) passes through
 * untouched: no respondWith means browser-default behavior, which cannot regress anything.
 */

const CACHE_NAME = 'fitforge-shell-v1';

self.addEventListener('install', () => {
  // No precache list: HTML fills in via navigations, static assets via first use. An empty
  // install can never 404-fail on a hashed filename from a previous deploy.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // One named cache; anything else is a leftover from an older worker version.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable, content-hashed bundles: cache-first.
  if (url.pathname.includes('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Navigations: network-first, last-good-copy fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw new Error('offline and no cached copy');
        }
      })(),
    );
  }
  // Everything else: browser default.
});
