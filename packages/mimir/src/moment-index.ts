/**
 * CBE curated-moment index (S9): the half-wiki over the raw event stream.
 *
 * The ledger already keeps everything — `events` is append-only and nothing
 * is ever thrown away. But an append-only stream is a poor thing to browse:
 * the researcher cannot "look up" a breakthrough the way they look up a
 * paper. This module is the thin, RE-DERIVABLE index that makes the
 * trajectory navigable, and it deliberately sits at half-wiki depth:
 *
 *  - **It stores nothing.** Every curated moment is a fold over `events`.
 *    Delete the index and it rebuilds itself; it is L1, never a fact.
 *  - **Auto-candidates come from the stream** (a burst of work, a terminal
 *    outcome, a declared Eureka). The system proposes; it never decides.
 *  - **The researcher promotes.** A pin is one append-only declaration that
 *    says "this one mattered", and it can carry their own words. A pin is
 *    the only way a moment becomes canonical, which keeps the origin rule
 *    intact: significance belongs to the person who bore the uncertainty.
 *  - **Unpinning is a declaration too** (`pinned: false`), not a deletion —
 *    append-only means the change of mind is itself part of the record.
 *
 * Nothing here ranks moments, scores them, or suggests which to pin. The
 * index is a table of contents for a book only the researcher has read.
 * @module dsh-mimir/src/moment-index
 */

import { CBE_SESSION_GAP_MINUTES, TERMINAL_ACTIONS } from './cognitive-map.ts'
import { EUREKA_ACTION } from './eureka.ts'
import type { EventRecord } from './types.ts'
import { tsToMs } from './time.ts'

const MS_PER_MINUTE = 60_000

/** The researcher's pin (or unpin) of one moment, anchored to one event. */
export const MOMENT_PIN_ACTION = 'cbe.moment.pin'

/** How many events a plain work burst needs before it is proposed at all. */
export const CBE_MOMENT_BURST_MIN_EVENTS = 3

/** What kind of moment one index entry is. */
export type CbeMomentKind = 'eureka' | 'terminal' | 'creation' | 'burst' | 'pinned'

/** One user pin declaration (last declaration per target wins). */
export interface CbeMomentPin {
  readonly targetEventId: string
  readonly note: string
  readonly pinned: boolean
}

/** One curated moment: the index's row. */
export interface CbeCuratedMoment {
  /** The anchoring event id (a pin on the same event reuses this id). */
  readonly id: string
  readonly at: string
  /** The line the moment belongs to, or null when unscoped. */
  readonly lineId: string | null
  readonly kind: CbeMomentKind
  /** The anchor event's action name (labels resolve client-side). */
  readonly action: string
  /** The researcher's own words when they pinned it; null otherwise. */
  readonly note: string | null
  /** Events folded into this moment (its magnitude). */
  readonly eventCount: number
  readonly pinned: boolean
  /** The event ids backing the moment (the evidence). */
  readonly evidence: readonly string[]
}

/**
 * Which kind one burst of work is: a declared Eureka outranks a terminal,
 * which outranks a creation, which outranks a plain busy stretch. A burst
 * below {@link CBE_MOMENT_BURST_MIN_EVENTS} with nothing significant in it
 * is not a moment — it is just Tuesday.
 */
function kindOfBurst(
  burst: readonly EventRecord[],
): { readonly kind: CbeMomentKind; readonly action: string } | null {
  const eureka = burst.find(event => event.action === EUREKA_ACTION)
  if (eureka !== undefined) return { kind: 'eureka', action: eureka.action }
  const terminal = burst.find(event => TERMINAL_ACTIONS.has(event.action))
  if (terminal !== undefined) return { kind: 'terminal', action: terminal.action }
  const creation = burst.find(event => event.action === 'knowledge.idea.added'
    || event.action === 'knowledge.claim.added'
    || event.action === 'experiments.saved')
  if (creation !== undefined) return { kind: 'creation', action: creation.action }
  if (burst.length >= CBE_MOMENT_BURST_MIN_EVENTS) {
    return { kind: 'burst', action: burst[0]?.action ?? '' }
  }
  return null
}


/** The line an event attributes to (idea first, then project), or null. */
function lineOf(event: EventRecord): string | null {
  if (event.refs.ideaId !== undefined) return event.refs.ideaId
  if (event.refs.projectId !== undefined) return `project:${event.refs.projectId}`
  return null
}

/**
 * Read the researcher's pin declarations: last declaration per target wins,
 * so an unpin really does override an earlier pin (append-only still — the
 * superseded declaration stays in the stream as history).
 * @param events - ledger events, any order.
 * @returns target event id → pin state.
 */
