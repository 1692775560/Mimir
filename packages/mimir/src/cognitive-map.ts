/**
 * Cognitive Beidou Engine for Research (CBE): the derived, read-only
 * "cognitive map" layer over the append-only ledger. Every function is pure
 * over (events, wiki records, window, now) — no I/O, no mutation, fully
 * re-derivable — so the layer is L1 inference in the epistemic architecture:
 * L0 facts stay in the immutable `events` table, L1 never persists as fact,
 * and L2 (narrative) is writable only by the user (a future `journal.*`
 * event, out of scope for this module).
 *
 * Drift-Diffusion mapping (see MIMIR-COGNITIVE-BEIDOU.zh.md, internal):
 *  - evidence      = one ledger event carrying a signed weight (§ LINE_WEIGHTS)
 *  - drift (μ)     = time-decayed weighted sum of a line's evidence
 *  - dispersion (σ) = population standard deviation of the line's signed weights
 *  - boundaries    = the research's own decision institutions
 *                    (`knowledge.idea.failed`, `knowledge.idea.adopted`,
 *                    `knowledge.claim.set` terminal)
 *  - decision time = first-seen → boundary crossing, in days
 *
 * Lines are wiki ideas (explicit lines) and, for events that carry only a
 * project reference, the project itself (`project:<id>`). Events without
 * either reference still participate in session/moment analysis but not in
 * line attribution.
 * @module dsh-mimir/src/cognitive-map
 */

import type {
  ClaimRecord,
  EventRecord,
  IdeaRecord,
  LedgerJsonValue,
  ProjectRecord,
} from './types.ts'

/** Half-life (days) of the drift decay: a week-old investment weighs half. */
export const CBE_HALF_LIFE_DAYS = 7
/** Minutes of inactivity that split one session from the next. */
export const CBE_SESSION_GAP_MINUTES = 30
/** Drift at/above which a line is the dominant direction (main road). */
export const CBE_DOMINANT_DRIFT = 4
/** Drift at/below which a line is stalled (negated). */
export const CBE_STALLED_DRIFT = -2
/** Event count that marks a noisy, direction-less line as exploring. */
export const CBE_EXPLORE_EVENTS = 4
/** Returning sessions that mark a low-drift line as a persistent side road. */
export const CBE_RETURN_SESSIONS = 2
/** Dispersion at/below which positive drift reads as focused (converging). */
export const CBE_FOCUS_DISPERSION = 1
/** How many event ids a line keeps as evidence (newest first). */
export const CBE_LINE_EVIDENCE_CAP = 20
/** The cap on boundary questions per brief. */
export const CBE_QUESTION_CAP = 5

/**
 * The brief's derivation version (I5): bump — and only bump — when any
 * registered, derivation-affecting parameter changes. The brief carries it
 * and the view shows the re-calibration notice when it moves, so a changed
 * number is never silently reinterpreted as a changed life.
 */
export const CBE_DERIVATION_VERSION = 2

/** Below this many line events a line stays wordless (the I2 evidence floor). */
export const CBE_TIER_SILENT_LINE_EVENTS = 5
/** Line events required before E1 comparative language may appear (I2). */
export const CBE_TIER_E1_LINE_EVENTS = 20
/** Window events required before E1 comparative language may appear (I2). */
export const CBE_TIER_E1_USER_EVENTS = 100

const MS_PER_DAY = 86_400_000

/**
 * The signed weight of one action on its line, over the REAL ledger
 * vocabulary (all 25 decision-grade actions). Outcomes that sign by payload
 * (`compute.job.settled`, `knowledge.claim.set`) resolve in
 * {@link signedWeight}. Actions absent here weigh 0 (meta events like
 * `data.wiki.*` never move a line — and neither does the journal: `journal.*`
 * is the L2 layer, read by the map as the user's own words, never signed as
 * evidence).
 */
