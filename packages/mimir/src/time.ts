/**
 * Shared time primitives for every fold in the cognitive-beidou engine.
 *
 * This is the "锅底" (the broth) the hotpot metaphor calls for: every module
 * that reads the ledger — `eureka`, `ledger-ews`, `cbe-engine`, `cognitive-map`,
 * `foraging`, `habits`, `moment-index`, `report-tier`, … — used to re-declare
 * `tsToMs`, `MS_PER_DAY`, and the `(ts, id)` ordered sort by hand. That was a
 * salad of duplicated definitions where the sort key or the day constant could
 * silently drift between folds. Now they live here, once, and every consumer
 * imports them.
 *
 * No business logic — only the unit conversions and the canonical ordering
 * every derived quantity must share so two folds never disagree on "what is in
 * this window".
 * @module dsh-mimir/src/time
 */

import type { EventRecord } from './types.ts'

/** Milliseconds in one day — the base unit of every sliding window here. */
export const MS_PER_DAY = 86_400_000

/** Parse one ISO-8601 timestamp to epoch ms (NaN → null, never guessed). */
export function tsToMs(ts:  string): number | null {
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Sort a copy into the canonical (ts, id) order every fold uses. Two events at
 * the same instant are ordered by id so the sequence is deterministic.
 * @param events - ledger events, any order.
 * @returns a new sorted array (the input is not mutated).
 */
export function orderedEvents(events: readonly EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
}

/**
 * The events that fall inside one half-open window [fromMs, toMs), in the
 * canonical (ts, id) order. Unparseable timestamps are dropped and cannot be
 * placed in any window. This is the single source of truth for "what counts as
 * inside the window" — `actionSequence` and the Eureka folds both slice here.
 * @param events - ledger events, any order.
 * @param fromMs - window start, inclusive (epoch ms).
 * @param toMs - window end, exclusive (epoch ms).
 * @returns the matching events, ordered.
 */
export function sliceEvents(
  events: readonly EventRecord[],
  fromMs: number,
  toMs: number,
): EventRecord[] {
  return orderedEvents(events).filter(event => {
    const ms = tsToMs(event.ts)
    return ms !== null && ms >= fromMs && ms < toMs
  })
}
