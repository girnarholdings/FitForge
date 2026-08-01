'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { ChevronLeftIcon, CheckIcon, RepeatIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { prepareScanImage } from '@/lib/scan/prepare';
import { askBodyScan, type ScanRefusalReason } from '@/lib/scan/client';
import { stashScan } from '@/lib/scan/session';
import { patchDraft } from '@/lib/demo/store';
import { useOnboarding } from '../OnboardingProvider';
import { AiSampleFigure } from './AiSampleFigure';

/**
 * AI-MODE screen 1 · Four photos (docs/AIMODE-CONTRACT.md "Onboarding fork", RESEARCH-VISION §E).
 *
 * THE PHOTOS LIVE IN COMPONENT STATE AND NOWHERE ELSE (contract Law 4): prepped in memory,
 * sent once, released on navigation. Nothing here touches localStorage — the only thing that
 * survives this screen is the scan result, handed to ai_confirm through the in-memory session
 * module, and even that is discarded once the athlete has confirmed or corrected every bucket.
 *
 * AI MODE IS A SHORTCUT, NEVER A WALL: every failure — refusal, outage, timeout, unconfigured
 * worker — lands on plain-voice copy with the Old School questionnaire one tap away, and
 * `possible_minor` skips the retake loop entirely (a hard stop, gently worded).
 */

interface Slot {
  key: 'front' | 'back' | 'left' | 'right';
  short: string;
  /** the §E2 per-slot capture direction */
  label: string;
}

const SLOTS: readonly Slot[] = [
  { key: 'front', short: 'Front', label: 'Face the camera' },
  { key: 'back', short: 'Back', label: 'Back to the camera' },
  { key: 'left', short: 'Left side', label: 'Left side to the camera' },
  { key: 'right', short: 'Right side', label: 'Right side to the camera' },
];

const GUIDANCE: readonly { lead: string; rest: string }[] = [
  { lead: 'Fitted clothing.', rest: 'Baggy clothes hide exactly what we’re trying to read.' },
  { lead: 'Whole body in frame,', rest: 'head to feet. Plain wall behind you, light in front of you.' },
  { lead: 'Prop your phone at chest height,', rest: '2–3 m away, and use the timer.' },
  { lead: 'Stand relaxed.', rest: 'Feet under your hips, arms slightly out. Don’t flex — we need your default.' },
  { lead: 'Keep your face out of the shot.', rest: 'Crop at the neck or turn your head — the estimates work just as well without it.' },
];

/** Refusal reason → one plain-voice line (RESEARCH-VISION §F3). */
const REFUSAL_COPY: Record<ScanRefusalReason, string> = {
  not_person:
    'We couldn’t find one person, head to feet, in those photos. Retake them full-body — or skip the photos and answer the questions instead.',
  possible_minor:
    'AI Mode needs you to be 18 or over, and we couldn’t be sure. No problem — the questions get you exactly the same plan.',
  inappropriate:
    'Those photos aren’t something we can read. Fitted gym clothes against a plain wall is all it takes — or skip the photos entirely.',
  unreadable:
    'Too dark or blurry to read. Get a light in front of you, not behind, and go again — or skip the photos.',
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'refused'; reason: ScanRefusalReason }
  | { kind: 'unavailable' };

