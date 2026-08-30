/**
 * Feasibility proof for the Cognitive Beidou Engine (CBE): synthetic ledger
 * streams with known ground truth, checking that the DDM-lite estimates
 * (drift, dispersion, decision time, line states), the eureka detector, the
 * open loops, the boundary questions, and the composed brief all recover the
 * intended structure from the REAL event vocabulary alone.
 * @module dsh-mimir/tests/cognitive-map.spec
 */

import { describe, expect, it } from 'vitest'
import {
  CBE_LINE_EVIDENCE_CAP,
  claimsOf,
  deriveBrief,
  deriveLines,
  deriveNarrative,
  deriveOpenLoops,
  deriveQuestions,
  deriveTransitions,
  detectMoments,
  JOURNAL_ACTION,
  lineInferenceCard,
  renderBriefMarkdown,
  signedWeight,
  type CbeBriefWindow,
  type CbeWikiSnapshot,
} from '../src/cognitive-map.ts'
import type {
  ClaimRecord,
  EventRecord,
  IdeaRecord,
  LedgerActor,
  LedgerJsonValue,
  ProjectRecord,
} from '../src/types.ts'

const USER: LedgerActor = { kind: 'user', id: 'panel' }
const AGENT: LedgerActor = { kind: 'agent', id: 'wiki_note' }

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

const NOW = Date.parse('2026-08-27T00:00:00Z')
const WINDOW: CbeBriefWindow = Object.freeze({
  since: '2026-07-25T00:00:00Z',
  until: '2026-08-27T23:59:59Z',
  projectId: null,
})

/**
 * Line A (dominant): a sustained positive investment over the last week.
 * Synthetic streams may carry richer refs than today's emit sites: every
 * event points at the idea (real experiments/jobs/papers currently carry
 * only experiment/job/paper refs — enriching that attribution is a P1 item).
 */
function dominantEvents(): readonly EventRecord[] {
  return [
    ev('2026-08-26T00:00:00Z', 'knowledge.idea.added', { ideaId: 'idea-a' }, { title: 'Alpha direction' }),
    ev('2026-08-26T12:00:00Z', 'experiments.saved', { ideaId: 'idea-a', experimentId: 'exp-a1', projectId: 'p1' }, { name: 'alpha run 1', created: true, metricCount: 2 }),
    ev('2026-08-26T18:00:00Z', 'compute.job.settled', { ideaId: 'idea-a', jobId: 'job-a1', serverId: 'srv1' }, { status: 'succeeded', exitCode: 0, durationMs: 60000 }),
    ev('2026-08-26T22:00:00Z', 'literature.paper.imported', { ideaId: 'idea-a', paperId: '2601.00001', projectId: 'p1' }, { title: 'Alpha related work', imported: true }),
    // Fifth event so the line clears the I2 word floor (five line events).
    ev('2026-08-26T23:00:00Z', 'writing.bib.saved', { ideaId: 'idea-a', projectId: 'p1' }, { entries: 3 }),
  ]
}

/** Line B (settled): born 08-01, first touched 08-03, failed 08-07 → 6-day decision. */
function settledEvents(): readonly EventRecord[] {
  return [
    ev('2026-08-03T00:00:00Z', 'literature.paper.imported', { paperId: '2601.00002', projectId: 'p1' }, { title: 'Beta related work', imported: true }),
    ev('2026-08-07T00:00:00Z', 'knowledge.idea.failed', { ideaId: 'idea-b' }, { reason: 'baselines do not reproduce' }),
  ]
}

/** Project p2 (stalled): dismantled without a terminal idea event. */
function stalledEvents(): readonly EventRecord[] {
  return [
    ev('2026-08-25T00:00:00Z', 'literature.paper.removed', { paperId: '2601.00003', projectId: 'p2' }, { title: 'Gamma paper', destructive: true }),
    ev('2026-08-26T00:00:00Z', 'experiments.deleted', { experimentId: 'exp-g1', projectId: 'p2' }, { name: 'gamma run', destructive: true }),
    ev('2026-08-26T12:00:00Z', 'figures.deleted', { projectId: 'p2', figureId: 'p2:figs/g1.png' }, { relPath: 'figs/g1.png', destructive: true }),
  ]
}

