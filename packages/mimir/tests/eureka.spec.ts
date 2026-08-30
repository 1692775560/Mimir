/**
 * Feasibility proof for the eureka engine (S8): the milestone stays declared
 * (never detected) while its lead-in is measured. Synthetic streams with
 * known ground truth check the declaration reader, the window features, the
 * paired-control fold, the I2 silence floor, and the rule that a control we
 * cannot observe is skipped rather than estimated.
 * @module dsh-mimir/tests/eureka
 */

import { describe, expect, it } from 'vitest'
import {
  eurekaDeclarations,
  eurekaFeatures,
  eurekaModelAt,
  eurekaProfileOf,
  eurekaCriticalStateData,
  EUREKA_ACTION,
  CBE_EUREKA_MIN_DECLARATIONS,
  CBE_EUREKA_WINDOW_DAYS,
} from '../src/eureka.ts'
import type { CbeCriticalStateSample } from '../src/eureka.ts'
import type { EventRecord, LedgerActor, LedgerJsonValue } from '../src/types.ts'

const USER: LedgerActor = { kind: 'user', id: 'panel' }

let seq = 0
function ev(
  ts: string,
  action = 'knowledge.idea.added',
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

const DAY = 86_400_000
const BASE = Date.parse('2026-06-01T00:00:00.000Z')
const at = (offsetDays: number): string => new Date(BASE + offsetDays * DAY).toISOString()

describe('eureka declarations', () => {
  it('reads the researcher’s own milestones in time order', () => {
    const declarations = eurekaDeclarations([
      ev(at(40), EUREKA_ACTION, { ideaId: 'i1' }, { title: '想通了注意力瓶颈' }),
      ev(at(10), EUREKA_ACTION, { ideaId: 'i1' }, { title: '第一次连上' }),
    ])
    expect(declarations.map(item => item.title)).toEqual(['第一次连上', '想通了注意力瓶颈'])
    expect(declarations[0]?.lineId).toBe('i1')
  })

  it('skips unparseable timestamps instead of guessing', () => {
    expect(eurekaDeclarations([ev('not-a-date', EUREKA_ACTION, {}, { title: 'x' })])).toEqual([])
  })
})

describe('window features', () => {
  it('counts creations, events, sittings, and active days', () => {
    const events = [
      ev(at(1), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(2), 'experiments.saved', { ideaId: 'i1' }),
      ev(at(3), 'knowledge.claim.added', { ideaId: 'i1' }),
      ev(at(20), 'knowledge.idea.added', { ideaId: 'i1' }),
    ]
    const features = eurekaFeatures(events, 'i1', BASE, BASE + 10 * DAY)
    expect(features.eventCount).toBe(3)
    // All three fixtures are creation-class (idea/claim/experiment).
    expect(features.creationCount).toBe(3)
    expect(features.distinctDays).toBe(3)
  })

  it('yields an honest zero vector for an empty window', () => {
    const features = eurekaFeatures([ev(at(1), 'knowledge.idea.added', { ideaId: 'i1' })], 'i2', BASE, BASE + 10 * DAY)
    expect(features.eventCount).toBe(0)
    expect(features.creationCount).toBe(0)
    expect(features.netSignedWeight).toBe(0)
  })
})

describe('paired-control fold', () => {
  it('folds one lead and one control per declaration', () => {
    const model = eurekaModelAt([
      ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(20), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(40), EUREKA_ACTION, { ideaId: 'i1' }, { title: '里程碑' }),
    ])
    expect(model.declarations).toHaveLength(1)
    expect(model.leads).toHaveLength(1)
    expect(model.controls).toHaveLength(1)
    // Lead = [26, 40) is quiet; control = [12, 26) holds the day-20 event.
    expect(model.leads[0]?.eventCount).toBe(0)
    expect(model.controls[0]?.eventCount).toBe(1)
  })

  it('skips a declaration whose control would start before the ledger', () => {
    // The ledger starts at day 0; a eureka at day 10 needs a control from -18.
    const model = eurekaModelAt([
      ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(10), EUREKA_ACTION, { ideaId: 'i1' }, { title: '太早了' }),
    ])
    expect(model.declarations).toEqual([])
    expect(model.leads).toEqual([])
  })
})

