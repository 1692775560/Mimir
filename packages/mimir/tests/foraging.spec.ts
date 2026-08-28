/**
 * Feasibility proof for the foraging organs (S4): synthetic streams with
 * known ground truth — territory rows (events, attention mass, the v1
 * clean-compile harvest proxy, day gaps), the personal GUT baseline
 * (median/IQR over documented closes, silent below its floor), and the
 * GUT cards' two-number payload. Everything is E0 arithmetic: dates and
 * counts; no go/stay language anywhere in the layer.
 * @module dsh-mimir/tests/foraging.spec
 */

import { describe, expect, it } from 'vitest'
import {
  CBE_GUT_BASELINE_MIN_DEPARTURES,
  deriveForaging,
  deriveGutBaseline,
  deriveTerritories,
} from '../src/foraging.ts'
import type { CbeWikiSnapshot } from '../src/cognitive-map.ts'
import type { EventRecord, IdeaRecord, LedgerActor, LedgerJsonValue, ProjectRecord } from '../src/types.ts'

const USER: LedgerActor = { kind: 'user', id: 'panel' }

let seq = 0
function ev(
  ts: string,
  action: string,
  refs: Partial<EventRecord['refs']> = {},
  payload: Record<string, LedgerJsonValue> = {},
): EventRecord {
  seq += 1
  return Object.freeze({
    id: `ev-${String(seq).padStart(3, '0')}`,
    ts,
    actor: USER,
    action,
    refs: Object.freeze(refs),
    payload: Object.freeze(payload),
  })
}

const NOW = Date.parse('2026-08-27T00:00:00.000Z')

function day(n: number): string {
  return new Date(Date.parse('2026-08-01T00:00:00.000Z') + n * 86_400_000).toISOString()
}

function project(id: string): ProjectRecord {
  return {
    id,
    title: `Project ${id}`,
    stage: 'experiment',
    artifacts: [],
    reviewRounds: 0,
    updatedAt: day(0),
  }
}

function closedIdea(id: string): IdeaRecord {
  return {
    id,
    title: `Idea ${id}`,
    hypothesis: 'h',
    status: 'failed',
    failureReason: 'documented no',
    createdAt: day(0),
  }
}

function wikiOf(projects: readonly ProjectRecord[], ideas: readonly IdeaRecord[] = []): CbeWikiSnapshot {
  return { ideas, claims: [], projects }
}

describe('territory ledger (organ 1)', () => {
  it('counts events, harvests (clean compiles only), and day gaps per project', () => {
    const events = [
      ev(day(2), 'experiments.saved', { projectId: 'p1' }, { name: 'r1' }),
      ev(day(4), 'writing.compile.settled', { projectId: 'p1' }, { issues: 3 }),
      ev(day(6), 'writing.compile.settled', { projectId: 'p1' }, { issues: 0 }),
      ev(day(8), 'literature.paper.imported', { projectId: 'p1' }, { title: 'x' }),
    ]
    const territories = deriveTerritories(events, wikiOf([project('p1')]), NOW)
    expect(territories).toHaveLength(1)
    const p1 = territories[0]
    expect(p1?.eventCount).toBe(4)
    expect(p1?.harvestCount).toBe(1) // the dirty compile never counted
    expect(p1?.lastHarvestAt).toBe(day(6))
    expect(p1?.daysSinceHarvest).toBe(20) // 08-27 − 08-07
    expect(p1?.daysSinceActivity).toBe(18) // 08-27 − 08-09
    expect(p1?.activityMass).toBeGreaterThan(0)
  })

  it('a declared-but-quiet territory exists with zero events', () => {
    const territories = deriveTerritories([], wikiOf([project('p1'), project('p2')]), NOW)
    expect(territories.map(item => item.projectId).sort()).toEqual(['p1', 'p2'])
    const quiet = territories.find(item => item.projectId === 'p2')
    expect(quiet?.eventCount).toBe(0)
    expect(quiet?.harvestCount).toBe(0)
    expect(quiet?.daysSinceHarvest).toBeNull()
  })

  it('sorts territories by last activity, newest first', () => {
    const events = [
      ev(day(1), 'experiments.saved', { projectId: 'p1' }),
      ev(day(5), 'experiments.saved', { projectId: 'p2' }),
    ]
    const order = deriveTerritories(events, wikiOf([project('p1'), project('p2')]), NOW)
      .map(item => item.projectId)
    expect(order).toEqual(['p2', 'p1'])
  })
})