export const LINE_WEIGHTS: Readonly<Record<string, number>> = {
  'knowledge.idea.added': 2,
  'experiments.saved': 1.5,
  'compute.job.settled': 1,
  'literature.paper.imported': 1,
  'literature.pdf.fetched': 0.5,
  'writing.paper.reordered': 0.5,
  'writing.bib.saved': 0.5,
  'writing.bib.imported': 0.5,
  'literature.paper.removed': -1,
  'experiments.server.relinked': -0.5,
  'figures.deleted': -0.5,
  'compute.server.deleted': -0.5,
  'experiments.deleted': -1.5,
  'knowledge.idea.failed': -2.5,
  'knowledge.idea.adopted': 2.5, // the merge: the positive terminal, symmetric weight of the close
}

/** The boundary-crossing actions: the research's own decision institutions. */
export const TERMINAL_ACTIONS: ReadonlySet<string> = new Set([
  'knowledge.idea.failed',
  'knowledge.idea.adopted',
  'knowledge.claim.set',
])

/** Creation-class actions: the eureka detector requires at least one per session. */
export const CREATION_ACTIONS: ReadonlySet<string> = new Set([
  'knowledge.idea.added',
  'knowledge.claim.added',
  'literature.paper.imported',
  'experiments.saved',
  'figures.saved',
  'writing.paper.reordered',
])

/** The one L2 action: a user-written journal line. It is the ONLY write path
 * the cognitive layer reads as narrative — never as evidence.
 */
export const JOURNAL_ACTION = 'journal.entry.added'

/**
 * The I4 reactivity meta events: the brief records its own questions'
 * lifecycle — when the map asked, and when the user answered — so the
 * shown-vs-never-shown comparison stays measurable (G3's natural
 * experiment). Meta events carry zero weight and never enter LINE_WEIGHTS.
 */
export const QUESTION_SHOWED_ACTION = 'cbe.question.showed'
export const QUESTION_ANSWERED_ACTION = 'cbe.question.answered'

/** The signed weight of one event on its line (outcome-aware). */
export function signedWeight(event: EventRecord): number {
  switch (event.action) {
    case 'compute.job.settled': {
      const status = typeof event.payload.status === 'string' ? event.payload.status : ''
      return status === 'succeeded' ? 1 : status === 'failed' ? -1 : 0
    }
    case 'knowledge.claim.set': {
      const status = typeof event.payload.status === 'string' ? event.payload.status : ''
      return status === 'supported' ? 2 : status === 'invalidated' ? -2 : 0
    }
    default:
      return LINE_WEIGHTS[event.action] ?? 0
  }
}

/**
 * The evidence tier one line's words may wear (constitution I2): below the
 * floor a line stays WORDLESS (no state claims at all); with enough line
 * and window mass, E1 comparative language becomes allowed. The thresholds
 * are provisional in the PARAMETER_REGISTRY until G1.
 * @param lineEventCount - events attributed to the line in the window.
 * @param userEventCount - all events in the window (the window's mass).
 * @returns the highest tier the line's rendering may wear.
 */
export function claimsOf(lineEventCount: number, userEventCount: number): CbeEvidenceTier {
  if (lineEventCount < CBE_TIER_SILENT_LINE_EVENTS) return 'silent'
  if (lineEventCount < CBE_TIER_E1_LINE_EVENTS) return 'e0'
  if (userEventCount < CBE_TIER_E1_USER_EVENTS) return 'e0'
  return 'e0+e1'
}

/** One wiki table bundle the pure functions read (assembled by the service). */
export interface CbeWikiSnapshot {
  readonly ideas: readonly IdeaRecord[]
  readonly claims: readonly ClaimRecord[]
  readonly projects: readonly ProjectRecord[]
}

/** The brief's window: ISO-8601 bounds, `until` exclusive, project scope optional. */
export interface CbeBriefWindow {
  readonly since: string
  readonly until: string
  readonly projectId: string | null
}

/** A line's DDM-lite state. */
export type CbeLineState =
  | 'settled'
  | 'dominant'
  | 'stalled'
  | 'converging'
  | 'returning-side'
  | 'exploring'

/**
 * The evidence tier a line's words may wear (I2): `silent` = wordless
 * below the floor, `e0` = descriptive only, `e0+e1` = comparative allowed.
 */
export type CbeEvidenceTier = 'silent' | 'e0' | 'e0+e1'

