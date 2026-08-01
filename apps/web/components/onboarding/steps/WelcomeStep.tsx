'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import {
  SparkleIcon,
  CheckIcon,
  ExportIcon,
  ImportIcon,
  ClipboardIcon,
  BodyIcon,
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';
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
  const { goTo, patch, draft } = useOnboarding();
  const router = useRouter();
  const { status, user } = useAuth();
  const signedIn = status === 'signed-in' && !!user;

  const [name, setName] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  /**
   * THE MODE FORK (docs/AIMODE-CONTRACT.md "Onboarding fork"): Old School — the classic
   * questionnaire, byte-identical — or AI Mode, which starts with four photos. Old School is the
   * DEFAULT: "Get started" with nothing tapped behaves exactly as it did before the fork
   * existed, which is what keeps every pre-fork spec and every muscle memory intact (Law 1).
   */
  const [mode, setMode] = React.useState<'classic' | 'ai'>('classic');
  const [modeTouched, setModeTouched] = React.useState(false);

  // Pre-fill from the Google profile, but never overwrite what someone has typed. Keyed on
  // `touched` rather than on the field being empty, so deliberately clearing it is respected too:
  // auth state can resolve after this screen mounts, and a late arrival must not undo an edit.
  React.useEffect(() => {
    if (!touched && user?.name) setName(user.name);
  }, [touched, user?.name]);

  // A resumed AI-Mode draft re-selects its card — but never over an explicit tap this visit.
  React.useEffect(() => {
    if (!modeTouched && draft.ai_mode) setMode('ai');
  }, [modeTouched, draft.ai_mode]);

  const start = () => {
    const trimmed = name.trim();
    const value = trimmed ? trimmed : null;
    // ai_mode is written EXPLICITLY on both paths: someone who tried AI Mode, came back and
    // picked Old School must not be left with a stale flag steering the wizard's chain.
    const ai = mode === 'ai';
    patch({ display_name: value, ai_mode: ai });
    patchDraft({ display_name: value, ai_mode: ai });
    // Seeding the local session used to be the `auth` step's CTA. It still has to happen — the
    // (app) route gate reads a session-less visitor as a stranger and bounces them back here.
    ensureSession();
    goTo(ai ? 'ai_photos' : 'goals');
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

        {/* THE FORK. Two doors, one decision; the questionnaire is preselected so the CTA below
            needs no new thinking from anyone who just wants to start. The AI card's subtitle is
            deliberately blunt about what it involves (photos) and what happens to them (read
            once, never stored) — a privacy claim made BEFORE the camera screen, not after. */}
        <div
          role="radiogroup"
          aria-label="How do you want to set up?"
          className="mt-4 grid flex-none gap-2"
        >
          <ModeCard
            selected={mode === 'classic'}
            onSelect={() => {
              setModeTouched(true);
              setMode('classic');
            }}
            icon={<ClipboardIcon size={18} />}
            title="Old School"
            description="Answer the questionnaire — goals, gear, schedule. About two minutes."
            testId="welcome-mode-classic"
          />
          <ModeCard
            selected={mode === 'ai'}
            onSelect={() => {
              setModeTouched(true);
              setMode('ai');
            }}
            icon={<BodyIcon size={18} />}
            title="AI Mode"
            description="Four photos, face hidden. Read once to guess your ranges — you confirm every one, and the photos are never stored."
            testId="welcome-mode-ai"
          />
        </div>

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

/**
 * One door of the fork. A radio-semantics row rather than a full Card: the welcome screen's one
 * anchor is the name question, and two more 24px-radius cards would out-shout it (One Anchor
 * Rule). ≥44px tall, house focus ring, `.ff-press` — the standard tappable contract.
 */
function ModeCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      data-testid={testId}
      className={cn(
        'ff-press flex cursor-pointer items-start gap-2.5 rounded-2xl border bg-surface-2 p-3 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? 'border-accent' : 'border-border hover:border-border-strong',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors',
          selected ? 'bg-accent-muted text-accent' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {title}
          {selected && <CheckIcon size={14} aria-hidden className="text-accent" />}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </div>
  );
}
