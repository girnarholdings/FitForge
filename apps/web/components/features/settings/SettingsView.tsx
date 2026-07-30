'use client';

/**
 * Settings (§2.3) — every onboarding answer, editable post-hoc, against the REAL Local Mode store.
 *
 * Two rules govern this screen:
 *
 *  1. NOTHING here is fabricated. Every control reads its value from the demo store
 *     (`lib/demo/store.ts`): the onboarding draft first, then the derived profile / nutrition
 *     profile / targets it was generated into. There are no MOCK_* fallbacks — a user who trains
 *     2 days a week on no equipment sees "2 days" and an empty kit, not the fixture's 4 days and
 *     a rack of barbells.
 *  2. NOTHING here is a no-op. Every control writes straight back through `update()` and persists
 *     to `localStorage` on the spot (there is no "Save changes" button to lie about it), keeping
 *     the draft and the derived rows the rest of the app reads (`profile`, `nutritionProfile`,
 *     `targets`) in sync. Editing equipment or protected areas offers a real re-generation, which
 *     calls the real generator (`lib/demo/generate.ts`) and replaces the stored routine.
 *
 * Data actions are wired to the whole-of-Local-Mode APIs (`exportAllState` / `importAllState` /
 * `eraseAllLocalData`), so a backup covers every `fitforge.*` key and an erase clears them all.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardTitle,
  Chip,
  SelectableCardGrid,
  Stepper,
  Sheet,
  type SelectableOption,
} from '@/components/ui';
import { StarIcon, ChevronDownIcon, ChevronUpIcon, SettingsIcon } from '@/components/ui/icons';
import { ProfileCard } from './ProfileCard';
import { signOutUser } from '@/lib/auth/firebase';
import { eraseCloudCopy } from '@/lib/auth/sync';
import { useAuth } from '@/lib/auth/useUser';
import { EquipmentIllustration } from '@/components/illustrations/equipment';
import { ProgressionEvidenceNote } from '@/components/features/shared/ProgressionEvidence';
import { SummaryColumn } from '@/components/features/shared/BackupSummary';
import {
  BarbellIcon,
  DumbbellIcon,
  FlameIcon,
  JumpRopeIcon,
  HeartIcon,
  HomeIcon,
  RackIcon,
  PlaneIcon,
  LogOutIcon,
  ExportIcon,
  ImportIcon,
  TrashIcon,
  RepeatIcon,
} from '@/components/ui/icons';
import {
  update,
  getState,
  exportAllState,
  importAllState,
  inspectBackup,
  localSummary,
  eraseAllLocalData,
  setProgressionScheme,
  resolveProgressionScheme,
  resetTour,
  type DemoState,
  type ImportMode,
  type BackupSummary,
} from '@/lib/demo/store';
import { useDemoState } from '@/lib/demo/useDemo';
import {
  routineForDraft,
  targetsForDraft,
  planCoverageForDraft,
  describeDay,
  exerciseCountLabel,
} from '@/lib/demo/generate';
import { DEMO_EQUIPMENT } from '@/lib/demo/catalog';
import {
  resolveBodyAreaExclusions,
  describeSetTarget,
  prescribeSets,
  recommendProgressionScheme,
  schemeCaution,
  suggestOnboardingDefaults,
  trimNoticeFor,
  PROGRESSION_OPTIONS,
  PROGRESSION_PICKER_LEDE,
  type ProgressionScheme,
} from '@fitforge/shared/rules';
import {
  BODY_AREAS,
  ALLERGEN_TAGS,
  type BodyArea,
  type GoalType,
  type DietType,
  type ExperienceLevel,
  type TrainingLocation,
  type SexType,
  type UnitSystem,
  type EquipmentCategory,
  type MovementPattern,
} from '@fitforge/shared/types';
import type { OnboardingDraft, DraftMovementExclusion } from '@/components/onboarding/types';
import {
  WEEKDAY_LABELS,
  localISO,
  type Profile,
  type NutritionProfile,
  type NutritionTargets,
} from '@/components/features/_mock/data';

type Draft = Partial<OnboardingDraft>;

/** Session-scoped, so the disclosure survives a reload without ever reaching a backup. */
const SETTINGS_OPEN_KEY = 'fitforge.settingsPanelOpen';

/** A small gold icon chip used for goal / location option cards. */
function OptionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
      {children}
    </span>
  );
}