describe('precursor profile', () => {
  it('stays silent below the declaration floor', () => {
    const events: EventRecord[] = [ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })]
    // Two declarations, both with observable controls.
    for (const day of [40, 80]) {
      events.push(ev(at(day - 2), 'knowledge.idea.added', { ideaId: 'i1' }))
      events.push(ev(at(day), EUREKA_ACTION, { ideaId: 'i1' }, { title: `m${String(day)}` }))
    }
    const profile = eurekaProfileOf(eurekaModelAt(events), BASE + 100 * DAY)
    expect(profile.declarationCount).toBeLessThan(CBE_EUREKA_MIN_DECLARATIONS)
    expect(profile.speaks).toBe(false)
    expect(profile.rows.every(row => row.lift === null)).toBe(true)
    // The counts remain — description is safe even when comparison is not.
    expect(profile.rows.find(row => row.feature === 'creationCount')?.eurekaMean).toBeGreaterThan(0)
  })

  it('reports a positive lift on creation events once it speaks', () => {
    const events: EventRecord[] = [ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })]
    // Each eureka is preceded by a burst; the paired control window is quiet.
    for (const day of [40, 80, 120]) {
      events.push(ev(at(day - 3), 'knowledge.idea.added', { ideaId: 'i1' }))
      events.push(ev(at(day - 2), 'experiments.saved', { ideaId: 'i1' }))
      events.push(ev(at(day), EUREKA_ACTION, { ideaId: 'i1' }, { title: `m${String(day)}` }))
    }
    const profile = eurekaProfileOf(eurekaModelAt(events), BASE + 140 * DAY)
    expect(profile.speaks).toBe(true)
    expect(profile.declarationCount).toBe(CBE_EUREKA_MIN_DECLARATIONS)
    expect(profile.windowDays).toBe(CBE_EUREKA_WINDOW_DAYS)
    const creation = profile.rows.find(row => row.feature === 'creationCount')
    expect(creation?.eurekaMean).toBeGreaterThan(creation?.controlMean ?? Number.POSITIVE_INFINITY)
    expect(creation?.lift).toBeGreaterThan(0)
  })

  it('describes the road without ever predicting one', () => {
    const events: EventRecord[] = [ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })]
    for (const day of [40, 80, 120]) {
      events.push(ev(at(day - 3), 'knowledge.idea.added', { ideaId: 'i1' }))
      events.push(ev(at(day), EUREKA_ACTION, { ideaId: 'i1' }, { title: `m${String(day)}` }))
    }
    const profile = eurekaProfileOf(eurekaModelAt(events), BASE + 140 * DAY)
    // Five first-order features + four early-warning signals.
    expect(profile.rows).toHaveLength(9)
    for (const row of profile.rows) expect(row.samples).toBe(3)
  })

  it('leaves the early-warning signals null when a window is too small to estimate', () => {
    // Two events per lead-in: nowhere near the EWS floor of 12 symbols.
    const events: EventRecord[] = [ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })]
    for (const day of [40, 80, 120]) {
      events.push(ev(at(day - 3), 'knowledge.idea.added', { ideaId: 'i1' }))
      events.push(ev(at(day), EUREKA_ACTION, { ideaId: 'i1' }, { title: `m${String(day)}` }))
    }
    const profile = eurekaProfileOf(eurekaModelAt(events), BASE + 140 * DAY)
    expect(profile.speaks).toBe(true)
    for (const feature of ['unigramEntropy', 'conditionalEntropy', 'lag1MutualInformation', 'meanSurprisal']) {
      const row = profile.rows.find(item => item.feature === feature)
      // A refusal to estimate is a null — never a zero dressed up as data.
      expect(row?.eurekaMean, feature).toBeNull()
      expect(row?.lift, feature).toBeNull()
    }
  })

  it('reports the early-warning signals once a window can carry them', () => {
    const varied = ['knowledge.idea.added', 'experiments.saved', 'knowledge.claim.added', 'figures.saved']
    const events: EventRecord[] = [ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })]
    for (const day of [40, 80, 120]) {
      // Lead-in [day−14, day): 13 varied actions → high entropy.
      for (let i = 13; i >= 1; i -= 1) {
        events.push(ev(at(day - i), varied[i % varied.length] as string, { ideaId: 'i1' }))
      }
      // Control [day−28, day−14): 13 identical actions → zero entropy.
      for (let i = 27; i >= 15; i -= 1) {
        events.push(ev(at(day - i), 'writing.bib.saved', { ideaId: 'i1' }))
      }
      events.push(ev(at(day), EUREKA_ACTION, { ideaId: 'i1' }, { title: `m${String(day)}` }))
    }
    const profile = eurekaProfileOf(eurekaModelAt(events), BASE + 140 * DAY)
    expect(profile.speaks).toBe(true)

    const spread = profile.rows.find(row => row.feature === 'unigramEntropy')
    expect(spread?.eurekaMean).toBeGreaterThan(0)
    expect(spread?.controlMean).toBe(0)
    // The lead-in really was the less predictable stretch — and this is a
    // statement about roads already walked, not a prediction.
    expect(spread?.lift).toBeGreaterThan(0)

    const persistence = profile.rows.find(row => row.feature === 'lag1MutualInformation')
    expect(persistence?.eurekaMean).not.toBeNull()
    expect(persistence?.controlMean).toBe(0)
  })
})

