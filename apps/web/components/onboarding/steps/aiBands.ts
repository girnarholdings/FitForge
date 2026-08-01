'use client';

/**
 * THE BUCKET TABLES for the ai_confirm screen — every band the UI offers, with the midpoint it
 * writes into the draft.
 *
 * LAW 2 (docs/AIMODE-CONTRACT.md): buckets, never numbers, in everything the athlete sees; the
 * MIDPOINTS feed the math internally, because the research showed bucket-level coarseness is
 * inside Mifflin-St Jeor's own error band. So `label` is what renders on a chip and `mid` is
 * what lands in `draft.weight_kg` / `draft.height_cm` / the birthdate year — and no copy
 * anywhere may print a `mid`.
 */
import type { AiAgeBucket } from '@fitforge/shared/schemas';

export interface Band {
  id: string;
  label: string;
  low: number;
  high: number;
  /** the number the deterministic generators receive — internal only, never rendered */
  mid: number;
}

/** 10 kg weight bands (contract). Open ends closed the same way the worker closes them (±10). */
export const WEIGHT_BANDS: readonly Band[] = [
  { id: 'under-50', label: 'Under 50 kg', low: 40, high: 50, mid: 45 },
  { id: '50-60', label: '50–60 kg', low: 50, high: 60, mid: 55 },
  { id: '60-70', label: '60–70 kg', low: 60, high: 70, mid: 65 },
  { id: '70-80', label: '70–80 kg', low: 70, high: 80, mid: 75 },
  { id: '80-90', label: '80–90 kg', low: 80, high: 90, mid: 85 },
  { id: '90-100', label: '90–100 kg', low: 90, high: 100, mid: 95 },
  { id: '100-110', label: '100–110 kg', low: 100, high: 110, mid: 105 },
  { id: '110-120', label: '110–120 kg', low: 110, high: 120, mid: 115 },
  { id: 'over-120', label: 'Over 120 kg', low: 120, high: 130, mid: 125 },
];

/** The worker returns a closed {low, high}; route it to the band its centre falls in. */
export function weightBandFor(low: number, high: number): Band {
  const centre = (low + high) / 2;
  return (
    WEIGHT_BANDS.find((b) => centre >= b.low && centre < b.high) ??
    (centre >= 120 ? WEIGHT_BANDS[WEIGHT_BANDS.length - 1]! : WEIGHT_BANDS[0]!)
  );
}

/** 5 cm height bands, 150–200+ (contract "height band (5cm bands 150-200+)"). */
export const HEIGHT_BANDS: readonly Band[] = [
  { id: 'under-150', label: 'Under 150 cm', low: 145, high: 150, mid: 147.5 },
  ...Array.from({ length: 10 }, (_, i) => {
    const low = 150 + i * 5;
    const high = low + 5;
    return { id: `${low}-${high}`, label: `${low}–${high} cm`, low, high, mid: (low + high) / 2 };
  }),
  { id: 'over-200', label: 'Over 200 cm', low: 200, high: 205, mid: 202.5 },
];

/**
 * Age-bucket midpoints. The existing generators want a birthdate, so the midpoint becomes
 * `{thisYear − mid}-01-01` — January 1st keeps the derived age equal to `mid` all year.
 * Never a real birthdate, never shown ("exact-age anything" is out of scope by contract).
 */
export const AGE_BUCKET_MID: Record<AiAgeBucket, number> = {
  '18-25': 22,
  '26-35': 30,
  '36-45': 40,
  '46-55': 50,
  '56+': 60,
};

export function birthdateForAgeBucket(bucket: AiAgeBucket): string {
  const year = new Date().getFullYear() - AGE_BUCKET_MID[bucket];
  return `${year}-01-01`;
}
