'use client';

import * as React from 'react';
import {
  suggestOnboardingDefaults,
  evenlySpacedWeekdays,
} from '@fitforge/shared/rules';
import { SESSION_MINUTE_OPTIONS } from '@fitforge/shared/schemas';
import { Chip, Stepper } from '@/components/ui';
import { useOnboarding } from '../OnboardingProvider';
import { OnboardingFooter } from '../OnboardingFooter';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0..6 (§4.3)

/** Screen 4 · Schedule (§2.2). Days/week stepper + weekday chips + session length. */
export function ScheduleStep() {
  const { draft, patch } = useOnboarding();

  // Seed defaults from goal × experience the first time we land here (§2.2 / §7.2.5).
  React.useEffect(() => {
    if (draft.days_per_week == null && draft.primary_goal && draft.experience_level) {
      const d = suggestOnboardingDefaults(draft.primary_goal, draft.experience_level);
      patch({
        days_per_week: d.days_per_week,
        session_minutes: d.session_minutes,
        preferred_days: evenlySpacedWeekdays(d.days_per_week),
      });
    }
  }, [draft.days_per_week, draft.primary_goal, draft.experience_level, patch]);

  const days = draft.days_per_week ?? 3;
  const minutes = draft.session_minutes ?? 45;
  const selectedDays = new Set(draft.preferred_days);

  const setDays = (n: number) => {
    // re-derive an evenly-spaced weekday pattern to match the new count (§2.2 autofill), and drop
    // any previously chosen split so the next screen re-recommends for the new frequency (WS-5).
    patch({ days_per_week: n, preferred_days: evenlySpacedWeekdays(n), split_slug: null });
  };

  const toggleDay = (idx: number) => {
    const next = new Set(selectedDays);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    patch({ preferred_days: [...next].sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-8">
      <section>
        <p className="mb-3 text-sm font-medium text-foreground">Days per week</p>
        <Stepper value={days} onChange={setDays} min={1} max={7} unit="days" aria-label="Days per week" />
      </section>

      <section>
        <p className="mb-3 text-sm font-medium text-foreground">Which days?</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((label, idx) => (
            <Chip key={label} selected={selectedDays.has(idx)} onClick={() => toggleDay(idx)}>
              {label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {selectedDays.size} selected · we pre-picked an evenly spaced pattern.
        </p>
      </section>

      <section>
        <p className="mb-3 text-sm font-medium text-foreground">Session length</p>
        <div className="flex flex-wrap gap-2">
          {SESSION_MINUTE_OPTIONS.map((m) => (
            <Chip
              key={m}
              selected={minutes === m}
              onClick={() => patch({ session_minutes: m })}
            >
              {m} min
            </Chip>
          ))}
        </div>
      </section>

      <div className="flex-1" />
      <OnboardingFooter step="schedule" canContinue={days >= 1} />
    </div>
  );
}
