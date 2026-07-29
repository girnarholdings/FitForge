/**
 * BODY-METRIC UNITS: a dictionary, and a parser that meets people where they type.
 *
 * "5'10" is not an edge case — it is how a large share of humans state their height, and a
 * `type="number"` input cannot even receive the apostrophe. So the fields are TEXT, every unit
 * the app understands lives in one dictionary (which is also what the unit dropdowns render
 * from), and the parser accepts the notations people actually use:
 *
 *   height:  5'10  ·  5'10"  ·  5 ft 10  ·  5 feet 10 in  ·  5-10  ·  70in  ·  178  ·  178cm  ·  1.78m
 *   weight:  82  ·  82kg  ·  180 lb  ·  180.5 lbs  ·  12st 7  ·  12 stone 7lb  ·  12.5st
 *
 * Two principles, learned from the nutrition parser:
 *   · An EXPLICIT unit in the text always wins over the dropdown — someone who typed "180lb" with
 *     the dropdown on kg meant pounds, and silently storing 180 kg would be a body-weight typo of
 *     record-shattering magnitude.
 *   · A BARE NUMBER is read in the dropdown's unit, except where that produces a physically
 *     absurd human ("5" as centimetres, "300" as inches) — those fall back to the interpretation
 *     that describes a person who could exist. The guard rails are wide (54–272 cm spans the
 *     shortest and tallest adults ever verified; 20–500 kg similar) so they only catch unit
 *     mix-ups, never unusual bodies.
 *
 * Everything is stored canonically in cm / kg; the dictionary's `format` renders any canonical
 * value back in any unit, which is what keeps the "→ 178 cm · 5′10″" echo honest in both systems.
 */

export const CM_PER_IN = 2.54;
export const CM_PER_FT = 30.48;
export const KG_PER_LB = 0.45359237;
export const KG_PER_ST = 6.35029318;

/** Sanity bounds for a live adult human (see header — wide on purpose). */
const HEIGHT_CM = { min: 54, max: 272 };
const WEIGHT_KG = { min: 20, max: 500 };

export interface UnitDef {
  id: string;
  /** dropdown label */
  label: string;
  /** short suffix for echoes, e.g. "cm", "lb" */
  suffix: string;
  /** render a canonical (cm or kg) value in this unit */
  format: (canonical: number) => string;
}

export const HEIGHT_UNITS: readonly UnitDef[] = [
  {
    id: 'cm',
    label: 'cm',
    suffix: 'cm',
    format: (cm) => `${Math.round(cm)} cm`,
  },
  {
    id: 'ftin',
    label: 'ft + in',
    suffix: 'ft in',
    format: (cm) => {
      const totalIn = cm / CM_PER_IN;
      let ft = Math.floor(totalIn / 12);
      let inch = Math.round(totalIn - ft * 12);
      if (inch === 12) {
        ft += 1;
        inch = 0;
      }
      return `${ft}′${inch}″`;
    },
  },
  {
    id: 'in',
    label: 'inches',
    suffix: 'in',
    format: (cm) => `${Math.round((cm / CM_PER_IN) * 10) / 10} in`,
  },
  {
    id: 'm',
    label: 'metres',
    suffix: 'm',
    format: (cm) => `${Math.round(cm) / 100} m`,
  },
] as const;

export const WEIGHT_UNITS: readonly UnitDef[] = [
  {
    id: 'kg',
    label: 'kg',
    suffix: 'kg',
    format: (kg) => `${Math.round(kg * 10) / 10} kg`,
  },
  {
    id: 'lb',
    label: 'lb',
    suffix: 'lb',
    format: (kg) => `${Math.round((kg / KG_PER_LB) * 10) / 10} lb`,
  },
  {
    id: 'st',
    label: 'st + lb',
    suffix: 'st lb',
    format: (kg) => {
      const totalLb = kg / KG_PER_LB;
      let st = Math.floor(totalLb / 14);
      let lb = Math.round(totalLb - st * 14);
      if (lb === 14) {
        st += 1;
        lb = 0;
      }
      return `${st} st ${lb} lb`;
    },
  },
] as const;

export interface ParseResult {
  /** canonical value — cm for height, kg for weight */
  value: number;
  /** the unit the text was read in (dictionary id) — how the echo names what it understood */
  unit: string;
}

const inRange = (n: number, r: { min: number; max: number }) => n >= r.min && n <= r.max;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Height from free text → canonical cm, or null when the text does not describe a height.
 * `preferredUnit` is the dropdown; explicit units in the text override it.
 */
