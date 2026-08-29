/**
 * Unit proof for the six-perspective experience capsules (S8b): each capsule
 * is a fold over one INDEPENDENT derived layer, so the array is a set of
 * distinct measurements — not six restatements of one model's opinion. These
 * tests build minimal, fully-typed mock layers (no ledger needed) and check
 * the fold rules and the localized one-liner.
 * @module dsh-mimir/tests/report-capsules
 */

import { describe, expect, it } from 'vitest'
import {
  deriveCapsules,
  formatCapsule,
  type CbeCapsuleInput,
  type CbeCapsulePerspective,
  type CbeExperienceCapsule,
} from '../src/report-capsules.ts'
import type { CbeWorktree, CbeWorktreeLane } from '../src/worktree.ts'
import type { CbeCuratedMoment } from '../src/moment-index.ts'
import type {
  CbeLibraryThemes,
  CbeThemeDriftRow,
  CbeThemeWindow,
} from '../src/library-themes.ts'
import type { CbeHabitProfile, CbeHourBucket } from '../src/habits.ts'
import type { CbeBrief, CbeOpenLoop } from '../src/cognitive-map.ts'

const AT = '2026-06-15T00:00:00.000Z'

/* ── Minimal, fully-typed layer builders ────────────────────────────────── */

function lane(over: Partial<CbeWorktreeLane> = {}): CbeWorktreeLane {
  return {
    lineId: 'L1', label: 'Line 1', status: 'open', state: 'converging',
    parentLineId: null, firstSeen: AT, lastSeen: AT, eventCount: 1, drift: 0.3,
    closedAt: null, closeReason: null, gutDays: null, idleDays: null,
    touches: Object.freeze([]),
    ...over,
  }
}

function worktree(over: Partial<CbeWorktree> = {}): CbeWorktree {
  return {
    asOf: AT, lanes: Object.freeze([]), mainline: null,
    mainlineHistory: Object.freeze([]), counts: { open: 0, failed: 0, adopted: 0 },
    ...over,
  }
}

function moment(over: Partial<CbeCuratedMoment> = {}): CbeCuratedMoment {
  return {
    id: 'm1', at: AT, lineId: null, kind: 'burst', action: 'experiments.saved',
    note: null, eventCount: 1, pinned: false, evidence: Object.freeze([]),
    ...over,
  }
}

function driftRow(over: Partial<CbeThemeDriftRow> = {}): CbeThemeDriftRow {
  return {
    theme: 't', source: 'tag', currentCount: 2, previousCount: 1,
    deltaShare: 0.1, direction: 'rising', ...over,
  }
}

function themeWindow(): CbeThemeWindow {
  return { since: AT, until: AT, paperCount: 0, themes: Object.freeze([]) }
}

function library(over: Partial<CbeLibraryThemes> = {}): CbeLibraryThemes {
  return {
    asOf: AT, current: themeWindow(), previous: themeWindow(),
    drift: Object.freeze([]), newThemes: Object.freeze([]),
    departedThemes: Object.freeze([]), speaks: false, ...over,
  }
}

function hour(hour: number): CbeHourBucket {
  return { hour, count: 1 }
}

function habits(over: Partial<CbeHabitProfile> = {}): CbeHabitProfile {
  return {
    asOf: AT, eventCount: 0, sessions: Object.freeze([]), sessionCount: 0,
    medianSessionMinutes: null, longestSessionMinutes: null,
    activeHours: Object.freeze([]), weekdayHistogram: Object.freeze([]),
    activeDays: 0, currentStreakDays: 0, speaks: false, ...over,
  }
}

function openLoop(over: Partial<CbeOpenLoop> = {}): CbeOpenLoop {
  return {
    kind: 'job-unsettled', refId: 'j1', openedBy: 'ev-open', openedAt: AT, ...over,
  }
}

function brief(loops: readonly CbeOpenLoop[] = []): CbeBrief {
  return {
    window: { since: AT, until: AT, projectId: null },
    lines: Object.freeze([]), moments: Object.freeze([]),
    transitions: Object.freeze([]), openLoops: Object.freeze(loops),
    questions: Object.freeze([]), narrative: Object.freeze([]),
  }
}

function input(over: Partial<CbeCapsuleInput> = {}): CbeCapsuleInput {
  return {
    window: { since: AT, until: AT },
    worktree: worktree(),
    moments: Object.freeze([]),
    library: library(),
    habits: habits(),
    brief: brief(),
    ...over,
  }
}

/** A capsule with all required fields, overriding only what a test needs. */
function cap(
  perspective: CbeCapsulePerspective,
  over: Partial<CbeExperienceCapsule> = {},
): CbeExperienceCapsule {
  return {
    id: 'x', at: AT, labelRef: 'L1',
    evidence: Object.freeze([]), theme: null, metric: null, kind: null,
    perspective, ...over,
  }
}

/* ── The fold ──────────────────────────────────────────────────────────── */

