'use client';

/**
 * Exercise detail (§6 P0-1, rebuilt) — the data-heavy page. Front+back MuscleMap as the
 * exercise "image", a "How to perform" block (offline SVG pose frames + numbered execution
 * steps + breathing/tempo), labeled muscle chips, meta chips, an illustrated equipment row,
 * form cues, a "why this exercise" rationale, common mistakes, and the substitute list.
 *
 * Content: catalog structure (muscles / equipment / meta) comes from the mock read-model;
 * the teaching fields (instructions, setup, tempo, breathing, form_cues, why,
 * common_mistakes, pose_pattern) come from the enriched seed (seed/data/exercises.json),
 * merged by slug. The pose art itself is pattern-level and lives in
 * components/illustrations/poses.
 */
import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Button } from '@/components/ui';
import {
  ChevronLeftIcon,
  DumbbellIcon,
  RepeatIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  SparkleIcon,
  TimerIcon,
  HeartIcon,
  BodyIcon,
} from '@/components/ui/icons';
import { MuscleMap, MuscleMapThumb } from '@/components/illustrations';
import { PoseFrames } from '@/components/illustrations/poses';
import type { MuscleSlug } from '@/components/illustrations';
import { matchQuality } from '@/lib/utils';
import * as Illustrations from '@/components/illustrations';
import { SubstituteSheet } from '@/components/features/shared/SubstituteSheet';
import {
  mockExerciseBySlug,
  mockSuggestSubstitutes,
  type SubstituteRow,
} from '@/components/features/_mock/data';
import type { SeedExercise } from '@fitforge/shared';
// Enriched seed content (§6 P0-4) — authored source of truth for teaching fields.
import exercisesSeed from '../../../../../seed/data/exercises.json';

/**
 * The seed carries teaching fields the shared `SeedExercise` type predates
 * (WS-3): a one-line `setup`, a `tempo` and `breathing` coaching line, and the
 * `pose_pattern` that selects the pose-frame rig. Integrator note: these four
 * keys should be added to `packages/shared`'s SeedExercise when convenient.
 */
type SeedExerciseHowTo = SeedExercise & {
  setup?: string;
  tempo?: string;
  breathing?: string;
  pose_pattern?: string;
  pose_badge?: string;
};

const SEED = exercisesSeed as unknown as SeedExerciseHowTo[];
const SEED_BY_SLUG = new Map(SEED.map((e) => [e.slug, e]));

/**
 * Split the authored instructions paragraph into numbered execution steps.
 * Avoids lookbehind so older iOS Safari builds are safe.
 */