/** Line C (returning-side): near-zero drift, but touched in three sessions. */
function returningEvents(): readonly EventRecord[] {
  return [
    ev('2026-08-20T09:00:00Z', 'literature.paper.imported', { paperId: '2601.00004', projectId: 'p1' }, { title: 'Delta paper', imported: true }),
    ev('2026-08-21T09:00:00Z', 'literature.paper.removed', { paperId: '2601.00004', projectId: 'p1' }, { title: 'Delta paper', destructive: true }),
    ev('2026-08-22T09:00:00Z', 'writing.bib.saved', { projectId: 'p1' }, { entries: 4, created: false }),
    ev('2026-08-23T09:00:00Z', 'experiments.deleted', { experimentId: 'exp-d1', projectId: 'p1' }, { name: 'delta run', destructive: true }),
    ev('2026-08-24T09:00:00Z', 'literature.pdf.fetched', { paperId: '2601.00004', projectId: 'p1' }, { pdfPath: 'papers/2601.00004.pdf' }),
  ]
}

const WIKI: CbeWikiSnapshot = Object.freeze({
  ideas: Object.freeze([
    Object.freeze({ id: 'idea-a', title: 'Alpha direction', hypothesis: 'h-a', status: 'active' as const, createdAt: '2026-08-26T00:00:00Z' }) as IdeaRecord,
    Object.freeze({ id: 'idea-b', title: 'Beta direction', hypothesis: 'h-b', status: 'failed' as const, failureReason: 'baselines do not reproduce', createdAt: '2026-08-01T00:00:00Z' }) as IdeaRecord,
    Object.freeze({ id: 'idea-c', title: 'Delta direction', hypothesis: 'h-c', status: 'active' as const, createdAt: '2026-08-19T00:00:00Z' }) as IdeaRecord,
  ]),
  claims: Object.freeze([
    Object.freeze({ id: 'claim-1', text: 'alpha works under the split', status: 'supported' as const, evidence: 'exp-a1' }) as ClaimRecord,
    Object.freeze({ id: 'claim-2', text: 'delta transfers', status: 'pending' as const, evidence: '—' }) as ClaimRecord,
  ]),
  projects: Object.freeze([
    Object.freeze({ id: 'p1', title: 'Alpha project', stage: 'experiment' as const }) as ProjectRecord,
    Object.freeze({ id: 'p2', title: 'Gamma project', stage: 'writing' as const }) as ProjectRecord,
  ]),
})

const ALL = [...dominantEvents(), ...settledEvents(), ...stalledEvents(), ...returningEvents()]

describe('signedWeight (outcome-aware)', () => {
  it('signs job settlement by outcome', () => {
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'compute.job.settled', {}, { status: 'succeeded' }))).toBe(1)
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'compute.job.settled', {}, { status: 'failed' }))).toBe(-1)
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'compute.job.settled', {}, { status: 'running' }))).toBe(0)
  })

  it('signs claim rulings: supported +2, invalidated −2, pending 0', () => {
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'knowledge.claim.set', {}, { status: 'supported' }))).toBe(2)
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'knowledge.claim.set', {}, { status: 'invalidated' }))).toBe(-2)
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'knowledge.claim.set', {}, { status: 'pending' }))).toBe(0)
  })

  it('weights meta events at zero (they never move a line)', () => {
    expect(signedWeight(ev('2026-08-01T00:00:00Z', 'data.wiki.exported', {}, { tables: {} }))).toBe(0)
  })
})

