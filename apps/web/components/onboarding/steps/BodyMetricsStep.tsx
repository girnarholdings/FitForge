'use client';

import * as React from 'react';
import type { SexType } from '@fitforge/shared/types';
import { Chip } from '@/components/ui';
import { m, AnimatePresence, SPRING } from '@/components/ui/motion';
import { BodyIcon, TapeIcon, ScaleIcon, CalendarIcon, CheckIcon } from '@/components/ui/icons';
import {
  HEIGHT_UNITS,
  WEIGHT_UNITS,
  parseHeight,
  parseWeight,
  heightUnit,
  weightUnit,
} from '@/lib/units/bodyMetrics';
import { useOnboarding } from '../OnboardingProvider';
import type { OnboardingDraft } from '../types';
import { OnboardingFooter } from '../OnboardingFooter';

const SEX_OPTIONS: { value: SexType; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

function ageFrom(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Screen 11 · Body metrics — TYPE IT YOUR WAY.
 *
 * The old screen was two `type="number"` boxes, which could not even RECEIVE "5'10" — the
 * apostrophe was swallowed by the browser. These are free-text fields over a unit dictionary
 * (lib/units/bodyMetrics): the dropdown states how a bare number will be read, the parser accepts
 * every notation people actually type (5'10", 178cm, 1.78m, 180 lb, 12st 7…), and an explicit
 * unit in the text always beats the dropdown.
 *
 * THE ECHO IS THE INTERFACE. Under each field, the app says what it understood — "✓ 5′10″ ·
 * 178 cm", both systems at once — the moment the text parses, with a small spring so being
 * understood FEELS like something. That echo is also the safety net for the parser's one hard
 * problem (bare numbers): if the app read "70" as inches when you meant kilograms of height…
 * you see it instantly, in your own unit and the other one.
 */
export function BodyMetricsStep() {
  const { draft, patch } = useOnboarding();

  // Locale seeds the DISPLAY units once; medians seed values so the next screen always has
  // something to compute targets from. (§2.2 — everything on this screen is optional.)
  const isUS = typeof navigator !== 'undefined' && /US$/i.test(navigator.language ?? '');
  const [hUnit, setHUnit] = React.useState(isUS ? 'ftin' : 'cm');
  const [wUnit, setWUnit] = React.useState(isUS ? 'lb' : 'kg');

  React.useEffect(() => {
    const init: Partial<OnboardingDraft> = {};
    if (isUS && draft.unit_system === 'metric') init.unit_system = 'imperial';
    if (draft.height_cm == null) init.height_cm = 170;
    if (draft.weight_kg == null) init.weight_kg = 70;
    if (Object.keys(init).length) patch(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const age = ageFrom(draft.birthdate);

  return (
    <div className="space-y-6">
      <section>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-muted text-accent">
            <BodyIcon size={16} />
          </span>
          Sex
        </p>
        <div className="flex flex-wrap gap-2">
          {SEX_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={draft.sex === o.value}
              onClick={() => patch({ sex: o.value })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      <MetricField
        icon={<TapeIcon size={16} />}
        label="Height"
        placeholder={hUnit === 'ftin' ? `e.g. 5'10"` : hUnit === 'm' ? 'e.g. 1.78' : 'e.g. 178'}
        units={HEIGHT_UNITS}
        unitId={hUnit}
        onUnit={setHUnit}
        canonical={draft.height_cm}
        parse={(text) => parseHeight(text, hUnit)?.value ?? null}
        echo={(cm) => `${heightUnit('ftin').format(cm)} · ${heightUnit('cm').format(cm)}`}
        // The unit dropdown re-renders the stored value in the chosen unit, so switching from cm
        // to ft+in TRANSLATES what you typed rather than wiping it.
        display={(cm, unit) => heightUnit(unit).format(cm)}
        onValue={(cm) => {
          patch({ height_cm: cm });
        }}
        testId="height-field"
      />

      <MetricField
        icon={<ScaleIcon size={16} />}
        label="Weight"
        placeholder={wUnit === 'lb' ? 'e.g. 180' : wUnit === 'st' ? 'e.g. 12st 7' : 'e.g. 82'}
        units={WEIGHT_UNITS}
        unitId={wUnit}
        onUnit={setWUnit}
        canonical={draft.weight_kg}
        parse={(text) => parseWeight(text, wUnit)?.value ?? null}
        echo={(kg) => `${weightUnit('kg').format(kg)} · ${weightUnit('lb').format(kg)}`}
        display={(kg, unit) => weightUnit(unit).format(kg)}
        onValue={(kg) => {
          patch({ weight_kg: kg });
        }}
        testId="weight-field"
      />

      <section>
        <label className="block">
          <span className="mb-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-muted text-accent">
              <CalendarIcon size={16} />
            </span>
            Birthdate
          </span>
          <input
            type="date"
            value={draft.birthdate ?? ''}
            onChange={(e) => patch({ birthdate: e.target.value || null })}
            className="h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-base text-foreground outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <AnimatePresence>
          {age != null && (
            <m.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
              className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="age-echo"
            >
              <CheckIcon size={12} className="text-success" />
              {age} years old — used only for your calorie math.
            </m.p>
          )}
        </AnimatePresence>
      </section>

      <p className="text-xs text-muted-foreground">
        All optional — but weight, height, sex and age make the calorie and macro targets on the
        next screens genuinely yours instead of a population average.
      </p>

      <div className="flex-1" />
      <OnboardingFooter step="body_metrics" skippable canContinue />
    </div>
  );
}

/**
 * One free-text metric field: icon, text box, unit dropdown, and the parse echo underneath.
 *
 * Text state is LOCAL while typing and committed upward per keystroke only when it parses —
 * half-typed input ("5'") must neither wipe the stored value nor scream red at someone
 * mid-thought. Invalid is only claimed once focus leaves the field with unparseable text.
 */
function MetricField({
  icon,
  label,
  placeholder,
  units,
  unitId,
  onUnit,
  canonical,
  parse,
  echo,
  display,
  onValue,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  units: readonly { id: string; label: string }[];
  unitId: string;
  onUnit: (id: string) => void;
  canonical: number | null;
  parse: (text: string) => number | null;
  echo: (canonical: number) => string;
  display: (canonical: number, unitId: string) => string;
  onValue: (canonical: number) => void;
  testId: string;
}) {
  const [text, setText] = React.useState(canonical != null ? display(canonical, unitId) : '');
  const [touchedInvalid, setTouchedInvalid] = React.useState(false);
  const parsed = parse(text);
  const shown = parsed ?? canonical;

  const onType = (raw: string) => {
    setText(raw);
    setTouchedInvalid(false);
    const v = parse(raw);
    if (v != null) onValue(v);
  };

  const onUnitChange = (id: string) => {
    onUnit(id);
    // Re-render the stored value in the new unit — translation, not erasure.
    if (canonical != null) setText(display(canonical, id));
    setTouchedInvalid(false);
  };

  return (
    <section data-testid={testId}>
      <label className="block">
        <span className="mb-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-muted text-accent">
            {icon}
          </span>
          {label}
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={text}
            placeholder={placeholder}
            aria-label={label}
            onChange={(e) => onType(e.target.value)}
            onBlur={() => setTouchedInvalid(text.trim().length > 0 && parse(text) == null)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 text-base text-foreground outline-none focus:ring-2 focus:ring-accent"
          />
          {/* The dictionary as a dropdown: how a bare number will be read. Typed units beat it. */}
          <select
            value={unitId}
            aria-label={`${label} unit`}
            data-testid={`${testId}-unit`}
            onChange={(e) => onUnitChange(e.target.value)}
            className="h-12 shrink-0 rounded-2xl border border-border bg-surface-2 px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-accent"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </label>

      {/* What the app understood, in both systems, springing in on every successful parse. Keyed
          on the value so a CHANGE re-runs the entrance — the echo visibly reacts to typing. */}
      <div className="min-h-6">
        <AnimatePresence mode="wait" initial={false}>
          {touchedInvalid ? (
            <m.p
              key="invalid"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-1.5 text-xs text-danger"
              data-testid={`${testId}-invalid`}
            >
              Couldn&apos;t read that — try like “{placeholder.replace('e.g. ', '')}”.
            </m.p>
          ) : shown != null ? (
            <m.p
              key={`ok-${shown}`}
              initial={{ opacity: 0, scale: 0.92, y: -3 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
              className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid={`${testId}-echo`}
            >
              <CheckIcon size={12} className="shrink-0 text-success" />
              <span className="tabular">{echo(shown)}</span>
            </m.p>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
