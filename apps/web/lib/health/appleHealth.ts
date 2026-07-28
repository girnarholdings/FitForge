/**
 * APPLE HEALTH EXPORT PARSER — steps, active energy and body mass, per day.
 *
 * Input is the `export.xml` from Health → profile → Export All Health Data. See docs/HEALTH-SYNC.md
 * for why a file is the only route: there is no browser API for HealthKit, on any platform.
 *
 * TWO PROPERTIES DRIVE THE WHOLE DESIGN.
 *
 * IT IS ENORMOUS. A few years of history is hundreds of megabytes of XML, and one record per step
 * sample. `DOMParser` on that string allocates the document in memory and dies; so does reading the
 * file into one string first. The parser therefore streams the file in chunks and matches records
 * with a regex over a sliding buffer, never holding more than a chunk plus one partial record.
 *
 * OVERLAPPING SOURCES DOUBLE-COUNT. A user with a Watch and an iPhone has TWO step records for the
 * same walk, one from each device. Summing everything reports roughly double their real step count,
 * confidently and silently. Health's own daily total de-duplicates; so does this, by grouping per
 * source and keeping the single largest source for each day rather than adding them.
 *
 * An undercount is visible and recoverable — the user compares with the Health app and tells us.
 * A 2x overcount looks plausible, flatters the user, and quietly corrupts every calorie balance
 * derived from it. Given only those two failure modes, undercounting is the correct one to choose.
 */

export interface DailyHealth {
  /** `YYYY-MM-DD`, local. */
  date: string;
  steps?: number;
  /** Active energy burned, kcal. Excludes basal — this is the "moved" number, not total burn. */
  activeKcal?: number;
  /** Body mass in kg, the last reading of the day. */
  weightKg?: number;
}

export interface ParseResult {
  days: DailyHealth[];
  /** Records the parser recognised, before per-source de-duplication. */
  recordsSeen: number;
  /** Distinct `sourceName` values, so the UI can say which devices contributed. */
  sources: string[];
  /** Non-fatal notes worth showing — e.g. that overlapping sources were collapsed. */
  notes: string[];
}

/** The three record types worth reading. Everything else in the export is ignored. */
const TYPE_STEPS = 'HKQuantityTypeIdentifierStepCount';
const TYPE_ACTIVE = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const TYPE_MASS = 'HKQuantityTypeIdentifierBodyMass';

/**
 * One `<Record …/>` element. Attribute order is not guaranteed, so each is matched independently
 * rather than with one positional pattern.
 */
const RECORD_RE = /<Record\b[^>]*\/?>/g;
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * Apple writes `2026-07-28 09:15:00 +0100` — a space, not the `T` that `Date` expects, and an
 * offset without a colon. Take the calendar date directly off the string rather than constructing a
 * Date: the date in the export is already local to where the user was, and re-parsing it through
 * UTC is how every entry near midnight lands on the wrong day.
 */
function localDateOf(startDate: string | undefined): string | null {
  if (!startDate) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(startDate);
  return m ? m[1]! : null;
}

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Accumulator: per day, per source, so overlapping devices can be resolved at the end. */
interface Bucket {
  stepsBySource: Map<string, number>;
  activeBySource: Map<string, number>;
  /** Last body-mass reading wins; weight is a point measurement, not a total. */
  weightKg?: number;
}

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/**
 * Parse an Apple Health export.
 *
 * `text` is an async iterable of chunks so the caller can stream a `File` without materialising it.
 * A plain string works too, for tests and small files.
 */
export async function parseAppleHealthExport(
  text: AsyncIterable<string> | string,
): Promise<ParseResult> {
  const byDate = new Map<string, Bucket>();
  const sources = new Set<string>();
  let recordsSeen = 0;

  const bucket = (date: string): Bucket => {
    let b = byDate.get(date);
    if (!b) {
      b = { stepsBySource: new Map(), activeBySource: new Map() };
      byDate.set(date, b);
    }
    return b;
  };

  let buffer = '';
  const chunks: AsyncIterable<string> =
    typeof text === 'string' ? (async function* () { yield text; })() : text;

  for await (const chunk of chunks) {
    buffer += chunk;

    let lastEnd = 0;
    RECORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RECORD_RE.exec(buffer)) !== null) {
      lastEnd = m.index + m[0].length;
      const tag = m[0];
      const type = attr(tag, 'type');
      if (type !== TYPE_STEPS && type !== TYPE_ACTIVE && type !== TYPE_MASS) continue;

      const date = localDateOf(attr(tag, 'startDate'));
      const value = num(attr(tag, 'value'));
      if (!date || value === null) continue;

      const source = attr(tag, 'sourceName') ?? 'unknown';
      sources.add(source);
      recordsSeen += 1;

      const b = bucket(date);
      if (type === TYPE_STEPS) add(b.stepsBySource, source, value);
      else if (type === TYPE_ACTIVE) add(b.activeBySource, source, value);
      else b.weightKg = attr(tag, 'unit') === 'lb' ? value * 0.45359237 : value;
    }

    // Keep only the tail that might hold a record split across the chunk boundary. Without this the
    // buffer grows to the whole file and the streaming is pointless.
    buffer = buffer.slice(lastEnd);
    if (buffer.length > 1_000_000) buffer = buffer.slice(-100_000);
  }

  /** The de-duplication: one source per day, the largest — never the sum. See the header. */
  const pickMax = (m: Map<string, number>): number | undefined => {
    let best: number | undefined;
    for (const v of m.values()) if (best === undefined || v > best) best = v;
    return best;
  };

  const days: DailyHealth[] = [];
  let collapsed = 0;
  for (const [date, b] of byDate) {
    if (b.stepsBySource.size > 1 || b.activeBySource.size > 1) collapsed += 1;
    const day: DailyHealth = { date };
    const steps = pickMax(b.stepsBySource);
    const active = pickMax(b.activeBySource);
    if (steps !== undefined) day.steps = Math.round(steps);
    if (active !== undefined) day.activeKcal = Math.round(active);
    if (b.weightKg !== undefined) day.weightKg = Math.round(b.weightKg * 10) / 10;
    days.push(day);
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));

  const notes: string[] = [];
  if (collapsed > 0) {
    notes.push(
      `${collapsed} ${collapsed === 1 ? 'day had' : 'days had'} more than one device reporting. ` +
        'Kept the highest single source per day rather than adding them, which is what Health does — ' +
        'adding a Watch and an iPhone together would roughly double the real figure.',
    );
  }
  if (recordsSeen === 0) {
    notes.push(
      'No step, energy or weight records were found. Check this is the export.xml from inside ' +
        'export.zip rather than the zip itself.',
    );
  }

  return { days, recordsSeen, sources: [...sources], notes };
}

/** Stream a `File` as text chunks, so a 500 MB export never becomes a 500 MB string. */
export async function* streamFile(file: Blob, chunkBytes = 4 << 20): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkBytes);
    const buf = await slice.arrayBuffer();
    // `stream: true` keeps a multi-byte character split across a slice boundary intact.
    yield decoder.decode(buf, { stream: true });
    offset += chunkBytes;
  }
  yield decoder.decode();
}