describe('eurekaCriticalStateData (silent collection)', () => {
  it('returns an empty array when no Eureka has been declared', () => {
    const events = [
      ev(at(1), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(2), 'experiments.saved', { ideaId: 'i1' }),
    ]
    expect(eurekaCriticalStateData(events)).toEqual([])
  })

  it('collects a lead-in and a paired control EWS reading per declaration', () => {
    const seed = ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })
    const leadBurst = ev(at(35), 'knowledge.idea.added', { ideaId: 'i1' })
    const declaration = ev(at(40), EUREKA_ACTION, { ideaId: 'i1' }, { title: '想通了注意力瓶颈' })
    const samples = eurekaCriticalStateData([seed, leadBurst, declaration])

    expect(samples).toHaveLength(1)
    const [sample] = samples as readonly CbeCriticalStateSample[]
    expect(sample?.declarationId).toBe(declaration.id)
    expect(sample?.at).toBe(at(40))
    expect(sample?.title).toBe('想通了注意力瓶颈')
    // The lead-in carried the burst; the paired control window was quiet.
    expect(sample?.lead.symbols).toBeGreaterThan(0)
    expect(sample?.control.symbols).toBe(0)
    // Both are full EWS readings — described, never a prediction.
    expect(typeof sample?.lead.symbols).toBe('number')
    expect(typeof sample?.control.distinct).toBe('number')
  })

  it('collects one frozen sample per declaration, in time order', () => {
    const seed = ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' })
    const d1 = ev(at(40), EUREKA_ACTION, { ideaId: 'i1' }, { title: '第一座山' })
    const d2 = ev(at(80), EUREKA_ACTION, { ideaId: 'i1' }, { title: '第二座山' })
    const samples = eurekaCriticalStateData([seed, d1, d2])

    expect(Object.isFrozen(samples)).toBe(true)
    expect(samples.map(item => item.title)).toEqual(['第一座山', '第二座山'])
  })

  it('is pure: it never writes and returns the same model for the same events', () => {
    const events = [
      ev(at(0), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(at(40), EUREKA_ACTION, { ideaId: 'i1' }, { title: '里程碑' }),
    ]
    const once = eurekaCriticalStateData(events)
    const twice = eurekaCriticalStateData(events)
    expect(twice).toEqual(once)
  })
})
