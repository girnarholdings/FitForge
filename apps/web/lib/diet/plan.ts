'use client';

/**
 * THE DIET PLAN GENERATOR — a 7-day rotating template from the frozen 100-recipe corpus
 * (RESEARCH-DIET §2/§4; interface pinned in docs/AIMODE-CONTRACT.md).
 *
 * SHAPE, decided by adherence evidence, not taste:
 *   · 2 alternating breakfasts (habit beats novelty at the most context-stable meal — §2),
 *   · lunches leftover-paired with the previous night's dinner on alternating days (cook once,
 *     eat twice — halves cooking events, the #1 practical adherence cost),
 *   · 5–6 distinct dinners across the week (variety across the week, monotony within the slot),
 *   · snacks as the macro shock-absorber, picked LAST to close each day's kcal/protein gap (§4.3).
 *
 * HARD BANDS per day (§4.2): kcal target ± max(100, 5%); protein −5/+25 g; every main
 * ≥ 0.4 g/kg protein (PER_MEAL_G_PER_KG — the single source in lib/food/portions). Carbs/fat get
 * no day band on purpose (Hall & Guo 2017: at matched kcal+protein the split doesn't move body
 * comp) — they are displayed, never failed on.
 *
 * DETERMINISM IS A CONTRACT TERM: the same input always yields the same plan. Every ordering in
 * here is total and seeded on a stable hash of the input — there is no Math.random and no clock.
 * Dietary preferences are HARD filters (base-diet lattice + avoid tags) — a preference miss is a
 * bug, not a ranking penalty.
 */
import type { NutritionTargets } from '@/components/features/_mock/data';
import { PER_MEAL_G_PER_KG } from '@/lib/food/portions';
import type { MealSlotName } from '@/lib/food/types';
import {
  satisfiesPrefs,
  slotPool,
  RECIPES,
  RECIPE_BY_ID,
  type DietPrefs,
  type Recipe,
} from './recipes';
import type { DietStance } from './stance';

export type { DietStance } from './stance';
export type { DietPrefs, AvoidTag, RecipeBaseDiet } from './recipes';

/** Portion steps a planned meal may take (contract: "servings usually 1, may be 1.5/2"). */
export const SERVING_STEPS: readonly number[] = [1, 1.5, 2];

export interface PlannedMeal {
  slot: MealSlotName;
  recipeId: string;
  servings: number;
  /** true when this lunch is the previous evening's dinner cooked ×2 (§2 leftover pairing). */
  leftover?: boolean;
}

export interface DietDay {
  meals: PlannedMeal[];
}

/**
 * The contract pins `{days}`; the extra fields carry the generation context the plan cannot be
 * interpreted without (swap filtering needs prefs + body weight, the UI needs targets/stance) —
 * consumers that only read `days` are unaffected.
 */
export interface DietPlan {
  days: DietDay[];
  stance: DietStance;
  prefs: DietPrefs;
  weightKg: number;
  targets: NutritionTargets;
}

export interface GenerateDietPlanInput {
  targets: NutritionTargets;
  weightKg: number;
  stance: DietStance;
  prefs: DietPrefs;
}

/* ---------------------------------------------------------------------- bands & arithmetic */

export interface Band {
  lo: number;
  hi: number;
}

/** §4.2 — kcal: target ± max(100 kcal, 5%). */
export function kcalBand(kcalTarget: number): Band {
  const tol = Math.max(100, kcalTarget * 0.05);
  return { lo: kcalTarget - tol, hi: kcalTarget + tol };
}

/** §4.2 — protein: −5 g / +25 g around target (overshoot is benign, undershoot defeats the point). */
export function proteinBand(proteinTarget: number): Band {
  return { lo: proteinTarget - 5, hi: proteinTarget + 25 };
}

/** §1.4 — every main meal carries at least this much protein. */
export function mainProteinFloor(weightKg: number): number {
  return PER_MEAL_G_PER_KG * weightKg;
}