describe('deriveCapsules', () => {
  it('sorts capsules by the fixed perspective order and freezes the array', () => {
    const inp = input({
      worktree: worktree({ lanes: Object.freeze([
        lane({ lineId: 'L1', status: 'open' }),
        lane({ lineId: 'L2', status: 'failed' }),
      ]) }),
      library: library({ drift: Object.freeze([driftRow({ direction: 'rising' })]) }),
      habits: habits({ speaks: true, activeHours: Object.freeze([hour(9)]) }),
      moments: Object.freeze([moment({ id: 'm1' }), moment({ id: 'm2', pinned: true })]),
      brief: brief([openLoop({ refId: 'j1' })]),
    })
    const caps = deriveCapsules(inp)
    expect(Object.isFrozen(caps)).toBe(true)
    // mainline, dead-branch, literature, rhythm, moment, moment, open-loop
    expect(caps.map(item => item.perspective)).toEqual([
      'mainline', 'dead-branch', 'literature', 'rhythm', 'moment', 'moment', 'open-loop',
    ])
  })

  it('mainline shows open/adopted lanes only; dead-branch shows failed lanes only', () => {
    const inp = input({
      worktree: worktree({ lanes: Object.freeze([
        lane({ lineId: 'L1', status: 'open' }),
        lane({ lineId: 'L2', status: 'adopted' }),
        lane({ lineId: 'L3', status: 'failed' }),
      ]) }),
    })
    const caps = deriveCapsules(inp)
    expect(caps.filter(item => item.perspective === 'mainline').map(item => item.labelRef))
      .toEqual(['L1', 'L2'])
    expect(caps.filter(item => item.perspective === 'dead-branch').map(item => item.labelRef))
      .toEqual(['L3'])
  })

  it('literature drops flat drift rows', () => {
    const inp = input({
      library: library({ drift: Object.freeze([
        driftRow({ theme: 'a', direction: 'rising' }),
        driftRow({ theme: 'b', direction: 'flat' }),
        driftRow({ theme: 'c', direction: 'falling' }),
      ]) }),
    })
    const caps = deriveCapsules(inp)
    expect(caps.filter(item => item.perspective === 'literature').map(item => item.theme))
      .toEqual(['a', 'c'])
  })

  it('rhythm is silent when habits do not speak, present once they do', () => {
    const silent = deriveCapsules(input({ habits: habits({ speaks: false }) }))
    expect(silent.some(item => item.perspective === 'rhythm')).toBe(false)

    const speaks = deriveCapsules(input({
      habits: habits({ speaks: true, activeHours: Object.freeze([hour(9)]) }),
    }))
    expect(speaks.filter(item => item.perspective === 'rhythm')).toHaveLength(1)
  })

  it('moments sort pinned before unpinned', () => {
    const inp = input({
      moments: Object.freeze([
        moment({ id: 'u1', pinned: false, at: '2026-06-01T00:00:00.000Z' }),
        moment({ id: 'p1', pinned: true, at: '2026-06-10T00:00:00.000Z' }),
      ]),
    })
    const caps = deriveCapsules(inp).filter(item => item.perspective === 'moment')
    expect(caps.map(item => item.labelRef)).toEqual(['p1', 'u1'])
  })

  it('open loops become open-loop capsules carrying the opening event as evidence', () => {
    const inp = input({
      brief: brief([
        openLoop({ kind: 'job-unsettled', refId: 'job-9', openedBy: 'ev-job-open' }),
        openLoop({ kind: 'compile-unresolved', refId: 'proj-2', openedBy: 'ev-compile-open' }),
      ]),
    })
    const caps = deriveCapsules(inp).filter(item => item.perspective === 'open-loop')
    expect(caps).toHaveLength(2)
    expect(caps[0]?.evidence).toEqual(['ev-job-open'])
    expect(caps[1]?.evidence).toEqual(['ev-compile-open'])
  })
})

/* ── The localized one-liner ───────────────────────────────────────────── */

describe('formatCapsule', () => {
  it('mainline reports drift, never praises it (zh + en)', () => {
    const c = cap('mainline', { labelRef: 'L1', metric: 0.25, kind: 'open' })
    expect(formatCapsule(c, 'zh')).toContain('L1')
    expect(formatCapsule(c, 'zh')).toContain('仍有活动')
    expect(formatCapsule(c, 'en')).toContain('still active')
  })

  it('dead-branch reports the documented No and how long it took', () => {
    const c = cap('dead-branch', { labelRef: 'L2', theme: '假设太强', metric: 8 })
    expect(formatCapsule(c, 'zh')).toContain('已终止')
    expect(formatCapsule(c, 'zh')).toContain('假设太强')
    expect(formatCapsule(c, 'zh')).toContain('8')
    expect(formatCapsule(c, 'en')).toContain('gave up after 8 days')
  })

  it('literature reports theme drift direction and delta', () => {
    const c = cap('literature', { labelRef: null, theme: '注意力', metric: 0.2, kind: 'rising' })
    expect(formatCapsule(c, 'zh')).toContain('升温')
    expect(formatCapsule(c, 'zh')).toContain('注意力')
    expect(formatCapsule(c, 'en')).toContain('rising')
  })

  it('rhythm reports the streak and busiest hour', () => {
    const c = cap('rhythm', { labelRef: null, metric: 12, kind: '9:00' })
    expect(formatCapsule(c, 'zh')).toContain('连续 12 天')
    expect(formatCapsule(c, 'en')).toContain('12-day streak')
  })

  it('moment uses the researcher’s note, else kind · event count', () => {
    const noted = cap('moment', { labelRef: 'm1', theme: '终于连上了', metric: 5, kind: 'burst' })
    expect(formatCapsule(noted, 'zh')).toBe('终于连上了')
    const bare = cap('moment', { labelRef: 'm1', theme: null, metric: 5, kind: 'burst' })
    expect(formatCapsule(bare, 'zh')).toContain('burst')
    expect(formatCapsule(bare, 'zh')).toContain('5')
  })

  it('open-loop names the unresolved thread', () => {
    const c = cap('open-loop', { labelRef: 'job-9', kind: 'job-unsettled' })
    expect(formatCapsule(c, 'zh')).toContain('未结算的任务')
    expect(formatCapsule(c, 'en')).toContain('unsettled job')
  })
})
