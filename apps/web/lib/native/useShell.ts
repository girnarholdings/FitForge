'use client';

/**
 * useShell — "am I inside the iOS shell, and what can it do?" as React state.
 *
 * `inShell` here means the HANDSHAKE COMPLETED, not merely that the global exists: the
 * contract treats a shell that never acks within 3s as no shell at all, and a component
 * branching on a half-alive bridge would render shell-only chrome no message can ever reach.
 * Components that want the phases (e.g. "still connecting") can read `getShellStatus()`.
 */
import * as React from 'react';
import {
  getShellStatus,
  subscribeShellStatus,
  initForgeBridge,
  type ShellStatus,
} from './forgeBridge';

export interface ShellInfo {
  /** true only after `bridge/helloAck` landed */
  inShell: boolean;
  /** the shell's capability strings ('health', 'storageMirror', …); [] outside the shell */
  capabilities: string[];
  shellVersion: string | null;
}

const SERVER_STATUS: ShellStatus = {
  phase: 'idle',
  shellVersion: null,
  bridgeVersion: null,
  capabilities: [],
};

export function useShell(): ShellInfo {
  // The root driver already ran init; this is belt-and-braces for a component tree rendered
  // outside the app layout (init is idempotent, so double-calling costs nothing).
  React.useEffect(() => {
    initForgeBridge();
  }, []);

  const status = React.useSyncExternalStore(subscribeShellStatus, getShellStatus, () => SERVER_STATUS);

  return React.useMemo(
    () => ({
      inShell: status.phase === 'shell',
      capabilities: status.capabilities,
      shellVersion: status.shellVersion,
    }),
    [status],
  );
}