export function momentPins(events: readonly EventRecord[]): ReadonlyMap<string, CbeMomentPin> {
  const pins = new Map<string, CbeMomentPin>()
  const ordered = [...events].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
  for (const event of ordered) {
    if (event.action !== MOMENT_PIN_ACTION) continue
    const target = event.payload['targetEventId']
    if (typeof target !== 'string') continue
    const note = typeof event.payload['note'] === 'string' ? event.payload['note'] : ''
    const pinned = event.payload['pinned'] !== false
    pins.set(target, Object.freeze({ targetEventId: target, note, pinned }))
  }
  return pins
}

/**
 * Cut the stream into bursts at the map's own session gap. Unparseable
 * timestamps are skipped (they cannot be placed in time).
 * @param events - events in ascending (ts, id) order.
 * @returns the bursts in time order.
 */
function burstsOf(events: readonly EventRecord[]): readonly EventRecord[][] {
  const bursts: EventRecord[][] = []
  let current: EventRecord[] = []
  for (const event of events) {
    const ms = tsToMs(event.ts)
    if (ms === null) continue
    const previous = current[current.length - 1]
    if (previous !== undefined) {
      const previousMs = tsToMs(previous.ts) ?? 0
      if (ms - previousMs > CBE_SESSION_GAP_MINUTES * MS_PER_MINUTE) {
        bursts.push(current)
        current = []
      }
    }
    current.push(event)
  }
  if (current.length > 0) bursts.push(current)
  return bursts
}

/**
 * Derive the curated moment index over one window: auto-candidates folded
 * from the stream (bursts carrying a Eureka, a terminal, a creation, or
 * enough plain work), unified with the researcher's pins. A pin on an event
 * inside an existing burst enriches that moment; a pin on a lonely event
 * promotes that event into its own moment. An unpin demotes a burst back to
 * unpinned but never removes it from the stream — the index is a reading of
 * the ledger, not an edit of it.
 * @param events - ledger events, any order.
 * @param since - window start, inclusive (ISO-8601); `null` opens the window.
 * @param until - window end, exclusive (ISO-8601); `null` opens the window.
 * @returns the curated moments in time order, pinned ones never dropped.
 */
export function deriveCuratedMoments(
  events: readonly EventRecord[],
  since: string | null,
  until: string | null,
): readonly CbeCuratedMoment[] {
  const sinceMs = since === null ? Number.NEGATIVE_INFINITY : (tsToMs(since) ?? Number.NEGATIVE_INFINITY)
  const untilMs = until === null ? Number.POSITIVE_INFINITY : (tsToMs(until) ?? Number.POSITIVE_INFINITY)
  const ordered = [...events]
    .filter(event => {
      const ms = tsToMs(event.ts)
      return ms !== null && ms >= sinceMs && ms < untilMs
    })
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))

  const pins = momentPins(events)
  const byId = new Map(ordered.map(event => [event.id, event] as const))
  const moments = new Map<string, CbeCuratedMoment>()

  for (const burst of burstsOf(ordered)) {
    const classified = kindOfBurst(burst)
    if (classified === null) continue
    // Anchor on the most significant event of the burst, not the loudest.
    const anchor = burst.find(event => event.action === classified.action) ?? burst[0]
    if (anchor === undefined) continue
    const pin = pins.get(anchor.id)
    moments.set(anchor.id, Object.freeze({
      id: anchor.id,
      at: anchor.ts,
      lineId: lineOf(anchor),
      kind: pin === undefined || !pin.pinned ? classified.kind : 'pinned',
      action: classified.action,
      note: pin?.note !== undefined && pin.note !== '' ? pin.note : null,
      eventCount: burst.length,
      pinned: pin?.pinned === true,
      evidence: Object.freeze(burst.map(event => event.id)),
    }))
  }

  // Pins on events the burst pass never proposed: the researcher saw
  // something the heuristics did not, which is the whole point of pinning.
  for (const [targetId, pin] of pins) {
    if (!pin.pinned || moments.has(targetId)) continue
    const target = byId.get(targetId)
    if (target === undefined) continue
    moments.set(targetId, Object.freeze({
      id: targetId,
      at: target.ts,
      lineId: lineOf(target),
      kind: 'pinned',
      action: target.action,
      note: pin.note === '' ? null : pin.note,
      eventCount: 1,
      pinned: true,
      evidence: Object.freeze([targetId]),
    }))
  }

  return Object.freeze(
    [...moments.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
  )
}
