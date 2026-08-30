/**
 * Behavior tests for the branch-flow layout (git-workflow illustration
 * form): the mainline lane rides the axis, children bow beyond their
 * parents, adopted lines curve back to the parent's rail, beads ride their
 * curve's straight section (clamped), the column budget folds long
 * histories, dangling/cyclic declarations degrade to roots, and the whole
 * layout is deterministic against input order.
 * @module dsh-client-ui-mimir/tests/worktree-map.spec
 */

import { describe, expect, it } from 'vitest'
import {
  beadRadius,
  layoutWorktreeFlow,
  WORKTREE_FLOW_MAX_COLS,
} from '../src/client/worktree-map.ts'
import type { ResearchWorktreeLaneView, ResearchWorktreeView } from 'dsh-mimir/types'

const NOW = '2026-08-27T10:00:00.000Z'
const BASE = Date.parse('2026-08-01T00:00:00.000Z')

function iso(day: number): string {
  return new Date(BASE + day * 86_400_000).toISOString()
}

function lane(
  lineId: string,
  firstDay: number,
  lastDay: number,
  overrides: Partial<ResearchWorktreeLaneView> = {},
): ResearchWorktreeLaneView {
  return {
    lineId,
    label: lineId,
    status: 'open',
    state: 'exploring',
    parentLineId: null,
    parentLabel: null,
    firstSeen: iso(firstDay),
    lastSeen: iso(lastDay),
    eventCount: 1,
    drift: 0,
    closedAt: null,
    closeReason: null,
    gutDays: null,
    idleDays: 0,
    touches: [],
    ...overrides,
  }
}

function viewOf(lanes: readonly ResearchWorktreeLaneView[], mainline: string | null = null): ResearchWorktreeView {
  return {
    derivedAt: NOW,
    lanes,
    mainline: mainline === null ? null : { lineId: mainline, label: mainline, declaredAt: iso(0) },
    mainlineHistory: [],
    counts: { open: lanes.length, failed: 0, adopted: 0 },
  }
}

