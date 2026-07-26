'use client';

import * as React from 'react';
import { mockSearchExercises } from '@/components/features/_mock/data';
import { searchFoods as searchFoodIndex } from '@/lib/food/search';

export interface ExerciseHit {
  exercise_id: string;
  slug: string;
  name: string;
  matched_alias: string | null;
  score: number;
}

export interface FoodHit {
  food_id: string;
  slug: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein_g: number;
  serving_name: string;
  serving_grams: number;
  score: number;
}

/**
 * DEMO MODE type-ahead fetchers. The §7.1 ranking runs entirely in-memory — exercises over the
 * shared fixture catalog, foods over the 509-food `lib/food` index — so the AbortSignal is
 * accepted for API compatibility with `SearchInput` but there is nothing to cancel.
 */
export function useCatalogSearch() {
  const searchExercises = React.useCallback(
    async (
      q: string,
      _signal?: AbortSignal,
      _opts?: { filterEquipment?: boolean; categorySlug?: string | null },
    ): Promise<ExerciseHit[]> => {
      return mockSearchExercises(q, 8).map((r) => ({
        exercise_id: r.exercise_id,
        slug: r.slug,
        name: r.name,
        matched_alias: r.matched_alias,
        score: r.score,
      }));
    },
    [],
  );

  const searchFoods = React.useCallback(
    async (q: string, _signal?: AbortSignal, _applyDietFilter = true): Promise<FoodHit[]> => {
      return searchFoodIndex(q, { limit: 8 }).map((hit) => ({
        food_id: hit.food.id,
        slug: hit.food.id,
        name: hit.food.name,
        brand: null,
        kcal: hit.food.per_100g.kcal,
        protein_g: hit.food.per_100g.protein_g,
        serving_name: hit.food.serving_name,
        serving_grams: hit.food.serving_grams,
        score: Math.round(hit.score),
      }));
    },
    [],
  );

  return { searchExercises, searchFoods };
}
