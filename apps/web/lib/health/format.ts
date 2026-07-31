/**
 * Display formatting for Apple Health readings — shared by the Today "Overnight" ledger row and
 * the Progress trend cards, so "how long you slept" is printed one way everywhere.
 *
 * Deliberately NOT part of the selector layer (`selectors.ts`): selectors answer "what happened",
 * this answers "how the product writes it down".
 */

/**
 * Sleep duration as `H:MM` — "6:12", never "6.2h". The contract's ledger grammar is a clock-style
 * duration because that is how people say sleep out loud, and a decimal hour reads as a score.
 */
export function sleepHM(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * The local calendar day `daysAgo` days before today, as `YYYY-MM-DD`. Local on purpose — health
 * days are the user's calendar days (see the store contract), and routing this through UTC is how
 * every reading near midnight lands on the wrong day.
 */
export function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