describe('layoutWorktreeFlow', () => {
  it('rides the mainline on the axis and bows branches to their own rails', () => {
    const lanes = [
      lane('main', 1, 20),
      lane('kid', 5, 15, { parentLineId: 'main' }),
      lane('grandkid', 8, 12, { parentLineId: 'kid' }),
    ]
    const flow = layoutWorktreeFlow(viewOf(lanes, 'main'))
    const main = flow.lanes.find(entry => entry.lane.lineId === 'main')
    const kid = flow.lanes.find(entry => entry.lane.lineId === 'kid')
    const grandkid = flow.lanes.find(entry => entry.lane.lineId === 'grandkid')
    expect(main).toBeDefined()
    expect(kid).toBeDefined()
    expect(grandkid).toBeDefined()
    expect(main!.y).toBe(flow.mainY) // the declared mainline rides the axis
    expect(Math.abs(kid!.y - flow.mainY)).toBeGreaterThan(0)
    expect(Math.abs(grandkid!.y - flow.mainY)).toBeGreaterThan(Math.abs(kid!.y - flow.mainY))
    // The mainline is the straight axis; a forked child curve bends (Q).
    expect(main!.path).not.toContain('Q')
    expect(kid!.path).toContain('Q')
  })

  it('merges an adopted line back to its declared parent rail', () => {
    const lanes = [
      lane('main', 1, 20),
      lane('m', 4, 9, { parentLineId: 'main', status: 'adopted' }),
    ]
    const flow = layoutWorktreeFlow(viewOf(lanes, 'main'))
    const main = flow.lanes.find(entry => entry.lane.lineId === 'main')!
    const merged = flow.lanes.find(entry => entry.lane.lineId === 'm')!
    // Two bends: the fork out (Q) and the merge back (Q) — ends on the axis.
    expect(merged.path.match(/Q/g)?.length ?? 0).toBe(2)
    expect(merged.path.endsWith(String(flow.mainY))).toBe(true)
    expect(merged.path.endsWith(String(main.y))).toBe(true)
  })

  it('clamps beads onto their curve straight section', () => {
    const lanes = [
      lane('main', 1, 20),
      lane('kid', 3, 18, {
        parentLineId: 'main',
        touches: [
        { at: iso(3), kind: 'create', action: 'knowledge.idea.added' },
        { at: iso(10), kind: 'work', action: 'experiments.saved' },
        { at: iso(18), kind: 'terminal', action: 'knowledge.idea.failed' },
      ],
      }),
    ]
    const flow = layoutWorktreeFlow(viewOf(lanes, 'main'))
    const kid = flow.lanes.find(entry => entry.lane.lineId === 'kid')!
    for (const bead of flow.beads.filter(item => item.lineId === 'kid')) {
      expect(bead.y).toBe(kid.y)
      expect(bead.x).toBeGreaterThanOrEqual(flow.lanes.find(entry => entry.lane.lineId === 'main')!.path ? 0 : 0)
    }
    const xs = flow.beads.filter(item => item.lineId === 'kid').map(item => item.x)
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs))
  })

  it('folds long histories into the column budget', () => {
    const touches = []
    for (let day = 0; day <= 200; day += 2) {
      touches.push({ at: iso(day), kind: 'work' as const, action: 'experiments.saved' })
    }
    const lanes = [lane('busy', 0, 200, { touches })]
    const flow = layoutWorktreeFlow(viewOf(lanes))
    expect(flow.cols).toBe(WORKTREE_FLOW_MAX_COLS)
    expect(flow.momentCount).toBeGreaterThan(flow.cols)
    expect(flow.beads.length).toBeLessThan(touches.length) // columns merged
    for (const bead of flow.beads) {
      if (bead.count > 1) expect(beadRadius(bead.kind, bead.count)).toBeGreaterThan(beadRadius(bead.kind, 1))
    }
  })

  it('sizes beads by kind (terminal > create > work > meta)', () => {
    expect(beadRadius('terminal', 1)).toBeGreaterThan(beadRadius('create', 1))
    expect(beadRadius('create', 1)).toBeGreaterThan(beadRadius('work', 1))
    expect(beadRadius('work', 1)).toBeGreaterThan(beadRadius('meta', 1))
  })

  it('gives every non-main lane its own rail (no two lanes overlap)', () => {
    const lanes = [
      lane('main', 1, 20),
      lane('p1', 2, 19),
      lane('c1', 5, 15, { parentLineId: 'main' }),
      lane('c2', 6, 14, { parentLineId: 'main' }),
      lane('c3', 7, 13, { parentLineId: 'main' }),
      lane('g1', 8, 12, { parentLineId: 'c1' }),
    ]
    const flow = layoutWorktreeFlow(viewOf(lanes, 'main'))
    const rails = flow.lanes.filter(e => e.lane.lineId !== 'main').map(e => e.y)
    expect(new Set(rails).size).toBe(rails.length) // unique ys
    // Children nest beyond their parent on the parent's side.
    const c1 = flow.lanes.find(e => e.lane.lineId === 'c1')
    const g1 = flow.lanes.find(e => e.lane.lineId === 'g1')
    expect(Math.abs(g1!.y - flow.mainY)).toBeGreaterThan(Math.abs(c1!.y - flow.mainY))
  })

  it('degrades dangling and cyclic declarations to roots without crashes', () => {
    const lanes = [
      lane('dangling', 3, 9, { parentLineId: 'ghost' }),
      lane('x', 1, 10, { parentLineId: 'y' }),
      lane('y', 2, 8, { parentLineId: 'x' }),
    ]
    const flow = layoutWorktreeFlow(viewOf(lanes))
    expect(flow.lanes).toHaveLength(3) // nobody is lost
    const x = flow.lanes.find(entry => entry.lane.lineId === 'x')!
    expect(x.path).not.toContain('Q') // cycle members ride flat rails
  })

  it('is deterministic against input order', () => {
    const lanes = [
      lane('main', 1, 20),
      lane('b', 2, 10),
      lane('a1', 5, 15, { parentLineId: 'main' }),
    ]
    const one = layoutWorktreeFlow(viewOf(lanes, 'main'))
    const two = layoutWorktreeFlow(viewOf([...lanes].reverse(), 'main'))
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })

  it('ends a failed lane before the now-line', () => {
    const lanes = [
      lane('dead', 2, 26, { status: 'failed', closedAt: iso(10), lastSeen: iso(26) }),
    ]
    const flow = layoutWorktreeFlow(viewOf(lanes))
    const dead = flow.lanes.find(entry => entry.lane.lineId === 'dead')!
    // The straight section stops at the close, left of now.
    const endX = Number.parseFloat(dead.path.split('L ').pop() ?? '0')
    expect(endX).toBeLessThan(flow.nowX)
  })
})
