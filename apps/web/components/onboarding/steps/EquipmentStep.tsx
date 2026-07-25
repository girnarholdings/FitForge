'use client';

import * as React from 'react';
import type { EquipmentCategory } from '@fitforge/shared/types';
import { equipmentPresetForLocation } from '@fitforge/shared/rules';
import { cn } from '@/lib/utils';
import { Button, Chip, SearchInput } from '@/components/ui';
import { SwipeDeck, StarIcon, type SwipeDirection } from '@/components/ui/SwipeDeck';
import { CheckIcon, XIcon, ChevronLeftIcon, ChevronRightIcon, SparkIcon } from '@/components/ui/icons';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { DEMO_EQUIPMENT, type DemoEquipmentRow } from '@/lib/demo/catalog';
import { EXERCISES } from '@/components/features/_mock/data';
import { useOnboarding } from '../OnboardingProvider';
import { OnboardingFooter, OnboardingDockContext } from '../OnboardingFooter';

/* ------------------------------------------------------------------------------ metadata */

const CATEGORY_META: Record<EquipmentCategory, { label: string; blurb: string }> = {
  free_weights: {
    label: 'Free weights',
    blurb: 'Bars, dumbbells and anything you pick up and put down.',
  },
  bodyweight_accessories: {
    label: 'Bodyweight & bands',
    blurb: 'Small kit that turns your own bodyweight into a workout.',
  },
  benches_racks: {
    label: 'Benches & racks',
    blurb: 'The furniture that lets you press and squat safely.',
  },
  machines: {
    label: 'Machines',
    blurb: 'Fixed-path stations you sit in — common in commercial gyms.',
  },
  cables: {
    label: 'Cables',
    blurb: 'Weight stacks on a pulley, so you can pull from any angle.',
  },
  cardio: { label: 'Cardio', blurb: 'Machines for warm-ups, conditioning and finishers.' },
};

/** Deck order: start with gear everyone recognises, end with the niche stuff (research §3). */
const CATEGORY_ORDER: EquipmentCategory[] = [
  'free_weights',
  'bodyweight_accessories',
  'benches_racks',
  'machines',
  'cables',
  'cardio',
];

/**
 * Plain-English "what is this thing" line for every equipment slug — a novice has to recognise
 * the machine from the picture plus this sentence alone (research §2.7).
 */
const EQUIPMENT_DESCRIPTOR: Record<string, string> = {
  barbell: 'The long steel bar you load with plates — squats, presses, rows, deadlifts.',
  'weight-plates': 'Round discs that slide onto a barbell to set how heavy it is.',
  dumbbell: 'One weight in each hand. The most versatile thing in any gym.',
  kettlebell: 'Cast-iron ball with a handle, built for swings, cleans and carries.',
  'ez-curl-bar': 'Short zig-zag bar — much kinder on your wrists during curls.',
  'squat-rack': 'Tall uprights that hold a barbell at shoulder height so you can squat safely.',
  'flat-bench': 'A padded bench you lie flat on to press, or sit on to curl.',
  'adjustable-bench': 'A bench whose back tilts up for incline presses and seated work.',
  'smith-machine': 'A barbell locked onto rails, so it only travels straight up and down.',
  'leg-press': 'You sit back and push a loaded sled away with your feet.',
  'hack-squat-machine': 'An angled sled you squat inside, with your back fully supported.',
  'leg-extension-machine': 'You sit and straighten your knees against a padded roller.',
  'leg-curl-machine': 'You curl your heels toward your backside against a padded roller.',
  'calf-raise-machine': 'Loads your shoulders or knees while you rise up onto your toes.',
  'chest-press-machine': 'Seated station with two handles you push straight forward.',
  'pec-deck': 'Seated station where you sweep both arms together in front of your chest.',
  'shoulder-press-machine': 'Seated station with handles you press straight overhead.',
  'hip-thrust-machine': 'Padded station where you drive your hips up against a load — glutes.',
  'cable-machine': 'A weight stack on a pulley with handles — resistance from any angle.',
  'lat-pulldown': 'You sit, grab a wide bar overhead and pull it to your chest. Builds your back.',
  'seated-row-machine': 'You sit facing a cable and pull the handle into your stomach.',
  'pull-up-bar': 'A fixed bar you hang from and pull your chin over.',
  'dip-station': 'Two parallel bars you hold while lowering yourself between them.',
  'resistance-bands': 'Stretchy loops or tubes that add resistance anywhere, even in a suitcase.',
  'suspension-trainer': 'Two adjustable straps with handles, anchored above a door or beam.',
  'ab-wheel': 'A small wheel with handles that you roll out on — brutal core work.',
  'medicine-ball': 'A weighted ball for throws, slams and twisting core work.',
  treadmill: 'A motorised belt for walking, jogging or interval running indoors.',
  'stationary-bike': 'A bike that stays put — steady cardio or hard intervals.',
  'rowing-machine': 'Sliding seat plus a handle: full-body cardio in one pulling motion.',
};

