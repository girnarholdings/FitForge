import { WorkoutPlayer } from '@/components/features/workout/WorkoutPlayer';
import { MOCK_ROUTINE } from '@/components/features/_mock/data';
import { DEMO_ROUTINE_ID, demoDayId } from '@/lib/demo/ids';

/**
 * Static params for the workout player. A session id maps to a routine-day id. We pre-render:
 *  - every day id of the default demo routine, and
 *  - the deterministic generated-routine day ids (demo-day-1..7),
 * plus the routine id itself as a safe fallback. The player also falls back to the active
 * routine's first day for any unknown id, so navigation never dead-ends.
 */
export function generateStaticParams() {
  const ids = new Set<string>([DEMO_ROUTINE_ID, 'quick']);
  for (const d of MOCK_ROUTINE.days) ids.add(d.id);
  for (let i = 0; i < 7; i++) ids.add(demoDayId(i));
  return [...ids].map((sessionId) => ({ sessionId }));
}

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <WorkoutPlayer sessionId={sessionId} />;
}