describe('deriveLines (DDM-lite)', () => {
  it('classifies dominant / settled / stalled / returning-side from one stream', () => {
    const lines = deriveLines(ALL, WIKI, WINDOW, NOW)
    const byId = new Map(lines.map(line => [line.id, line]))
    expect(byId.get('idea-a')?.state).toBe('dominant')
    expect(byId.get('idea-b')?.state).toBe('settled')
    expect(byId.get('project:p2')?.state).toBe('stalled')
    // The returning events carry only projectId (idea-c stays event-less),
    // so the near-zero, multi-session line is project:p1's own mix — the
    // project-line fallback that real emit sites produce today.
    expect(byId.get('idea-c')).toBeUndefined()
    expect(byId.get('project:p1')?.state).toBe('returning-side')
    expect(byId.get('idea-a')?.drift).toBeGreaterThanOrEqual(4)
    expect(byId.get('project:p2')?.drift).toBeLessThanOrEqual(-2)
    // dominant sorts first
    expect(lines[0]?.id).toBe('idea-a')
  })

  it('computes decision time from the idea birthdate to the boundary crossing', () => {
    const lines = deriveLines(settledEvents(), WIKI, WINDOW, NOW)
    const beta = lines.find(line => line.id === 'idea-b')
    expect(beta?.state).toBe('settled')
    // born 08-01, crossed 08-07 → exactly 6 days
    expect(beta?.decisionDays).toBeCloseTo(6, 3)
    expect(beta?.settledBy).not.toBeNull()
  })

  it('decays drift over time (the μ estimate is a present-tense quantity)', () => {
    const fresh = deriveLines(dominantEvents(), WIKI, WINDOW, NOW)
    const weekLater = deriveLines(dominantEvents(), WIKI, { ...WINDOW, until: '2026-09-04T00:00:00Z' }, NOW + 7 * 86_400_000)
    expect(weekLater.find(l => l.id === 'idea-a')?.drift).toBeLessThan(fresh.find(l => l.id === 'idea-a')?.drift as number)
  })

  it('caps and orders the per-line evidence', () => {
    const many: EventRecord[] = []
    for (let i = 0; i < CBE_LINE_EVIDENCE_CAP + 5; i += 1) {
      many.push(ev(`2026-08-2${i % 2}T${String(i % 24).padStart(2, '0')}:00:00Z`, 'literature.pdf.fetched', { paperId: `2601.9000${i % 10}`, projectId: 'p1' }, {}))
    }
    const lines = deriveLines(many, WIKI, WINDOW, NOW)
    const project = lines.find(line => line.id === 'project:p1')
    expect(project?.evidence).toHaveLength(CBE_LINE_EVIDENCE_CAP)
    expect(project?.eventCount).toBe(CBE_LINE_EVIDENCE_CAP + 5)
    // newest first
    const [first, last] = project?.evidence ?? []
    const times = (id: string) => many.find(e => e.id === id)?.ts
    expect((times(first as string) ?? '').localeCompare(times(last as string) ?? '')).toBeGreaterThanOrEqual(0)
  })

  it('ignores events without a line reference (meta events stay out of attribution)', () => {
    const lines = deriveLines([ev('2026-08-20T00:00:00Z', 'data.wiki.exported', {}, { tables: {} })], WIKI, WINDOW, NOW)
    expect(lines).toHaveLength(0)
  })
})

