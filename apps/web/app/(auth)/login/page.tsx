import Link from 'next/link';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { LogoLockup } from '@/components/illustrations';

/**
 * Standalone entry (§8 tree / §5.3) — "I have an account" from the landing page. In the static
 * export there is no hosted auth: Local Mode seeds a local session and routes to onboarding (or
 * /today if it is already complete). The "Welcome back" heading is e2e-load-bearing (§7.9).
 *
 * One-viewport layout: `.screen` (100svh) → header / scroll region / pinned footer link.
 */
export default function LoginPage() {
  return (
    <main className="screen mx-auto w-full max-w-[430px] sm:max-w-md">
      <header className="safe-top flex-none px-6 pb-2">
        <Link href="/" aria-label="FitForge home">
          <LogoLockup size={20} />
        </Link>
      </header>

      <div className="scroll-region flex flex-col justify-center px-6">
        <h1 className="font-display text-[clamp(1.375rem,5.6vw,1.75rem)] font-bold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-[0.8125rem] leading-snug text-muted-foreground">
          Cloud accounts are part of the hosted build. On this version, jump straight into Local
          Mode — your data stays in this browser.
        </p>

        <div className="mt-6">
          <AuthPanel next="/onboarding/welcome" />
        </div>
      </div>

      <footer className="cta-dock px-6">
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/onboarding/welcome" className="font-medium text-accent">
            Get started
          </Link>
        </p>
      </footer>
    </main>
  );
}
