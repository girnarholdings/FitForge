# Research · Trending splits added July 2026

A research pass (web sweep over community data, program-app charts and 2025–26 trend coverage)
asked one question: which splits are people actually asking for that `SPLIT_LIBRARY` (26 programs)
could not serve? Five made the cut; three were deliberately rejected.

## Added

1. **Hybrid Athlete · Lift + Run** (`hybrid-lift-run-5`) — the defining 2025–26 lifter trend
   (Nick Bare / Fergus Crawley school; "hybrid training went mainstream" per BOXROX and Men's
   Health coverage). Distinct from `athletic-conditioning-4`, which is gym-conditioning only —
   this one carries dedicated run days (Zone 2 + intervals) between lower/upper strength days
   and a full-body power day.
2. **Hyrox Race Prep** (`hyrox-prep-4`) — Hyrox grew from ~600 entrants (2018) to 550k+ (2025);
   mainstream gyms now publish plans. Station strength (walking lunges, carries), erg engine
   work, run intervals, and a "compromised running" brick day.
3. **HIT · Heavy Duty** (`hit-heavy-duty-3`) — the Mike Mentzer revival is one of the largest
   organic training trends on short-form video. One all-out set per exercise, pre-exhaust
   pairings, long recovery. Fills the "train hard twice or three times a week, briefly" gap the
   conventional-volume minimalist split does not.
4. **5/3/1 for Beginners** (`five-three-one-beginners-3`) — the r/Fitness wiki flagship, distinct
   from the BBB and nSuns variants already shipped: 3-day full body, two main lifts per day on
   5/3/1 waves plus First Set Last 5×5 and balanced assistance.
5. **High-Frequency Full Body** (`high-frequency-full-body-5`) — the science-based community's
   (Nippard-school) answer to PPL; the library's full-body options previously topped out at 3
   days. Five days, rotating emphasis so no lift repeats on consecutive days.

## Rejected, and why

- **Longevity/healthspan protocol** (Attia-style Zone 2 + VO2max + strength): real trend, but it
  decomposes into Full Body 2/3-day + the new hybrid's run days; a dedicated entry would be a
  marketing label on existing structures. Revisit if a "health metrics" positioning lands.
- **Anterior/posterior split**: legitimate but low-demand recombination of existing slots; adds
  catalog noise for little coverage gain.
- **GZCL Jacked & Tan 2.0**: wants a T1 rep-max-wave prescription concept the generator does not
  have; adding the split without the scheme would misrepresent the program. Pair it with the
  progression-schemes work (task backlog) instead.

## Notes for the generator

- All five use only existing `MovementPattern` values — `cardio`, `conditioning`, `carry`,
  `mobility` were already in the vocabulary and the catalog has exercises for them.
- The HIT split's "one working set to failure" is expressed today through day labels and the
  program's `progression` line; `generate.ts` still prescribes its standard set counts. A true
  single-set prescription belongs to the progression-schemes backlog item — the split remains
  honest because the label and description say what the method is.
- Sources compiled in the research agent's report (session log, July 2026): BOXROX 2026 hybrid
  coverage, Gymshark/PureGym Hyrox guides, thefitness.wiki, Boostcamp program charts, ACSM 2026
  trends survey.