/** One research line's derived state (L1: re-derivable, never a fact). */
export interface CbeLine {
  /** Idea id, or `project:<id>` for project-level events. */
  readonly id: string
  /** Idea/project title when the wiki record is present. */
  readonly label: string
  readonly firstSeen: string
  readonly lastSeen: string
  readonly eventCount: number
  /** Time-decayed drift score (the μ estimate). */
  readonly drift: number
  /** Dispersion of signed evidence (the σ estimate). */
  readonly dispersion: number
  /** Sessions that touched the line (the return-frequency signature). */
  readonly returnSessions: number
  /** Days from first-seen to the boundary crossing; null while open. */
  readonly decisionDays: number | null
  /** The crossing event id, when the line has settled. */
  readonly settledBy: string | null
  readonly state: CbeLineState
  /** The highest evidence tier this line's rendering may wear (I2). */
  readonly tier: CbeEvidenceTier
  /** Newest-first evidence (capped at {@link CBE_LINE_EVIDENCE_CAP}). */
  readonly evidence: readonly string[]
}

/** One eureka candidate: a behavior burst with a creation-class event inside. */
export interface CbeMoment {
  readonly from: string
  readonly to: string
  readonly eventCount: number
  readonly creationCount: number
  /** The session's event ids (the evidence). */
  readonly evidence: readonly string[]
  /** The window's median session size (the baseline). */
  readonly baseline: number
}

/** One status transition read off the ledger (the Yes that emerged). */
export interface CbeTransition {
  readonly kind: 'idea' | 'claim'
  readonly id: string
  readonly to: string
  readonly ts: string
  readonly evidence: readonly string[]
}

/** A started-but-not-closed thread (known-unknown quadrant). */
export type CbeOpenLoopKind = 'job-unsettled' | 'compile-unresolved'
export interface CbeOpenLoop {
  readonly kind: CbeOpenLoopKind
  /** Job id, or project id for compile loops. */
  readonly refId: string
  /** The opening event id. */
  readonly openedBy: string
  readonly openedAt: string
}

/** A boundary confirmation question (the No→Yes step; UI renders the locale copy). */
export type CbeQuestionKind = 'returning-branch' | 'pending-claim'
export interface CbeBoundaryQuestion {
  readonly kind: CbeQuestionKind
  readonly lineId: string
  readonly evidence: readonly string[]
}

/**
 * One user-written journal line (the L2 layer): narrative ONLY the user
 * authored, read by the map for the brief but never weighed as evidence.
 * The optional mood ratings are SELF-REPORTED (the user's own words about
 * their state) — never inferred; L1 refuses to estimate them.
 */
export interface CbeNarrative {
  readonly id: string
  readonly ts: string
  /** The user's own words, verbatim. */
  readonly text: string
  /** The line the entry was written against, or null when unscoped. */
  readonly lineId: string | null
  /** The project the entry was written under, or null when unscoped. */
  readonly projectId: string | null
  /** Self-reported valence rating (1–5), when the user chose to tag one. */
  readonly valence?: number | undefined
  /** Self-reported arousal rating (1–5), when the user chose to tag one. */
  readonly arousal?: number | undefined
}

/** The composed brief model (the roadbook's data layer). */
export interface CbeBrief {
  readonly window: CbeBriefWindow
  readonly lines: readonly CbeLine[]
  readonly moments: readonly CbeMoment[]
  readonly transitions: readonly CbeTransition[]
  readonly openLoops: readonly CbeOpenLoop[]
  readonly questions: readonly CbeBoundaryQuestion[]
  /** The user's L2 journal lines of the stream, in time order. */
  readonly narrative: readonly CbeNarrative[]
}

/** One L1 inference card (DeepScientist-borrowed epistemic schema). */
export interface InferenceCard {
  readonly id: string
  readonly kind: 'drift' | 'moment'
  readonly statement: string
  readonly confidence: 'low' | 'medium' | 'high'
  /** Ledger event ids backing the inference. */
  readonly evidencePaths: readonly string[]
  readonly boundaries: {
    readonly observedFacts: readonly string[]
    readonly allowedInterpretations: readonly string[]
    readonly mustNotClaim: readonly string[]
    readonly evidenceGaps: readonly string[]
  }
  readonly derivedAt: string
  readonly mutable: false
}