const GOAL_OPTIONS: SelectableOption<GoalType>[] = [
  { value: 'strength', title: 'Strength', icon: <OptionBadge><BarbellIcon size={20} /></OptionBadge> },
  { value: 'hypertrophy', title: 'Build muscle', icon: <OptionBadge><DumbbellIcon size={20} /></OptionBadge> },
  { value: 'fat_loss', title: 'Lose fat', icon: <OptionBadge><FlameIcon size={20} /></OptionBadge> },
  { value: 'endurance', title: 'Endurance', icon: <OptionBadge><JumpRopeIcon size={20} /></OptionBadge> },
  { value: 'general_health', title: 'General health', icon: <OptionBadge><HeartIcon size={20} /></OptionBadge> },
];
const GOAL_LABEL: Record<GoalType, string> = {
  strength: 'Strength',
  hypertrophy: 'Build muscle',
  fat_loss: 'Lose fat',
  endurance: 'Endurance',
  general_health: 'General health',
};
const EXPERIENCE_OPTIONS: SelectableOption<ExperienceLevel>[] = [
  { value: 'beginner', title: 'Beginner', description: 'Less than 1 year consistent' },
  { value: 'intermediate', title: 'Intermediate', description: '1–3 years' },
  { value: 'advanced', title: 'Advanced', description: '3+ years' },
];
const LOCATION_OPTIONS: SelectableOption<TrainingLocation>[] = [
  { value: 'home', title: 'Home', description: 'Dumbbells, bands, a bench', icon: <OptionBadge><HomeIcon size={20} /></OptionBadge> },
  // An office block was the wrong building. A squat rack is the one object that unambiguously
  // means "commercial gym"; home and plane were already correct and stay.
  { value: 'commercial_gym', title: 'Commercial gym', description: 'Full equipment', icon: <OptionBadge><RackIcon size={20} /></OptionBadge> },
  { value: 'minimal', title: 'Minimal', description: 'Bodyweight & travel', icon: <OptionBadge><PlaneIcon size={20} /></OptionBadge> },
];
const DIET_OPTIONS: SelectableOption<DietType>[] = [
  { value: 'omnivore', title: 'Omnivore' },
  { value: 'vegetarian', title: 'Vegetarian' },
  { value: 'vegan', title: 'Vegan' },
  { value: 'pescatarian', title: 'Pescatarian' },
  { value: 'keto', title: 'Keto' },
  { value: 'mediterranean', title: 'Mediterranean' },
  { value: 'none', title: 'Just track' },
];
const SEX_OPTIONS: { value: SexType; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
const SESSION_MINUTES = [30, 45, 60, 75, 90];
const BODY_AREA_LABEL: Record<BodyArea, string> = {
  shoulders: 'Shoulders',
  lower_back: 'Lower back',
  knees: 'Knees',
  wrists: 'Wrists',
  hips: 'Hips',
  neck: 'Neck',
  elbows: 'Elbows',
};
const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  free_weights: 'Free weights',
  benches_racks: 'Benches & racks',
  machines: 'Machines',
  cables: 'Cables',
  bodyweight_accessories: 'Bodyweight kit',
  cardio: 'Cardio',
  other: 'Plyo & conditioning',
};
const EQUIPMENT_CATEGORY_ORDER: EquipmentCategory[] = [
  'free_weights',
  'benches_racks',
  'bodyweight_accessories',
  'cables',
  'machines',
  'cardio',
  'other',
];

function prettyPattern(p: MovementPattern | string): string {
  return String(p)
    .split('_')
    .filter((w) => w !== 'iso')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Display name for a progression scheme (the library is the single source of these strings). */
function schemeName(scheme: ProgressionScheme): string {
  return PROGRESSION_OPTIONS.find((o) => o.slug === scheme)?.name ?? scheme;
}

function allergenLabel(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/_/g, ' ');
}

/* ═══════════════════════════════════════════════════════════ the store ↔ screen projection
 *
 * ONE resolver drives both what the screen renders and what a write persists, so the two can
 * never drift. Precedence is: the onboarding draft (the answers the user gave and can edit here)
 * → the derived rows generated from them → a neutral default for a store that never had the
 * field at all (e.g. a v1 backup imported from an older build).
 */

