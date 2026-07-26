/**
 * Text normalization for the offline KB index (docs/RESEARCH-KB.md §1.1).
 *
 * ONE pipeline, run identically over the index and every query — that identity is the whole
 * correctness argument, so nothing here may branch on "is this a query?".
 *
 *   raw → lowercase / strip punctuation / split
 *       → number normalization (`10k` → `10000`)
 *       → synonym normalization   (the single biggest win; see SYNONYMS)
 *       → stopword removal
 *       → suffix stemming (10 rules, min stem 3)
 *
 * No dependencies: the stemmer is hand-written (full Porter is overkill for this vocabulary).
 */

/**
 * Function words that carry no retrieval signal in fitness questions.
 *
 * DELIBERATELY KEPT (they carry real meaning here): not, no, never, without, much, many, more,
 * less, often, long, before, after, during, first, need, best, good, bad, home, gym, day, week.
 * Apostrophes are stripped before this set is consulted, so contractions appear un-punctuated.
 */
const STOPWORDS = new Set([
  'a', 'about', 'am', 'an', 'and', 'any', 'anything', 'are', 'arent', 'as', 'at', 'be', 'because',
  'been', 'being', 'but', 'by', 'can', 'cant', 'could', 'couldnt', 'did', 'didnt', 'do', 'does',
  'doesnt', 'doing', 'done', 'dont', 'each', 'even', 'ever', 'from', 'had', 'has', 'hasnt', 'have',
  'havent', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'hows', 'i', 'id', 'if', 'ill', 'im',
  'in', 'into', 'is', 'isnt', 'it', 'its', 'ive', 'just', 'like', 'll', 'me', 'mean', 'means',
  'might', 'mine', 'must', 'my', 'myself', 'of', 'on', 'once', 'one', 'or', 'other', 'our',
  'out', 'over', 're', 's', 'shall', 'she', 'should', 'shouldnt', 'so', 'some', 'such', 't', 'than',
  'that', 'thats', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things',
  'this', 'those', 'to', 'too', 'up', 'us', 'was', 'wasnt', 'we', 'were', 'what', 'whats', 'when',
  'where', 'which', 'while', 'who', 'whom', 'whose', 'why', 'will', 'with', 'wont', 'would',
  'wouldnt', 'you', 'youre', 'your', 'yours',
]);

/**
 * Hand-curated synonym table (§1.1 step 4), applied BEFORE stemming so canonical forms only ever
 * need to be stem-stable with themselves. This does more for recall than the stemmer does.
 */
