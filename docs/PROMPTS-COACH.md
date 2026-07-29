# Coach worker prompts · panel-refined (July 2026)

The system prompts in `workers/coach/src/index.ts` were refined by a judged panel rather than a
single rewrite: three independent drafts from different lenses (a veteran long-term trainer, a
small-model prompt engineer, a safety-and-grounding specialist), scored by two judges (one for
instruction-following on 12–70B instruct models, one for whether the answers would serve a real
client for years), then synthesized from the winner with the best grafts from the others.

## What changed, and why it survived judging

- **Persona**: "…focused on steady progress over weeks and months — every answer is one step in
  the user's longer plan." The product wanted a long-term holistic trainer; this is that stated
  as an identity a small model can act on.
- **New COACHING block** — the core addition. Five concrete behaviors: coach for the next 8–12
  weeks not one session; prefer the fix that is repeatable and joint-friendly; treat missed
  workouts and stalls as information (name the likely cause — sleep, stress, food, volume — in
  one clause); mention sleep/food/stress only when it likely explains the issue; at most one
  question per reply, and only when the answer would change the advice.
- **Per-shape word cap**: every ANSWER SHAPE now restates "Whole reply under 110 words" locally.
  Both judges called this the single highest-leverage mechanism: small models obey the rule
  nearest the output instruction far more reliably than a global cap two blocks earlier.
- **Per-intent SAFETY routing**: each focus names its own danger zone (pain mid-technique,
  supplements/medications mid-nutrition, medical diets mid-meal, lingering fatigue mid-recovery)
  and routes it to SAFETY — the escape hatch lives in the intent the question arrives through.
- **Personalization with acknowledgment**: exclusions are not silently avoided; the answer names
  the swap ("since **squats** are out, use **leg press**") so the user sees their constraint was
  understood, not ignored.
- **Plateaus as information**: the progression intent now checks sleep/food/stress/missed
  sessions before changing the program, and adds a 2–3 week outlook clause.

## Hard contracts that every draft was required to preserve (and tests enforce)

- FORMAT: GFM limited to **bold** + `- ` bullets; no headings/tables/links/emojis/code; 110-word
  cap; numbers and exercise names in bold.
- Every coaching shape ends with a `**Next:** ` line (`worker.test.ts` asserts it).
- Literal `FOCUS` and `ANSWER SHAPE` headers (asserted).
- SAFETY: no medical advice; pain/injury/illness/pregnancy/medication → doctor or physio; only
  real app features may be mentioned.
- GROUNDING: REFERENCE NOTES beat memory; uncertainty is admitted, never papered over with an
  invented number.
- CONVERSATION rules for follow-ups (short question = follow-up; new subject = fresh answer).

All 53 worker tests pass against the refined prompts. To re-run the refinement with different
lenses, the workflow script is reusable — see the session notes; the panel's judged alternatives
and rationale are preserved in the workflow journal.
