/**
 * Feasibility proof for the journal draft (S7): the organ that hands the
 * researcher a written-out day instead of a blank page. Checks that every
 * section is machine-filled from the brief, that empty sections say so
 * honestly rather than inventing a reading, and that exactly one slot is
 * left for words only a person can supply.
 * @module dsh-mimir/tests/journal-draft
 */

import { describe, expect, it } from 'vitest'
import { renderJournalDraft } from '../src/journal-draft.ts'
import type { CbeBrief, CbeBriefWindow, CbeLine, CbeLineState } from '../src/cognitive-map.ts'
import type { CbeHabitProfile } from '../src/habits.ts'
import type { CbeLibraryThemes } from '../src/library-themes.ts'

const WINDOW: CbeBriefWindow = {
  since: '2026-08-29T00:00:00.000Z',
  until: '2026-08-30T00:00:00.000Z',
  projectId: null,
}

function brief(overrides: Partial<CbeBrief> = {}): CbeBrief {
  return {
    window: WINDOW,
    lines: [],
    moments: [],
    transitions: [],
    openLoops: [],
    questions: [],
    narrative: [],
    ...overrides,
  }
}

function line(id: string, label: string, state: CbeLineState, eventCount: number): CbeLine {
  return {
    id,
    label,
    firstSeen: WINDOW.since,
    lastSeen: WINDOW.since,
    eventCount,
    drift: 1,
    dispersion: 0,
    returnSessions: 1,
    decisionDays: null,
    settledBy: null,
    state,
    tier: 'silent',
    evidence: [],
  }
}

const SILENT_THEMES: CbeLibraryThemes = {
  asOf: WINDOW.since,
  current: { since: WINDOW.since, until: WINDOW.until, paperCount: 0, themes: [] },
  previous: { since: WINDOW.since, until: WINDOW.until, paperCount: 0, themes: [] },
  drift: [],
  newThemes: [],
  departedThemes: [],
  speaks: false,
}

const SILENT_HABITS: CbeHabitProfile = {
  asOf: WINDOW.since,
  eventCount: 0,
  sessions: [],
  sessionCount: 0,
  medianSessionMinutes: null,
  longestSessionMinutes: null,
  activeHours: [],
  weekdayHistogram: [1, 2, 3, 4, 5, 6, 0].map(weekday => ({ weekday, count: 0 })),
  activeDays: 0,
  currentStreakDays: 0,
  speaks: false,
}

describe('journal draft shape', () => {
  it('writes the day out and leaves exactly one slot for the researcher', () => {
    const markdown = renderJournalDraft({ kind: 'day', brief: brief() })
    expect(markdown).toContain('# ')
    expect(markdown).toContain('研究日记（草稿）')
    expect(markdown).toContain('一、做了什么')
    expect(markdown).toContain('二、想法的转变')
    expect(markdown).toContain('我自己的话')
    expect(markdown).toContain('- [ ] ')
    // The bracketed slot is the only one in the draft.
    expect(markdown.match(/- \[ \] /g) ?? []).toHaveLength(1)
  })

  it('renders English on request', () => {
    const markdown = renderJournalDraft({ kind: 'week', brief: brief(), lang: 'en' })
    expect(markdown).toContain('this week (draft)')
    expect(markdown).toContain('1. What I did')
    expect(markdown).toContain('In my own words')
  })

  it('titles the weekly and monthly drafts by span', () => {
    const week = renderJournalDraft({ kind: 'week', brief: brief() })
    expect(week).toContain('本周进展')
    const month = renderJournalDraft({ kind: 'month', brief: brief() })
    expect(month).toContain('本月进展')
  })
})

describe('journal draft honesty', () => {
  it('says so when nothing happened, instead of inventing a reading', () => {
    const markdown = renderJournalDraft({ kind: 'day', brief: brief() })
    expect(markdown).toContain('没有任何一条线的活动')
    expect(markdown).toContain('没有落定的转折')
    expect(markdown).toContain('没有悬而未决的线程')
  })

  it('keeps a silent organ silent', () => {
    const markdown = renderJournalDraft({
      kind: 'day',
      brief: brief(),
      themes: SILENT_THEMES,
      habits: SILENT_HABITS,
    })
    expect(markdown).toContain('样本还不够')
    // A silent habit layer adds no rhythm claim at all.
    expect(markdown).not.toContain('坐下来')
  })

  it('omits the shelf section entirely when no library layer is supplied', () => {
    const without = renderJournalDraft({ kind: 'day', brief: brief() })
    expect(without).not.toContain('书架的漂移')
    const withThemes = renderJournalDraft({ kind: 'day', brief: brief(), themes: SILENT_THEMES })
    expect(withThemes).toContain('书架的漂移')
  })
})