export function parseHeight(raw: string, preferredUnit: string): ParseResult | null {
  const text = raw.trim().toLowerCase().replace(/,/g, '.');
  if (!text) return null;

  // 5'10", 5’10, 5 ft 10, 5 feet 10 in, 5ft10in, 5-10 (dash only between two ft/in-plausible
  // small numbers, so "178-" noise does not match)
  const ftin =
    /^(\d{1,2}(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:"|”|in\.?|inches)?\s*$/.exec(
      text,
    ) ?? /^([3-8])\s*-\s*(\d{1,2})$/.exec(text);
  if (ftin) {
    const ft = parseFloat(ftin[1]!);
    const inch = ftin[2] != null ? parseFloat(ftin[2]) : 0;
    const cm = ft * CM_PER_FT + inch * CM_PER_IN;
    return inRange(cm, HEIGHT_CM) ? { value: r1(cm), unit: 'ftin' } : null;
  }

  const unitful = /^(\d+(?:\.\d+)?)\s*(cm|centimetres?|centimeters?|m|metres?|meters?|in|inch|inches|")\s*$/.exec(
    text,
  );
  if (unitful) {
    const n = parseFloat(unitful[1]!);
    const u = unitful[2]!;
    const cm = u.startsWith('c') ? n : u === 'm' || u.startsWith('met') ? n * 100 : n * CM_PER_IN;
    const unit = u.startsWith('c') ? 'cm' : u === 'm' || u.startsWith('met') ? 'm' : 'in';
    return inRange(cm, HEIGHT_CM) ? { value: r1(cm), unit } : null;
  }

  const bare = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (!bare) return null;
  const n = parseFloat(bare[1]!);

  // The dropdown's reading first; physically-absurd readings fall through to one that could
  // describe a living person. "1.78" with the dropdown on cm is a metres entry; "70" on cm is
  // ambiguous nonsense as cm (70 cm adult) but a fine inches value.
  const candidates: Array<{ unit: string; cm: number }> = [];
  if (preferredUnit === 'cm') candidates.push({ unit: 'cm', cm: n });
  if (preferredUnit === 'm') candidates.push({ unit: 'm', cm: n * 100 });
  if (preferredUnit === 'in' || preferredUnit === 'ftin')
    candidates.push({ unit: 'in', cm: n * CM_PER_IN });
  candidates.push(
    { unit: 'cm', cm: n },
    { unit: 'm', cm: n * 100 },
    { unit: 'in', cm: n * CM_PER_IN },
    // a bare 5.8-style entry with an imperial dropdown reads as decimal feet
    { unit: 'ftin', cm: n * CM_PER_FT },
  );
  for (const c of candidates) {
    if (inRange(c.cm, HEIGHT_CM)) return { value: r1(c.cm), unit: c.unit };
  }
  return null;
}

/** Weight from free text → canonical kg, or null. Same contract as {@link parseHeight}. */
export function parseWeight(raw: string, preferredUnit: string): ParseResult | null {
  const text = raw.trim().toLowerCase().replace(/,/g, '.');
  if (!text) return null;

  // 12st 7, 12 stone 7lb, 12.5st
  const stlb =
    /^(\d{1,2}(?:\.\d+)?)\s*(?:st\.?|stones?)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:lbs?\.?|pounds?)?\s*$/.exec(
      text,
    );
  if (stlb) {
    const st = parseFloat(stlb[1]!);
    const lb = stlb[2] != null ? parseFloat(stlb[2]) : 0;
    const kg = st * KG_PER_ST + lb * KG_PER_LB;
    return inRange(kg, WEIGHT_KG) ? { value: r1(kg), unit: 'st' } : null;
  }

  const unitful = /^(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|kilograms?|lb|lbs|pounds?)\s*$/.exec(text);
  if (unitful) {
    const n = parseFloat(unitful[1]!);
    const isKg = unitful[2]!.startsWith('k');
    const kg = isKg ? n : n * KG_PER_LB;
    return inRange(kg, WEIGHT_KG) ? { value: r1(kg), unit: isKg ? 'kg' : 'lb' } : null;
  }

  const bare = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (!bare) return null;
  const n = parseFloat(bare[1]!);
  const candidates: Array<{ unit: string; kg: number }> = [];
  if (preferredUnit === 'kg') candidates.push({ unit: 'kg', kg: n });
  if (preferredUnit === 'lb') candidates.push({ unit: 'lb', kg: n * KG_PER_LB });
  if (preferredUnit === 'st') candidates.push({ unit: 'st', kg: n * KG_PER_ST });
  candidates.push(
    { unit: 'kg', kg: n },
    { unit: 'lb', kg: n * KG_PER_LB },
    { unit: 'st', kg: n * KG_PER_ST },
  );
  for (const c of candidates) {
    if (inRange(c.kg, WEIGHT_KG)) return { value: r1(c.kg), unit: c.unit };
  }
  return null;
}

export function heightUnit(id: string): UnitDef {
  return HEIGHT_UNITS.find((u) => u.id === id) ?? HEIGHT_UNITS[0]!;
}
export function weightUnit(id: string): UnitDef {
  return WEIGHT_UNITS.find((u) => u.id === id) ?? WEIGHT_UNITS[0]!;
}
