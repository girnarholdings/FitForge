import type { MealSlot } from '@/components/features/_mock/data';

/** The four day sections, in the order they are rendered. */
export const MEAL_SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'snack', label: 'Snacks' },
];

export function mealSlotLabel(slot: MealSlot): string {
  return MEAL_SLOTS.find((s) => s.slot === slot)?.label ?? 'Snacks';
}
