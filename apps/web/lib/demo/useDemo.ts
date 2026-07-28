'use client';

/**
 * React bindings for the demo store.
 *
 * Built on `useSyncExternalStore` with a distinct server snapshot so static prerender always sees
 * the default (mock) data and the client re-reads `localStorage` after hydration — the sanctioned
 * pattern, so there are no hydration mismatches.
 */
import * as React from 'react';
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  setLogsFor,
  logWeight as logWeightStore,
  type DemoState,
  type WeightEntry,
} from './store';
import {
  MOCK_ROUTINE,
  mockNutritionTargets,
  todayISO,
  type Routine,
  type NutritionTargets,
  type NutritionLog,
} from '@/components/features/_mock/data';

export function useDemoState(): DemoState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Active routine: the generated one once onboarding is done, else the default demo routine. */
export function useActiveRoutine(): Routine {
  const state = useDemoState();
  return state.routine ?? MOCK_ROUTINE;
}

export function useNutritionTargets(): NutritionTargets {
  const state = useDemoState();
  return state.targets ?? mockNutritionTargets();
}

/**
 * Greeting-ready display name. Once onboarding is complete, an un-named athlete falls back to
 * "Athlete" (§5.4); before completion (pre-gate SSR / fresh state) it is empty so chrome can show
 * its own neutral placeholder.
 */
export function useProfileName(): string {
  const state = useDemoState();
  return state.profile?.display_name ?? (state.completedAt ? 'Athlete' : '');
}

/** Whether the user has finished onboarding (drives first-run empty states vs. real data). */
export function useHasOnboarded(): boolean {
  return useDemoState().completedAt != null;
}

/** Body-weight log (empty for a fresh user) + a persister. */
export function useWeights(): {
  weights: WeightEntry[];
  logWeight: (date: string, kg: number) => void;
} {
  const weights = useDemoState().weights;
  return { weights, logWeight: logWeightStore };
}

/**
 * Today's food logs, with a persister that writes through to the store.
 * A fresh demo user starts with an EMPTY day — nothing is auto-logged; the UI guides them to log
 * their first food. Logs only exist once the user (or a "load sample day" action) creates them.
 */
export function useTodayLogs(): {
  logs: NutritionLog[];
  setLogs: (updater: (prev: NutritionLog[]) => NutritionLog[]) => void;
} {
  return useLogsForDate(todayISO());
}

/**
 * The same accessor for ANY day, so a meal can be logged onto the night you forgot to record it.
 *
 * `setLogs` re-reads from `getSnapshot()` rather than closing over the rendered `logs`: the updater
 * must apply to what is in the store at the moment it runs, not to whatever the component last
 * rendered. That mattered little when the date was always today, and matters a great deal now that
 * the date can change underneath a pending update.
 */
export function useLogsForDate(date: string): {
  logs: NutritionLog[];
  setLogs: (updater: (prev: NutritionLog[]) => NutritionLog[]) => void;
} {
  const state = useDemoState();
  const logs = state.logsByDate[date] ?? EMPTY_LOGS;

  const setLogs = React.useCallback(
    (updater: (prev: NutritionLog[]) => NutritionLog[]) => {
      const prev = getSnapshot().logsByDate[date] ?? [];
      setLogsFor(date, updater(prev));
    },
    [date],
  );

  return { logs, setLogs };
}

/**
 * One shared empty array for every day with nothing logged.
 *
 * `?? []` allocates a NEW array on each render, so any `useMemo`/`useEffect` keyed on `logs` would
 * re-run forever on an empty day — which is most days, most of the time, now that arbitrary dates
 * are reachable.
 */
const EMPTY_LOGS: NutritionLog[] = [];