export function AiPhotosStep() {
  const { patch, goTo, commitAndNext, saving } = useOnboarding();
  const [photos, setPhotos] = React.useState<(string | null)[]>([null, null, null, null]);
  const [preparing, setPreparing] = React.useState<number | null>(null);
  const [decodeError, setDecodeError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>({ kind: 'idle' });
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const ready = photos.every((p) => p !== null);
  const scanning = phase.kind === 'scanning';

  const onPick = async (index: number, file: File) => {
    setDecodeError(null);
    setPhase({ kind: 'idle' });
    setPreparing(index);
    try {
      // Downscale + EXIF-strip immediately, so the raw file is released and what we hold in
      // memory is already the only version that will ever leave the phone.
      const dataUri = await prepareScanImage(file);
      setPhotos((p) => p.map((v, i) => (i === index ? dataUri : v)));
    } catch {
      // HEIC outside Safari, corrupt file, screenshot-of-nothing — decode is the arbiter (§C2.4).
      setDecodeError('That photo didn’t open — use your camera, or a JPEG.');
    } finally {
      setPreparing(null);
    }
  };

  const scan = async () => {
    if (!ready || scanning) return;
    setPhase({ kind: 'scanning' });
    const result = await askBodyScan(photos as string[]);
    if (result.status === 'ok') {
      // In-memory hand-off only — the raw estimates are never persisted (Law 4); ai_confirm
      // stores nothing but what the athlete confirms.
      stashScan(result.scan);
      await commitAndNext('ai_photos');
      return;
    }
    if (result.status === 'refused') {
      setPhase({ kind: 'refused', reason: result.reason });
      return;
    }
    // not-configured / timeout / error — one honest bucket: the scanner is not reachable.
    setPhase({ kind: 'unavailable' });
  };

  /** The graceful exit (contract Law 4 refusal path): flip the fork flag and join the classic flow. */
  const oldSchool = () => {
    patch({ ai_mode: false });
    patchDraft({ ai_mode: false });
    goTo('goals');
  };

  const refusedMinor = phase.kind === 'refused' && phase.reason === 'possible_minor';

  return (
    <>
      <div className="scroll-region safe-top flex flex-col px-6 pb-2">
        <div className="flex flex-none items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => goTo('welcome')}
            className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeftIcon size={22} />
          </button>
        </div>

        <h1 className="flex-none font-display text-[clamp(1.375rem,5.6vw,1.75rem)] font-bold leading-[1.15] tracking-tight text-foreground">
          Four photos. About thirty seconds.
        </h1>
        <p className="mt-1.5 flex-none text-[0.8125rem] leading-snug text-muted-foreground">
          Front, back, left, right. Here’s how to get estimates worth confirming:
        </p>

        {/* guidance: the drawn figure beside the plain-voice list */}
        <div className="mt-4 flex flex-none gap-3 rounded-card border border-border bg-surface-2 p-3">
          <AiSampleFigure className="w-[88px] shrink-0 self-center text-muted-foreground" />
          <ul className="min-w-0 flex-1 space-y-2 self-center">
            {GUIDANCE.map((g) => (
              <li key={g.lead} className="text-[11.5px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{g.lead}</span> {g.rest}
              </li>
            ))}
          </ul>
        </div>

        {/* the privacy claim, made where the camera is — and made true in lib/scan/prepare.ts */}
        <p
          className="mt-2.5 flex-none text-[11px] leading-snug text-muted-foreground"
          data-testid="ai-photos-privacy"
        >
          Your photos are read once to guess your ranges, then gone. Nothing is saved — not by the
          app, not on our server — and you confirm or correct every estimate before it touches
          your plan.
        </p>

        {/* four labeled capture slots */}
        <div className="mt-4 grid flex-none grid-cols-2 gap-2.5">
          {SLOTS.map((slot, i) => {
            const filled = photos[i];
            return (
              <div key={slot.key} className="relative">
                <button
                  type="button"
                  disabled={scanning || preparing !== null}
                  onClick={() => inputRefs.current[i]?.click()}
                  data-testid={`ai-photo-slot-${slot.key}`}
                  data-filled={filled ? 'true' : 'false'}
                  className={cn(
                    'ff-press-soft relative flex h-28 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border text-center transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    filled ? 'border-accent bg-surface-2' : 'border-dashed border-border-strong bg-surface-2',
                  )}
                >
                  {filled ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URI preview; never a hosted asset */}
                      <img
                        src={filled}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full object-cover opacity-80"
                      />
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-surface/80 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                        <CheckIcon size={11} aria-hidden className="text-success" /> {slot.short}
                      </span>
                      <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-surface/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <RepeatIcon size={11} aria-hidden /> Retake
                      </span>
                    </>
                  ) : preparing === i ? (
                    <span className="text-xs text-muted-foreground">Reading…</span>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-foreground">{slot.short}</span>
                      <span className="mt-0.5 px-2 text-[10.5px] leading-tight text-muted-foreground">
                        {slot.label}
                      </span>
                    </>
                  )}
                </button>
                <input
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="file"
                  accept="image/*"
                  capture
                  className="hidden"
                  data-testid={`ai-photo-input-${slot.key}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Clear first: retaking with the SAME file fires no change event otherwise.
                    e.target.value = '';
                    if (file) void onPick(i, file);
                  }}
                />
              </div>
            );
          })}
        </div>

        {decodeError && (
          <p className="mt-2 flex-none text-xs text-danger" data-testid="ai-photo-decode-error">
            {decodeError}
          </p>
        )}

        {(phase.kind === 'refused' || phase.kind === 'unavailable') && (
          <div
            className="mt-3 flex-none rounded-2xl border border-border bg-surface-2 p-3"
            role="alert"
            data-testid="ai-scan-error"
            data-kind={phase.kind === 'refused' ? phase.reason : 'ai_unavailable'}
          >
            <p className="text-[12.5px] leading-snug text-foreground">
              {phase.kind === 'refused'
                ? REFUSAL_COPY[phase.reason]
                : 'The scanner isn’t reachable right now. No problem — the questions get you exactly the same plan.'}
            </p>
          </div>
        )}

        <div className="min-h-3 flex-1" />
      </div>

      <div className="cta-dock px-6">
        {/* possible_minor never re-offers the camera — Old School becomes the one path (§F3) */}
        {!refusedMinor && (
          <Button
            size="lg"
            block
            glow
            texture
            disabled={!ready || preparing !== null}
            loading={scanning || saving}
            onClick={scan}
            data-testid="ai-photos-scan"
          >
            {phase.kind === 'refused' || phase.kind === 'unavailable' ? 'Try again' : 'Scan my photos'}
          </Button>
        )}
        <Button
          size="md"
          variant={refusedMinor ? 'secondary' : 'ghost'}
          block
          disabled={scanning}
          onClick={oldSchool}
          data-testid="ai-photos-oldschool"
        >
          Continue with Old School
        </Button>
      </div>
    </>
  );
}