function descriptorFor(row: DemoEquipmentRow): string {
  return (
    EQUIPMENT_DESCRIPTOR[row.slug] ??
    `${CATEGORY_META[row.category].label} you can use for resistance training.`
  );
}

/* ------------------------------------------------------------- live "exercises unlocked" */

/** Requirement shape mirrored from the shared feasibility rule: bodyweight OR every alt-group met. */
const EXERCISE_REQUIREMENTS = EXERCISES.map((e) => ({
  bodyweight: e.is_bodyweight_ok,
  groups: e.equipment.map((g) => g.slugs),
}));

const TOTAL_EXERCISES = EXERCISE_REQUIREMENTS.length;

/** Alpha Progression's best mechanic: the consequence of the current kit, in one number (§2.2). */
function unlockedCount(owned: ReadonlySet<string>): number {
  let n = 0;
  for (const req of EXERCISE_REQUIREMENTS) {
    if (req.bodyweight || req.groups.every((g) => g.some((s) => owned.has(s)))) n += 1;
  }
  return n;
}

/* ---------------------------------------------------------------------------- deck model */

type Answer = 'have' | 'love' | 'none';
type Phase = 'intro' | 'deck' | 'review';

type DeckCard =
  | { kind: 'category'; key: string; category: EquipmentCategory; items: DemoEquipmentRow[] }
  | {
      kind: 'item';
      key: string;
      row: DemoEquipmentRow;
      position: number;
      total: number;
      categoryLabel: string;
    };

const ANSWER_FOR: Record<SwipeDirection, Answer> = {
  right: 'have',
  up: 'love',
  left: 'none',
};