interface Attributed {
  readonly id: string
  readonly weight: number
  readonly isTerminal: boolean
  readonly tsMs: number
  readonly sessionId: number
}

/** Parse one ISO-8601 timestamp to epoch ms (NaN → null). */
function tsToMs(ts: string): number | null {
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

/** Round to 3 decimals for stable rendering/serialization. */
function r3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Cut an ASCENDING event stream into sessions (gap > {@link CBE_SESSION_GAP_MINUTES}
 * splits). Returns one session index per event id.
 */
function sessionize(events: readonly EventRecord[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  let current = 0
  let previous: number | null = null
  for (const event of events) {
    const ms = tsToMs(event.ts)
    if (ms === null) continue
    if (previous !== null && ms - previous > CBE_SESSION_GAP_MINUTES * 60_000) current += 1
    out.set(event.id, current)
    previous = ms
  }
  return out
}

/** Median of a numeric list (even length → mean of the two middle values). */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** Terminal only when the outcome actually decided (claim `set` to a terminal status). */
function weightIsOutcomeTerminal(event: EventRecord): boolean {
  if (event.action === 'knowledge.idea.failed') return true
  if (event.action === 'knowledge.idea.adopted') return true
  const status = typeof event.payload.status === 'string' ? event.payload.status : ''
  return status === 'supported' || status === 'invalidated'
}

/**
 * Derive the lines' DDM-lite states from the window's events.
 * @param events - ledger events, ANY order (sorted internally by ts, then id).
 * @param wiki - the wiki tables the labels and idea birthdates come from.
 * @param window - the ISO bounds; the `projectId` scope is applied here.
 * @param nowMs - "now" in epoch ms (injectable for determinism).
 * @returns lines sorted by drift descending (ties: label ascending).
 */
export function deriveLines(
  events: readonly EventRecord[],
  wiki: CbeWikiSnapshot,
  window: CbeBriefWindow,
  nowMs: number,
): readonly CbeLine[] {
  const ideaLabel = new Map(wiki.ideas.map(idea => [idea.id, idea.title]))
  const projectLabel = new Map(wiki.projects.map(project => [project.id, project.title]))

  const ordered = events
    .filter(event => {
      if (window.projectId !== null && event.refs.projectId !== window.projectId) return false
      return event.ts >= window.since && event.ts < window.until
    })
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
  const sessions = sessionize(ordered)
  // The window's total mass feeds the I2 tier: comparative language needs
  // both enough line events and enough window events.
  const userEventCount = ordered.length

  const lineEvents = new Map<string, Attributed[]>()
  for (const event of ordered) {
    const ideaId = event.refs.ideaId
    const projectId = event.refs.projectId
    const lineId = ideaId ?? (projectId !== undefined ? `project:${projectId}` : null)
    if (lineId === null) continue
    const ms = tsToMs(event.ts)
    const session = sessions.get(event.id)
    if (ms === null || session === undefined) continue
    const list = lineEvents.get(lineId) ?? []
    list.push({
      id: event.id,
      weight: signedWeight(event),
      isTerminal: TERMINAL_ACTIONS.has(event.action) && weightIsOutcomeTerminal(event),
      tsMs: ms,
      sessionId: session,
    })
    lineEvents.set(lineId, list)
  }

  const lines: CbeLine[] = []
  for (const [lineId, attributed] of [...lineEvents.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    attributed.sort((a, b) => a.tsMs - b.tsMs)
    const evidence = [...attributed].sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, CBE_LINE_EVIDENCE_CAP)
      .map(item => item.id)
    const first = attributed[0]
    const last = attributed[attributed.length - 1]
    if (first === undefined || last === undefined) continue
    const firstMs = first.tsMs
    const lastMs = last.tsMs
    const drift = attributed.reduce(
      (sum, item) => sum + item.weight * Math.exp(-Math.LN2 * (nowMs - item.tsMs) / (CBE_HALF_LIFE_DAYS * MS_PER_DAY)),
      0,
    )
    const mean = attributed.reduce((sum, item) => sum + item.weight, 0) / attributed.length
    const dispersion = Math.sqrt(
      attributed.reduce((sum, item) => sum + (item.weight - mean) ** 2, 0) / attributed.length,
    )
    const sessionsTouched = new Set(attributed.map(item => item.sessionId)).size
    const terminal = attributed.find(item => item.isTerminal) ?? null

    const birthIso = wiki.ideas.find(idea => idea.id === lineId)?.createdAt
    const birthMs = birthIso === undefined ? null : tsToMs(birthIso)
    const decisionDays = terminal === null || birthMs === null
      ? null
      : Math.max(0, (terminal.tsMs - Math.min(firstMs, birthMs)) / MS_PER_DAY)

    const state: CbeLineState =
      terminal !== null ? 'settled'
      : drift >= CBE_DOMINANT_DRIFT ? 'dominant'
      : drift <= CBE_STALLED_DRIFT ? 'stalled'
      : drift > 0 && dispersion <= CBE_FOCUS_DISPERSION ? 'converging'
      : Math.abs(drift) < 2 && sessionsTouched >= CBE_RETURN_SESSIONS ? 'returning-side'
      : 'exploring'

    const isProjectLine = lineId.startsWith('project:')
    const rawId = isProjectLine ? lineId.slice('project:'.length) : lineId
    const label = isProjectLine ? (projectLabel.get(rawId) ?? lineId) : (ideaLabel.get(rawId) ?? lineId)

    lines.push(Object.freeze({
      id: lineId,
      label,
      firstSeen: new Date(firstMs).toISOString(),
      lastSeen: new Date(lastMs).toISOString(),
      eventCount: attributed.length,
      drift: r3(drift),
      dispersion: r3(dispersion),
      returnSessions: sessionsTouched,
      decisionDays: decisionDays === null ? null : r3(decisionDays),
      settledBy: terminal === null ? null : terminal.id,
      state,
      tier: claimsOf(attributed.length, userEventCount),
      evidence: Object.freeze(evidence),
    }))
  }

  return Object.freeze(
    lines.sort((a, b) => b.drift - a.drift || a.label.localeCompare(b.label)),
  )
}

/**
 * Detect eureka candidates: sessions whose size beats `2 × median + 1` and
 * which contain at least one creation-class event.
 * @param events - ledger events, any order.
 * @param window - the ISO bounds (project scope applied).
 * @returns candidates in time order.
 */
export function detectMoments(
  events: readonly EventRecord[],
  window: CbeBriefWindow,
): readonly CbeMoment[] {
  const inWindow = events
    .filter(event => {
      if (window.projectId !== null && event.refs.projectId !== window.projectId) return false
      return event.ts >= window.since && event.ts < window.until
    })
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
  const sessions = sessionize(inWindow)

  const bySession = new Map<number, EventRecord[]>()
  for (const event of inWindow) {
    const index = sessions.get(event.id)
    if (index === undefined) continue
    const list = bySession.get(index) ?? []
    list.push(event)
    bySession.set(index, list)
  }

  const baseline = median([...bySession.values()].map(list => list.length))
  const moments: CbeMoment[] = []
  for (const [, list] of [...bySession.entries()].sort((a, b) => a[0] - b[0])) {
    if (list.length < 2 * baseline + 1) continue
    const creationCount = list.filter(event => CREATION_ACTIONS.has(event.action)).length
    if (creationCount < 1) continue
    const first = list[0]
    const last = list[list.length - 1]
    if (first === undefined || last === undefined) continue
    moments.push(Object.freeze({
      from: first.ts,
      to: last.ts,
      eventCount: list.length,
      creationCount,
      evidence: Object.freeze(list.map(event => event.id)),
      baseline: r3(baseline),
    }))
  }
  return Object.freeze(moments)
}

/** Read the status transitions (the Yes that emerged from the No's). */
export function deriveTransitions(events: readonly EventRecord[]): readonly CbeTransition[] {
  const transitions: CbeTransition[] = []
  for (const event of [...events].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))) {
    if (event.action === 'knowledge.idea.failed' && event.refs.ideaId !== undefined) {
      transitions.push(Object.freeze({
        kind: 'idea' as const,
        id: event.refs.ideaId,
        to: 'failed',
        ts: event.ts,
        evidence: Object.freeze([event.id]),
      }))
    } else if (event.action === 'knowledge.claim.set' && event.refs.claimId !== undefined) {
      const status = typeof event.payload.status === 'string' ? event.payload.status : ''
      if (status === 'supported' || status === 'invalidated') {
        transitions.push(Object.freeze({
          kind: 'claim' as const,
          id: event.refs.claimId,
          to: status,
          ts: event.ts,
          evidence: Object.freeze([event.id]),
        }))
      }
    }
  }
  return Object.freeze(transitions)
}

