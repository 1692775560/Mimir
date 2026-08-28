/**
 * G0 for the CBE learning engine (SBC spirit, Talts et al. 2020): before
 * any real-data claim, the engine must recover known ground truth on
 * synthetic streams. Declared scope of G0 v1: ORDERING and SIGN recovery,
 * null invariance (cold start ≡ today's priors), determinism of the fold,
 * the sign lock's quorum behavior, and the fold window — full parameter
 * recovery would need a trial-level likelihood we have declared never to
 * have. Synthetic streams may carry richer refs than today's emit sites
 * (claim terminals attributed to ideas) — enriching real attribution is a
 * standing P2 item.
 * @module dsh-mimir/tests/cbe-engine.spec
 */

import { describe, expect, it } from 'vitest'
import {
  CBE_ENGINE_FOLD_WINDOW_DAYS,
  effectiveValue,
  evidenceModelAt,
  evidenceProfileOf,
  initialModel,
  terminalOutcome,
} from '../src/cbe-engine.ts'
import { LINE_WEIGHTS } from '../src/cognitive-map.ts'
import type { EventRecord, LedgerActor, LedgerJsonValue } from '../src/types.ts'

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

/** Day-offset helper (n may cross month boundaries) for compact fixtures. */
function day(n: number): string {
  return new Date(Date.parse('2026-06-01T09:00:00.000Z') + n * 86_400_000).toISOString()
}

describe('G0: null invariance (cold start ≡ today)', () => {
  it('returns exactly the priors with no terminals, however busy the ledger', () => {
    const stream = [
      ev(day(1), 'experiments.saved', { ideaId: 'a' }),
      ev(day(2), 'literature.paper.imported', { ideaId: 'a' }),
      ev(day(3), 'compute.job.settled', { ideaId: 'a' }, { status: 'succeeded' }),
      ev(day(4), 'writing.compile.settled', { projectId: 'p1' }, { issues: 0 }),
    ]
    const model = evidenceModelAt(stream)
    expect(model.derivation.terminalsFolded).toBe(0)
    for (const [action, prior] of Object.entries(LINE_WEIGHTS)) {
      expect(effectiveValue(model, action)).toBe(prior)
    }
  })

  it('an empty ledger folds the initial model', () => {
    const model = evidenceModelAt([])
    expect(model).toEqual(initialModel())
  })
})

describe('G0: determinism', () => {
  const stream = [
    ev(day(1), 'experiments.saved', { ideaId: 'a' }),
    ev(day(2), 'knowledge.claim.set', { ideaId: 'a' }, { status: 'supported' }),
    ev(day(3), 'experiments.saved', { ideaId: 'b' }),
    ev(day(4), 'knowledge.idea.failed', { ideaId: 'b' }, { reason: 'no effect' }),
  ]
  it('folds the same model regardless of input order', () => {
    const one = evidenceModelAt(stream)
    const two = evidenceModelAt([...stream].reverse())
    expect([...one.values.entries()]).toEqual([...two.values.entries()])
    expect(one.derivation).toEqual(two.derivation)
  })
})

describe('G0: synthetic ordering recovery (the SBC step)', () => {
  /**
   * A two-action world with known truth: `experiments.saved` lines are
   * eventually SUPPORTED (true value above its prior), and
   * `literature.paper.removed` lines are eventually INVALIDATED (true
   * value below its prior). Each line carries two prior events and one
   * terminal per cycle, six cycles per world.
   */
  function world(): EventRecord[] {
    const stream: EventRecord[] = []
    let d = 1
    for (let cycle = 0; cycle < 6; cycle += 1) {
      stream.push(ev(day(d), 'experiments.saved', { ideaId: 'a' }))
      stream.push(ev(day(d + 1), 'experiments.saved', { ideaId: 'a' }))
      stream.push(ev(day(d + 2), 'knowledge.claim.set', { ideaId: 'a' }, { status: 'supported' }))
      stream.push(ev(day(d + 3), 'literature.paper.removed', { ideaId: 'b' }))
      stream.push(ev(day(d + 4), 'literature.paper.removed', { ideaId: 'b' }))
      stream.push(ev(day(d + 5), 'knowledge.claim.set', { ideaId: 'b' }, { status: 'invalidated' }))
      d += 6
    }
    return stream
  }

  it('lifts the action that precedes Yes and sinks the one that precedes No', () => {
    const model = evidenceModelAt(world())
    expect(model.derivation.terminalsFolded).toBe(12)
    const lifted = effectiveValue(model, 'experiments.saved')
    const sunk = effectiveValue(model, 'literature.paper.removed')
    expect(lifted).toBeGreaterThan(LINE_WEIGHTS['experiments.saved'] as number)
    expect(sunk).toBeLessThan(LINE_WEIGHTS['literature.paper.removed'] as number)
    expect(lifted).toBeGreaterThan(sunk)
    // A control action the world never touches stays exactly at its prior.
    expect(effectiveValue(model, 'figures.deleted')).toBe(LINE_WEIGHTS['figures.deleted'])
  })

  it('an adopted idea folds +1 — without it the profile would learn only from failures', () => {
    const events = [
      ev(day(0), 'knowledge.idea.added', { ideaId: 'i1' }),
      ev(day(5), 'knowledge.idea.adopted', { ideaId: 'i1' }),
    ]
    const model = evidenceModelAt(events)
    expect(terminalOutcome(events[1]!)).toBe(1)
    expect(model.derivation.terminalsFolded).toBe(1)
    const profile = evidenceProfileOf(model)
    // The terminal credits the line's PRIOR eligible actions (share form);
    // the terminal action itself carries no mass — check the added→adopted line.
    const added = profile.actions.find(item => item.action === 'knowledge.idea.added')
    expect(added?.mass ?? 0).toBeGreaterThanOrEqual(1)
    // The +1 outcome pulls the effective value TOWARD +1 from its prior
    // (the added prior is +2, so the move is downward — credit, not growth).
    expect(Math.abs((added?.effectiveValue ?? 1) - 1)).toBeLessThan(Math.abs((added?.prior ?? 1) - 1))
  })

  it('one terminal nudges toward the outcome, never leaps (κ conservatism)', () => {
    const model = evidenceModelAt([
      ev(day(1), 'experiments.saved', { ideaId: 'a' }),
      ev(day(2), 'knowledge.claim.set', { ideaId: 'a' }, { status: 'supported' }),
    ])
    const eff = effectiveValue(model, 'experiments.saved')
    const prior = LINE_WEIGHTS['experiments.saved'] as number
    expect(Math.abs(eff - prior)).toBeLessThan(0.2)
    // The nudge points toward the outcome's side of the prior.
    expect(eff).toBeLessThan(prior)
    const down = evidenceModelAt([
      ev(day(1), 'literature.paper.removed', { ideaId: 'b' }),
      ev(day(2), 'knowledge.claim.set', { ideaId: 'b' }, { status: 'supported' }),
    ])
    const effDown = effectiveValue(down, 'literature.paper.removed')
    const priorDown = LINE_WEIGHTS['literature.paper.removed'] as number
    expect(effDown).toBeGreaterThan(priorDown)
    expect(Math.abs(effDown - priorDown)).toBeLessThan(0.2)
  })
})