export interface MealMacros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function mealMacros(recipe: Recipe, servings: number): MealMacros {
  return {
    kcal: recipe.per_serving.kcal * servings,
    protein_g: recipe.per_serving.protein_g * servings,
    carbs_g: recipe.per_serving.carbs_g * servings,
    fat_g: recipe.per_serving.fat_g * servings,
  };
}

export function dayTotals(day: DietDay): MealMacros {
  const total: MealMacros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const meal of day.meals) {
    const recipe = RECIPE_BY_ID.get(meal.recipeId);
    if (!recipe) continue;
    const m = mealMacros(recipe, meal.servings);
    total.kcal += m.kcal;
    total.protein_g += m.protein_g;
    total.carbs_g += m.carbs_g;
    total.fat_g += m.fat_g;
  }
  return total;
}

/* ------------------------------------------------------------------------- determinism seed */

/** FNV-1a — tiny, stable, and plenty for tie-breaking. NOT crypto, deliberately. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A canonical serialization of the input — key order fixed, avoid list sorted. */
function inputSeed(input: GenerateDietPlanInput): number {
  const t = input.targets;
  const canonical = [
    t.kcal_target,
    t.protein_g_target,
    t.carbs_g_target,
    t.fat_g_target,
    input.weightKg,
    input.stance,
    input.prefs.base,
    [...input.prefs.avoid].sort().join('+'),
  ].join('|');
  return fnv1a(canonical);
}

/* ----------------------------------------------------------------------------- generation */

interface Option {
  recipe: Recipe;
  servings: number;
  kcal: number;
  protein: number;
}

/** Serving steps at which a main clears the 0.4 g/kg floor; empty when it never does. */
function mainServings(recipe: Recipe, floor: number): number[] {
  return SERVING_STEPS.filter((s) => recipe.per_serving.protein_g * s >= floor - 1e-9);
}

interface DaySolution {
  meals: PlannedMeal[];
  /** 0 = all hard bands met; otherwise the summed distance outside them. */
  violation: number;
  score: number;
}

