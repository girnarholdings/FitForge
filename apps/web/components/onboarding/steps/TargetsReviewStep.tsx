'use client';

import * as React from 'react';
import { computeNutritionTargets } from '@fitforge/shared/rules';
import { m, SPRING } from '@/components/ui/motion';
import { useOnboarding } from '../OnboardingProvider';
import type { OnboardingDraft } from '../types';
import { OnboardingFooter } from '../OnboardingFooter';

type TargetField = 'kcal_target' | 'protein_g_target' | 'carbs_g_target' | 'fat_g_target';

function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Screen 11 · Targets review (§2.2 / §7.2.4) — DEMO MODE. Targets are computed deterministically
 * from the draft with the §7.2.4 macros rule (Mifflin–St Jeor); editable.
 */
export function TargetsReviewStep() {
  const { draft, patch } = useOnboarding();
  const [method, setMethod] = React.useState<string>('');

  // Instant client-side computation (§7.2.4 mirror) the first time we arrive.
  React.useEffect(() => {
    const preview = computeNutritionTargets({
      sex: draft.sex,
      weight_kg: draft.weight_kg,
      height_cm: draft.height_cm,
      age: ageFromBirthdate(draft.birthdate),
      days_per_week: draft.days_per_week,
      primary_goal: draft.primary_goal ?? 'general_health',
      diet_type: draft.diet_type,
    });
    setMethod(preview.method);
    if (draft.kcal_target != null) return;
    patch({
      kcal_target: preview.kcal,
      protein_g_target: preview.protein_g,
      carbs_g_target: preview.carbs_g,
      fat_g_target: preview.fat_g,
      targets_source: 'suggested',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (field: TargetField, raw: string) => {
    const n = parseInt(raw, 10);
    const value = Number.isNaN(n) ? null : n;
    const next: Partial<OnboardingDraft> = { targets_source: 'custom' };
    next[field] = value;
    patch(next);
  };

  const rows: { key: TargetField; label: string; unit: string; value: number | null }[] = [
    { key: 'kcal_target', label: 'Calories', unit: 'kcal', value: draft.kcal_target },
    { key: 'protein_g_target', label: 'Protein', unit: 'g', value: draft.protein_g_target },
    { key: 'carbs_g_target', label: 'Carbs', unit: 'g', value: draft.carbs_g_target },
    { key: 'fat_g_target', label: 'Fat', unit: 'g', value: draft.fat_g_target },
  ];

  const pk = (draft.protein_g_target ?? 0) * 4;
  const ck = (draft.carbs_g_target ?? 0) * 4;
  const fk = (draft.fat_g_target ?? 0) * 9;
  const totalK = Math.max(1, pk + ck + fk);
  const macroColors = ['var(--color-accent)', 'var(--color-success)', 'var(--color-energy)'];
  const segments = [
    { label: 'Protein', kcal: pk },
    { label: 'Carbs', kcal: ck },
    { label: 'Fat', kcal: fk },
  ];

  return (
    <div className="space-y-6">
      <div className="border-gradient-gold overflow-hidden rounded-card shadow-[var(--shadow-card)]">
        <div className="px-5 pb-4 pt-5" style={{ background: 'var(--gradient-ember-bg)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">
            Your daily target
          </p>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums text-foreground">
            {/* Keyed on the value: the number physically arrives, and REARRIVES when edited —
                the payoff moment of the whole questionnaire should not just be sitting there. */}
            <m.span
              key={draft.kcal_target ?? 'none'}
              initial={{ opacity: 0, scale: 0.8, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={SPRING}
              className="inline-block text-gradient-gold"
            >
              {draft.kcal_target ?? '—'}
            </m.span>{' '}
            <span className="text-lg font-semibold text-muted-foreground">kcal / day</span>
          </p>
          {method && <p className="mt-1 text-xs text-muted-foreground">{method}</p>}
          <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
            {segments.map((s, i) => (
              <m.div
                key={s.label}
                initial={{ width: 0 }}
                animate={{ width: `${(s.kcal / totalK) * 100}%` }}
                transition={{ ...SPRING, delay: 0.12 * i }}
                style={{ backgroundColor: macroColors[i] }}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-4">
            {segments.map((s, i) => (
              <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: macroColors[i] }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <label
            key={r.key}
            className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3 shadow-[var(--shadow-card)]"
          >
            <span className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: i === 0 ? 'var(--color-muted-foreground)' : macroColors[i - 1] }}
              />
              <span className="text-sm font-semibold text-foreground">{r.label}</span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={r.value ?? ''}
                onChange={(e) => edit(r.key, e.target.value)}
                className="h-11 w-24 rounded-xl border border-border bg-surface px-3 text-right text-base tabular-nums text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent"
              />
              <span className="w-8 text-sm text-muted-foreground">{r.unit}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {draft.targets_source === 'custom'
          ? 'Using your custom targets.'
          : 'These are our suggestions — adjust any number and it becomes your custom target.'}
      </p>

      <div className="flex-1" />
      <OnboardingFooter step="targets_review" continueLabel="Sounds right" canContinue={draft.kcal_target != null} />
    </div>
  );
}
