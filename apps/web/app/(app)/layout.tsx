import type { Metadata } from 'next';
import { AppShell } from '@/components/features/shell/AppShell';
import { StorageFullBanner } from '@/components/ui';

/**
 * Authed shell layout (WS-5). The `middleware.ts` (WS-4) guards `(app)` for auth; this layout
 * only renders the nav chrome. All child pages render with mocked data (WS-5 brief).
 */
export const metadata: Metadata = {
  title: 'FitForge',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {/* The one app-wide "storage is full" surface: any store's failed write raises it, so the
          feature screens never have to know storage exists. Fixed-position, renders nothing
          until a write actually fails. */}
      <StorageFullBanner />
      {children}
    </AppShell>
  );
}