interface Answers {
  displayName: string;
  primaryGoal: GoalType;
  secondaryGoal: GoalType | null;
  experience: ExperienceLevel;
  daysPerWeek: number;
  sessionMinutes: number;
  preferredDays: number[];
  location: TrainingLocation;
  equipment: string[];
  loved: string[];
  bodyAreas: BodyArea[];
  movementExclusions: DraftMovementExclusion[];
  sex: SexType;
  birthdate: string;
  heightCm: number | null;
  weightKg: number | null;
  unit: UnitSystem;
  dietType: DietType;
  allergies: string[];
  mealsPerDay: number;
  targetsSource: 'suggested' | 'custom';
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

function resolveAnswers(state: DemoState): Answers {
  const d = state.draft;
  const p = state.profile;
  const n = state.nutritionProfile;
  const t = state.targets;
  return {
    displayName: d.display_name ?? p?.display_name ?? '',
    primaryGoal: d.primary_goal ?? p?.primary_goal ?? 'general_health',
    secondaryGoal: d.secondary_goal ?? p?.secondary_goal ?? null,
    experience: d.experience_level ?? p?.experience_level ?? 'beginner',
    daysPerWeek: d.days_per_week ?? p?.days_per_week ?? 3,
    sessionMinutes: d.session_minutes ?? p?.session_minutes ?? 45,
    preferredDays: d.preferred_days ?? p?.preferred_days ?? [],
    location: d.training_location ?? p?.training_location ?? 'commercial_gym',
    equipment: d.equipment_slugs ?? [],
    loved: d.loved_equipment_slugs ?? [],
    bodyAreas: d.body_areas ?? [],
    movementExclusions: d.movement_exclusions ?? [],
    sex: d.sex ?? p?.sex ?? 'prefer_not_to_say',
    birthdate: d.birthdate ?? p?.birthdate ?? '',
    heightCm: d.height_cm ?? p?.height_cm ?? null,
    weightKg: d.weight_kg ?? null,
    unit: d.unit_system ?? p?.unit_system ?? 'metric',
    dietType: d.diet_type ?? n?.diet_type ?? 'none',
    allergies: d.allergies ?? n?.allergies ?? [],
    mealsPerDay: d.meals_per_day ?? n?.meals_per_day ?? 3,
    targetsSource: d.targets_source ?? n?.targets_source ?? 'suggested',
    kcal: d.kcal_target ?? t?.kcal_target ?? n?.kcal_target ?? 0,
    protein: d.protein_g_target ?? t?.protein_g_target ?? n?.protein_g_target ?? 0,
    carbs: d.carbs_g_target ?? t?.carbs_g_target ?? n?.carbs_g_target ?? 0,
    fat: d.fat_g_target ?? t?.fat_g_target ?? n?.fat_g_target ?? 0,
  };
}

/**
 * Apply a draft patch and re-derive everything downstream of it, then persist.
 *
 * The store keeps BOTH the answers (`draft`) and the rows generated from them (`profile`,
 * `nutritionProfile`, `targets`) — Today, Nutrition and Progress read the latter. Writing only the
 * draft would leave Settings claiming one thing and the rest of the app showing another, so a
 * single write updates all of them. Suggested (i.e. not hand-edited) macro targets are recomputed
 * from the real §7.2.4 rule whenever an input to it changes.
 */
function commitPatch(patch: Draft): void {
  update((s) => {
    let draft: Draft = { ...s.draft, ...patch };
    const source = draft.targets_source ?? s.nutritionProfile?.targets_source ?? 'suggested';
    if (source === 'suggested') {
      const suggested = targetsForDraft(draft);
      draft = {
        ...draft,
        targets_source: 'suggested',
        kcal_target: suggested.kcal_target,
        protein_g_target: suggested.protein_g_target,
        carbs_g_target: suggested.carbs_g_target,
        fat_g_target: suggested.fat_g_target,
      };
    }

    const a = resolveAnswers({ ...s, draft });
    const name = a.displayName.trim();
    const profile: Profile = {
      display_name: name.length > 0 ? name : null,
      sex: a.sex,
      birthdate: a.birthdate,
      height_cm: a.heightCm ?? s.profile?.height_cm ?? 170,
      unit_system: a.unit,
      experience_level: a.experience,
      primary_goal: a.primaryGoal,
      secondary_goal: a.secondaryGoal,
      training_location: a.location,
      days_per_week: a.daysPerWeek,
      session_minutes: a.sessionMinutes,
      preferred_days: a.preferredDays,
    };
    const targets: NutritionTargets = {
      kcal_target: a.kcal,
      protein_g_target: a.protein,
      carbs_g_target: a.carbs,
      fat_g_target: a.fat,
    };
    const nutritionProfile: NutritionProfile = {
      diet_type: a.dietType,
      allergies: a.allergies,
      meals_per_day: a.mealsPerDay,
      kcal_target: a.kcal,
      protein_g_target: a.protein,
      carbs_g_target: a.carbs,
      fat_g_target: a.fat,
      targets_source: a.targetsSource,
    };
    return { ...s, draft, profile, nutritionProfile, targets };
  });
}

export function SettingsView() {
  const router = useRouter();
  const state = useDemoState();
  const answers = React.useMemo(() => resolveAnswers(state), [state]);
  const routine = state.routine;

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  /**
   * A validated, NOT-YET-APPLIED backup. Holding the raw text (rather than the parsed bundle)
   * keeps one parser in charge: `inspectBackup` and `importAllState` read the same string, so the
   * numbers shown in the confirm sheet are the numbers that get written.
   */
  const [pendingImport, setPendingImport] = React.useState<{
    text: string;
    summary: BackupSummary;
    local: BackupSummary;
  } | null>(null);
  const [savedCount, setSavedCount] = React.useState(0);
  /**
   * THE SETTINGS DISCLOSURE, closed by default.
   *
   * Nineteen sections of controls were the first thing this screen showed, which made the two
   * questions people actually arrive with — "am I signed in?" and "what plan am I on?" — the last
   * things they could answer. The profile card answers those; everything editable now sits behind one
   * button, and the button says how much is behind it.
   */
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  /**
   * The open/closed state survives a RELOAD, in `sessionStorage`.
   *
   * Deliberately not localStorage: every `fitforge.*` key there is swept into backups and the cloud
   * bundle, and "was the settings panel open" is not something to carry between devices. A tab's
   * lifetime is exactly the right lifetime for a disclosure — refresh mid-edit and you are still
   * where you were; come back tomorrow and the screen greets you with your profile again.
   *
   * Read in an effect rather than a lazy initialiser because this screen is prerendered: a first
   * client render that disagreed with the static HTML is a hydration mismatch.
   */
  React.useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SETTINGS_OPEN_KEY) === '1') setSettingsOpen(true);
    } catch {
      /* private mode — the panel simply starts closed */
    }
  }, []);
  const toggleSettings = React.useCallback(() => {
    setSettingsOpen((open) => {
      const next = !open;
      try {
        if (next) window.sessionStorage.setItem(SETTINGS_OPEN_KEY, '1');
        else window.sessionStorage.removeItem(SETTINGS_OPEN_KEY);
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);
  const [planDirty, setPlanDirty] = React.useState(false);
  const [planStatus, setPlanStatus] = React.useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { user } = useAuth();
  const [eraseBusy, setEraseBusy] = React.useState(false);
  const [eraseError, setEraseError] = React.useState<string | null>(null);
  /**
   * The "re-generate?" sheet is an OFFER, not a nag: it interrupts once per round of edits.
   * Equipment cycles through have → favourite → off, so re-opening a modal on every tap would
   * make the control unusable; after the first offer the inline banner carries the message.
   */
  const offeredRegenRef = React.useRef(false);

  /** Write-through: persist the patch, then acknowledge it truthfully. */
  const save = React.useCallback((patch: Draft, affectsPlan = false) => {
    commitPatch(patch);
    setSavedCount((n) => n + 1);
    if (affectsPlan) {
      setPlanDirty(true);
      setPlanStatus(null); // the last "re-generated" line is no longer true of these answers
    }
  }, []);

  /** Re-run the real generator over the CURRENT answers and replace the stored routine (§7.5). */
  const regenerate = React.useCallback(() => {
    const draft = getState().draft;
    const next = routineForDraft(draft);
    update((s) => ({ ...s, routine: next }));
    const total = next.days.reduce((sum, d) => sum + d.exercises.length, 0);
    setPlanDirty(false);
    setRegenPrompt(false);
    offeredRegenRef.current = false;
    setPlanStatus(`Plan re-generated · ${next.name} · ${exerciseCountLabel(total)}`);
  }, []);

  /** Offer a re-generation once per round of plan-affecting edits. */
  const offerRegenerate = React.useCallback(() => {
    if (offeredRegenRef.current) return;
    offeredRegenRef.current = true;
    setRegenPrompt(true);
  }, []);

  // Honest coverage read-out for the answers as they stand (§7.5 / M1) — pure, so it can be
  // recomputed whenever the draft changes.
  const coverage = React.useMemo(() => planCoverageForDraft(state.draft), [state.draft]);

  const totalExercises = routine?.days.reduce((sum, d) => sum + d.exercises.length, 0) ?? 0;

  /* ------------------------------------------------------------------ Local Mode data actions */

  /** Export EVERY Local Mode key as a downloadable JSON backup (§5.1 / P2-16). */
  function exportData() {
    const blob = new Blob([exportAllState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitforge-backup-${localISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * STEP 1 OF THE IMPORT: read and validate the file, then ASK. Nothing is written here.
   *
   * Import used to be one irreversible verb — pick a file, lose whatever was on the device. That
   * is right for restoring onto a fresh phone and wrong everywhere else, and it was worst for a
   * signed-in athlete: an old backup silently replaced newer history and then synced the loss up
   * to the account. So the file is inspected first and the athlete chooses on the numbers.
   */
  async function stageImport(file: File) {
    const text = await file.text();
    const result = inspectBackup(text);
    if (!result.ok) {
      setImportError(result.error);
      setPendingImport(null);
      return;
    }
    setImportError(null);
    setPendingImport({ text, summary: result.summary, local: localSummary() });
  }

  /** STEP 2: apply, with the mode the athlete picked. */
  function applyImport(mode: ImportMode) {
    if (!pendingImport) return;
    const result = importAllState(pendingImport.text, mode);
    setPendingImport(null);
    if (result.ok) {
      setImportError(null);
      router.push('/today');
    } else {
      setImportError(result.error);
    }
  }

  /**
   * Erase EVERYTHING — and for a signed-in user, "everything" includes the account's Firestore
   * document. Ordering is load-bearing: the cloud delete runs first (Firestore rules only allow a
   * user to delete their OWN doc, so it must happen while still signed in, and `eraseCloudCopy`
   * latches all further uploads so the mirror can't resurrect the doc), then sign-out, then the
   * local wipe. If the cloud delete cannot be confirmed, NOTHING is erased and the sheet says so
   * — "your data is gone" is the one claim this screen must never get wrong.
   */
  async function eraseAndLeave() {
    if (user) {
      setEraseBusy(true);
      setEraseError(null);
      const ok = await eraseCloudCopy(user.uid);
      if (!ok) {
        setEraseError(
          'Your cloud copy could not be deleted — check your connection and try again. Nothing was erased.',
        );
        setEraseBusy(false);
        return;
      }
      await signOutUser().catch(() => {});
    }
    eraseAllLocalData();
    router.push('/');
  }

  /* --------------------------------------------------------------------------- edit handlers */

  function toggleWeekday(index: number) {
    const next = answers.preferredDays.includes(index)
      ? answers.preferredDays.filter((d) => d !== index)
      : [...answers.preferredDays, index].sort((a, b) => a - b);
    save({ preferred_days: next }, true);
  }

  /**
   * Equipment cycles have → love → gone, exactly as the onboarding review screen does, so the
   * gold star ("we'll favour this") stays editable here too.
   */
  function cycleEquipment(slug: string) {
    const owned = answers.equipment.includes(slug);
    const loved = answers.loved.includes(slug);
    let equipment = answers.equipment;
    let lovedSlugs = answers.loved;
    if (!owned) {
      equipment = [...equipment, slug];
    } else if (!loved) {
      lovedSlugs = [...lovedSlugs, slug];
    } else {
      equipment = equipment.filter((s) => s !== slug);
      lovedSlugs = lovedSlugs.filter((s) => s !== slug);
    }
    save({ equipment_slugs: equipment, loved_equipment_slugs: lovedSlugs }, true);
    offerRegenerate();
  }

  /** Protected areas resolve to real movement-pattern exclusions through the §7.2.2 rule. */
  function toggleBodyArea(area: BodyArea) {
    const next = answers.bodyAreas.includes(area)
      ? answers.bodyAreas.filter((a) => a !== area)
      : [...answers.bodyAreas, area];
    const rows: DraftMovementExclusion[] = resolveBodyAreaExclusions(next).map((e) => ({
      movement_pattern: e.movement_pattern,
      reason: 'injury',
      source_body_area: e.source_body_area,
      soft: e.soft,
    }));
    save({ body_areas: next, movement_exclusions: rows }, true);
    offerRegenerate();
  }

  function toggleAllergy(tag: string) {
    const next = answers.allergies.includes(tag)
      ? answers.allergies.filter((a) => a !== tag)
      : [...answers.allergies, tag];
    save({ allergies: next });
  }

  /** A hand-typed macro target is a custom override (§2.3) — it stops tracking the suggestion. */
  function setCustomTarget(patch: Draft) {
    save({ ...patch, targets_source: 'custom' });
  }

  function resetTargetsToSuggested() {
    const suggested = targetsForDraft({ ...getState().draft, targets_source: 'suggested' });
    save({
      targets_source: 'suggested',
      kcal_target: suggested.kcal_target,
      protein_g_target: suggested.protein_g_target,
      carbs_g_target: suggested.carbs_g_target,
      fat_g_target: suggested.fat_g_target,
    });
  }

  const sessionOptions = React.useMemo(
    () => [...new Set([...SESSION_MINUTES, answers.sessionMinutes])].sort((a, b) => a - b),
    [answers.sessionMinutes],
  );
  const avoidedPatterns = React.useMemo(
    () => answers.movementExclusions.map((m) => prettyPattern(m.movement_pattern)),
    [answers.movementExclusions],
  );

  /* ------------------------------------------------------------------------ progression scheme
   * `progression` is the scheme IN FORCE (explicit choice, else the recommendation for the answers
   * above — which is why changing Experience here can change what this section says). The preview
   * runs the real shared rule over the real compound prescription this athlete's plan uses, so the
   * numbers on screen are the numbers the player will show, not an illustration. */
  const progression = resolveProgressionScheme(state);
  const recommendedScheme = recommendProgressionScheme({
    experience_level: answers.experience,
    primary_goal: answers.primaryGoal,
  });
  // Recommended first, exactly as the onboarding step orders them, so the two screens agree.
  const progressionOptions = React.useMemo<SelectableOption<ProgressionScheme>[]>(
    () =>
      [...PROGRESSION_OPTIONS]
        .sort((a, b) => Number(b.slug === recommendedScheme) - Number(a.slug === recommendedScheme))
        .map((meta) => ({
          value: meta.slug,
          title: meta.slug === recommendedScheme ? `${meta.name} · recommended for you` : meta.name,
          description: meta.tagline,
        })),
    [recommendedScheme],
  );
  const progressionPreview = React.useMemo(() => {
    const defaults = suggestOnboardingDefaults(answers.primaryGoal, answers.experience);
    return prescribeSets(
      {
        sets: 4,
        rep_min: defaults.rep_min,
        rep_max: defaults.rep_max,
        // The RPE the generator writes on every row, so a back-off that runs one notch easier
        // shows up here as the different number it is.
        target_rpe: 7,
        mechanics: 'compound',
        experience: answers.experience,
      },
      progression,
    );
  }, [answers.primaryGoal, answers.experience, progression]);
  const progressionCaution = schemeCaution(progression, answers.experience);
  const progressionTrim = trimNoticeFor(progressionPreview);

  return (
    <div className="space-y-6 pb-4">
      {/* THE SCREEN IS A PROFILE NOW, and the title says so. It is still served at /settings — the
          route is linked from the top bar, the tab bar and half the specs, and renaming a URL to
          rename a heading would be a gratuitous break. */}
      <h1 className="font-display text-display font-bold">Profile</h1>

      <ProfileCard
        displayName={answers.displayName}
        goalLabel={GOAL_LABEL[answers.primaryGoal]}
        routine={routine}
        startedAt={state.completedAt}
      />

      {/* ONE BUTTON FOR EVERYTHING EDITABLE. Wired as a real disclosure — `aria-expanded` plus
          `aria-controls` — so assistive tech gets the same "there is more behind this" that the
          chevron gives everyone else. */}
      <div>
        <button
          type="button"
          onClick={toggleSettings}
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
          data-testid="settings-open"
          className="flex w-full items-center gap-3 rounded-card border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:border-accent"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent">
            <SettingsIcon size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Settings</span>
            <span className="block text-[11px] text-muted-foreground">
              Plan, goals, schedule, equipment, nutrition targets, your data
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-muted-foreground">
            {settingsOpen ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </span>
        </button>
        <p className="mt-1.5 px-1 text-xs text-muted-foreground" data-testid="settings-saved">
          <span role="status" aria-live="polite">
            {savedCount > 0
              ? 'Saved to this browser.'
              : 'Every change saves to this browser as you make it.'}
          </span>
        </p>
      </div>

      {/* The panel is UNMOUNTED when closed rather than hidden: half of these sections do real work
          on mount (plan coverage, progression previews, the equipment illustration set), and paying
          for all of it to render behind a collapsed panel would be the opposite of the point. */}
      {settingsOpen && (
        <div id="settings-panel" className="space-y-6" data-testid="settings-panel">

      {/* ---------------------------------------------------------------- Your plan */}
      <GroupHeader>Your plan</GroupHeader>

      <Section title="Current routine" hint="Generated from the answers below.">
        {routine ? (
          <div className="space-y-2" data-testid="settings-plan-summary">
            <p className="text-sm font-semibold text-foreground" data-testid="settings-plan-name">
              {routine.name}
            </p>
            <p className="text-xs text-muted-foreground tabular" data-testid="settings-plan-days">
              {routine.days.length} {routine.days.length === 1 ? 'day' : 'days'} a week ·{' '}
              {exerciseCountLabel(totalExercises)}
            </p>
            <ul className="space-y-1">
              {routine.days.map((day) => (
                <li key={day.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{day.name}</span> — {describeDay(day)}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="settings-plan-summary">
            No routine generated yet.
          </p>
        )}

        {coverage.limited && (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
            {coverage.title}. {coverage.body}
          </p>
        )}

        {planDirty && (
          <p
            className="rounded-xl border border-accent bg-accent-muted px-3 py-2 text-xs text-accent"
            data-testid="settings-plan-dirty"
          >
            Your answers changed. Re-generate to bring the routine in line with them.
          </p>
        )}

        <Button
          size="lg"
          block
          variant={planDirty ? 'primary' : 'secondary'}
          onClick={regenerate}
          data-testid="settings-regenerate"
        >
          <RepeatIcon size={18} /> Re-generate my plan
        </Button>
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite" data-testid="settings-plan-status">
          {planStatus ?? ''}
        </p>
      </Section>

      <Section title="Primary goal" hint="Drives how we generate and progress your routine.">
        <SelectableCardGrid
          options={GOAL_OPTIONS}
          value={answers.primaryGoal}
          onChange={(v) => save({ primary_goal: v }, true)}
          columns={1}
        />
        <FieldLabel>Secondary goal (optional)</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.filter((o) => o.value !== answers.primaryGoal).map((o) => (
            <Chip
              key={o.value}
              selected={answers.secondaryGoal === o.value}
              onClick={() =>
                save({ secondary_goal: answers.secondaryGoal === o.value ? null : o.value })
              }
            >
              {GOAL_LABEL[o.value]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Experience">
        <SelectableCardGrid
          options={EXPERIENCE_OPTIONS}
          value={answers.experience}
          onChange={(v) => save({ experience_level: v }, true)}
        />
      </Section>

      {/* Progression — the one setting that changes what happens on EVERY set, so it lives with
          the plan rather than buried under preferences. */}
      <Section
        title="Progression"
        hint="How your sets are loaded, and what makes the weight go up."
      >
        <p className="text-xs text-muted-foreground" data-testid="settings-progression-current">
          {state.progressionScheme
            ? `You chose ${schemeName(progression)}.`
            : `Following our recommendation for you: ${schemeName(progression)}.`}
        </p>
        {/* The same sentence the onboarding picker leads with, so the two screens teach the same
            thing and the default stays the endorsed answer rather than the leftover one. */}
        <p className="text-xs text-muted-foreground" data-testid="settings-progression-lede">
          {PROGRESSION_PICKER_LEDE}
        </p>
        <SelectableCardGrid
          options={progressionOptions}
          value={progression}
          onChange={(v) => setProgressionScheme(v)}
          columns={1}
        />
        <div className="rounded-xl border border-border bg-surface px-3 py-2" data-testid="settings-progression-preview">
          <p className="text-sm font-semibold text-foreground">A 4-set compound, set by set</p>
          <p className="mt-1 text-sm tabular text-foreground" data-testid="settings-progression-shape">
            {/* `describeSetTarget` is the shared formatter, so a rep RANGE under straight sets and
                a missing percentage on a bodyweight lift render identically everywhere. */}
            {progressionPreview.sets.map(describeSetTarget).join('  ·  ')}
          </p>
          {progressionTrim && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="settings-progression-trim">
              {progressionTrim}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{progressionPreview.nextSession}</p>
        </div>
        {progressionCaution && (
          <p
            className="rounded-xl border border-accent bg-accent-muted px-3 py-2 text-xs leading-snug text-accent"
            role="status"
            data-testid="settings-progression-caution"
          >
            {progressionCaution}
          </p>
        )}
        {state.progressionScheme && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setProgressionScheme(null)}
            data-testid="settings-progression-reset"
            /* min-h-[44px]: `size="sm"` lands this at 245 × 36. It hands the athlete's training
               back to the recommendation, which is a bigger decision than its height suggested. */
            className="min-h-[44px]"
          >
            Use the recommendation instead
          </Button>
        )}
        {/* Provenance for every percentage above — including, explicitly, the ones that rest on
            coaching convention rather than a trial. Same treatment volume targets already get. */}
        <ProgressionEvidenceNote testId="settings-progression-evidence" />
      </Section>

      <Section title="Schedule">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Days per week</FieldLabel>
          <Stepper
            value={answers.daysPerWeek}
            min={1}
            max={7}
            onChange={(v) => save({ days_per_week: v }, true)}
            unit="days"
            aria-label="Days per week"
          />
        </div>
        <div>
          <FieldLabel>Preferred days</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((d, i) => (
              <Chip key={d} selected={answers.preferredDays.includes(i)} onClick={() => toggleWeekday(i)}>
                {d}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Session length</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {sessionOptions.map((m) => (
              <Chip
                key={m}
                selected={answers.sessionMinutes === m}
                onClick={() => save({ session_minutes: m }, true)}
              >
                {m} min
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Training location">
        <SelectableCardGrid
          options={LOCATION_OPTIONS}
          value={answers.location}
          onChange={(v) => save({ training_location: v }, true)}
        />
      </Section>

      <Section
        title="Equipment"
        hint="Tap to cycle: have, then a gold star for kit we should favour, then off."
      >
        <p className="text-xs text-muted-foreground" data-testid="settings-equipment-count">
          {answers.equipment.length === 0
            ? 'Nothing marked — we build bodyweight-only plans for you.'
            : `${answers.equipment.length} marked${answers.loved.length > 0 ? ` · ${answers.loved.length} favourite` : ''}`}
        </p>
        {EQUIPMENT_CATEGORY_ORDER.map((category) => {
          const rows = DEMO_EQUIPMENT.filter((e) => e.category === category);
          if (rows.length === 0) return null;
          return (
            <div key={category}>
              <FieldLabel>{EQUIPMENT_CATEGORY_LABEL[category]}</FieldLabel>
              <div
                className="mt-1.5 flex flex-wrap gap-2"
                role="group"
                aria-label={EQUIPMENT_CATEGORY_LABEL[category]}
              >
                {rows.map((row) => {
                  const owned = answers.equipment.includes(row.slug);
                  const loved = answers.loved.includes(row.slug);
                  return (
                    <Chip
                      key={row.slug}
                      selected={owned}
                      // THE KIT, DRAWN. Thirty finished object portraits existed and this grid —
                      // the one screen that is entirely ABOUT equipment — was a wall of text
                      // chips. The gold star still wins when a slug is a favourite, because that
                      // is a state the glyph cannot carry. `Chip`'s leading slot is aria-hidden
                      // and adds no text node, so `{ name: 'Barbell', exact: true }` still
                      // resolves in the settings spec.
                      leading={
                        loved ? (
                          <StarIcon size={13} className="text-accent" />
                        ) : (
                          <EquipmentIllustration slug={row.slug} size={18} selected={owned} />
                        )
                      }
                      onClick={() => cycleEquipment(row.slug)}
                      data-testid={`settings-equipment-${row.slug}`}
                    >
                      {row.name}
                    </Chip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Protect / avoid" hint="Body areas map to movement patterns we'll avoid.">
        <div className="flex flex-wrap gap-2">
          {BODY_AREAS.map((area) => (
            <Chip
              key={area}
              selected={answers.bodyAreas.includes(area)}
              onClick={() => toggleBodyArea(area)}
              data-testid={`settings-body-area-${area}`}
            >
              {BODY_AREA_LABEL[area]}
            </Chip>
          ))}
        </div>
        {avoidedPatterns.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="settings-avoided-patterns">
            We&apos;ll steer away from: {avoidedPatterns.join(', ')}.
          </p>
        )}
      </Section>

      {/* ---------------------------------------------------------------- Preferences */}
      <GroupHeader>Preferences</GroupHeader>

      <Section title="Diet">
        <SelectableCardGrid
          options={DIET_OPTIONS}
          value={answers.dietType}
          onChange={(v) => save({ diet_type: v })}
          columns={2}
        />
        <FieldLabel>Allergies</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_TAGS.map((tag) => (
            <Chip
              key={tag}
              selected={answers.allergies.includes(tag)}
              onClick={() => toggleAllergy(tag)}
              data-testid={`settings-allergy-${tag}`}
            >
              {allergenLabel(tag)}
            </Chip>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Meals per day</FieldLabel>
          <Stepper
            value={answers.mealsPerDay}
            min={1}
            max={6}
            onChange={(v) => save({ meals_per_day: v })}
            unit="meals"
            aria-label="Meals per day"
          />
        </div>
      </Section>

      <Section
        title="Daily targets"
        hint={
          answers.targetsSource === 'custom'
            ? 'Custom values — these stay put until you reset them.'
            : 'Suggested from your body metrics, goal and schedule.'
        }
      >
        <div className="flex items-center gap-3">
          <NumberField
            label="Calories"
            value={answers.kcal}
            min={0}
            onCommit={(n) => setCustomTarget({ kcal_target: n })}
            testId="settings-kcal"
            width="w-28"
          />
          <span className="text-sm text-muted-foreground">kcal / day</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Protein (g)"
            value={answers.protein}
            min={0}
            onCommit={(n) => setCustomTarget({ protein_g_target: n })}
            testId="settings-protein"
          />
          <NumberField
            label="Carbs (g)"
            value={answers.carbs}
            min={0}
            onCommit={(n) => setCustomTarget({ carbs_g_target: n })}
            testId="settings-carbs"
          />
          <NumberField
            label="Fat (g)"
            value={answers.fat}
            min={0}
            onCommit={(n) => setCustomTarget({ fat_g_target: n })}
            testId="settings-fat"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={resetTargetsToSuggested}>
          Reset to suggested
        </Button>
      </Section>

      {/* "About you" rather than "Profile": the SCREEN is the profile now, and a section inside it
          wearing the same name is both confusing to read and ambiguous to address. */}
      <Section title="About you">
        <label className="flex flex-col gap-1">
          <FieldLabel>Display name</FieldLabel>
          <input
            value={answers.displayName}
            onChange={(e) => save({ display_name: e.target.value })}
            data-testid="settings-display-name"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Height (cm)"
            value={answers.heightCm}
            min={0}
            onCommit={(n) => save({ height_cm: n })}
            testId="settings-height"
          />
          <label className="flex flex-col gap-1">
            <FieldLabel>Birthdate</FieldLabel>
            <input
              type="date"
              value={answers.birthdate}
              onChange={(e) => save({ birthdate: e.target.value })}
              data-testid="settings-birthdate"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
            />
          </label>
        </div>
        <NumberField
          label="Weight (kg)"
          value={answers.weightKg}
          min={0}
          step="0.1"
          onCommit={(n) => save({ weight_kg: n })}
          testId="settings-weight"
          hint="Used for your calorie targets. Day-to-day weigh-ins live in Progress."
        />
        <div>
          <FieldLabel>Sex</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {SEX_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={answers.sex === o.value}
                onClick={() => save({ sex: o.value })}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Units</FieldLabel>
          <div className="mt-1.5 flex gap-2">
            {(['metric', 'imperial'] as const).map((u) => (
              <Chip key={u} selected={answers.unit === u} onClick={() => save({ unit_system: u })}>
                <span className="capitalize">{u}</span>
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      {/* THE ACCOUNT SECTION IS GONE FROM HERE — deliberately, not by oversight. `AccountCard` now
          renders once, at the top of the screen, inside the profile card. Two of them on one page
          means two places that can disagree about whether you are signed in, and two "Sign out"
          buttons a scroll apart. Identity belongs with identity. */}

      {/* ---------------------------------------------------------------- data + device */}
      {/* THE HEADING FOLLOWS THE TRUTH. "Local Mode" is the name of the no-account experience, so
          stamping it over a signed-in athlete's data section told them the wrong thing about where
          their training lives — and the copy underneath used to promise "nothing is uploaded",
          which for them is simply false. Signed in, this is "Your data": on the device AND in the
          account. */}
      <GroupHeader>{user ? 'Your data' : 'Local Mode'}</GroupHeader>

      {/* THE TOUR, ON DEMAND. A first-run tour that can only ever be seen once is a tour you have
          to get right on the first read; one you can replay is a reference. Re-arming CLEARS the
          flag rather than opening a sheet from here, so the tour opens where it belongs — over
          Today, the screen it is describing — and the "never twice" rule keeps working afterwards. */}
      <Section
        title="App tour"
        hint="The three-screen tour of the tabs, starting a workout, and how Local Mode stores your data."
      >
        <Button
          size="lg"
          variant="secondary"
          block
          data-testid="settings-replay-tour"
          onClick={() => {
            resetTour();
            router.push('/today');
          }}
        >
          <RepeatIcon size={18} /> Replay the app tour
        </Button>
      </Section>

      <Section
        title={user ? 'Backup and portability' : 'Local Mode'}
        hint={
          user
            ? `Your training is saved in this browser and synced to your Google account (${user.email ?? 'signed in'}), so a new device picks it up after you sign in. A JSON export is still yours to keep — it needs no account to restore.`
            : 'Everything lives in this browser. Nothing is uploaded. Back up or move your data anytime.'
        }
      >
        <div className="flex flex-col gap-2">
          <Button size="lg" variant="secondary" block onClick={exportData} data-testid="settings-export">
            <ExportIcon size={18} /> Export data (JSON)
          </Button>
          <Button
            size="lg"
            variant="secondary"
            block
            onClick={() => fileInputRef.current?.click()}
            data-testid="settings-import"
          >
            <ImportIcon size={18} /> Import data
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void stageImport(file);
              e.target.value = '';
            }}
          />
          {importError && (
            <p role="alert" className="text-xs text-danger" data-testid="settings-import-error">
              {importError}
            </p>
          )}
          {/* The label states the REACH of the button, which changed once erase started deleting
              the account document too. Signed out it is still exactly "Erase Local Mode data" —
              that is what it does, and several specs quite rightly hold it to that name. */}
          <Button
            size="lg"
            variant="danger"
            block
            onClick={() => setDeleteOpen(true)}
            data-testid="erase-local-data"
          >
            <TrashIcon size={18} />{' '}
            {user ? 'Erase everything, everywhere' : 'Erase Local Mode data'}
          </Button>
          <p className="text-xs text-muted-foreground">
            A backup covers everything this app stores here — your answers, plan, food logs and full
            training history.{' '}
            {user
              ? 'Erasing clears this browser AND deletes your cloud copy, then signs you out.'
              : 'Erasing clears all of it.'}
          </p>
        </div>
      </Section>

      {/* START OVER — a LOCAL-MODE-ONLY control, and hiding it when signed in is a safety fix
          rather than tidying. It is labelled "Sign out" but calls the erase path, and a signed-in
          athlete already has a real sign-out in the Account card above (which keeps their data).
          Two controls a screen apart, one word, opposite consequences: the destructive one goes. */}
      {!user && (
        <Section title="Start over">
          <div className="flex flex-col gap-2">
            <Button size="lg" variant="secondary" block onClick={() => void eraseAndLeave()} data-testid="demo-signout">
              <LogOutIcon size={18} /> Clear this browser and start over
            </Button>
            <p className="text-xs text-muted-foreground">
              Local Mode has no account to sign out of — this clears this browser&apos;s data and
              returns you to the start. Export a backup first if you want to keep it.
            </p>
          </div>
        </Section>
      )}

      </div>
      )}

      {/* Regenerate prompt — fired by equipment / protected-area edits (§2.3). */}
      <Sheet open={regenPrompt} onClose={() => setRegenPrompt(false)} title="Re-generate your plan?">
        <p className="text-sm text-muted-foreground">
          You changed your equipment or the areas you want to protect. Want us to re-generate your
          starter routine to match?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button block onClick={regenerate} data-testid="settings-regenerate-confirm">
            Yes, re-generate it
          </Button>
          <Button variant="ghost" block onClick={() => setRegenPrompt(false)}>
            Keep my current plan
          </Button>
        </div>
      </Sheet>

      {/* IMPORT CONFIRM — the file's numbers beside this device's, then a choice of verb.
          Merge is offered first because it is the recoverable one: overwrite is the only action on
          this screen that can silently destroy history the athlete never exported. */}
      <Sheet
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title="Import this backup?"
      >
        {pendingImport && (
          <>
            <div className="grid grid-cols-2 gap-2" data-testid="import-compare">
              <SummaryColumn
                label="The file"
                summary={pendingImport.summary}
                stampPrefix="Exported"
                testid="import-summary-file"
              />
              <SummaryColumn
                label="This device"
                summary={pendingImport.local}
                testid="import-summary-local"
              />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button block onClick={() => applyImport('merge')} data-testid="import-merge">
                Merge into my data
              </Button>
              <p className="text-xs text-muted-foreground">
                Keeps everything on this device — including your current plan and profile — and adds
                every workout, food entry and weigh-in from the file that this device is missing.
              </p>
              <Button
                variant="danger"
                block
                onClick={() => applyImport('overwrite')}
                data-testid="import-overwrite"
              >
                Overwrite with the file
              </Button>
              <p className="text-xs text-muted-foreground">
                Replaces your profile, plan, food logs and training history on this device with the
                file&apos;s copy. Anything here that is not in the file is lost.
              </p>
              {/* Signed in, the consequence does not stop at this browser. Saying so here is the
                  "linking step" — the mirror will carry whichever choice is made up to the account. */}
              {user && (
                <p className="text-xs font-medium text-foreground" data-testid="import-sync-note">
                  You are signed in, so the result syncs to your Google account and reaches your
                  other devices.
                </p>
              )}
              <Button variant="ghost" block onClick={() => setPendingImport(null)} data-testid="import-cancel">
                Cancel
              </Button>
            </div>
          </>
        )}
      </Sheet>

      {/* Erase confirm — for a signed-in user this ALSO deletes the account's cloud copy. */}
      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Erase all your data?">
        <p className="text-sm text-muted-foreground">
          This clears your profile, generated routine, food logs and training history stored in this
          browser
          {user ? (
            <>
              {' '}
              <span className="font-semibold text-foreground">
                and deletes your cloud copy from your Google account
              </span>
              , then signs you out
            </>
          ) : null}
          . This cannot be undone. Export a backup first if you want to keep it.
        </p>
        {eraseError && (
          <p className="mt-3 text-sm font-medium text-danger" data-testid="erase-cloud-error">
            {eraseError}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" block disabled={eraseBusy} onClick={() => void eraseAndLeave()}>
            {eraseBusy ? 'Erasing…' : 'Yes, erase everything'}
          </Button>
          <Button variant="ghost" block onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 pt-2 font-display text-lg font-bold text-foreground">
      {children}
    </h2>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardTitle className="text-base">{title}</CardTitle>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </Card>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * A numeric field that survives being emptied.
 *
 * A raw `value={n} onChange={Number(e.target.value)}` turns a cleared box into a persisted `0`
 * (and a half-typed "1." into `1`), so the field keeps its own text buffer, commits only when the
 * text parses to a finite number, and snaps back to the stored value on blur.
 */
function NumberField({
  label,
  value,
  onCommit,
  min,
  step,
  testId,
  hint,
  width,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number) => void;
  min?: number;
  step?: string;
  testId?: string;
  hint?: string;
  width?: string;
}) {
  const stored = value == null ? '' : String(value);
  const [text, setText] = React.useState(stored);
  const [editing, setEditing] = React.useState(false);

  // Follow the store while the user is not typing (import, reset-to-suggested, another tab).
  React.useEffect(() => {
    if (!editing) setText(stored);
  }, [stored, editing]);

  return (
    <label className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={text}
        data-testid={testId}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n) && (min == null || n >= min)) {
            onCommit(n);
          }
        }}
        onBlur={() => {
          setEditing(false);
          setText(stored);
        }}
        className={`h-11 rounded-xl border border-border bg-surface px-3 text-base tabular outline-none focus:border-accent ${width ?? 'w-full'}`}
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