function buildQueue(
  catalog: readonly DemoEquipmentRow[],
  answers: Readonly<Record<string, Answer>>,
  mode: 'all' | 'unanswered',
): DeckCard[] {
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: catalog.filter(
      (row) => row.category === category && (mode === 'all' || !answers[row.slug]),
    ),
  })).filter((g) => g.items.length > 0);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const out: DeckCard[] = [];
  let position = 0;
  for (const g of groups) {
    // A batch shortcut only earns its own card when it can save real taps.
    if (g.items.length >= 3) {
      out.push({ kind: 'category', key: `cat-${g.category}`, category: g.category, items: g.items });
    }
    for (const row of g.items) {
      position += 1;
      out.push({
        kind: 'item',
        key: row.slug,
        row,
        position,
        total,
        categoryLabel: CATEGORY_META[g.category].label,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------------- presets */

const BODYWEIGHT_SLUGS = ['pull-up-bar', 'resistance-bands'];

interface Preset {
  id: 'home' | 'commercial' | 'bodyweight';
  label: string;
  compute: (catalog: readonly DemoEquipmentRow[]) => string[];
}

const PRESETS: Preset[] = [
  { id: 'home', label: 'Home gym', compute: (c) => equipmentPresetForLocation('home', c).preset },
  {
    id: 'commercial',
    label: 'Commercial gym',
    compute: (c) => equipmentPresetForLocation('commercial_gym', c).preset,
  },
  {
    id: 'bodyweight',
    label: 'Bodyweight only',
    compute: (c) => BODYWEIGHT_SLUGS.filter((s) => c.some((row) => row.slug === s)),
  },
];

/* ------------------------------------------------------------------------------ component */

/**
 * Screen 6 · Equipment — a Tinder-style swipe deck (research §3).
 *
 * Right = "I have this", up = "have it AND love it", left = "don't have"; every gesture also
 * has a button and an arrow key. The deck runs in a `100svh` overlay so it can never become a
 * scroll wall on an iPhone, and it is bracketed by two in-shell screens: a preset/launch intro
 * (which keeps the step continue-able for anyone who just wants to move on) and a review screen
 * of everything marked have/love.
 *
 * The gold star (up-swipe) is a *preference* signal on top of availability: it persists as
 * `loved_equipment_slugs` while `equipment_slugs` keeps its "have OR love" meaning.
 */
export function EquipmentStep() {
  const { draft, patch } = useOnboarding();
  // DEMO MODE: the equipment catalog is a static in-memory list (no backend).
  const catalog = DEMO_EQUIPMENT;

  const [phase, setPhase] = React.useState<Phase>('intro');
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [queue, setQueue] = React.useState<DeckCard[]>([]);
  const [deckIndex, setDeckIndex] = React.useState(0);
  const [history, setHistory] = React.useState<
    { answers: Record<string, Answer>; deckIndex: number; dir?: SwipeDirection }[]
  >([]);
  const [announcement, setAnnouncement] = React.useState('');
  const hydrated = React.useRef(false);

  const nameForSlug = React.useCallback(
    (slug: string) => catalog.find((c) => c.slug === slug)?.name ?? slug,
    [catalog],
  );

  /* ------------------------------------------------------------------- draft <-> answers */

  const writeThrough = React.useCallback(
    (next: Record<string, Answer>) => {
      const have: string[] = [];
      const loved: string[] = [];
      for (const row of catalog) {
        const a = next[row.slug];
        if (a === 'have' || a === 'love') have.push(row.slug);
        if (a === 'love') loved.push(row.slug);
      }
      patch({ equipment_slugs: have, loved_equipment_slugs: loved });
    },
    [catalog, patch],
  );

  const applyAnswers = React.useCallback(
    (next: Record<string, Answer>) => {
      // Any write means this step now owns the answer map — never re-seed over the top of it
      // (a "don't have" answer is invisible in the draft, so re-seeding would silently drop it).
      hydrated.current = true;
      setAnswers(next);
      writeThrough(next);
    },
    [writeThrough],
  );

  // Hydrate from the draft (resume) or from the location preset, exactly once.
  React.useEffect(() => {
    if (hydrated.current) return;
    if (draft.equipment_slugs.length > 0) {
      hydrated.current = true;
      const loved = new Set(draft.loved_equipment_slugs ?? []);
      const seeded: Record<string, Answer> = {};
      for (const slug of draft.equipment_slugs) seeded[slug] = loved.has(slug) ? 'love' : 'have';
      setAnswers(seeded);
      return;
    }
    if (draft.training_location) {
      hydrated.current = true;
      const { preset } = equipmentPresetForLocation(draft.training_location, catalog);
      if (preset.length === 0) return;
      const seeded: Record<string, Answer> = {};
      for (const slug of preset) seeded[slug] = 'have';
      applyAnswers(seeded);
    }
  }, [
    applyAnswers,
    catalog,
    draft.equipment_slugs,
    draft.loved_equipment_slugs,
    draft.training_location,
  ]);

  /* ------------------------------------------------------------------------- derived bits */

  const ownedSet = React.useMemo(() => {
    const s = new Set<string>();
    for (const [slug, a] of Object.entries(answers)) if (a === 'have' || a === 'love') s.add(slug);
    return s;
  }, [answers]);

  const unlocked = React.useMemo(() => unlockedCount(ownedSet), [ownedSet]);

  const haveRows = React.useMemo(
    () => catalog.filter((r) => answers[r.slug] === 'have' || answers[r.slug] === 'love'),
    [answers, catalog],
  );

  const unansweredRows = React.useMemo(
    () => catalog.filter((r) => !answers[r.slug]),
    [answers, catalog],
  );

  const activePreset = React.useMemo(() => {
    const have = haveRows.map((r) => r.slug);
    return (
      PRESETS.find((p) => {
        const preset = p.compute(catalog);
        return preset.length === have.length && preset.every((s) => ownedSet.has(s));
      })?.id ?? null
    );
  }, [catalog, haveRows, ownedSet]);

  /* --------------------------------------------------------------------------- deck flow */

  const startDeck = React.useCallback(
    (mode: 'all' | 'unanswered') => {
      const built = buildQueue(catalog, answers, mode);
      if (built.length === 0) {
        setPhase('review');
        return;
      }
      setQueue(built);
      setDeckIndex(0);
      setHistory([]);
      setAnnouncement('');
      setPhase('deck');
    },
    [answers, catalog],
  );

  // Lock the page behind the full-screen deck/review overlays so the URL bar can't collapse
  // mid-gesture and the deck geometry stays stable (research §4).
  React.useEffect(() => {
    if (phase === 'intro') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Deck exhausted → review. Held briefly so the last card is seen flying out.
  React.useEffect(() => {
    if (phase !== 'deck' || queue.length === 0 || deckIndex < queue.length) return;
    const t = window.setTimeout(() => setPhase('review'), 260);
    return () => window.clearTimeout(t);
  }, [deckIndex, phase, queue.length]);

  const answerCard = React.useCallback(
    (card: DeckCard, dir: SwipeDirection) => {
      if (card.kind !== 'item') return;
      const answer = ANSWER_FOR[dir];
      const next = { ...answers, [card.row.slug]: answer };
      setHistory((h) => [...h, { answers, deckIndex, dir }]);
      applyAnswers(next);
      setDeckIndex((i) => i + 1);
      const owned = new Set(ownedSet);
      if (answer === 'none') owned.delete(card.row.slug);
      else owned.add(card.row.slug);
      const verb =
        answer === 'love' ? 'saved as a favourite' : answer === 'have' ? 'added' : 'skipped';
      setAnnouncement(`${card.row.name} ${verb}. ${unlockedCount(owned)} exercises unlocked.`);
    },
    [answers, applyAnswers, deckIndex, ownedSet],
  );

  const answerCategory = React.useCallback(
    (card: Extract<DeckCard, { kind: 'category' }>, all: boolean) => {
      const next = { ...answers };
      for (const row of card.items) next[row.slug] = all ? 'have' : 'none';
      setHistory((h) => [...h, { answers, deckIndex }]);
      applyAnswers(next);
      setDeckIndex((i) => i + 1 + card.items.length);
      const owned = new Set(ownedSet);
      for (const row of card.items) {
        if (all) owned.add(row.slug);
        else owned.delete(row.slug);
      }
      setAnnouncement(
        `${CATEGORY_META[card.category].label}: ${all ? 'all' : 'none'} of ${card.items.length} items. ` +
          `${unlockedCount(owned)} exercises unlocked.`,
      );
    },
    [answers, applyAnswers, deckIndex, ownedSet],
  );

  const undo = React.useCallback((): SwipeDirection | void => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    applyAnswers(last.answers);
    setDeckIndex(last.deckIndex);
    setAnnouncement('Undone.');
    return last.dir;
  }, [applyAnswers, history]);

  /* -------------------------------------------------------------------- answer mutations */

  const cycleAnswer = React.useCallback(
    (slug: string) => {
      const current = answers[slug];
      const next: Answer = current === 'have' ? 'love' : current === 'love' ? 'none' : 'have';
      const map = { ...answers, [slug]: next };
      applyAnswers(map);
      const owned = new Set(ownedSet);
      if (next === 'none') owned.delete(slug);
      else owned.add(slug);
      setAnnouncement(
        `${nameForSlug(slug)} ${
          next === 'love' ? 'marked as a favourite' : next === 'have' ? 'added' : 'removed'
        }. ${unlockedCount(owned)} exercises unlocked.`,
      );
    },
    [answers, applyAnswers, nameForSlug, ownedSet],
  );

  const applyPreset = React.useCallback(
    (preset: Preset) => {
      const slugs = preset.compute(catalog);
      const next: Record<string, Answer> = {};
      for (const slug of slugs) next[slug] = 'have';
      applyAnswers(next);
      const owned = new Set(slugs);
      setAnnouncement(`${preset.label} preset applied. ${unlockedCount(owned)} exercises unlocked.`);
      setPhase('review');
    },
    [applyAnswers, catalog],
  );

  const searchEquipment = React.useCallback(
    async (q: string): Promise<DemoEquipmentRow[]> => {
      const needle = q.toLowerCase();
      return catalog
        .filter((c) => c.name.toLowerCase().includes(needle) || c.slug.includes(needle))
        .slice(0, 8);
    },
    [catalog],
  );

  /* ------------------------------------------------------------------------- deck render */

  const itemCards = React.useMemo(() => queue.filter((c) => c.kind === 'item').length, [queue]);
  const itemsDone = React.useMemo(
    () => queue.slice(0, deckIndex).filter((c) => c.kind === 'item').length,
    [deckIndex, queue],
  );

  const renderCard = React.useCallback(
    (card: DeckCard) => {
      if (card.kind === 'category') {
        return (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[24px] border border-accent/40 bg-[linear-gradient(160deg,var(--accent-muted),var(--surface-2)_55%)] p-6 text-center shadow-[var(--shadow-card)]">
            <span className="inline-flex items-center gap-1.5 rounded-chip border border-accent/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              <SparkIcon size={14} />
              Shortcut
            </span>
            <h2 className="font-display text-2xl font-bold leading-tight text-foreground">
              {CATEGORY_META[card.category].label}
            </h2>
            <p className="text-sm text-muted-foreground">{CATEGORY_META[card.category].blurb}</p>
            <p className="text-sm font-medium text-accent">
              {card.items.length} items coming up — answer them all at once, or one by one.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-muted-foreground">
              {card.items.slice(0, 4).map((row) => (
                <EquipmentIllustration key={row.slug} slug={row.slug} size={38} />
              ))}
            </div>
          </div>
        );
      }
      const row = card.row;
      return (
        <div className="flex h-full w-full flex-col rounded-[24px] border border-border bg-surface-2 p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>{card.categoryLabel}</span>
            <span className="tabular">
              {card.position} / {card.total}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center py-3">
            <div className="grid h-full w-full place-items-center rounded-[20px] bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent-muted),transparent_70%)]">
              <EquipmentIllustration
                slug={row.slug}
                size={180}
                selected
                className="h-full max-h-[240px] min-h-[140px] w-auto"
              />
            </div>
          </div>
          <h2 className="font-display text-[1.6rem] font-bold leading-tight tracking-tight text-foreground">
            {row.name}
          </h2>
          <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{descriptorFor(row)}</p>
        </div>
      );
    },
    [],
  );

  /* -------------------------------------------------------------------------------- views */

  if (phase === 'deck') {
    const current = queue[deckIndex];
    return (
      <OverlayScreen
        onBack={() => setPhase('intro')}
        backLabel="Back to setup"
        title={
          <span className="tabular text-sm font-medium text-foreground">
            {Math.min(itemsDone + 1, itemCards)} of {itemCards}
          </span>
        }
        unlocked={unlocked}
        progress={itemCards === 0 ? 0 : itemsDone / itemCards}
        testId="equipment-deck-screen"
      >
        <SwipeDeck<DeckCard>
          className="min-h-0 flex-1"
          data-testid="equipment-swipe-deck"
          items={queue}
          index={deckIndex}
          getKey={(c) => c.key}
          getCardLabel={(c) =>
            c.kind === 'category'
              ? `${CATEGORY_META[c.category].label} — ${c.items.length} items. Answer them all at once or one by one.`
              : `${c.row.name}. ${descriptorFor(c.row)} Card ${c.position} of ${c.total}. Swipe right if you have it, up if you love it, left if you don't.`
          }
          renderCard={(c) => renderCard(c)}
          onSwipe={(c, dir) => answerCard(c, dir)}
          onUndo={undo}
          canUndo={history.length > 0}
          isSwipeable={(c) => c.kind === 'item'}
          announcement={announcement}
          actionLabels={{ left: "Don't have", right: 'Have it', up: 'Love it' }}
          renderActions={
            current?.kind === 'category'
              ? (card, api) => (
                  <CategoryActions
                    card={card as Extract<DeckCard, { kind: 'category' }>}
                    onAll={(c) => answerCategory(c, true)}
                    onNone={(c) => answerCategory(c, false)}
                    onOneByOne={() => setDeckIndex((i) => i + 1)}
                    onUndo={api.undo}
                    canUndo={api.canUndo}
                  />
                )
              : undefined
          }
          emptyState={<p className="text-sm text-muted-foreground">All done — nice work.</p>}
        />

        <div className="shrink-0 pt-2">
          <Button variant="ghost" size="sm" block onClick={() => setPhase('review')} data-testid="equipment-deck-review">
            Done — review my kit
          </Button>
        </div>
      </OverlayScreen>
    );
  }

  if (phase === 'review') {
    return (
      <OverlayScreen
        onBack={() => setPhase('intro')}
        backLabel="Back to setup"
        title={<span className="text-sm font-medium text-foreground">Your kit</span>}
        unlocked={unlocked}
        progress={1}
        testId="equipment-review-screen"
      >
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <p className="text-xs text-muted-foreground">
            Tap a chip to cycle it: have <ChevronRightIcon size={12} className="inline" /> love{' '}
            <ChevronRightIcon size={12} className="inline" /> remove. A gold star means we&apos;ll
            favour it in your plan.
          </p>

          {haveRows.length === 0 ? (
            <p className="mt-4 rounded-card border border-border bg-surface-2 p-4 text-sm text-muted-foreground">
              Nothing marked yet — that&apos;s fine. Bodyweight training needs no equipment at all,
              and you can add things any time in Settings.
            </p>
          ) : (
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Equipment you have"
              data-testid="equipment-review-chips"
            >
              {haveRows.map((row) => {
                const loved = answers[row.slug] === 'love';
                return (
                  <Chip
                    key={row.slug}
                    selected
                    leading={
                      loved ? (
                        <StarIcon size={13} className="text-accent" />
                      ) : (
                        <CheckIcon size={13} />
                      )
                    }
                    onClick={() => cycleAnswer(row.slug)}
                    data-testid={`equipment-chip-${row.slug}`}
                  >
                    {row.name}
                  </Chip>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add anything we missed
            </p>
            <SearchInput<DemoEquipmentRow>
              aria-label="Search equipment"
              placeholder="Search equipment…"
              search={(q) => searchEquipment(q)}
              getKey={(r) => r.slug}
              renderResult={(r) => (
                <span className="flex w-full items-center gap-2.5">
                  <EquipmentIllustration slug={r.slug} size={28} selected={ownedSet.has(r.slug)} />
                  <span className="flex-1">{r.name}</span>
                  {ownedSet.has(r.slug) && <span className="text-xs text-accent">added</span>}
                </span>
              )}
              onSelect={(r) => {
                if (!ownedSet.has(r.slug)) cycleAnswer(r.slug);
              }}
            />
          </div>

          {unansweredRows.length > 0 && (
            <Button
              variant="secondary"
              size="md"
              block
              className="mt-4"
              onClick={() => startDeck('unanswered')}
              data-testid="equipment-swipe-remaining"
            >
              Swipe the remaining {unansweredRows.length}
            </Button>
          )}
        </div>

        {/* The overlay is `position: fixed; z-60`, so it paints ABOVE the shell's `.cta-dock`.
            Null out the dock context here and let OnboardingFooter render its in-flow fallback
            INSIDE the overlay — otherwise Continue is invisible (and unclickable) on review. */}
        <OnboardingDockContext.Provider value={null}>
          <OnboardingFooter step="equipment" canContinue />
        </OnboardingDockContext.Provider>
      </OverlayScreen>
    );
  }

  /* --------------------------------------------------------------------------- intro view */

  const deckMode: 'all' | 'unanswered' = unansweredRows.length > 0 ? 'unanswered' : 'all';
  const deckCount = deckMode === 'unanswered' ? unansweredRows.length : catalog.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="equipment-intro-screen">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="flex items-center justify-between gap-3 rounded-card border border-accent/30 bg-accent-muted px-3.5 py-2.5">
        <p className="min-w-0" data-testid="equipment-unlocked-banner">
          <span className="tabular font-display text-xl font-bold text-accent">{unlocked}</span>
          <span className="ml-1.5 text-sm font-medium text-accent">exercises unlocked</span>
          <span className="ml-1 text-xs text-muted-foreground">of {TOTAL_EXERCISES}</span>
        </p>
        {haveRows.length > 0 && (
          <button
            type="button"
            onClick={() => setPhase('review')}
            data-testid="equipment-open-review"
            className="shrink-0 rounded-chip px-2 py-1 text-xs font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            My kit ({haveRows.length})
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => startDeck(deckMode)}
        data-testid="equipment-start-swiping"
        className={cn(
          'border-gradient-gold mt-3 flex w-full items-center gap-3 rounded-card p-4 text-left',
          'touch-manipulation transition-opacity duration-150 active:opacity-80',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <span aria-hidden className="flex -space-x-2 text-accent">
          <EquipmentIllustration slug="dumbbell" size={34} selected />
          <EquipmentIllustration slug="lat-pulldown" size={34} selected />
          <EquipmentIllustration slug="resistance-bands" size={34} selected />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-foreground">
            Swipe through the gear
          </span>
          <span className="block text-xs text-muted-foreground">
            {deckCount} {deckCount === 1 ? 'item' : 'items'} · about 40 seconds
          </span>
        </span>
        <ChevronRightIcon size={20} className="shrink-0 text-accent" />
      </button>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Right if you have it, up if you have it <em>and</em> love it, left if you don&apos;t. Buttons
        and arrow keys work too.
      </p>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Or start from a preset
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Equipment presets">
          {PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              selected={activePreset === preset.id}
              onClick={() => applyPreset(preset)}
              data-testid={`equipment-preset-${preset.id}`}
            >
              {preset.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="min-h-4 flex-1" />
      <OnboardingFooter step="equipment" canContinue />
    </div>
  );
}

/* ------------------------------------------------------------------------------ subviews */

/** Full-screen (100svh) frame for the deck + review: fixed header, flexible body, no page scroll. */
function OverlayScreen({
  onBack,
  backLabel,
  title,
  unlocked,
  progress,
  testId,
  children,
}: {
  onBack: () => void;
  backLabel: string;
  title: React.ReactNode;
  unlocked: number;
  progress: number;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'fixed inset-0 z-[60] flex flex-col bg-surface',
        'px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      )}
      style={{ height: '100svh' }}
    >
      <header className="shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={backLabel}
            onClick={onBack}
            className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-surface-2"
          >
            <ChevronLeftIcon size={22} />
          </button>
          <div className="flex-1 text-center">{title}</div>
          <span
            className="tabular inline-flex items-center gap-1 rounded-chip bg-accent-muted px-2.5 py-1 text-[11px] font-semibold text-accent"
            data-testid="equipment-unlocked-counter"
          >
            <SparkIcon size={13} />
            {unlocked} unlocked
          </span>
        </div>
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Equipment progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function CategoryActions({
  card,
  onAll,
  onNone,
  onOneByOne,
  onUndo,
  canUndo,
}: {
  card: Extract<DeckCard, { kind: 'category' }>;
  onAll: (c: Extract<DeckCard, { kind: 'category' }>) => void;
  onNone: (c: Extract<DeckCard, { kind: 'category' }>) => void;
  onOneByOne: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="md"
          variant="secondary"
          onClick={() => onNone(card)}
          data-testid="equipment-category-none"
        >
          <XIcon size={16} />
          Have none
        </Button>
        <Button size="md" onClick={() => onAll(card)} data-testid="equipment-category-all">
          <CheckIcon size={16} />
          Have all {card.items.length}
        </Button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          data-testid="equipment-category-undo"
          className="rounded-chip px-2 py-1.5 text-xs font-medium text-muted-foreground transition-opacity disabled:opacity-30"
        >
          Undo
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onOneByOne}
          data-testid="equipment-category-one-by-one"
        >
          Show me one by one
        </Button>
      </div>
    </div>
  );
}
