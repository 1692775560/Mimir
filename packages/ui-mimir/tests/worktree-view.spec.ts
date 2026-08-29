/**
 * The worktree view helpers: the close-reason draft state, the idea-lane
 * probe, and the trajectory highlights — the beats the view keeps until a
 * bigger Eureka arrives. The highlight tests pin the SELECTION rules (which
 * lane counts as busiest, which terminal is "latest") and the honesty rule
 * that an empty worktree invents nothing.
 * @module dsh-client-ui-mimir/tests/worktree-view
 */

import { describe, expect, it } from 'vitest'
import { closeReasonState, isIdeaLane, worktreeHighlights, WORKTREE_REASON_MAX_CHARS } from '../src/client/worktree-view.ts'
import type {
  ResearchWorktreeLaneView,
  ResearchWorktreeMainlineView,
  ResearchWorktreeTouchView,
  ResearchWorktreeView,
} from 'dsh-mimir/types'

function touch(at: string, kind: ResearchWorktreeTouchView['kind'], action = 'knowledge.idea.added'): ResearchWorktreeTouchView {
  return { at, kind, action }
}

function lane(
  lineId: string,
  label: string,
  eventCount: number,
  touches: readonly ResearchWorktreeTouchView[] = [],
): ResearchWorktreeLaneView {
  return {
    lineId,
    label,
    status: 'open',
    state: 'exploring',
    parentLineId: null,
    parentLabel: null,
    firstSeen: '2026-08-01T00:00:00.000Z',
    lastSeen: '2026-08-20T00:00:00.000Z',
    eventCount,
    drift: 0,
    closedAt: null,
    closeReason: null,
    gutDays: null,
    idleDays: null,
    touches,
  }
}

function mainline(lineId: string, label: string, at: string): ResearchWorktreeMainlineView {
  return { lineId, label, declaredAt: at }
}

function view(overrides: Partial<ResearchWorktreeView> = {}): ResearchWorktreeView {
  return {
    derivedAt: '2026-08-29T00:00:00.000Z',
    lanes: [],
    mainline: null,
    mainlineHistory: [],
    counts: { open: 0, failed: 0, adopted: 0 },
    ...overrides,
  }
}

describe('close reason draft state', () => {
  it('mirrors the server cap', () => {
    expect(WORKTREE_REASON_MAX_CHARS).toBe(48)
    expect(closeReasonState('   ')).toBe('empty')
    expect(closeReasonState('a')).toBe('ok')
    expect(closeReasonState('a'.repeat(49))).toBe('too-long')
  })
})

describe('idea lane probe', () => {
  it('separates idea lines from project lanes', () => {
    expect(isIdeaLane('i1')).toBe(true)
    expect(isIdeaLane('project:p1')).toBe(false)
  })
})

describe('trajectory highlights', () => {
  it('invents nothing for an empty worktree', () => {
    expect(worktreeHighlights(view())).toEqual([])
  })

  it('names the busiest lane by event count', () => {
    const highlights = worktreeHighlights(view({
      lanes: [lane('i1', '稀疏注意力', 3), lane('i2', '主线方向', 9)],
    }))
    const busiest = highlights.find(item => item.kind === 'busiest')
    expect(busiest?.value).toBe('主线方向')
    expect(busiest?.detail).toBe('9')
  })

  it('picks the most recent terminal as the latest decision', () => {
    const highlights = worktreeHighlights(view({
      lanes: [
        lane('i1', '旧线', 2, [touch('2026-08-05T00:00:00.000Z', 'terminal', 'knowledge.idea.failed')]),
        lane('i2', '新线', 2, [touch('2026-08-25T00:00:00.000Z', 'terminal', 'knowledge.idea.adopted')]),
      ],
    }))
    const eureka = highlights.find(item => item.kind === 'eureka')
    expect(eureka?.value).toBe('新线')
    expect(eureka?.detail).toBe('2026-08-25')
  })

  it('counts the mainline reflog rather than only naming the current ref', () => {
    const highlights = worktreeHighlights(view({
      lanes: [lane('i1', '主线方向', 3)],
      mainline: mainline('i1', '主线方向', '2026-08-20T00:00:00.000Z'),
      mainlineHistory: [
        mainline('i1', '主线方向', '2026-08-10T00:00:00.000Z'),
        mainline('i1', '主线方向', '2026-08-20T00:00:00.000Z'),
      ],
    }))
    const main = highlights.find(item => item.kind === 'mainline')
    expect(main?.value).toBe('主线方向')
    expect(main?.detail).toBe('2')
  })

  it('reports adopted and documented-No counts only when they exist', () => {
    const none = worktreeHighlights(view({ counts: { open: 3, failed: 0, adopted: 0 } }))
    expect(none.find(item => item.kind === 'adopted')).toBeUndefined()
    expect(none.find(item => item.kind === 'failed')).toBeUndefined()

    const some = worktreeHighlights(view({ counts: { open: 1, failed: 2, adopted: 3 } }))
    expect(some.find(item => item.kind === 'adopted')?.value).toBe('3')
    expect(some.find(item => item.kind === 'failed')?.value).toBe('2')
  })

  it('orders the beats: busiest, latest decision, mainline, then the tally', () => {
    const highlights = worktreeHighlights(view({
      lanes: [lane('i1', '主线方向', 5, [touch('2026-08-25T00:00:00.000Z', 'terminal')])],
      mainline: mainline('i1', '主线方向', '2026-08-20T00:00:00.000Z'),
      mainlineHistory: [mainline('i1', '主线方向', '2026-08-20T00:00:00.000Z')],
      counts: { open: 1, failed: 2, adopted: 1 },
    }))
    expect(highlights.map(item => item.kind)).toEqual(['busiest', 'eureka', 'mainline', 'adopted', 'failed'])
  })
})
