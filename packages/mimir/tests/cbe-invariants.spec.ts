/**
 * L2/L3/L4 invariants across the whole CBE derivation surface.
 *
 * The per-module specs prove each derivation is CORRECT on hand-built
 * fixtures. This file proves they are SAFE to run: that shuffling the input
 * cannot change the answer, that malformed rows cannot crash the fold, that
 * nothing leaks a Map/undefined across the Remote wire, and that an empty
 * ledger yields honest empties rather than invented numbers.
 *
 * These are the failure modes that only show up at RUNTIME — a pure fold
 * that accidentally depended on input order, or a structure that typechecks
 * but dies in JSON — so they are asserted here rather than trusted.
 * @module dsh-mimir/tests/cbe-invariants
 */

import { describe, expect, it } from 'vitest'
import { eurekaModelAt, eurekaProfileOf, EUREKA_ACTION } from '../src/eureka.ts'
import { deriveCuratedMoments, MOMENT_PIN_ACTION } from '../src/moment-index.ts'
import { deriveLibraryThemes } from '../src/library-themes.ts'
import { deriveHabits } from '../src/habits.ts'
import { deriveWorktree } from '../src/worktree.ts'
import type {
  EventRecord,
  IdeaRecord,
  LedgerActor,
  LedgerJsonValue,
  PaperRecord,
  CbeWikiSnapshot,
} from '../src/types.ts'

const USER: LedgerActor = { kind: 'user', id: 'panel' }
const DAY = 86_400_000
const BASE = Date.parse('2026-08-01T00:00:00.000Z')

let seq = 0
function ev(
  ts: string,
  action = 'knowledge.idea.added',
  refs: Partial<EventRecord['refs']> = {},
  payload: Record<string, LedgerJsonValue> = {},
): EventRecord {
  seq += 1
  return Object.freeze({
    id: `ev-${String(seq).padStart(4, '0')}`,
    ts,
    actor: USER,
    action,
    refs: Object.freeze(refs),
    payload: Object.freeze(payload),
  })
}

const at = (days: number): string => new Date(BASE + days * DAY).toISOString()

/** A deterministic shuffle (LCG) — no Math.random, so failures reproduce. */
function shuffled<T>(items: readonly T[], seed = 42): T[] {
  const out = [...items]
  let state = seed
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}

/** A ledger rich enough that every layer produces real output. */
function sampleEvents(): EventRecord[] {
  return [
    ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' }),
    ev(at(1), 'experiments.saved', { ideaId: 'i1' }),
    ev(at(2), 'writing.bib.saved', { ideaId: 'i1' }),
    ev(at(5), 'knowledge.idea.added', { ideaId: 'i2' }),
    ev(at(6), 'literature.paper.imported', { ideaId: 'i2' }, { title: 'Diffusion guidance' }),
    ev(at(9), 'compute.job.settled', { ideaId: 'i1' }, { status: 'success' }),
    ev(at(30), EUREKA_ACTION, { ideaId: 'i1' }, { title: '想通了' }),
    ev(at(31), 'knowledge.claim.added', { ideaId: 'i2' }),
    ev(at(32), 'experiments.saved', { ideaId: 'i2' }),
    ev(at(60), EUREKA_ACTION, { ideaId: 'i2' }, { title: '第二次' }),
    ev(at(61), 'writing.paper.reordered', { projectId: 'p1' }),
    ev(at(90), EUREKA_ACTION, { ideaId: 'i1' }, { title: '第三次' }),
  ]
}

function samplePapers(): PaperRecord[] {
  return [
    { arxivId: '2608.00001', title: 'Diffusion guidance', authors: [], summary: 'sampling', url: '', notes: '', tags: ['diffusion'], projectIds: ['p1'], addedAt: at(3) },
    { arxivId: '2608.00002', title: 'Diffusion samplers', authors: [], summary: 'schedulers', url: '', notes: '', tags: ['diffusion'], projectIds: [], addedAt: at(4) },
    { arxivId: '2608.00003', title: 'Transformer pruning', authors: [], summary: 'efficiency', url: '', notes: '', tags: [], projectIds: [], addedAt: at(40) },
    { arxivId: '2608.00004', title: 'Transformer distillation', authors: [], summary: 'compression', url: '', notes: '', tags: [], projectIds: [], addedAt: at(41) },
  ]
}

const WIKI: CbeWikiSnapshot = {
  ideas: [
    { id: 'i1', title: '主线方向', hypothesis: 'h', status: 'active', createdAt: at(0) },
    { id: 'i2', title: '支线探索', hypothesis: 'h', status: 'active', createdAt: at(5) },
  ] satisfies readonly IdeaRecord[],
  claims: [],
  projects: [],
}

const WINDOW = { since: at(-1000), until: at(1000) }

/** Every derived layer, computed the same way every time. */
function deriveAll(events: readonly EventRecord[]) {
  return {
    eureka: eurekaProfileOf(eurekaModelAt(events), BASE + 120 * DAY),
    moments: deriveCuratedMoments(events, null, null),
    themes: deriveLibraryThemes(samplePapers(), WINDOW.since, WINDOW.until, BASE + 120 * DAY),
    habits: deriveHabits(events, WINDOW.since, WINDOW.until, BASE + 120 * DAY),
    worktree: deriveWorktree(events, WIKI, BASE + 120 * DAY),
  }
}

