/**
 * Feasibility proof for the CBE worktree (S2): synthetic ledger streams
 * with known ground truth, checking that the pure derivation recovers the
 * branch structure from the REAL event vocabulary alone — lanes and their
 * statuses, the user-declared parent edges (last declaration wins, clears
 * clear), the mainline ref and its reflog, the documented-No numbers (GUT
 * at close, idle while open), and the wiki-only branches with no commits.
 * @module dsh-mimir/tests/worktree.spec
 */

import { describe, expect, it } from 'vitest'
import {
  deriveWorktree,
  ideaParentEdges,
  IDEA_CLOSE_REASON_MAX_CHARS,
  IDEA_PARENT_ACTION,
  MAINLINE_ACTION,
} from '../src/worktree.ts'
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

function idea(id: string, status: IdeaRecord['status'], failureReason?: string): IdeaRecord {
  return {
    id,
    title: `Idea ${id}`,
    hypothesis: 'h',
    status,
    ...(failureReason === undefined ? {} : { failureReason }),
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

const PROJECT: ProjectRecord = {
  id: 'p1',
  title: 'Project One',
  stage: 'experiment',
  artifacts: [],
  reviewRounds: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const NOW = Date.parse('2026-08-27T00:00:00.000Z')

function wiki(ideas: readonly IdeaRecord[], projects: readonly ProjectRecord[] = [PROJECT]): CbeWikiSnapshot {
  return { ideas, claims: [], projects }
}

describe('worktree derivation (S2)', () => {
  it('derives an empty tree from an empty ledger', () => {
    const tree = deriveWorktree([], wiki([]), NOW)
    expect(tree.lanes).toEqual([])
    expect(tree.mainline).toBeNull()
    expect(tree.mainlineHistory).toEqual([])
    expect(tree.counts).toEqual({ open: 0, failed: 0, adopted: 0 })
  })

  it('is deterministic: the same inputs fold to the same tree', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }, { title: 'Idea i1' }),
      ev('2026-08-20T00:00:00.000Z', MAINLINE_ACTION, { ideaId: 'i1' }),
    ]
    const one = deriveWorktree(events, wiki([idea('i1', 'active')]), NOW)
    const two = deriveWorktree([...events].reverse(), wiki([idea('i1', 'active')]), NOW)
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })

  it('derives one idea lane with its close, reason, and GUT number', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }, { title: 'Idea i1' }),
      ev('2026-08-04T00:00:00.000Z', 'experiments.saved', { ideaId: 'i1', projectId: 'p1' }),
      ev('2026-08-12T00:00:00.000Z', 'knowledge.idea.failed', { ideaId: 'i1' }, { reason: 'no effect' }),
    ]
    const tree = deriveWorktree(events, wiki([idea('i1', 'failed', 'no effect')]), NOW)
    // The idea lane absorbs its own project-ref events (ideaId wins attribution).
    expect(tree.lanes).toHaveLength(1)
    const lane = tree.lanes.find(item => item.lineId === 'i1')
    expect(lane?.status).toBe('failed')
    expect(lane?.closedAt).toBe('2026-08-12T00:00:00.000Z')
    expect(lane?.closeReason).toBe('no effect')
    // GUT: last touch 08-04 → close 08-12 = 8 days.
    expect(lane?.gutDays).toBe(8)
    expect(lane?.idleDays).toBeNull()
    expect(tree.counts.failed).toBe(1)
  })

  it('computes idle days for open lanes and keeps project lanes open', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
      ev('2026-08-15T00:00:00.000Z', 'experiments.saved', { projectId: 'p1' }),
    ]
    const tree = deriveWorktree(events, wiki([idea('i1', 'active')]), NOW)
    const openIdea = tree.lanes.find(item => item.lineId === 'i1')
    expect(openIdea?.status).toBe('open')
    // last touch 08-02 → now 08-27 = 25 days.
    expect(openIdea?.idleDays).toBe(25)
    const projectLane = tree.lanes.find(item => item.lineId === 'project:p1')
    expect(projectLane?.status).toBe('open')
    expect(projectLane?.label).toBe('Project One')
    expect(tree.counts.open).toBe(2)
  })

  it('carries the mainline ref and its full reflog (last declaration wins)', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
      ev('2026-08-10T00:00:00.000Z', MAINLINE_ACTION, { ideaId: 'i1' }),
      ev('2026-08-20T00:00:00.000Z', MAINLINE_ACTION, { projectId: 'p1' }),
    ]
    const tree = deriveWorktree(events, wiki([idea('i1', 'active')]), NOW)
    expect(tree.mainline?.lineId).toBe('project:p1')
    expect(tree.mainlineHistory.map(item => item.lineId)).toEqual(['i1', 'project:p1'])
    // The mainline lane sorts first even with older activity.
    expect(tree.lanes[0]?.lineId).toBe('project:p1')
  })

  it('reads parent edges from declarations only — last wins, null clears', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
      ev('2026-08-03T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i2' }),
      ev('2026-08-03T12:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i3' }),
      ev('2026-08-05T00:00:00.000Z', IDEA_PARENT_ACTION, { ideaId: 'i2' }, { parentIdeaId: 'i1' }),
      ev('2026-08-06T00:00:00.000Z', IDEA_PARENT_ACTION, { ideaId: 'i2' }, { parentIdeaId: 'i3' }),
      ev('2026-08-07T00:00:00.000Z', IDEA_PARENT_ACTION, { ideaId: 'i2' }, { parentIdeaId: null }),
    ]
    const edges = ideaParentEdges(events.slice(0, 5))
    expect(edges.get('i2')).toBe('i3')
    const cleared = ideaParentEdges(events)
    expect(cleared.has('i2')).toBe(false)
    const tree = deriveWorktree(events, wiki([idea('i1', 'active'), idea('i2', 'active'), idea('i3', 'active')]), NOW)
    expect(tree.lanes.find(item => item.lineId === 'i2')?.parentLineId).toBeNull()
  })

  it('renders adopted ideas as merges and wiki-only ideas as zero-event lanes', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
      ev('2026-08-05T00:00:00.000Z', 'knowledge.claim.set', { claimId: 'c1' }, { status: 'supported' }),
    ]
    const tree = deriveWorktree(
      events,
      wiki([idea('i1', 'adopted'), idea('i9', 'active')]),
      NOW,
    )
    const adopted = tree.lanes.find(item => item.lineId === 'i1')
    expect(adopted?.status).toBe('adopted')
    expect(adopted?.closedAt).toBeNull() // adoption carries no close event in v1
    const wikiOnly = tree.lanes.find(item => item.lineId === 'i9')
    expect(wikiOnly?.eventCount).toBe(0)
    expect(wikiOnly?.status).toBe('open')
    expect(wikiOnly?.idleDays).toBe(26) // createdAt 08-01 → now 08-27
    expect(tree.counts).toEqual({ open: 1, failed: 0, adopted: 1 })
  })

  it('keeps structural cbe events off the drift (zero-weight touches only)', () => {
    const events = [
      ev('2026-08-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
      ev('2026-08-03T00:00:00.000Z', MAINLINE_ACTION, { ideaId: 'i1' }),
    ]
    const tree = deriveWorktree(events, wiki([idea('i1', 'active')]), NOW)
    const lane = tree.lanes.find(item => item.lineId === 'i1')
    // knowledge.idea.added weighs 2; the cbe.mainline.set touch weighs 0 —
    // the declaration rides the lane without moving its drift.
    expect(lane?.drift).toBeCloseTo(2 * Math.exp(-Math.LN2 * 25 / 7), 3)
    expect(lane?.eventCount).toBe(2)
  })

  it('caps close reasons at the exported constant (contract echo, 48 chars)', () => {
    expect(IDEA_CLOSE_REASON_MAX_CHARS).toBe(48)
  })
})
