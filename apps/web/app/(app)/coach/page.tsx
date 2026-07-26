import type { Metadata } from 'next';
import { CoachView } from '@/components/features/coach/CoachView';

export const metadata: Metadata = {
  title: 'Coach · FitForge',
  description: 'The FitForge knowledge base — 83 curated answers, searchable offline.',
};

/** Static export: the whole surface is client-side (local KB + one optional AI fetch). */
export default function CoachPage() {
  return <CoachView />;
}