describe('personal GUT baseline (organ 2)', () => {
  /** One documented close: touch at `touchDay`, close at `closeDay`. */
  function closed(id: string, touchDay: number, closeDay: number): EventRecord[] {
    return [
      ev(day(touchDay), 'experiments.saved', { ideaId: id, projectId: 'p1' }),
      ev(day(closeDay), 'knowledge.idea.failed', { ideaId: id }, { reason: 'no' }),
    ]
  }

  it('stays silent below the floor (fewer than five documented closes)', () => {
    const events = [...closed('i1', 1, 3), ...closed('i2', 1, 5)]
    const wiki = wikiOf([project('p1')], [closedIdea('i1'), closedIdea('i2')])
    const baseline = deriveGutBaseline(events, wiki, NOW)
    expect(baseline.samples).toBe(2)
    expect(baseline.speaks).toBe(false)
    expect(baseline.medianDays).toBeNull()
    expect(baseline.minSamples).toBe(CBE_GUT_BASELINE_MIN_DEPARTURES)
  })

  it('speaks median and IQR once five closes exist', () => {
    const events = [
      ...closed('i1', 1, 3), // GUT 2
      ...closed('i2', 1, 5), // GUT 4
      ...closed('i3', 1, 7), // GUT 6
      ...closed('i4', 1, 9), // GUT 8
      ...closed('i5', 1, 11), // GUT 10
    ]
    const wiki = wikiOf(
      [project('p1')],
      ['i1', 'i2', 'i3', 'i4', 'i5'].map(closedIdea),
    )
    const baseline = deriveGutBaseline(events, wiki, NOW)
    expect(baseline.speaks).toBe(true)
    expect(baseline.samples).toBe(5)
    expect(baseline.medianDays).toBe(6)
    expect(baseline.iqrDays).toBe(4) // nearest-rank q75 (8) − q25 (4)
  })

  it('failed ideas without ledger events contribute no sample', () => {
    const events = [...closed('i1', 1, 3)]
    const wiki = wikiOf([project('p1')], [closedIdea('i1'), closedIdea('wiki-only')])
    const baseline = deriveGutBaseline(events, wiki, NOW)
    expect(baseline.samples).toBe(1)
  })
})

describe('foraging composition + GUT cards (organ 3)', () => {
  it('cards carry two numbers; the baseline number appears only when it speaks', () => {
    const quiet = deriveForaging(
      [ev(day(2), 'experiments.saved', { projectId: 'p1' })],
      wikiOf([project('p1')]),
      NOW,
    )
    expect(quiet.cards).toHaveLength(1)
    expect(quiet.cards[0]?.baselineMedianDays).toBeNull()
    expect(quiet.cards[0]?.daysSinceHarvest).toBeNull() // no harvest yet

    function closed(id: string, touchDay: number, closeDay: number): EventRecord[] {
      return [
        ev(day(touchDay), 'experiments.saved', { ideaId: id, projectId: 'p1' }),
        ev(day(closeDay), 'knowledge.idea.failed', { ideaId: id }, { reason: 'no' }),
      ]
    }
    const speaking = deriveForaging(
      [
        ev(day(20), 'writing.compile.settled', { projectId: 'p1' }, { issues: 0 }),
        ...closed('i1', 1, 3),
        ...closed('i2', 1, 5),
        ...closed('i3', 1, 7),
        ...closed('i4', 1, 9),
        ...closed('i5', 1, 11),
      ],
      wikiOf([project('p1')], ['i1', 'i2', 'i3', 'i4', 'i5'].map(closedIdea)),
      NOW,
    )
    const card = speaking.cards.find(item => item.projectId === 'p1')
    expect(card?.daysSinceHarvest).toBe(6) // 08-27 − 08-21
    expect(card?.baselineMedianDays).toBe(6)
  })

  it('is deterministic: the same stream folds to the same layer', () => {
    const events = [
      ev(day(2), 'experiments.saved', { projectId: 'p1' }),
      ev(day(3), 'knowledge.idea.failed', { ideaId: 'i1' }, { reason: 'x' }),
    ]
    const wiki = wikiOf([project('p1')], [closedIdea('i1')])
    const one = deriveForaging(events, wiki, NOW)
    const two = deriveForaging([...events].reverse(), wiki, NOW)
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })
})