describe('G0: sign lock (no single-terminal flips)', () => {
  it('clamps contrary means to zero below the quorum, releases at it', () => {
    // Three lines, each one saved-then-invalidated: share 1 per terminal,
    // mass 1 → 2 → 3. The lock holds through terminal two; the third is
    // the quorum, and the mean goes (and stays) negative.
    const lines = ['a', 'b', 'c']
    const stream: EventRecord[] = []
    lines.forEach((ideaId, index) => {
      stream.push(ev(day(1 + index * 10), 'experiments.saved', { ideaId }))
      stream.push(ev(day(2 + index * 10), 'knowledge.claim.set', { ideaId }, { status: 'invalidated' }))
    })
    const model = evidenceModelAt(stream)
    const row = evidenceProfileOf(model).actions.find(item => item.action === 'experiments.saved')
    expect(row?.mass).toBeGreaterThanOrEqual(3)
    expect(row?.mean).toBeLessThan(0)
    // κ still shrinks the effective value to the prior's side of zero —
    // the lock forbids sign flips of the MEAN, and κ forbids leaps.
    expect(row?.effectiveValue).toBeGreaterThan(0)
    expect(row?.effectiveValue).toBeLessThan(LINE_WEIGHTS['experiments.saved'] as number)
  })

  it('terminalOutcome signs claims and idea failures', () => {
    expect(terminalOutcome(ev(day(1), 'knowledge.claim.set', {}, { status: 'supported' }))).toBe(1)
    expect(terminalOutcome(ev(day(1), 'knowledge.claim.set', {}, { status: 'invalidated' }))).toBe(-1)
    expect(terminalOutcome(ev(day(1), 'knowledge.claim.set', {}, { status: 'pending' }))).toBe(0)
    expect(terminalOutcome(ev(day(1), 'knowledge.idea.failed', {}, { reason: 'x' }))).toBe(-1)
    expect(terminalOutcome(ev(day(1), 'experiments.saved', {}))).toBe(0)
  })
})

describe('G0: fold window', () => {
  it('events older than the window earn nothing and the terminal skips honestly', () => {
    const farPast = new Date(Date.parse(day(1)) - (CBE_ENGINE_FOLD_WINDOW_DAYS + 5) * 86_400_000)
      .toISOString()
    const model = evidenceModelAt([
      ev(farPast, 'experiments.saved', { ideaId: 'a' }),
      ev(day(1), 'knowledge.claim.set', { ideaId: 'a' }, { status: 'supported' }),
    ])
    expect(model.derivation.terminalsFolded).toBe(0)
    expect(effectiveValue(model, 'experiments.saved')).toBe(LINE_WEIGHTS['experiments.saved'])
  })
})

describe('evidence profile serialization', () => {
  it('sorts rows by effective value and carries the derivation', () => {
    const model = evidenceModelAt([
      ev(day(1), 'experiments.saved', { ideaId: 'a' }),
      ev(day(2), 'knowledge.claim.set', { ideaId: 'a' }, { status: 'supported' }),
    ])
    const profile = evidenceProfileOf(model)
    expect(profile.derivation.terminalsFolded).toBe(1)
    const values = profile.actions.map(row => row.effectiveValue)
    expect([...values].sort((a, b) => b - a)).toEqual(values)
    const saved = profile.actions.find(row => row.action === 'experiments.saved')
    expect(saved?.prior).toBe(LINE_WEIGHTS['experiments.saved'])
    expect(saved?.mass).toBeGreaterThan(0)
  })
})