/**
 * The open loops (known-unknown quadrant): a submitted job with no settled
 * event for its id, and a project whose LAST compile in the stream still
 * carries issues.
 */
export function deriveOpenLoops(events: readonly EventRecord[]): readonly CbeOpenLoop[] {
  const ordered = [...events].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
  const settledJobs = new Set(
    ordered
      .filter(event => event.action === 'compute.job.settled' && event.refs.jobId !== undefined)
      .map(event => event.refs.jobId as string),
  )
  const loops: CbeOpenLoop[] = []
  for (const event of ordered) {
    if (event.action === 'compute.job.submitted' && event.refs.jobId !== undefined
      && !settledJobs.has(event.refs.jobId)) {
      loops.push(Object.freeze({
        kind: 'job-unsettled' as const,
        refId: event.refs.jobId,
        openedBy: event.id,
        openedAt: event.ts,
      }))
    }
  }
  const lastCompile = new Map<string, EventRecord>()
  for (const event of ordered) {
    if (event.action === 'writing.compile.settled' && event.refs.projectId !== undefined) {
      lastCompile.set(event.refs.projectId, event)
    }
  }
  for (const [projectId, event] of [...lastCompile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const issues = typeof event.payload.issues === 'number' ? event.payload.issues : 0
    if (issues > 0) {
      loops.push(Object.freeze({
        kind: 'compile-unresolved' as const,
        refId: projectId,
        openedBy: event.id,
        openedAt: event.ts,
      }))
    }
  }
  return Object.freeze(loops)
}

/**
 * The boundary confirmation questions (≤ {@link CBE_QUESTION_CAP}): each
 * `returning-side` line asks "keep or archive?"; each `pending` claim asks
 * for a ruling.
 */
export function deriveQuestions(
  lines: readonly CbeLine[],
  wiki: CbeWikiSnapshot,
): readonly CbeBoundaryQuestion[] {
  const questions: CbeBoundaryQuestion[] = []
  for (const line of lines) {
    // I2: a wordless line gets no question either — asking "keep or
    // archive?" about a line with fewer than five events would be the map
    // speaking where it must stay silent.
    if (line.state !== 'returning-side' || line.tier === 'silent') continue
    questions.push(Object.freeze({
      kind: 'returning-branch' as const,
      lineId: line.id,
      evidence: Object.freeze(line.evidence),
    }))
  }
  for (const claim of wiki.claims) {
    if (claim.status !== 'pending') continue
    questions.push(Object.freeze({
      kind: 'pending-claim' as const,
      lineId: claim.id,
      evidence: Object.freeze([]),
    }))
  }
  return Object.freeze(questions.slice(0, CBE_QUESTION_CAP))
}

/**
 * Read one self-reported mood rating off a journal payload: only a safe
 * integer within 1–5 counts (the pure layer guards against junk L0 data).
 */
function moodRating(value: LedgerJsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 5
    ? value
    : undefined
}

/**
 * Derive the L2 layer: the user's journal lines, in (ts, id) order. An entry
 * counts only when its `payload.text` is a non-blank string; the line and
 * project scopes ride the event's refs (`ideaId` maps to the line id).
 * Journal events never enter {@link deriveLines} — L2 is read by the map,
 * never signed as evidence.
 * @param events - ledger events, any order.
 * @returns the narrative entries, oldest first, frozen.
 */
export function deriveNarrative(events: readonly EventRecord[]): readonly CbeNarrative[] {
  const entries = [...events]
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))
    .filter(event => event.action === JOURNAL_ACTION)
    .flatMap(event => {
      const text = event.payload.text
      if (typeof text !== 'string' || text.trim() === '') return []
      const valence = moodRating(event.payload.valence)
      const arousal = moodRating(event.payload.arousal)
      return [Object.freeze({
        id: event.id,
        ts: event.ts,
        text,
        lineId: event.refs.ideaId ?? null,
        projectId: event.refs.projectId ?? null,
        ...(valence === undefined ? {} : { valence }),
        ...(arousal === undefined ? {} : { arousal }),
      })]
    })
  return Object.freeze(entries)
}

