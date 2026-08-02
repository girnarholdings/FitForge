'use client';

import * as React from 'react';
import type { SexType, TrainingLocation, ExperienceLevel } from '@fitforge/shared/types';
import {
  AI_AGE_BUCKETS,
  AI_BODY_FAT_BANDS,
  AI_DIET_BASES,
  AI_DIET_AVOID,
  type AiAgeBucket,
  type AiBodyFatBand,
  type AiDietBase,
  type AiDietAvoid,
} from '@fitforge/shared/schemas';
import { equipmentPresetForLocation } from '@fitforge/shared/rules';
import { Button, Chip } from '@/components/ui';
import { ChevronLeftIcon, SparkleIcon } from '@/components/ui/icons';
import { DEMO_EQUIPMENT } from '@/lib/demo/catalog';
import { peekScan, clearScan } from '@/lib/scan/session';
import { useOnboarding } from '../OnboardingProvider';
import type { OnboardingDraft } from '../types';
import { AVOID_TO_ALLERGENS } from '../dietGeneration';
import {
  WEIGHT_BANDS,
  HEIGHT_BANDS,
  weightBandFor,
  birthdateForAgeBucket,
} from './aiBands';

/**
 * AI-MODE screen 2 · Confirm (docs/AIMODE-CONTRACT.md "Onboarding fork").
 *
 * LAW 3 MADE VISIBLE: the scan only PRE-FILLS chips; nothing it guessed reaches the plan except
 * through the athlete's tap on Continue, and every pre-filled chip says so ("estimated — tap to
 * change"). The screen also asks the questions vision cannot answer — height band, sex, dietary
 * preference, where they train — and derives experience from the build bucket (muscular →
 * intermediate, else beginner), changeable like everything else.
 *
 * LAW 2 LIVES IN `./aiBands.ts`: chips render BUCKETS ("70–80 kg"), while the draft receives the
 * bucket MIDPOINTS in the exact fields the existing deterministic generators read (`weight_kg`,
 * `height_cm`, `birthdate` = Jan-1 of the midpoint year) — coarseness the research showed is
 * inside Mifflin-St Jeor's own error. No copy on this screen prints a midpoint.
 *
 * A reload between photos and here loses the in-memory scan (Law 4 — it is never persisted).
 * That is handled, not broken: the same chips simply arrive unfilled and the athlete picks by
 * hand.
 */

const BODY_FAT_LABEL: Record<AiBodyFatBand, string> = {
  '<12': 'Under 12%',
  '12-18': '12–18%',
  '18-25': '18–25%',
  '25-32': '25–32%',
  '32+': 'Over 32%',
};

const AGE_LABEL: Record<AiAgeBucket, string> = {
  '18-25': '18–25',
  '26-35': '26–35',
  '36-45': '36–45',
  '46-55': '46–55',
  '56+': '56+',
};