function toSteps(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*/g);
  return (parts ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/**
 * EquipmentIllustration is owned by WS-D; consume it from the frozen barrel but degrade
 * gracefully if it hasn't landed at build time (renders a dumbbell glyph instead).
 */
const EquipmentIllustration = (
  Illustrations as unknown as {
    EquipmentIllustration?: React.FC<{ slug: string; size?: number; className?: string }>;
  }
).EquipmentIllustration;

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ExerciseDetail({ slug }: { slug: string }) {
  const ex = mockExerciseBySlug(slug);
  const [swapOpen, setSwapOpen] = React.useState(false);
  if (!ex) return notFound();

  const seed = SEED_BY_SLUG.get(slug);
  const instructions = seed?.instructions ?? ex.instructions;
  const formCues = seed?.form_cues ?? [];
  const why = seed?.why ?? null;
  const commonMistakes = seed?.common_mistakes ?? [];
  const steps = toSteps(instructions);
  const setup = seed?.setup ?? null;
  const tempo = seed?.tempo ?? null;
  const breathing = seed?.breathing ?? null;

  const primary = ex.primary_muscles as MuscleSlug[];
  const secondary = ex.secondary_muscles as MuscleSlug[];

  const subs: SubstituteRow[] = mockSuggestSubstitutes(ex.id, 5);

  return (
    <div className="space-y-5">
      <Link
        href="/exercises"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon size={16} /> Exercises
      </Link>

      {/* Hero — the muscle map IS the exercise image */}
      <Card premium className="overflow-hidden">
        <div
          className="grid place-items-center rounded-sm py-2"
          style={{ backgroundImage: 'var(--gradient-ember-bg)' }}
        >
          <MuscleMap view="both" primary={primary} secondary={secondary} height={188} />
        </div>
        <div className="mt-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">{ex.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <Tag>{ex.category_name}</Tag>
            <Tag>{ex.movement_pattern.replace(/_/g, ' ')}</Tag>
            <Tag>{ex.mechanics}</Tag>
            <Tag>{DIFFICULTY_LABEL[ex.difficulty]}</Tag>
            {ex.is_unilateral && <Tag>Unilateral</Tag>}
            {ex.is_bodyweight_ok && <Tag>Bodyweight OK</Tag>}
          </div>
        </div>
      </Card>

      {/* Why this exercise */}
      {why && (
        <Card className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-muted text-accent">
            <SparkleIcon size={17} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Why this exercise
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{why}</p>
          </div>
        </Card>
      )}

      {/* How to perform — pose frames first, then setup → execution → breathing/tempo */}
      <Card data-testid="how-to-perform">
        <CardTitle className="mb-3 text-base">How to perform</CardTitle>

        <PoseFrames exerciseSlug={slug} size={92} badge={seed?.pose_badge} className="mb-4" />

        {setup && (
          <div className="mb-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Set up</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{setup}</p>
          </div>
        )}

        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Execution
        </p>
        <ol className="mt-2 space-y-2.5" data-testid="howto-steps">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="tabular mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                {i + 1}
              </span>
              <span className="leading-snug text-foreground">{s}</span>
            </li>
          ))}
        </ol>

        {(breathing || tempo) && (
          <div className="mt-4 space-y-2.5 border-t border-border pt-3">
            {breathing && (
              <CoachLine label="Breathing" text={breathing} icon={<HeartIcon size={13} />} />
            )}
            {tempo && <CoachLine label="Tempo" text={tempo} icon={<TimerIcon size={13} />} />}
          </div>
        )}
      </Card>

      {/* Muscles */}
      <Card>
        <CardTitle className="mb-2 flex items-center gap-2 text-base">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-muted text-accent">
            <BodyIcon size={16} />
          </span>
          Muscles worked
        </CardTitle>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Primary</span>
            {ex.primary_muscles.map((m) => (
              <span
                key={m}
                className="rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {humanize(m)}
              </span>
            ))}
          </div>
          {ex.secondary_muscles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Secondary</span>
              {ex.secondary_muscles.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {humanize(m)}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Equipment */}
      <Card>
        <CardTitle className="mb-3 text-base">Equipment</CardTitle>
        {ex.equipment.length === 0 ? (
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
              <DumbbellIcon size={22} />
            </span>
            <p className="text-sm text-muted-foreground">No equipment needed — bodyweight.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
              {ex.equipment.map((grp, i) => (
                <React.Fragment key={grp.alt_group}>
                  {i > 0 && <span className="text-sm font-bold text-muted-foreground">＋</span>}
                  <div className="flex items-center gap-2">
                    {grp.slugs.map((s, j) => (
                      <React.Fragment key={s}>
                        {j > 0 && <span className="text-xs text-muted-foreground">or</span>}
                        <EquipmentTile slug={s} name={grp.names[j] ?? humanize(s)} />
                      </React.Fragment>
                    ))}
                  </div>
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Items joined by &ldquo;or&rdquo; are interchangeable; separate groups are all required.
            </p>
          </div>
        )}
      </Card>

      {/* Form cues */}
      {formCues.length > 0 && (
        <Card>
          <CardTitle className="mb-3 text-base">Form cues</CardTitle>
          <ul className="space-y-2.5">
            {formCues.map((cue, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-muted text-accent">
                  <CheckIcon size={13} />
                </span>
                <span className="leading-snug text-foreground">{cue}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Common mistakes */}
      {commonMistakes.length > 0 && (
        <Card>
          <CardTitle className="mb-3 text-base">Common mistakes</CardTitle>
          <ul className="space-y-2.5">
            {commonMistakes.map((m, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
                  <XIcon size={13} />
                </span>
                <span className="leading-snug text-muted-foreground">{m}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Substitutes */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-muted text-accent">
              <RepeatIcon size={16} />
            </span>
            Swap / similar exercises
          </CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setSwapOpen(true)}>
            See all
          </Button>
        </div>
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No substitutes found.</p>
        ) : (
          <ul className="space-y-2">
            {subs.slice(0, 3).map((s) => {
              const sub = mockExerciseBySlug(s.slug);
              return (
                <li key={s.exercise_id}>
                  <Link
                    href={`/exercises/${s.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent/60"
                  >
                    {sub && (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted">
                        <MuscleMapThumb primary={sub.primary_muscles as MuscleSlug[]} height={40} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {s.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{s.reason}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[11px] font-semibold text-accent">
                        {matchQuality(s.score)}
                      </span>
                      <ChevronRightIcon size={16} className="text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <SubstituteSheet
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        exerciseId={ex.id}
        exerciseName={ex.name}
        onPick={(s) => {
          window.location.href = `/exercises/${s.slug}`;
        }}
      />
    </div>
  );
}

function EquipmentTile({ slug, name }: { slug: string; name: string }) {
  return (
    <div className="flex w-[76px] flex-col items-center gap-1 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-sm border border-border bg-surface text-muted-foreground">
        {EquipmentIllustration ? (
          <EquipmentIllustration slug={slug} size={40} />
        ) : (
          <DumbbellIcon size={22} />
        )}
      </span>
      <span className="text-[10px] font-medium leading-tight text-muted-foreground">{name}</span>
    </div>
  );
}

/** One coaching line under the execution steps (breathing / tempo). */
function CoachLine({
  label,
  text,
  icon,
}: {
  label: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-accent">
        {icon}
      </span>
      <span className="leading-snug">
        <span className="font-semibold text-foreground">{label}: </span>
        {text}
      </span>
    </p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 capitalize text-muted-foreground">
      {children}
    </span>
  );
}