/** Compose the full brief model (the pure core of the roadbook). */
export function deriveBrief(
  events: readonly EventRecord[],
  wiki: CbeWikiSnapshot,
  window: CbeBriefWindow,
  nowMs: number,
): CbeBrief {
  const lines = deriveLines(events, wiki, window, nowMs)
  return Object.freeze({
    window: Object.freeze({ ...window }),
    lines,
    moments: detectMoments(events, window),
    transitions: deriveTransitions(events),
    openLoops: deriveOpenLoops(events),
    questions: deriveQuestions(lines, wiki),
    narrative: deriveNarrative(events),
  })
}

/**
 * Render one line's state as an L1 inference card (DeepScientist-borrowed
 * epistemic schema: evidence paths + confidence + four-part boundaries).
 * The card is ALWAYS derived (`mutable: false`) — L1 never persists as fact.
 */
export function lineInferenceCard(line: CbeLine, derivedAt: string): InferenceCard {
  const byState: Record<CbeLineState, string> = {
    settled: `line "${line.label}" crossed its boundary (decision time ${line.decisionDays ?? '?'} days)`,
    dominant: `line "${line.label}" is the dominant direction (drift ${line.drift})`,
    stalled: `line "${line.label}" is being negated (drift ${line.drift})`,
    converging: `line "${line.label}" shows focused positive investment (drift ${line.drift}, σ ${line.dispersion})`,
    'returning-side': `line "${line.label}" is revisited despite near-zero drift — a persistent side road`,
    exploring: `line "${line.label}" is directionless so far (${line.eventCount} events)`,
  }
  const confidence: Record<CbeLineState, 'low' | 'medium' | 'high'> = {
    settled: 'high',
    dominant: 'high',
    stalled: 'medium',
    converging: 'medium',
    'returning-side': 'medium',
    exploring: 'low',
  }
  // I2 in the card: a wordless line carries no state claim at all, and an
  // E0 line's confidence is capped — comparative certainty needs E1 mass.
  const statement = line.tier === 'silent'
    ? `line "${line.label}": ${line.eventCount} events — below the evidence floor (${CBE_TIER_SILENT_LINE_EVENTS}); no state words yet`
    : byState[line.state]
  const tierCap: Record<CbeEvidenceTier, 'low' | 'medium' | 'high'> = {
    silent: 'low',
    e0: 'medium',
    'e0+e1': 'high',
  }
  const rankOf = (value: 'low' | 'medium' | 'high'): number =>
    value === 'high' ? 2 : value === 'medium' ? 1 : 0
  const cappedConfidence = rankOf(confidence[line.state]) <= rankOf(tierCap[line.tier])
    ? confidence[line.state]
    : tierCap[line.tier]
  const mustNotClaim = [
    'nothing about the user as a person (schedule, mood, identity) — only about the work',
    'no causal claims beyond the recorded evidence',
    ...(line.tier === 'e0' ? ['E0 tier: descriptive only — comparative language would outrun the data'] : []),
  ]
  return Object.freeze({
    id: `cbe-card:${line.id}:${line.lastSeen}`,
    kind: 'drift' as const,
    statement,
    confidence: cappedConfidence,
    evidencePaths: Object.freeze(line.evidence),
    boundaries: Object.freeze({
      observedFacts: Object.freeze([
        `${line.eventCount} events reference the line between ${line.firstSeen} and ${line.lastSeen}`,
        `time-decayed drift ${line.drift}, dispersion ${line.dispersion}, ${line.returnSessions} sessions`,
      ]),
      allowedInterpretations: Object.freeze([statement]),
      mustNotClaim: Object.freeze(mustNotClaim),
      evidenceGaps: Object.freeze([
        line.eventCount > CBE_LINE_EVIDENCE_CAP
          ? `${line.eventCount - CBE_LINE_EVIDENCE_CAP} older events omitted by the evidence cap`
          : 'no self-report: the inference rests on behavior alone',
      ]),
    }),
    derivedAt,
    mutable: false,
  })
}