const SYNONYMS: Record<string, string> = {
  /* training / sessions ------------------------------------------------------------------- */
  workout: 'train', workouts: 'train', working: 'train', work: 'train', worked: 'train',
  session: 'train', sessions: 'train', training: 'train', trainings: 'train', trained: 'train',
  trains: 'train', train: 'train', exercise: 'train', exercises: 'train', exercising: 'train',
  exercised: 'train',

  /* lifting ------------------------------------------------------------------------------- */
  weights: 'lift', weightlifting: 'lift', weightlift: 'lift', lifting: 'lift', lifts: 'lift',
  lifted: 'lift', lift: 'lift', resistance: 'lift',

  /* losing / fat -------------------------------------------------------------------------- */
  lose: 'lose', losing: 'lose', loses: 'lose', lost: 'lose', loss: 'lose', shed: 'lose',
  shedding: 'lose', drop: 'lose', dropping: 'lose', dropped: 'lose', burn: 'lose',
  burning: 'lose', burned: 'lose', cutting: 'cut', cuts: 'cut',
  fats: 'fat', bodyfat: 'fat', flab: 'fat', flabby: 'fat',

  /* physique vocabulary ------------------------------------------------------------------- */
  bulky: 'bulky', big: 'bulky', bigger: 'bulky', biggest: 'bulky', huge: 'bulky',
  massive: 'bulky', jacked: 'bulky', manly: 'bulky',
  toned: 'toned', tone: 'toned', toning: 'toned', definition: 'toned', defined: 'toned',
  lean: 'toned', sculpted: 'toned', slim: 'toned',
  abs: 'abs', ab: 'abs', abdominal: 'abs', abdominals: 'abs', sixpack: 'abs',
  belly: 'belly', tummy: 'belly', stomach: 'belly', midsection: 'belly', gut: 'belly',
  handles: 'belly',
  muscular: 'muscle', muscles: 'muscle', musculature: 'muscle',
  strength: 'strong', stronger: 'strong', strongest: 'strong',

  /* recovery ------------------------------------------------------------------------------ */
  sore: 'sore', soreness: 'sore', sores: 'sore', doms: 'sore', ache: 'sore', aches: 'sore',
  aching: 'sore', achy: 'sore', stiff: 'sore', stiffness: 'sore',
  pain: 'pain', pains: 'pain', painful: 'pain', hurt: 'pain', hurts: 'pain', hurting: 'pain',
  tweaked: 'pain', tweak: 'pain',
  injury: 'injury', injuries: 'injury', injured: 'injury',
  sleeping: 'sleep', slept: 'sleep', rested: 'rest', resting: 'rest',
  overtrain: 'overtrain', overtraining: 'overtrain', overtrained: 'overtrain', burnout: 'overtrain',
  breathe: 'breath', breathing: 'breath', breathes: 'breath',

  /* nutrition ----------------------------------------------------------------------------- */
  protein: 'protein', proteins: 'protein', prot: 'protein',
  calorie: 'calorie', calories: 'calorie', cals: 'calorie', cal: 'calorie', kcal: 'calorie',
  kcals: 'calorie', calory: 'calorie',
  eat: 'eat', eating: 'eat', ate: 'eat', eats: 'eat', food: 'eat', foods: 'eat', diet: 'eat',
  dieting: 'eat', meal: 'meal', meals: 'meal',
  hydrate: 'hydration', hydrated: 'hydration', hydration: 'hydration',
  supplement: 'supplement', supplements: 'supplement', supps: 'supplement',
  carb: 'carb', carbs: 'carb', carbohydrate: 'carb', carbohydrates: 'carb',

  /* progression --------------------------------------------------------------------------- */
  plateau: 'plateau', plateaus: 'plateau', plateaued: 'plateau', stall: 'plateau',
  stalled: 'plateau', stalling: 'plateau', stuck: 'plateau', stagnant: 'plateau',
  progress: 'progress', progressing: 'progress', progression: 'progress', progressive: 'progress',
  improving: 'progress', improve: 'progress', improvement: 'progress',
  heavier: 'heavy', heaviest: 'heavy', heavy: 'heavy',
  better: 'best', best: 'best',

  /* equipment / substitutions ------------------------------------------------------------- */
  substitute: 'substitute', substitutes: 'substitute', substitution: 'substitute',
  substituting: 'substitute', swap: 'substitute', swapping: 'substitute', replace: 'substitute',
  replacement: 'substitute', alternative: 'substitute', alternatives: 'substitute',
  instead: 'substitute',
  dumbbell: 'dumbbell', dumbbells: 'dumbbell', db: 'dumbbell',
  barbell: 'barbell', barbells: 'barbell', bb: 'barbell',
  band: 'band', bands: 'band',
  machine: 'machine', machines: 'machine',
  bodyweight: 'bodyweight', calisthenics: 'bodyweight',

  /* cardio -------------------------------------------------------------------------------- */
  cardio: 'cardio', aerobic: 'cardio', aerobics: 'cardio', conditioning: 'cardio',
  running: 'run', runs: 'run', jog: 'run', jogging: 'run',
  walking: 'walk', walks: 'walk',
  step: 'step', steps: 'step',

  /* demographics -------------------------------------------------------------------------- */
  woman: 'woman', women: 'woman', female: 'woman', females: 'woman', girl: 'woman',
  girls: 'woman', lady: 'woman', ladies: 'woman',
  man: 'man', men: 'man', male: 'man', males: 'man', guy: 'man', guys: 'man',
  older: 'old', oldest: 'old', elderly: 'old', senior: 'old', seniors: 'old', aging: 'old',
  beginner: 'beginner', beginners: 'beginner', novice: 'beginner', newbie: 'beginner',
  starter: 'beginner', rookie: 'beginner',
  pregnant: 'pregnancy', pregnancy: 'pregnancy', expecting: 'pregnancy',
  period: 'period', periods: 'period', menstrual: 'period', menstruation: 'period',

  /* app ----------------------------------------------------------------------------------- */
  app: 'app', apps: 'app', fitforge: 'app',
  data: 'data', datum: 'data',
  routine: 'routine', routines: 'routine', program: 'routine', programs: 'routine',
  plan: 'routine', plans: 'routine',
  split: 'split', splits: 'split',
};