describe('detectMoments (eureka candidates)', () => {
  it('flags the burst session and nothing else', () => {
    const quiet: EventRecord[] = []
    for (let day = 1; day <= 8; day += 1) {
      const base = `2026-08-0${day}T09:00:00Z`
      for (let i = 0; i < 3; i += 1) {
        quiet.push(ev(`2026-08-0${day}T09:${String(i * 5).padStart(2, '0')}:00Z`, 'literature.pdf.fetched', { paperId: `2601.5000${day}`, projectId: 'p1' }, {}))
      }
    }
    // one small session to keep the median honest
    quiet.push(ev('2026-08-10T09:00:00Z', 'literature.pdf.fetched', { paperId: '2601.50009', projectId: 'p1' }, {}))
    quiet.push(ev('2026-08-10T09:10:00Z', 'literature.pdf.fetched', { paperId: '2601.50008', projectId: 'p1' }, {}))
    // the burst: 8 events in 20 minutes, including creations
    const burst: EventRecord[] = []
    for (let i = 0; i < 8; i += 1) {
      const action = i < 3
        ? 'knowledge.idea.added'
        : i < 5
          ? 'literature.paper.imported'
          : i < 7
            ? 'experiments.saved'
            : 'writing.paper.reordered'
      const refs = i < 3
        ? { ideaId: `idea-burst-${i}` }
        : i < 5
          ? { paperId: `2601.7000${i}`, projectId: 'p1' }
          : i < 7
            ? { experimentId: `exp-burst-${i}`, projectId: 'p1' }
            : { projectId: 'p1' }
      const payload = i < 3
        ? { title: `burst idea ${i}` }
        : i < 5
          ? { title: `burst paper ${i}`, imported: true }
          : i < 7
            ? { name: `burst run ${i}`, created: true, metricCount: 1 }
            : { level: 'section', moves: 2 }
      const actor = i < 3 ? AGENT : USER
      burst.push(Object.freeze({
        id: `burst-${i}`,
        ts: `2026-08-20T23:${String(10 + i * 2).padStart(2, '0')}:00Z`,
        actor,
        action,
        refs: Object.freeze(refs),
        payload: Object.freeze(payload),
      }))
    }
    const moments = detectMoments([...quiet, ...burst], WINDOW)
    expect(moments).toHaveLength(1)
    const moment = moments[0]
    expect(moment?.eventCount).toBe(8)
    expect(moment?.creationCount).toBeGreaterThanOrEqual(3)
    expect(moment?.evidence).toEqual(burst.map(e => e.id))
    expect(moment?.baseline).toBe(3)
  })

  it('does not flag a large session without a creation-class event', () => {
    const stream: EventRecord[] = []
    for (let i = 0; i < 10; i += 1) {
      stream.push(ev(`2026-08-20T23:${String(10 + i).padStart(2, '0')}:00Z`, 'literature.pdf.fetched', { paperId: `2601.6000${i % 10}`, projectId: 'p1' }, {}))
    }
    expect(detectMoments(stream, WINDOW)).toHaveLength(0)
  })
})

describe('deriveTransitions / deriveOpenLoops / deriveQuestions', () => {
  it('reads the Yes that emerged (idea failed, claim ruled) and skips pending', () => {
    const transitions = deriveTransitions(ALL)
    const idea = transitions.find(t => t.kind === 'idea')
    expect(idea?.id).toBe('idea-b')
    expect(idea?.to).toBe('failed')
    expect(idea?.evidence).toHaveLength(1)
  })

  it('keeps only truly dangling threads', () => {
    const loops = deriveOpenLoops([
      ev('2026-08-26T00:00:00Z', 'compute.job.submitted', { jobId: 'job-open', serverId: 'srv1' }, { command: 'python train.py' }),
      ev('2026-08-26T01:00:00Z', 'compute.job.submitted', { jobId: 'job-done', serverId: 'srv1' }, { command: 'python eval.py' }),
      ev('2026-08-26T02:00:00Z', 'compute.job.settled', { jobId: 'job-done', serverId: 'srv1' }, { status: 'succeeded' }),
      ev('2026-08-26T03:00:00Z', 'writing.compile.settled', { projectId: 'p1' }, { state: 'success', engine: 'xelatex', issues: 2 }),
    ])
    expect(loops.map(l => l.refId).sort()).toEqual(['job-open', 'p1'])
    expect(loops.find(l => l.kind === 'job-unsettled')?.refId).toBe('job-open')
  })

  it('clears a compile loop once a later clean compile lands', () => {
    const loops = deriveOpenLoops([
      ev('2026-08-26T00:00:00Z', 'writing.compile.settled', { projectId: 'p1' }, { state: 'error', engine: 'xelatex', issues: 3 }),
      ev('2026-08-26T06:00:00Z', 'writing.compile.settled', { projectId: 'p1' }, { state: 'success', engine: 'xelatex', issues: 0 }),
    ])
    expect(loops).toHaveLength(0)
  })

  it('asks about pending claims and caps the question list', () => {
    const lines = deriveLines(ALL, WIKI, WINDOW, NOW)
    const questions = deriveQuestions(lines, WIKI)
    expect(questions.some(q => q.kind === 'pending-claim' && q.lineId === 'claim-2')).toBe(true)
    expect(questions.some(q => q.kind === 'returning-branch' && q.lineId === 'project:p1')).toBe(true)
    expect(questions.length).toBeLessThanOrEqual(5)
  })
})

