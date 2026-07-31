'use client';

/**
 * Mounts the ForgeBridge init at the app ROOT (see app/layout.tsx) — the handshake must run on
 * every route, marketing page included: the shell wraps the whole origin, and a bridge that
 * only woke up inside the app shell would leave a cold launch onto `/` handshake-less until
 * the first navigation. Renders nothing; outside the shell, init resolves to 'web' and this
 * component is inert.
 */
import * as React from 'react';
import { initForgeBridge } from './forgeBridge';

export function ShellBridgeDriver(): null {
  // In an effect, not at module scope: the static export prerenders this tree at build time,
  // where there is no window — the effect runs only in the browser, after hydration.
  React.useEffect(() => {
    initForgeBridge();
  }, []);
  return null;
}