describe('journal draft content', () => {
  it('names the lines touched with their drift state', () => {
    const markdown = renderJournalDraft({
      kind: 'day',
      brief: brief({
        lines: [
          line('i1', '稀疏注意力', 'converging', 7),
          line('i2', '旧方向', 'exploring', 2),
        ],
      }),
    })
    expect(markdown).toContain('稀疏注意力')
    expect(markdown).toContain('收敛中')
    expect(markdown).toContain('仍在探索')
    expect(markdown).toContain('7 次')
  })

  it('records the transitions as the Yes that emerged', () => {
    const markdown = renderJournalDraft({
      kind: 'day',
      brief: brief({
        transitions: [{ kind: 'idea', id: 'i1', to: 'adopted', ts: WINDOW.since, evidence: [] }],
      }),
    })
    expect(markdown).toContain('adopted')
    expect(markdown).not.toContain('没有落定的转折')
  })

  it('lists the open loops in plain words', () => {
    const markdown = renderJournalDraft({
      kind: 'day',
      brief: brief({
        openLoops: [
          { kind: 'compile-unresolved', refId: 'p1', openedBy: 'ev-1', openedAt: WINDOW.since },
          { kind: 'job-unsettled', refId: 'job-9', openedBy: 'ev-2', openedAt: WINDOW.since },
        ],
      }),
    })
    expect(markdown).toContain('编译未解决')
    expect(markdown).toContain('实验任务未落定')
  })

  it('reports the moments as spans with their creation counts', () => {
    const markdown = renderJournalDraft({
      kind: 'day',
      brief: brief({
        moments: [{
          from: '2026-08-29T06:00:00.000Z',
          to: '2026-08-29T08:30:00.000Z',
          eventCount: 6,
          creationCount: 2,
          evidence: [],
          baseline: 3,
        }],
      }),
    })
    expect(markdown).toContain('6 个事件')
    expect(markdown).toContain('2 次新建')
    expect(markdown).toContain('中位数 3')
  })

  it('carries the shelf drift into its own section', () => {
    const themes: CbeLibraryThemes = {
      ...SILENT_THEMES,
      current: {
        since: WINDOW.since,
        until: WINDOW.until,
        paperCount: 4,
        themes: [{ theme: 'diffusion', count: 3, share: 0.75, source: 'keyword' }],
      },
      previous: {
        since: WINDOW.since,
        until: WINDOW.until,
        paperCount: 4,
        themes: [{ theme: 'transformer', count: 3, share: 0.75, source: 'keyword' }],
      },
      drift: [
        { theme: 'diffusion', source: 'keyword', currentCount: 3, previousCount: 0, deltaShare: 0.75, direction: 'new' },
        { theme: 'transformer', source: 'keyword', currentCount: 0, previousCount: 3, deltaShare: -0.75, direction: 'gone' },
      ],
      newThemes: ['diffusion'],
      departedThemes: ['transformer'],
      speaks: true,
    }
    const markdown = renderJournalDraft({ kind: 'week', brief: brief(), themes })
    expect(markdown).toContain('书架的漂移')
    expect(markdown).toContain('diffusion')
    expect(markdown).toContain('新增')
    expect(markdown).toContain('消失')
  })

  it('describes the rhythm without ever advising on it', () => {
    const habits: CbeHabitProfile = {
      ...SILENT_HABITS,
      eventCount: 12,
      sessionCount: 3,
      medianSessionMinutes: 45,
      longestSessionMinutes: 90,
      activeHours: [{ hour: 22, count: 8 }, { hour: 23, count: 4 }],
      activeDays: 2,
      currentStreakDays: 3,
      speaks: true,
    }
    const markdown = renderJournalDraft({ kind: 'week', brief: brief(), habits })
    expect(markdown).toContain('坐下来 3 次')
    expect(markdown).toContain('90 分钟')
    expect(markdown).toContain('连续 3 天')
    // No prescription: the draft describes attention already spent.
    expect(markdown).not.toContain('应该')
    expect(markdown).not.toContain('建议')
  })

  it('closes with the questions the map is still holding', () => {
    const markdown = renderJournalDraft({
      kind: 'day',
      brief: brief({
        questions: [{ kind: 'returning-branch', lineId: 'i1', evidence: [] }],
      }),
    })
    expect(markdown).toContain('待你确认的边界问题')
  })
})