const SEX_OPTIONS: { value: SexType; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const DIET_BASE_LABEL: Record<AiDietBase, string> = {
  omnivore: 'Omnivore',
  pescatarian: 'Pescatarian',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
};

const DIET_AVOID_LABEL: Record<AiDietAvoid, string> = {
  dairy_free: 'No dairy',
  gluten_free: 'No gluten',
  halal_friendly: 'Halal-friendly',
  nut_free: 'No nuts',
  shellfish_free: 'No shellfish',
};

/** DietPrefs.base → the existing `diet_type` vocabulary (same words for these four). */
const BASE_TO_DIET_TYPE: Record<AiDietBase, OnboardingDraft['diet_type']> = {
  omnivore: 'omnivore',
  pescatarian: 'pescatarian',
  vegetarian: 'vegetarian',
  vegan: 'vegan',
};

const TRAIN_OPTIONS: { value: TrainingLocation; label: string; hint: string }[] = [
  { value: 'commercial_gym', label: 'Gym', hint: 'racks, machines, the lot' },
  { value: 'home', label: 'Home basics', hint: 'dumbbells, bands, a bench' },
  { value: 'minimal', label: 'Just my body', hint: 'no equipment needed' },
];

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

/** The contract's derivation: a muscular build took time to build; everything else starts easy. */
function experienceForBuild(build: string): ExperienceLevel {
  return build === 'muscular' ? 'intermediate' : 'beginner';
}

export function AiConfirmStep() {
  const { draft, patch, goTo, commitAndNext, saving, hydrated } = useOnboarding();
  // One read per mount is enough — the scan cannot change while this screen is up.
  const scan = React.useMemo(() => peekScan(), []);
  const seededRef = React.useRef(false);

  /**
   * Seed AFTER hydration only (see OnboardingProvider.hydrated): the stored draft merges in the
   * same commit as mount effects, so seeding early would be silently overwritten. Only fields
   * the athlete has not already answered are touched — a back-navigation must not re-assert
   * guesses over corrections.
   */
  React.useEffect(() => {
    if (!hydrated || seededRef.current) return;
    seededRef.current = true;
    const init: Partial<OnboardingDraft> = {};
    if (scan) {
      init.ai_build = scan.build;
      if (!draft.ai_age_bucket) {
        init.ai_age_bucket = scan.ageBucket;
        init.birthdate = birthdateForAgeBucket(scan.ageBucket);
      }
      if (!draft.ai_weight_band) {
        const band = weightBandFor(scan.weightBandKg.low, scan.weightBandKg.high);
        init.ai_weight_band = band.id;
        init.weight_kg = band.mid;
      }
      if (!draft.ai_body_fat_band) init.ai_body_fat_band = scan.bodyFatBand;
      if (!draft.experience_level) init.experience_level = experienceForBuild(scan.build);
    }
    // Schedule defaults (contract): 4 days Mon/Tue/Thu/Fri, 60 min — said in copy below,
    // editable later in Settings. Never overwrites an answered schedule.
    if (draft.days_per_week == null) init.days_per_week = 4;
    if (!draft.preferred_days?.length) init.preferred_days = [0, 1, 3, 4];
    if (draft.session_minutes == null) init.session_minutes = 60;
    if (Object.keys(init).length) patch(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot seed, gated on hydration
  }, [hydrated]);

  // "estimated" tags: provenance, live — they name fields still standing on the scan's guess and
  // disappear the moment the athlete overrules one.
  const estimated = {
    age: !!scan && draft.ai_age_bucket === scan.ageBucket,
    weight:
      !!scan &&
      draft.ai_weight_band === weightBandFor(scan.weightBandKg.low, scan.weightBandKg.high).id,
    bodyFat: !!scan && draft.ai_body_fat_band === scan.bodyFatBand,
    experience: !!scan && draft.experience_level === experienceForBuild(scan.build),
  };

  const canContinue =
    !!draft.ai_age_bucket &&
    !!draft.ai_weight_band &&
    !!draft.ai_body_fat_band &&
    !!draft.ai_height_band &&
    !!draft.sex &&
    !!draft.diet_base &&
    !!draft.training_location &&
    !!draft.experience_level;

  const next = async () => {
    // The hand-off is done: only the CONFIRMED buckets (now in the draft) survive from here on
    // (contract §F1 — never the raw pre-confirmation guesses).
    clearScan();
    await commitAndNext('ai_confirm');
  };

  return (
    <>
      <div className="scroll-region safe-top flex flex-col px-6 pb-2">
        <div className="flex flex-none items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => goTo('ai_photos')}
            className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeftIcon size={22} />
          </button>
        </div>

        <h1 className="flex-none font-display text-[clamp(1.375rem,5.6vw,1.75rem)] font-bold leading-[1.15] tracking-tight text-foreground">
          Here’s what we read
        </h1>
        <p className="mt-1.5 flex-none text-[0.8125rem] leading-snug text-muted-foreground">
          {scan
            ? 'Estimates, not verdicts — tap any chip to change it. Nothing counts until you continue.'
            : 'No scan this time — pick your ranges below. It takes the same thirty seconds.'}
        </p>

        <div className="mt-4 flex-none space-y-5">
          <ChipSection
            label="Age range"
            estimated={estimated.age}
            estimatedTestId="ai-estimated-age"
          >
            {AI_AGE_BUCKETS.map((b) => (
              <Chip
                key={b}
                selected={draft.ai_age_bucket === b}
                data-testid={`ai-chip-age-${b}`}
                onClick={() => patch({ ai_age_bucket: b, birthdate: birthdateForAgeBucket(b) })}
              >
                {AGE_LABEL[b]}
              </Chip>
            ))}
          </ChipSection>

          <ChipSection
            label="Weight range"
            estimated={estimated.weight}
            estimatedTestId="ai-estimated-weight"
          >
            {WEIGHT_BANDS.map((b) => (
              <Chip
                key={b.id}
                selected={draft.ai_weight_band === b.id}
                data-testid={`ai-chip-weight-${b.id}`}
                onClick={() => patch({ ai_weight_band: b.id, weight_kg: b.mid })}
              >
                {b.label}
              </Chip>
            ))}
          </ChipSection>

          <ChipSection
            label="Body fat"
            estimated={estimated.bodyFat}
            estimatedTestId="ai-estimated-bodyfat"
          >
            {AI_BODY_FAT_BANDS.map((b) => (
              <Chip
                key={b}
                selected={draft.ai_body_fat_band === b}
                data-testid={`ai-chip-bodyfat-${b}`}
                onClick={() => patch({ ai_body_fat_band: b })}
              >
                {BODY_FAT_LABEL[b]}
              </Chip>
            ))}
          </ChipSection>

          <ChipSection label="Height" hint="feet + inches · cm">
            {HEIGHT_BANDS.map((b) => (
              <Chip
                key={b.id}
                selected={draft.ai_height_band === b.id}
                data-testid={`ai-chip-height-${b.id}`}
                onClick={() => patch({ ai_height_band: b.id, height_cm: b.mid })}
              >
                {b.label}
              </Chip>
            ))}
          </ChipSection>

          <ChipSection label="Sex">
            {SEX_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={draft.sex === o.value}
                data-testid={`ai-chip-sex-${o.value}`}
                onClick={() => patch({ sex: o.value })}
              >
                {o.label}
              </Chip>
            ))}
          </ChipSection>

          <ChipSection label="How you eat">
            {AI_DIET_BASES.map((b) => (
              <Chip
                key={b}
                selected={draft.diet_base === b}
                data-testid={`ai-chip-diet-${b}`}
                onClick={() => patch({ diet_base: b, diet_type: BASE_TO_DIET_TYPE[b] })}
              >
                {DIET_BASE_LABEL[b]}
              </Chip>
            ))}
          </ChipSection>

          <ChipSection label="Anything to avoid" hint="optional — these are hard filters">
            {AI_DIET_AVOID.map((tag) => {
              const on = draft.diet_avoid?.includes(tag) ?? false;
              return (
                <Chip
                  key={tag}
                  selected={on}
                  data-testid={`ai-chip-avoid-${tag}`}
                  onClick={() => {
                    const nextAvoid = on
                      ? (draft.diet_avoid ?? []).filter((t) => t !== tag)
                      : [...(draft.diet_avoid ?? []), tag];
                    // Keep the existing allergen list in sync where the vocabularies overlap, so
                    // catalog filtering works on an AI-Mode draft exactly as on a classic one.
                    patch({
                      diet_avoid: nextAvoid,
                      allergies: nextAvoid.flatMap((t) => AVOID_TO_ALLERGENS[t]),
                    });
                  }}
                >
                  {DIET_AVOID_LABEL[tag]}
                </Chip>
              );
            })}
          </ChipSection>

          <ChipSection label="Where you’ll train">
            {TRAIN_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={draft.training_location === o.value}
                data-testid={`ai-chip-train-${o.value}`}
                onClick={() =>
                  // The location's standard preset (same shared rule as the classic equipment
                  // screen) — editable any time in Settings, like everything else here.
                  patch({
                    training_location: o.value,
                    equipment_slugs: equipmentPresetForLocation(o.value, DEMO_EQUIPMENT).preset,
                  })
                }
              >
                {o.label}
              </Chip>
            ))}
            {draft.training_location && (
              <p className="w-full text-[11px] leading-snug text-muted-foreground">
                {TRAIN_OPTIONS.find((o) => o.value === draft.training_location)?.hint}
              </p>
            )}
          </ChipSection>

          <ChipSection
            label="Lifting experience"
            estimated={estimated.experience}
            estimatedTag="guessed from your build — tap to change"
            estimatedTestId="ai-estimated-experience"
          >
            {EXPERIENCE_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={draft.experience_level === o.value}
                data-testid={`ai-chip-experience-${o.value}`}
                onClick={() => patch({ experience_level: o.value })}
              >
                {o.label}
              </Chip>
            ))}
          </ChipSection>
        </div>

        <p
          className="mt-5 flex-none text-[11.5px] leading-snug text-muted-foreground"
          data-testid="ai-schedule-note"
        >
          We’ll start you at four sessions a week — Mon, Tue, Thu, Fri, about an hour each. Change
          any of it whenever you like in Settings.
        </p>

        <div className="min-h-3 flex-1" />
      </div>

      <div className="cta-dock px-6">
        <Button
          size="lg"
          block
          glow
          texture
          disabled={!canContinue}
          loading={saving}
          onClick={next}
          data-testid="ai-confirm-continue"
        >
          Looks right — continue
        </Button>
      </div>
    </>
  );
}

/** One question: a label row (with the honest provenance tag when relevant) over wrapped chips. */
function ChipSection({
  label,
  hint,
  estimated,
  estimatedTag = 'estimated — tap to change',
  estimatedTestId,
  children,
}: {
  label: string;
  hint?: string;
  estimated?: boolean;
  estimatedTag?: string;
  estimatedTestId?: string;
  children: React.ReactNode;
}) {
  // The chips are toggle buttons with bare band values as names ("26–35"); without a
  // programmatic group label a screen-reader user hears numbers with no question attached.
  const labelId = React.useId();
  return (
    <section>
      <p
        id={labelId}
        className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium text-foreground"
      >
        {label}
        {estimated && (
          <span
            className="inline-flex items-center gap-1 text-[10.5px] font-medium text-accent"
            data-testid={estimatedTestId}
          >
            <SparkleIcon size={11} aria-hidden /> {estimatedTag}
          </span>
        )}
        {hint && <span className="text-[10.5px] font-normal text-muted-foreground">{hint}</span>}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {children}
      </div>
    </section>
  );
}
