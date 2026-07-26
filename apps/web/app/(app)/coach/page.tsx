import type { Metadata } from 'next';
import { CoachView } from '@/components/features/coach/CoachView';
import { KB_ENTRIES } from '@/lib/kb';

export const metadata: Metadata = {
  title: 'Coach · FitForge',
  // Derived, never hand-counted: the KB grows and a stale count is a small lie in the <head>.
  description: `The FitForge knowledge base — ${KB_ENTRIES.length} curated answers, searchable offline.`,
};

/** Static export: the whole surface is client-side (local KB + one optional AI fetch). */
export default function CoachPage() {
  return <CoachView />;
}