/**
 * Suffix stemmer — two ordered passes, 10 rules total, minimum stem length 3.
 *
 * Pass A strips plurals FIRST so pass B never sees a trailing `s` (that ordering is what keeps
 * `supplement`/`supplements` and `exercise`/`exercises` collapsing to the same stem; a naive
 * single-pass `-es → ∅` rule corrupts both).
 */
const PLURAL_RULES: [RegExp, string][] = [
  [/sses$/, 'ss'],
  [/ies$/, 'y'],
  [/([^s])s$/, '$1'],
];

const SUFFIX_RULES: [RegExp, string][] = [
  [/ness$/, ''],
  [/ment$/, ''],
  [/ing$/, ''],
  [/edly$/, ''],
  [/ed$/, ''],
  [/est$/, ''],
  [/er$/, ''],
];

const MIN_STEM = 3;

function applyFirst(word: string, rules: [RegExp, string][]): string {
  for (const [re, rep] of rules) {
    if (re.test(word)) {
      const next = word.replace(re, rep);
      return next.length >= MIN_STEM ? next : word;
    }
  }
  return word;
}

/** Stem a single already-normalized word. Exported for the index build and for tests. */
export function stem(word: string): string {
  if (word.length <= MIN_STEM) return word;
  if (/\d/.test(word)) return word; // never mangle numbers / `1g` / `10000`
  return applyFirst(applyFirst(word, PLURAL_RULES), SUFFIX_RULES);
}

/** Lowercase, drop apostrophes, split on everything that is not a letter or digit. */
export function rawTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** `10k` → `10000`, `2x` → `2`. Numbers otherwise survive tokenization untouched (§1.1). */
function normalizeNumber(token: string): string {
  const k = /^(\d+(?:\.\d+)?)k$/.exec(token);
  if (k?.[1]) return String(Math.round(parseFloat(k[1]) * 1000));
  const x = /^(\d+)x$/.exec(token);
  if (x?.[1]) return x[1];
  return token;
}

/**
 * The full pipeline. Returns the ORDERED stem sequence (order matters for the phrase bonus).
 * Stopwords are removed after synonym mapping so a mapped word is never dropped by accident.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of rawTokens(text)) {
    const num = normalizeNumber(raw);
    const mapped = SYNONYMS[num] ?? num;
    if (STOPWORDS.has(mapped)) continue;
    if (mapped.length < 2) continue;
    out.push(stem(mapped));
  }
  return out;
}

/**
 * "Edit distance 1" for §1.2's fuzzy assist — one substitution, insertion, deletion, OR one
 * adjacent transposition (the Damerau variant).
 *
 * The transposition case is not optional: the spec's own worked example, `protien` → `protein`,
 * is a transposition and is at plain Levenshtein distance 2. Typing slips swap adjacent letters
 * far more often than they do anything else, so this is where most of the rescue value is.
 */
export function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  // One substitution, or one adjacent transposition (two swapped neighbours, REST IDENTICAL).
  //
  // The whole string has to be scanned before a transposition can be accepted: bailing out with
  // `true` at the first swapped pair silently ignores every later character, which made pairs
  // like `brauche` ≡ `barbell` (differing in 6 of 7 positions) look like a distance-1 typo and
  // let a German question fuzzy-rescue its way to a confident, wrong English answer.
  if (la === lb) {
    const diffs: number[] = [];
    for (let k = 0; k < la; k += 1) {
      if (a[k] !== b[k]) {
        diffs.push(k);
        if (diffs.length > 2) return false;
      }
    }
    if (diffs.length <= 1) return true; // identical, or one substitution
    const [p, q] = diffs as [number, number];
    return q === p + 1 && a[p] === b[q] && a[q] === b[p];
  }

  // One insertion / deletion — walk the shorter string against the longer one.
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j += 1;
  }
  return true;
}
