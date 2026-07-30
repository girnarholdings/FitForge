'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { SparkleIcon, CheckIcon, ExportIcon, ImportIcon } from '@/components/ui/icons';
import { LogoLockup } from '@/components/illustrations';
import { ensureSession, importAllState, patchDraft } from '@/lib/demo/store';
import { useAuth } from '@/lib/auth/useUser';
import { useOnboarding } from '../OnboardingProvider';

/**
 * Screen 0 · Welcome — the name, and nothing else to decide.
 *
 * By the time anyone reaches this screen the account question is settled: the landing page offers
 * Local Mode or Google and nothing else. So this screen never re-asks it. It used to hand off to
 * an `auth` step that offered Local Mode a second time and linked to a login page that offered it
 * a third — that step and that page are both gone.
 *
 * What it says next depends on which door they came through, because the two need different
 * things said to them:
 *
 *   SIGNED IN — the name is already known, so it is pre-filled from the Google profile and the
 *   field becomes a confirmation rather than a question. Nothing about backups needs saying: the
 *   account IS the backup.
 *
 *   LOCAL MODE — the name is asked outright, and this is the one moment where the consequences of
 *   Local Mode can still be acted on before there is anything to lose. Clearing browser data
 *   erases the lot, so the export/import route is spelled out here rather than left to be
 *   discovered in Settings later, and Import is a working control right here — which is exactly
 *   what a returning user holding a backup file needs at this precise moment, and what they
 *   previously had to finish a full onboarding to reach.
 */
export function WelcomeStep() {
  const { goTo, patch } = useOnboarding();
  const router = useRouter();
  const { status, user } = useAuth();
  const signedIn = status === 'signed-in' && !!user;

  const [name, setName] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Pre-fill from the Google profile, but never overwrite what someone has typed. Keyed on
  // `touched` rather than on the field being empty, so deliberately clearing it is respected too:
  // auth state can resolve after this screen mounts, and a late arrival must not undo an edit.
  React.useEffect(() => {
    if (!touched && user?.name) setName(user.name);
  }, [touched, user?.name]);

  const start = () => {
    const trimmed = name.trim();
    const value = trimmed ? trimmed : null;
    patch({ display_name: value });
    patchDraft({ display_name: value });
    // Seeding the local session used to be the `auth` step's CTA. It still has to happen — the
    // (app) route gate reads a session-less visitor as a stranger and bounces them back here.
    ensureSession();
    goTo('goals');
  };

  const restore = async (file: File) => {
    const result = importAllState(await file.text());
    if (result.ok) router.push('/today');
    else setImportError(result.error);
  };

  return (
    <>
      <div className="scroll-region safe-top flex flex-col px-6">
        <div className="flex flex-none flex-col items-center">
          <LogoLockup size={24} stacked />
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-muted px-3 py-1 text-[11px] font-semibold text-accent">
            <SparkleIcon size={13} /> Personalized in ~2 minutes
          </span>
        </div>

        <h1 className="mt-4 flex-none text-center font-display text-[clamp(1.5rem,6.6vw,2rem)] font-bold leading-[1.1] tracking-tight text-foreground">
          Your personal trainer,
          <br />
          <span className="text-accent-soft">forged around you.</span>
        </h1>
        <p className="mt-2 flex-none text-center text-[0.9375rem] leading-snug text-muted-foreground">
          A few quick questions about your goals, gear, and preferences — we&apos;ll forge the rest.
        </p>

        <label className="mt-5 block flex-none">
          <span className="text-sm font-medium text-foreground">What should we call you?</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
            placeholder="Your name (optional)"
            autoComplete="given-name"
            data-testid="onboarding-name"
            /* 16px min font-size — anything smaller triggers iOS auto-zoom on focus. */
            className="mt-1.5 h-12 w-full rounded-[var(--radius-field)] border border-border bg-surface-2 px-4 text-base text-foreground outline-none transition-colors focus:border-accent"
          />
        </label>

        {signedIn ? (
          <p
            className="mt-2.5 flex flex-none items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground"
            data-testid="welcome-signed-in"
          >
            <CheckIcon size={13} className="mt-px shrink-0 text-success" />
            <span>
              Signed in as <span className="text-foreground">{user.email}</span>. Your training
              backs up to your Google account automatically.
            </span>
          </p>
        ) : (
          /* LOCAL MODE — said once, plainly, while it can still be acted on. */
          <div
            className="mt-3 flex-none rounded-2xl border border-border bg-surface-2 p-3"
            data-testid="welcome-local-backup"
          >
            <p className="text-[12.5px] font-semibold leading-tight text-foreground">
              Everything stays in this browser
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              Nothing is uploaded — so clearing your browser data erases your training. Export a
              backup file whenever you like from{' '}
              <span className="text-foreground">Settings → Local Mode</span>, and import it here or
              on any other device.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                data-testid="welcome-import"
              >
                <ImportIcon size={14} /> Import a backup
              </Button>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <ExportIcon size={12} /> Export lives in Settings
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="welcome-import-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Clear the input before doing anything with the file: picking the SAME file twice
                // fires no change event otherwise, so a rejected import could not be retried after
                // the file was corrected.
                e.target.value = '';
                if (file) void restore(file);
              }}
            />
            {importError && (
              <p
                className="mt-1.5 text-[11px] leading-snug text-danger"
                data-testid="welcome-import-error"
              >
                {importError}
              </p>
            )}
          </div>
        )}


        <div className="min-h-2 flex-1" />
      </div>

      <div className="cta-dock px-6">
        <Button size="lg" block glow onClick={start}>
          Get started
        </Button>
      </div>
    </>
  );
}