/** Render one brief as Markdown (the progress report's sibling sheet). */
export function renderBriefMarkdown(brief: CbeBrief): string {
  const lines: string[] = []
  lines.push('# Cognitive Brief')
  lines.push('')
  lines.push(`- Window: ${brief.window.since} → ${brief.window.until}`)
  lines.push(`- Scope: ${brief.window.projectId === null ? 'all projects' : brief.window.projectId}`)
  lines.push(`- Derivation: v${CBE_DERIVATION_VERSION}`)
  lines.push(`- Lines: ${brief.lines.length} · Moments: ${brief.moments.length} · Open loops: ${brief.openLoops.length}`)
  lines.push('')
  lines.push('## Lines (drift)')
  lines.push('')
  if (brief.lines.length === 0) {
    lines.push('_No line-attributable events in the window._')
  } else {
    lines.push('| Line | State | Tier | Drift | σ | Events | Return sessions | Decision (days) |')
    lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |')
    for (const line of brief.lines) {
      // id in a code span so the agent can reference the line stably; label for the human
      lines.push(
        `| \`${line.id}\` ${line.label} | ${line.state} | ${line.tier} | ${line.drift} | ${line.dispersion} | ${line.eventCount} | ${line.returnSessions} | ${line.decisionDays === null ? '—' : line.decisionDays} |`,
      )
    }
  }
  lines.push('')
  lines.push('## Moments (eureka candidates)')
  lines.push('')
  if (brief.moments.length === 0) {
    lines.push('_No behavior bursts above baseline._')
  } else {
    for (const moment of brief.moments) {
      lines.push(
        `- ${moment.from} → ${moment.to}: ${moment.eventCount} events (baseline ${moment.baseline}), ${moment.creationCount} creation-class`,
      )
    }
  }
  lines.push('')
  lines.push('## Transitions (the Yes that emerged)')
  lines.push('')
  if (brief.transitions.length === 0) {
    lines.push('_No status transitions in the stream._')
  } else {
    for (const transition of brief.transitions) {
      lines.push(`- \`${transition.kind} ${transition.id}\` → **${transition.to}** (${transition.ts})`)
    }
  }
  lines.push('')
  lines.push('## Open loops')
  lines.push('')
  if (brief.openLoops.length === 0) {
    lines.push('_Nothing left dangling._')
  } else {
    for (const loop of brief.openLoops) {
      lines.push(`- ${loop.kind}: \`${loop.refId}\` since ${loop.openedAt}`)
    }
  }
  lines.push('')
  lines.push('## Your words (the L2 layer)')
  lines.push('')
  if (brief.narrative.length === 0) {
    lines.push('_No words yet — the map is yours to write on._')
  } else {
    for (const entry of brief.narrative) {
      const line = entry.lineId === null ? '' : `\`${entry.lineId}\` `
      // Self-reported ratings render as-is: recorded, never interpreted.
      const mood = [
        entry.valence === undefined ? null : `valence ${entry.valence}`,
        entry.arousal === undefined ? null : `arousal ${entry.arousal}`,
      ].filter(part => part !== null)
      const suffix = mood.length === 0 ? '' : ` (${mood.join(' · ')})`
      lines.push(`- ${entry.ts} ${line}> ${entry.text}${suffix}`)
    }
  }
  lines.push('')
  lines.push('## Boundary questions')
  lines.push('')
  if (brief.questions.length === 0) {
    lines.push('_No questions this window._')
  } else {
    for (const question of brief.questions) {
      lines.push(`- [${question.kind}] \`${question.lineId}\``)
    }
  }
  return lines.join('\n') + '\n'
}
