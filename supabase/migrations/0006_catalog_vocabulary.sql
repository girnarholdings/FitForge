-- 0006 — widen the catalog vocabulary for the 59 → 91 exercise expansion.
--
-- WHY a migration rather than remapping the data: the 22 new rows are genuinely a different
-- KIND of work from the 18 patterns frozen in 0001, and the app now keys behaviour off that
-- difference — the prep builder (apps/web/lib/demo/prep.ts) picks the dynamic pre-session block
-- from 'mobility' and the cooldown from 'static_stretch', and the volume accounting deliberately
-- excludes both from set counts. Folding a hamstring stretch into 'hinge' or a burpee into
-- 'squat' would make those rows indistinguishable from working sets and silently inflate every
-- sets-per-muscle-per-week number in the product.
--
-- 'other' equipment: a plyo box is furniture you jump on. It is not a weight, not a stack-and-
-- pulley machine and not a cardio ergometer, so none of the six frozen categories fit.
--
-- NOTE: `alter type ... add value` cannot run inside a transaction block on Postgres < 12 and
-- cannot be rolled back, hence a dedicated migration that does nothing else. Values are added
-- idempotently so re-running against an already-migrated database is a no-op.

alter type movement_pattern add value if not exists 'conditioning';
alter type movement_pattern add value if not exists 'mobility';
alter type movement_pattern add value if not exists 'static_stretch';

alter type equipment_category add value if not exists 'other';
