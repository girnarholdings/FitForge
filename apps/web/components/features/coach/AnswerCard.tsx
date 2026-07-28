'use client';

/**
 * One answer, with its PROVENANCE always on screen.
 *
 * Two visual identities, never blurred together:
 *  - `kb` — "From the FitForge guide": a curated, human-written entry. Shows WHICH question it
 *    matched ("Answering: …") so a bad match is self-evident to the reader rather than hidden.
 *  - `ai` — "AI answer": generated for this user's profile. Shows the profile facts the model was
 *    given and the KB notes it was grounded on.
 *
 * A `pending` variant renders the KB match at reduced emphasis while an AI call is in flight, so
 * the user reads something useful at ~0 perceived latency (§3 Timeouts).
 */
import * as React from 'react';
import { Card } from '@/components/ui';
import { BookIcon, SparkleIcon } from '@/components/ui/icons';
import { CoachMarkdown } from '@/lib/coach/CoachMarkdown';
import type { KbEntry } from '@/lib/kb/types';
import { SourceChips } from './SourceChips';

export type AnswerSource = 'kb' | 'ai';

export interface AnswerCardProps {
  source: AnswerSource;
  answer: string;
  /** The KB question this answer came from — rendered as the "Answering:" line. */
  matchedQuestion?: string;
  /** Overrides the default badge caption (e.g. "Closest match from the guide"). */
  badgeLabel?: string;
  /** Dim treatment: an interim KB answer shown while the AI call runs. */
  interim?: boolean;
  followups?: KbEntry[];
  onFollowup?: (entry: KbEntry) => void;
  /** AI only — the profile facts that shaped the answer, shown as chips. */
  facts?: string[];
  /** AI only — the KB entries attached as grounding. */
  sources?: KbEntry[];
  onSource?: (entry: KbEntry) => void;
  footer?: React.ReactNode;
}

function Badge({ source, label }: { source: AnswerSource; label: string }) {
  const kb = source === 'kb';
  if (kb)
    return (
      <span
        data-testid="coach-badge-kb"
        className="inline-flex items-center gap-1.5 rounded-chip bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <span aria-hidden>
          <BookIcon size={13} />
        </span>
        {label}
      </span>
    );
  // The AI badge WEARS the AI: gold gradient, sparkle, glow. The owner's complaint was that
  // nothing in the app says "AI-powered" — this is the artifact that is literally AI-made, so
  // it is the one place the emphasis belongs at full volume.
  return (
    <span
      data-testid="coach-badge-ai"
      className="inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--accent-foreground)] shadow-[var(--shadow-glow)]"
      style={{ background: 'var(--gradient-gold)' }}
    >
      <span aria-hidden>
        <SparkleIcon size={13} />
      </span>
      {label}
    </span>
  );
}

export function AnswerCard({
  source,
  answer,
  matchedQuestion,
  badgeLabel,
  interim,
  followups = [],
  onFollowup,
  facts = [],
  sources = [],
  onSource,
  footer,
}: AnswerCardProps) {
  const isAi = source === 'ai';
  const label = badgeLabel ?? (isAi ? 'AI coach' : 'From the FitForge guide');

  return (
    <Card
      premium={isAi}
      data-testid={isAi ? 'coach-answer-ai' : 'coach-answer-kb'}
      className={interim ? 'opacity-80' : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge source={source} label={label} />
        {isAi && (
          <span className="text-[11px] text-muted-foreground">generated for your profile</span>
        )}
      </div>

      {matchedQuestion && (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="coach-matched-question">
          Answering: <span className="font-semibold text-foreground">{matchedQuestion}</span>
        </p>
      )}

      {isAi ? (
        // AI answers arrive in the worker's markdown contract (bold + bullets); curated guide
        // entries are plain prose and stay that way.
        <div className="mt-2">
          <CoachMarkdown text={answer} />
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground">
          {answer}
        </p>
      )}

      {isAi && facts.length > 0 && (
        <div className="mt-3" data-testid="coach-profile-facts">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Personalized with
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <li
                key={f}
                className="rounded-chip border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-accent-muted px-2.5 py-1 text-xs font-medium text-accent"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAi && sources.length > 0 && onSource && (
        <SourceChips entries={sources} onSelect={onSource} />
      )}

      {followups.length > 0 && onFollowup && (
        <div className="mt-4" data-testid="coach-followups">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Related
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {followups.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onFollowup(f)}
                  data-testid="coach-followup-chip"
                  className="max-w-full rounded-chip border border-border bg-surface px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {f.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}