describe('deriveBrief + renderBriefMarkdown (composed roadbook)', () => {
  it('composes all sections from one stream', () => {
    const brief = deriveBrief(ALL, WIKI, WINDOW, NOW)
    expect(brief.lines.length).toBeGreaterThan(0)
    expect(brief.transitions.length).toBeGreaterThan(0)
    const markdown = renderBriefMarkdown(brief)
    expect(markdown).toContain('# Cognitive Brief')
    expect(markdown).toContain('## Lines (drift)')
    expect(markdown).toContain('## Moments (eureka candidates)')
    expect(markdown).toContain('## Transitions (the Yes that emerged)')
    expect(markdown).toContain('## Open loops')
    expect(markdown).toContain('## Your words (the L2 layer)')
    expect(markdown).toContain('## Boundary questions')
    expect(markdown).toContain('idea-a')
    expect(markdown).toContain('idea-b')
  })

  it('honors the project scope', () => {
    const scoped = deriveBrief(ALL, WIKI, { ...WINDOW, projectId: 'p2' }, NOW)
    expect(scoped.lines.every(line => line.id.startsWith('project:p2') || line.id === 'project:p2')).toBe(true)
  })
})

describe('lineInferenceCard (L1 epistemic schema)', () => {
  it('carries evidence paths, confidence, and the person-boundary guard', () => {
    const lines = deriveLines(ALL, WIKI, WINDOW, NOW)
    const alpha = lines.find(line => line.id === 'idea-a')
    const card = lineInferenceCard(alpha as Parameters<typeof lineInferenceCard>[0], '2026-08-27T00:00:00Z')
    expect(card.kind).toBe('drift')
    expect(card.mutable).toBe(false)
    // I2: the window's mass is E0, so even a dominant line's confidence
    // caps at medium — comparative certainty needs E1 mass (tier e0+e1).
    expect(card.confidence).toBe('medium')
    expect(card.evidencePaths).toEqual(alpha?.evidence)
    expect(card.boundaries.mustNotClaim.join(' ')).toContain('only about the work')
    expect(card.id).toContain('idea-a')
  })
})