describe('L2 · order independence — a pure fold must not care about input order', () => {
  it('gives byte-identical answers on a shuffled ledger', () => {
    const events = sampleEvents()
    const original = JSON.stringify(deriveAll(events))
    for (const seed of [1, 7, 42, 1337]) {
      expect(JSON.stringify(deriveAll(shuffled(events, seed)))).toBe(original)
    }
  })

  it('is deterministic across repeated runs', () => {
    const events = sampleEvents()
    expect(JSON.stringify(deriveAll(events))).toBe(JSON.stringify(deriveAll(events)))
  })
})

describe('L2 · frozen outputs — the derivation never hands back a mutable model', () => {
  it('freezes every layer it returns', () => {
    const { eureka, moments, themes, habits, worktree } = deriveAll(sampleEvents())
    expect(Object.isFrozen(eureka)).toBe(true)
    expect(Object.isFrozen(moments)).toBe(true)
    expect(Object.isFrozen(themes)).toBe(true)
    expect(Object.isFrozen(habits)).toBe(true)
    expect(Object.isFrozen(worktree)).toBe(true)
  })
})

describe('L3 · wire contract — nothing leaks a Map, Set or undefined across the Remote boundary', () => {
  it('survives a JSON round-trip unchanged', () => {
    const derived = deriveAll(sampleEvents())
    for (const [name, value] of Object.entries(derived)) {
      expect(JSON.parse(JSON.stringify(value)), name).toEqual(value)
    }
  })

  it('never lets a NaN reach the wire (JSON would silently write it as null)', () => {
    // A string search cannot tell a legitimate `null` from a NaN that JSON
    // turned into one, so walk the object and check every number directly.
    const bad: string[] = []
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) bad.push(path)
        return
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${String(index)}]`))
        return
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`)
      }
    }
    walk(deriveAll(sampleEvents()), 'root')
    expect(bad).toEqual([])
  })
})

describe('L4 · malformed input — a bad row is skipped, never a crash', () => {
  const malformed: EventRecord[] = [
    ev('not-a-date', 'knowledge.idea.added', { ideaId: 'i1' }),
    ev('', 'experiments.saved', { ideaId: 'i1' }),
    ev(at(1), 'knowledge.idea.added'),
    ev(at(2), 'experiments.saved', { ideaId: 'i1' }, { huge: 'x'.repeat(5000) }),
    ev('1970-01-01T00:00:00.000Z', 'writing.bib.saved', { ideaId: 'i1' }),
  ]

  it('does not throw on unparseable timestamps, empty strings, or missing refs', () => {
    expect(() => deriveAll(malformed)).not.toThrow()
  })

  it('still derives something meaningful from the good rows', () => {
    const { moments, habits } = deriveAll(malformed)
    expect(moments.length).toBeGreaterThan(0)
    // Two of the five rows are usable: the two unparseable timestamps are
    // skipped, and the 1970 row falls BEFORE the window start (BASE − 1000d).
    expect(habits.eventCount).toBe(2)
  })

  it('tolerates a pin pointing at a nonexistent event', () => {
    expect(() => deriveCuratedMoments([
      ev(at(1), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(2), MOMENT_PIN_ACTION, {}, { targetEventId: 'ghost' }),
      ev(at(3), MOMENT_PIN_ACTION, {}, { targetEventId: 'ghost' }),
    ], null, null)).not.toThrow()
  })
})

describe('L4 · empty honesty — an empty ledger invents nothing', () => {
  it('reports empties and stays silent, rather than fabricating a reading', () => {
    const { eureka, moments, themes, habits, worktree } = deriveAll([])
    expect(moments).toEqual([])
    expect(eureka.declarationCount).toBe(0)
    expect(eureka.speaks).toBe(false)
    expect(eureka.rows.every(row => row.lift === null)).toBe(true)
    expect(themes.speaks).toBe(false)
    expect(habits.speaks).toBe(false)
    expect(habits.sessionCount).toBe(0)
    expect(worktree.lanes.every(lane => lane.eventCount === 0)).toBe(true)
  })

  it('handles an empty paper shelf', () => {
    const themes = deriveLibraryThemes([], WINDOW.since, WINDOW.until, BASE)
    expect(themes.current.paperCount).toBe(0)
    expect(themes.drift).toEqual([])
    expect(themes.speaks).toBe(false)
  })
})

describe('L4 · window bounds — an inverted or zero-width window is not a crash', () => {
  it('yields empties for a zero-width window', () => {
    const events = sampleEvents()
    const habits = deriveHabits(events, at(5), at(5), BASE + 120 * DAY)
    expect(habits.eventCount).toBe(0)
    expect(habits.speaks).toBe(false)
  })

  it('yields empties for an inverted window instead of throwing', () => {
    const events = sampleEvents()
    expect(() => deriveHabits(events, at(50), at(5), BASE + 120 * DAY)).not.toThrow()
    expect(deriveHabits(events, at(50), at(5), BASE + 120 * DAY).eventCount).toBe(0)
  })
})