export function generateDietPlan(input: GenerateDietPlanInput): DietPlan {
  const { targets, weightKg, stance, prefs } = input;
  const kcalTarget = targets.kcal_target;
  const proteinTarget = targets.protein_g_target;
  const kBand = kcalBand(kcalTarget);
  const pBand = proteinBand(proteinTarget);
  const floor = mainProteinFloor(weightKg);
  const seed = inputSeed(input);
  const ord = (id: string): number => fnv1a(`${seed}:${id}`);

  // Template pools stay slot-true (dinners are dinner-slot recipes) even though the SWAP pool
  // for mains crosses lunch↔dinner — the weekly template should read like a normal week.
  const pool = {
    breakfast: slotPool('breakfast').filter((r) => satisfiesPrefs(r, prefs)),
    lunchNative: RECIPES.filter((r) => r.slot === 'lunch' && satisfiesPrefs(r, prefs)),
    dinner: RECIPES.filter((r) => r.slot === 'dinner' && satisfiesPrefs(r, prefs)),
    snack: slotPool('snack').filter((r) => satisfiesPrefs(r, prefs)),
  };

  /**
   * Rank a slot's candidates: dishes that can clear the protein floor first, closest to the
   * slot's share of the day's kcal (§4.2 envelopes as a PREFERENCE, not a hard band), with a
   * nudge toward dishes that have many same-slot neighbours in kcal (that is what §5's ≥3-swap
   * generator guarantee wants) and toward high-protein tags when the stance leans on protein.
   */
  function rank(candidates: Recipe[], kcalShare: number): Recipe[] {
    const share = kcalTarget * kcalShare;
    const scored = candidates.map((r) => {
      const feasible = mainServings(r, floor);
      const servings = feasible.length > 0 ? feasible : [...SERVING_STEPS];
      let bestFit = Number.POSITIVE_INFINITY;
      for (const s of servings) {
        bestFit = Math.min(bestFit, Math.abs(r.per_serving.kcal * s - share));
      }
      const window = Math.max(75, r.per_serving.kcal * 0.15);
      let mates = 0;
      for (const m of candidates) {
        if (m.id !== r.id && Math.abs(m.per_serving.kcal - r.per_serving.kcal) <= window) mates++;
      }
      let cost = bestFit - Math.min(mates, 4) * 12;
      if (feasible.length === 0) cost += 10_000; // never clears the protein floor — last resort
      if ((stance === 'cut' || stance === 'recomp') && r.tags.includes('high_protein')) cost -= 15;
      return { r, cost };
    });
    scored.sort((a, b) => a.cost - b.cost || ord(a.r.id) - ord(b.r.id) || (a.r.id < b.r.id ? -1 : 1));
    return scored.map((s) => s.r);
  }

  const breakfasts = rank(pool.breakfast, 0.25).slice(0, 2);
  const dinnerRanked = rank(pool.dinner, 0.35);
  const dinnerCount = Math.min(6, dinnerRanked.length);
  const dinners = dinnerRanked.slice(0, dinnerCount);
  const lunchNatives = rank(pool.lunchNative, 0.325).slice(0, 4);
  /** Full lunch pool (natives + dinner recipes) — the last-resort repair lever for the tightest
   *  filter stacks, where a forced leftover pairing can leave a day unsolvable. */
  const lunchRanked = rank(
    slotPool('lunch').filter((r) => satisfiesPrefs(r, prefs)),
    0.325,
  );

  // Snack options, precomputed once. Order is the deterministic ranked order so pair enumeration
  // is stable too.
  const snackRanked = rank(pool.snack, 0.15);
  const snackOptions: Option[] = [];
  for (const r of snackRanked) {
    for (const s of SERVING_STEPS) {
      snackOptions.push({
        recipe: r,
        servings: s,
        kcal: r.per_serving.kcal * s,
        protein: r.per_serving.protein_g * s,
      });
    }
  }

  /** Score one candidate day. Hard-band distance dominates; inside the bands, prefer landing on
   *  the kcal target with protein at-or-above target (§4.2: overshoot benign, undershoot not). */
  function assess(
    kcal: number,
    protein: number,
    mainsShortfall: number,
    finePenalty: number,
  ): { violation: number; score: number } {
    const kcalViolation = kcal < kBand.lo ? kBand.lo - kcal : kcal > kBand.hi ? kcal - kBand.hi : 0;
    const proteinViolation = protein < pBand.lo ? pBand.lo - protein : protein > pBand.hi ? protein - pBand.hi : 0;
    const violation = kcalViolation + proteinViolation * 2 + mainsShortfall * 4;
    const score =
      violation * 1_000_000 +
      Math.abs(kcal - kcalTarget) +
      Math.max(0, proteinTarget - protein) * 2 +
      Math.max(0, protein - proteinTarget - 10) * 0.5 +
      finePenalty;
    return { violation, score };
  }

  /** Solve one day for fixed main recipes: choose servings + snack(s) to close the gap. */
  function solveDay(bRec: Recipe, lRec: Recipe, dRec: Recipe, lunchLeftover: boolean): DaySolution {
    const snackCounts = kcalTarget > 2600 ? [2, 1] : [1, 2];
    let best: DaySolution | null = null;

    const bServ = mainServings(bRec, floor);
    const lServ = mainServings(lRec, floor);
    const dServ = mainServings(dRec, floor);
    const bSteps = bServ.length > 0 ? bServ : [...SERVING_STEPS];
    const lSteps = lServ.length > 0 ? lServ : [...SERVING_STEPS];
    const dSteps = dServ.length > 0 ? dServ : [...SERVING_STEPS];

    const shortfallOf = (r: Recipe, s: number): number =>
      Math.max(0, floor - r.per_serving.protein_g * s);

    const runSearch = (bs: readonly number[], ls: readonly number[], ds: readonly number[]): void => {
    for (const sB of bs) {
      for (const sL of ls) {
        for (const sD of ds) {
          const mainsKcal =
            bRec.per_serving.kcal * sB + lRec.per_serving.kcal * sL + dRec.per_serving.kcal * sD;
          const mainsProtein =
            bRec.per_serving.protein_g * sB +
            lRec.per_serving.protein_g * sL +
            dRec.per_serving.protein_g * sD;
          const mainsShortfall = shortfallOf(bRec, sB) + shortfallOf(lRec, sL) + shortfallOf(dRec, sD);
          const remaining = kcalTarget - mainsKcal;

          for (const count of snackCounts) {
            // Prune: a snack stack can only reach so far — skip main combos it cannot rescue.
            const reach = count === 1 ? 520 : 1040;
            if (remaining < -(kcalTarget - kBand.lo) - 50 || remaining > reach + 200) continue;

            if (count === 1) {
              for (const opt of snackOptions) {
                // Snacks at their base serving keep the densest swap neighbourhood — prefer them
                // lightly (never over band placement).
                const { violation, score } = assess(
                  mainsKcal + opt.kcal,
                  mainsProtein + opt.protein,
                  mainsShortfall,
                  (opt.servings - 1) * 12,
                );
                if (!best || score < best.score) {
                  best = {
                    violation,
                    score,
                    meals: [
                      { slot: 'breakfast', recipeId: bRec.id, servings: sB },
                      lunchLeftover
                        ? { slot: 'lunch', recipeId: lRec.id, servings: sL, leftover: true }
                        : { slot: 'lunch', recipeId: lRec.id, servings: sL },
                      { slot: 'dinner', recipeId: dRec.id, servings: sD },
                      { slot: 'snack', recipeId: opt.recipe.id, servings: opt.servings },
                    ],
                  };
                }
              }
            } else {
              for (let i = 0; i < snackOptions.length; i++) {
                const a = snackOptions[i]!;
                if (mainsKcal + a.kcal > kBand.hi) continue;
                for (let j = i + 1; j < snackOptions.length; j++) {
                  const b = snackOptions[j]!;
                  if (b.recipe.id === a.recipe.id) continue; // two snacks = two different dishes
                  const { violation, score } = assess(
                    mainsKcal + a.kcal + b.kcal,
                    mainsProtein + a.protein + b.protein,
                    mainsShortfall,
                    (a.servings + b.servings - 2) * 12,
                  );
                  if (!best || score < best.score) {
                    best = {
                      violation,
                      score,
                      meals: [
                        { slot: 'breakfast', recipeId: bRec.id, servings: sB },
                        lunchLeftover
                          ? { slot: 'lunch', recipeId: lRec.id, servings: sL, leftover: true }
                          : { slot: 'lunch', recipeId: lRec.id, servings: sL },
                        { slot: 'dinner', recipeId: dRec.id, servings: sD },
                        { slot: 'snack', recipeId: a.recipe.id, servings: a.servings },
                        { slot: 'snack', recipeId: b.recipe.id, servings: b.servings },
                      ],
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
    };

    runSearch(bSteps, lSteps, dSteps);
    // A STRICT FILTER STACK (vegan + gluten_free was the measured case) can leave only
    // low-protein mains whose floor-clearing servings are 1.5×/2× — pushing mains kcal so far
    // past the target that the snack prune rejects EVERY combination and the degenerate
    // mains-only fallback shipped 3-row, ~1250 kcal days. When that happens, search again over
    // the FULL serving ladder: the protein shortfall is already priced by `assess`, and an
    // honest near-miss with snacks beats a fictional day nobody could eat. Deterministic — the
    // retry runs on exactly the inputs that had no solution, never on a green path.
    if (!best) runSearch(SERVING_STEPS, SERVING_STEPS, SERVING_STEPS);

    // The pools are never empty in practice, but a degenerate filter stack must still return
    // SOMETHING deterministic rather than throw.
    return (
      best ?? {
        violation: Number.POSITIVE_INFINITY,
        score: Number.POSITIVE_INFINITY,
        meals: [
          { slot: 'breakfast', recipeId: bRec.id, servings: 1 },
          { slot: 'lunch', recipeId: lRec.id, servings: 1 },
          { slot: 'dinner', recipeId: dRec.id, servings: 1 },
        ],
      }
    );
  }

  const days: DietDay[] = [];
  const finalDinners: Recipe[] = [];

  for (let i = 0; i < 7; i++) {
    const bRec = breakfasts[i % 2] ?? breakfasts[0];
    if (!bRec) break; // impossible with the shipped corpus; guarded for degenerate stacks

    const templateDinner = dinners[i % Math.max(1, dinners.length)];
    if (!templateDinner) break;

    // Lunches: natives on even days, yesterday's dinner (cooked ×2) on odd days. When the filter
    // stack leaves no native lunches, every lunch is a leftover and day 0 borrows a mid-week
    // dinner as its stand-in.
    let lRec: Recipe | undefined;
    let lunchLeftover = false;
    if (i % 2 === 0 && lunchNatives.length > 0) {
      lRec = lunchNatives[(i / 2) % lunchNatives.length];
    } else if (i > 0) {
      lRec = finalDinners[i - 1];
      lunchLeftover = true;
    } else {
      lRec = dinners[Math.floor(dinners.length / 2)] ?? templateDinner;
    }
    if (!lRec) lRec = templateDinner;

    let solution = solveDay(bRec, lRec, templateDinner, lunchLeftover);
    let dinnerUsed = templateDinner;

    // Repair pass 1: if the template dinner cannot land the day inside the hard bands, try other
    // prefs-compatible dinners — unused ones first (the week keeps its 5–6 distinct dinners),
    // nearby template days excluded (no accidental back-to-back repeats).
    if (solution.violation > 0) {
      const nearby = new Set<string>();
      for (const d of [
        finalDinners[i - 1],
        dinners[(i + 1) % Math.max(1, dinners.length)],
      ]) {
        if (d) nearby.add(d.id);
      }
      const used = new Set(finalDinners.map((d) => d.id));
      const alternatives = [
        ...dinnerRanked.filter((r) => !used.has(r.id)),
        ...dinnerRanked.filter((r) => used.has(r.id)),
      ];
      for (const alt of alternatives) {
        if (alt.id === templateDinner.id || nearby.has(alt.id) || alt.id === lRec.id) continue;
        const attempt = solveDay(bRec, lRec, alt, lunchLeftover);
        if (attempt.score < solution.score) {
          solution = attempt;
          dinnerUsed = alt;
        }
        if (solution.violation === 0) break;
      }
    }

    // Repair pass 2: the tightest stacks (vegan + gluten_free leaves zero native lunches) can
    // pin every lunch to yesterday's dinner and still miss the bands — as a last resort the
    // leftover pairing yields and the lunch is re-picked from the full lunch pool.
    if (solution.violation > 0) {
      const blocked = new Set<string>([dinnerUsed.id]);
      if (finalDinners[i - 1]) blocked.add(finalDinners[i - 1]!.id);
      outer: for (const lunchAlt of lunchRanked.slice(0, 12)) {
        if (blocked.has(lunchAlt.id) || lunchAlt.id === lRec.id) continue;
        for (const dinnerAlt of [dinnerUsed, ...dinnerRanked.slice(0, 8)]) {
          if (dinnerAlt.id === lunchAlt.id) continue;
          const attempt = solveDay(bRec, lunchAlt, dinnerAlt, false);
          if (attempt.score < solution.score) {
            solution = attempt;
            dinnerUsed = dinnerAlt;
          }
          if (solution.violation === 0) break outer;
        }
      }
    }

    finalDinners.push(dinnerUsed);
    days.push({ meals: solution.meals });
  }

  return { days, stance, prefs, weightKg, targets };
}