describe('deriveNarrative (the L2 layer)', () => {
  it('collects only non-blank journal texts, in time order, with their scopes', () => {
    const stream = [
      ev('2026-08-26T13:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, {}),
      ev('2026-08-26T12:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, { text: '   ' }),
      ev('2026-08-26T10:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, { text: '先把检索丢掉试试' }),
      ev('2026-08-26T11:00:00Z', JOURNAL_ACTION, { ideaId: 'idea-c' }, { text: '这条线值得再推一周' }),
    ]
    const narrative = deriveNarrative(stream)
    expect(narrative).toHaveLength(2)
    expect(narrative[0]).toMatchObject({ lineId: null, projectId: 'p1', text: '先把检索丢掉试试' })
    expect(narrative[1]).toMatchObject({ lineId: 'idea-c', projectId: null, text: '这条线值得再推一周' })
    expect(narrative.map(entry => entry.text)).toEqual(['先把检索丢掉试试', '这条线值得再推一周'])
  })

  it('never moves a line: a journal event leaves ids and drift untouched', () => {
    const before = deriveLines(ALL, WIKI, WINDOW, NOW)
    const withJournal = [
      ...ALL,
      ev('2026-08-26T10:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, { text: 'L2 永远不算证据' }),
    ]
    const after = deriveLines(withJournal, WIKI, WINDOW, NOW)
    expect(after.map(line => line.id)).toEqual(before.map(line => line.id))
    for (const line of before) {
      const moved = after.find(candidate => candidate.id === line.id)
      expect(moved?.drift).toBeCloseTo(line.drift, 3)
    }
  })

  it('feeds the brief: one journal line lands in the narrative and the Markdown', () => {
    const withJournal = [
      ...ALL,
      ev('2026-08-26T10:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, { text: '这条线起来了' }),
    ]
    const brief = deriveBrief(withJournal, WIKI, WINDOW, NOW)
    expect(brief.narrative).toHaveLength(1)
    const markdown = renderBriefMarkdown(brief)
    expect(markdown).toContain('## Your words (the L2 layer)')
    expect(markdown).toContain('这条线起来了')
  })

  it('renders the empty state when no words are written', () => {
    const markdown = renderBriefMarkdown(deriveBrief(ALL, WIKI, WINDOW, NOW))
    expect(markdown).toContain('_No words yet — the map is yours to write on._')
  })

  it('carries self-reported mood ratings through, junk values dropped', () => {
    const tagged = [ev('2026-08-26T10:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, { text: '有点乱但兴奋', valence: 3, arousal: 5 })]
    const narrative = deriveNarrative(tagged)
    expect(narrative[0]?.valence).toBe(3)
    expect(narrative[0]?.arousal).toBe(5)
    const markdown = renderBriefMarkdown(deriveBrief(tagged, WIKI, WINDOW, NOW))
    expect(markdown).toContain('(valence 3 · arousal 5)')
    // L0 junk never crosses: out-of-range ratings are dropped, not clamped.
    const junkEvents = [
      ev('2026-08-26T10:00:00Z', JOURNAL_ACTION, { projectId: 'p1' }, { text: '乱数据', valence: 9, arousal: 'high' }),
    ]
    const junk = deriveNarrative(junkEvents)
    expect(junk[0]?.valence).toBeUndefined()
    expect(junk[0]?.arousal).toBeUndefined()
    expect(renderBriefMarkdown(deriveBrief(junkEvents, WIKI, WINDOW, NOW))).not.toContain('valence')
  })
})

describe('claimsOf (I2 tier gate)', () => {
  it('stays wordless below the floor, descriptive at E0, comparative only with window mass', () => {
    expect(claimsOf(4, 1000)).toBe('silent')
    expect(claimsOf(5, 10)).toBe('e0')
    expect(claimsOf(19, 1000)).toBe('e0')
    expect(claimsOf(20, 99)).toBe('e0')
    expect(claimsOf(20, 100)).toBe('e0+e1')
  })

  it('marks lines with their tier and keeps silent lines wordless end to end', () => {
    // Four events on one idea: below the floor, whatever their drift.
    const quiet = [
      ev('2026-08-20T00:00:00Z', 'knowledge.idea.added', { ideaId: 'idea-q' }),
      ev('2026-08-21T00:00:00Z', 'experiments.saved', { ideaId: 'idea-q' }),
      ev('2026-08-22T00:00:00Z', 'experiments.saved', { ideaId: 'idea-q' }),
      ev('2026-08-23T00:00:00Z', 'experiments.saved', { ideaId: 'idea-q' }),
    ]
    const lines = deriveLines(quiet, WIKI, WINDOW, NOW)
    const lane = lines.find(line => line.id === 'idea-q')
    expect(lane?.tier).toBe('silent')
    // No boundary question for a wordless line (I2: the map stays quiet).
    expect(deriveQuestions(lines, WIKI).some(question => question.lineId === 'idea-q')).toBe(false)
    // The card carries no state claim either — the floor is the floor.
    const card = lineInferenceCard(lane as Parameters<typeof lineInferenceCard>[0], '2026-08-27T00:00:00Z')
    expect(card.statement).toContain('below the evidence floor')
    expect(card.confidence).toBe('low')
    // A line that clears the floor (idea-a, five events) speaks at E0.
    const all = deriveLines(ALL, WIKI, WINDOW, NOW)
    expect(all.find(line => line.id === 'idea-a')?.tier).toBe('e0')
  })
})
