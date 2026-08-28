/**
 * Ledger domain module: the Remote-facing verbs over the append-only growth
 * record — the event query and the progress-report render. The domain logic
 * (event persistence, filtering, report assembly) lives in `../ledger.ts`;
 * this module adds the runtime guards and the `ResearchResult` union shape,
 * matching the other modules under `./services`.
 * @module dsh-mimir/src/services/ledger
 */

import type { ResearchWikiDomain } from '../store.ts'
import {
  appendEvent,
  buildProgressReport,
  emitEvent,
  JOURNAL_TEXT_MAX_CHARS,
  LIST_EVENTS_MAX_LIMIT,
  listEvents,
  PANEL_ACTOR,
} from '../ledger.ts'
import { deriveBrief, JOURNAL_ACTION, QUESTION_ANSWERED_ACTION, QUESTION_SHOWED_ACTION, renderBriefMarkdown, CBE_DERIVATION_VERSION } from '../cognitive-map.ts'
import type { CbeBriefWindow, CbeWikiSnapshot } from '../cognitive-map.ts'
import { evidenceModelAt, evidenceProfileOf } from '../cbe-engine.ts'
import { deriveForaging } from '../foraging.ts'
import {
  deriveWorktree,
  ideaParentEdges,
  IDEA_CLOSE_REASON_MAX_CHARS,
  IDEA_PARENT_ACTION,
  MAINLINE_ACTION,
} from '../worktree.ts'
import type {
  CbeMainlineDeclaration,
  CbeWorktreeLane,
} from '../worktree.ts'
import type {
  EventRefs,
  LedgerActorKind,
  ResearchAddJournalEntryResult,
  ResearchBriefQuestion,
  ResearchCloseIdeaResult,
  ResearchAdoptIdeaResult,
  ResearchGenerateBriefOptions,
  ResearchGenerateBriefResult,
  ResearchGetEvidenceProfileResult,
  ResearchGetForagingResult,
  ResearchGetWorktreeResult,
  ResearchListEventsResult,
  ResearchProgressReportOptions,
  ResearchProgressReportResult,
  ResearchSetIdeaParentResult,
  ResearchSetMainlineResult,
  ResearchWorktreeMainlineView,
  ResearchWorktreeView,
} from '../types.ts'
import { rejected, success } from './common.ts'

/** Everything the ledger domain functions need from the service scope. */
export interface LedgerDeps {
  /** Open research-wiki domain (the ledger's events table lives here). */
  readonly domain: ResearchWikiDomain
}

/**
 * Query the research ledger (the append-only growth record). Every field is
 * an optional filter: a project ref, an actor kind, an action prefix
 * (e.g. `compute.`), and ISO-8601 time bounds (`since` inclusive, `until`
 * exclusive). The result is capped (default 200, hard cap 1000) and ordered
 * by (ts, id); `order: 'desc'` inverts it. An illegal limit or an
 * unparseable bound is `invalid-input` — the ledger itself is never mutated
 * by this read.
 * @param deps - open wiki domain.
 * @param request - the optional filters.
 * @returns the matching events.
 */
export async function listEventsRemote(
  deps: LedgerDeps,
  request: {
    projectId?: string | undefined
    actorKind?: string | undefined
    actionPrefix?: string | undefined
    since?: string | undefined
    until?: string | undefined
    limit?: number | undefined
    order?: string | undefined
  },
): Promise<ResearchListEventsResult> {
  const kind = request.actorKind
  if (kind !== undefined && !(['user', 'agent', 'subagent', 'module', 'system'] as readonly string[]).includes(kind)) {
    return rejected({ code: 'invalid-input', message: `unknown actorKind: ${kind}` })
  }
  const order = request.order
  if (order !== undefined && order !== 'asc' && order !== 'desc') {
    return rejected({ code: 'invalid-input', message: `order must be 'asc' or 'desc', got '${order}'` })
  }
  try {
    const events = await listEvents(deps.domain, {
      ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
      ...(kind === undefined ? {} : { actorKind: kind as LedgerActorKind }),
      ...(request.actionPrefix === undefined ? {} : { actionPrefix: request.actionPrefix }),
      ...(request.since === undefined ? {} : { since: request.since }),
      ...(request.until === undefined ? {} : { until: request.until }),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
      ...(order === undefined ? {} : { order }),
    })
    return success({ events })
  } catch (error) {
    return rejected({
      code: 'invalid-input',
      message: error instanceof RangeError ? error.message : 'event filter is invalid',
    })
  }
}

/**
 * Render the research PROGRESS report (the transparent growth record) over
 * the ledger plus current wiki state: a TL;DR line, the full progress of the
 * window, the learning & judgment changes (claim transitions, idea failures
 * with reasons, review verdicts), the current state counts, the claim ledger
 * with each claim's last ledgered change, experiments & runs, and the
 * destructive-operations ledger as the closing risk footnote. A project id
 * scopes everything to that project (`project-not-found` for an unknown
 * id); time bounds are ISO-8601 (`since` inclusive, `until` exclusive) — a
 * recent window (e.g. 7 days) produces the weekly 组会 digest. The report is
 * a pure query — it writes nothing.
 * @param deps - open wiki domain.
 * @param request - the optional scope and bounds.
 * @returns the Markdown report plus the event count it covered.
 */
export async function generateProgressReportRemote(
  deps: LedgerDeps,
  request: {
    projectId?: string | undefined
    since?: string | undefined
    until?: string | undefined
  },
): Promise<ResearchProgressReportResult> {
  if (request.projectId !== undefined
    && deps.domain.table('projects').get(request.projectId) === undefined) {
    return rejected({ code: 'project-not-found', projectId: request.projectId })
  }
  const options: ResearchProgressReportOptions = {
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    ...(request.since === undefined ? {} : { since: request.since }),
    ...(request.until === undefined ? {} : { until: request.until }),
  }
  try {
    const [markdown, events] = await Promise.all([
      buildProgressReport(deps.domain, options),
      listEvents(deps.domain, {
        ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
        ...(options.since === undefined ? {} : { since: options.since }),
        ...(options.until === undefined ? {} : { until: options.until }),
        limit: LIST_EVENTS_MAX_LIMIT,
      }),
    ])
    return success({ markdown, generatedAt: new Date().toISOString(), eventCount: events.length })
  } catch (error) {
    return rejected({
      code: 'invalid-input',
      message: error instanceof RangeError ? error.message : 'report options are invalid',
    })
  }
}

/**
 * Render the COGNITIVE BRIEF (the DDM-lite roadbook) of one window: the
 * lines' drift states, the eureka candidates, the status transitions, the
 * open loops, the boundary questions — and, between the loops and the
 * questions, the user's own L2 journal lines. The boundary questions also
 * travel as structured, label-resolved rows ({@link ResearchBriefQuestion})
 * so the view can render them as interactive confirmation cards. Omitted
 * bounds open into the full history (`since` = epoch, `until` = now); an
 * unknown project id is `project-not-found`; an unparseable bound is
 * `invalid-input`. The brief is a pure query — it writes nothing (the L2
 * write path is {@link addJournalEntryRemote}).
 * @param deps - open wiki domain.
 * @param request - the optional scope and bounds.
 * @returns the Markdown brief, its interactive questions, and the event count.
 */
export async function generateBriefRemote(
  deps: LedgerDeps,
  request: {
    projectId?: string | undefined
    since?: string | undefined
    until?: string | undefined
  },
): Promise<ResearchGenerateBriefResult> {
  if (request.projectId !== undefined
    && deps.domain.table('projects').get(request.projectId) === undefined) {
    return rejected({ code: 'project-not-found', projectId: request.projectId })
  }
  const options: ResearchGenerateBriefOptions = {
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    ...(request.since === undefined ? {} : { since: request.since }),
    ...(request.until === undefined ? {} : { until: request.until }),
  }
  const window: CbeBriefWindow = {
    since: options.since ?? new Date(0).toISOString(),
    until: options.until ?? new Date().toISOString(),
    projectId: options.projectId ?? null,
  }
  try {
    const events = await listEvents(deps.domain, {
      ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
      ...(options.since === undefined ? {} : { since: options.since }),
      ...(options.until === undefined ? {} : { until: options.until }),
      limit: LIST_EVENTS_MAX_LIMIT,
    })
    const wiki: CbeWikiSnapshot = {
      ideas: [...deps.domain.table('ideas').entries()].map(([, record]) => record),
      claims: [...deps.domain.table('claims').entries()].map(([, record]) => record),
      projects: [...deps.domain.table('projects').entries()].map(([, record]) => record),
    }
    const brief = deriveBrief(events, wiki, window, Date.now())
    const questions = briefQuestions(brief, wiki)
    // I4 instrumentation: the map records that it asked — the meta event is
    // zero-weight (never in LINE_WEIGHTS) and best-effort, so the pure
    // query's contract only gains an observation line, never a failure.
    if (questions.length > 0) {
      await emitEvent(deps.domain, {
        actor: PANEL_ACTOR,
        action: QUESTION_SHOWED_ACTION,
        payload: { count: questions.length, lineIds: questions.map(question => question.lineId) },
      })
    }
    return success({
      markdown: renderBriefMarkdown(brief),
      generatedAt: new Date().toISOString(),
      eventCount: events.length,
      derivationVersion: CBE_DERIVATION_VERSION,
      questions,
    })
  } catch (error) {
    return rejected({
      code: 'invalid-input',
      message: error instanceof RangeError ? error.message : 'brief options are invalid',
    })
  }
}

/**
 * Validate one self-reported mood rating (1–5 integer): returns a one-key
 * payload spread, or throws a RangeError naming the field. Self-report
 * ONLY — the service never estimates these for the user.
 */
function moodRating(value: number | undefined, name: string): Record<string, number> {
  if (value === undefined) return {}
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) {
    throw new RangeError(`${name} must be an integer between 1 and 5`)
  }
  return { [name]: value }
}

/**
 * Label-resolve the brief's boundary questions for the view: idea/project
 * ids become titles (the local landmark names), a pending claim becomes a
 * 48-char excerpt of its own text. Unresolvable ids pass through verbatim —
 * the card still names a line, never a blank.
 */
function briefQuestions(brief: ReturnType<typeof deriveBrief>, wiki: CbeWikiSnapshot): readonly ResearchBriefQuestion[] {
  const labels = new Map<string, string>([
    ...wiki.ideas.map(idea => [idea.id, idea.title] as const),
    ...wiki.projects.map(project => [`project:${project.id}`, project.title] as const),
    ...wiki.claims.map(claim => [claim.id, claim.text.length > 48 ? `${claim.text.slice(0, 47)}…` : claim.text] as const),
  ])
  return Object.freeze(brief.questions.map(question => Object.freeze({
    kind: question.kind,
    lineId: question.lineId,
    label: labels.get(question.lineId) ?? question.lineId,
  })))
}

/**
 * Append one L2 journal entry (the user's own words) to the ledger: the only
 * write path the cognitive map reads as narrative. The text must be a
 * non-blank string capped at {@link JOURNAL_TEXT_MAX_CHARS} characters; a
 * `projectId` scopes the entry (unknown id → `project-not-found`), an
 * `ideaId` writes it against one line — both refs are omitted when absent.
 * Optional `valence`/`arousal` self-report ratings (1–5 integers) ride the
 * payload verbatim. The stored event is the single source of truth: L2 is
 * re-derived, never persisted as a table of its own.
 * @param deps - open wiki domain.
 * @param request - the text plus optional project/line refs.
 * @returns the stored journal event.
 */
export async function addJournalEntryRemote(
  deps: LedgerDeps,
  request: {
    text: string
    projectId?: string | undefined
    ideaId?: string | undefined
    valence?: number | undefined
    arousal?: number | undefined
    /** When the entry answers a boundary-question card, the I4 meta event rides along. */
    question?: { kind: string; lineId: string } | undefined
  },
): Promise<ResearchAddJournalEntryResult> {
  if (typeof request.text !== 'string' || request.text.trim() === '') {
    return rejected({ code: 'invalid-input', message: 'journal text must not be empty' })
  }
  if (request.text.length > JOURNAL_TEXT_MAX_CHARS) {
    return rejected({
      code: 'invalid-input',
      message: `journal text is capped at ${JOURNAL_TEXT_MAX_CHARS} characters`,
    })
  }
  if (request.projectId !== undefined
    && deps.domain.table('projects').get(request.projectId) === undefined) {
    return rejected({ code: 'project-not-found', projectId: request.projectId })
  }
  if (request.question !== undefined) {
    const kind = request.question.kind
    const lineId = request.question.lineId
    if ((kind !== 'returning-branch' && kind !== 'pending-claim')
      || typeof lineId !== 'string' || lineId === '') {
      return rejected({
        code: 'invalid-input',
        message: 'question must be { kind: returning-branch | pending-claim, lineId }',
      })
    }
  }
  const refs: EventRefs = {
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    ...(request.ideaId === undefined ? {} : { ideaId: request.ideaId }),
  }
  try {
    const event = await appendEvent(deps.domain, {
      actor: PANEL_ACTOR,
      action: JOURNAL_ACTION,
      ...(Object.keys(refs).length === 0 ? {} : { refs }),
      payload: {
        text: request.text,
        ...moodRating(request.valence, 'valence'),
        ...moodRating(request.arousal, 'arousal'),
      },
    })
    // I4 instrumentation: an answer to a boundary-question card is itself
    // recorded — the G3 natural experiment (shown vs never-shown) reads
    // these lines. Best-effort, zero-weight, never part of the journal.
    if (request.question !== undefined) {
      const lineId = request.question.lineId
      const answeredRefs: EventRefs = lineId.startsWith('project:')
        ? { projectId: lineId.slice('project:'.length) }
        : deps.domain.table('ideas').get(lineId) !== undefined ? { ideaId: lineId }
        : deps.domain.table('claims').get(lineId) !== undefined ? { claimId: lineId }
        : {}
      await emitEvent(deps.domain, {
        actor: PANEL_ACTOR,
        action: QUESTION_ANSWERED_ACTION,
        ...(Object.keys(answeredRefs).length === 0 ? {} : { refs: answeredRefs }),
        payload: { kind: request.question.kind, lineId },
      })
    }
    return success({ event })
  } catch (error) {
    return rejected({
      code: 'invalid-input',
      message: error instanceof RangeError ? error.message : 'journal entry is invalid',
    })
  }
}

/* ------------------------------------------------------------------------ *
 * Evidence engine (S3): the learned profile — read-only instrumentation.
 * ------------------------------------------------------------------------ */

/**
 * Read the learned evidence profile (E1 instrumentation): the κ-shrunk
 * effective value of every ledger action, folded over the full ledger by
 * the pure engine (`evidenceModelAt`). READ-ONLY and deliberately NOT
 * consumed by any UI until G1 passes — the profile exists so the
 * priors-versus-learned comparison is inspectable when that day comes.
 * The profile must never be used as a self-optimization performance
 * metric: its job is honest priors, not leaderboard copy.
 * @param deps - open wiki domain.
 * @returns the folded profile (rows sorted by effective value).
 */
export async function getEvidenceProfileRemote(deps: LedgerDeps): Promise<ResearchGetEvidenceProfileResult> {
  try {
    const events = await listEvents(deps.domain, { limit: LIST_EVENTS_MAX_LIMIT })
    const model = evidenceModelAt(events)
    const profile = evidenceProfileOf(model)
    return success({
      profile: {
        derivationVersion: profile.derivation.version,
        terminalsFolded: profile.derivation.terminalsFolded,
        actions: profile.actions,
      },
    })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the evidence profile could not be folded' })
  }
}

/**
 * Read the foraging layer (S4): the territory ledger (one E0 row per
 * declared project — events, attention mass, harvest-proxy counts, day
 * gaps), the personal GUT baseline (silent below its floor), and the GUT
 * cards' data — two numbers, zero verbs, no go/stay language. A pure
 * query over the full ledger plus current wiki state; it writes nothing.
 * @param deps - open wiki domain.
 * @returns the derived, label-resolved foraging layer.
 */
export async function getForagingRemote(deps: LedgerDeps): Promise<ResearchGetForagingResult> {
  try {
    const events = await listEvents(deps.domain, { limit: LIST_EVENTS_MAX_LIMIT })
    const wiki: CbeWikiSnapshot = {
      ideas: [...deps.domain.table('ideas').entries()].map(([, record]) => record),
      claims: [...deps.domain.table('claims').entries()].map(([, record]) => record),
      projects: [...deps.domain.table('projects').entries()].map(([, record]) => record),
    }
    const layer = deriveForaging(events, wiki, Date.now())
    return success({
      foraging: {
        derivedAt: layer.asOf,
        territories: layer.territories,
        baseline: layer.baseline,
        cards: layer.cards,
      },
    })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the foraging layer could not be derived' })
  }
}

/* ------------------------------------------------------------------------ *
 * Worktree (S2): the research process as a git-like working tree. The view
 * is a pure L0 projection (E0 by construction); the three writes are the
 * user's own structural declarations — the mainline ref move, the declared
 * derivation edge, and the documented No — every one an explicit,
 * user-refusable action, so origin attribution is 'user' by construction.
 * ------------------------------------------------------------------------ */

/**
 * The label map every worktree view resolves against: idea ids and
 * `project:<id>` lanes become their wiki titles; unresolvable ids pass
 * through verbatim (the view still names a line, never a blank).
 */
function worktreeLabels(wiki: CbeWikiSnapshot): Map<string, string> {
  return new Map<string, string>([
    ...wiki.ideas.map(idea => [idea.id, idea.title] as const),
    ...wiki.projects.map(project => [`project:${project.id}`, project.title] as const),
  ])
}

/** One declaration joined with its label for the view. */
function declaredView(
  declaration: CbeMainlineDeclaration,
  labels: ReadonlyMap<string, string>,
): ResearchWorktreeMainlineView {
  return Object.freeze({
    lineId: declaration.lineId,
    label: labels.get(declaration.lineId) ?? declaration.lineId,
    declaredAt: declaration.declaredAt,
  })
}

/**
 * Read the whole derived worktree: every lane (idea lines plus project
 * lines, including wiki-only ideas with no events yet) with its status,
 * declared parent, activity dates, and documented-No numbers; the mainline
 * ref and its full reflog; and the lane counts. A pure query over the full
 * ledger plus current wiki state — it writes nothing, infers no genealogy,
 * and needs no gate (the view is the data wearing tree semantics).
 * @param deps - open wiki domain.
 * @returns the derived, label-resolved worktree.
 */
export async function getWorktreeRemote(deps: LedgerDeps): Promise<ResearchGetWorktreeResult> {
  try {
    const events = await listEvents(deps.domain, { limit: LIST_EVENTS_MAX_LIMIT })
    const wiki: CbeWikiSnapshot = {
      ideas: [...deps.domain.table('ideas').entries()].map(([, record]) => record),
      claims: [...deps.domain.table('claims').entries()].map(([, record]) => record),
      projects: [...deps.domain.table('projects').entries()].map(([, record]) => record),
    }
    const tree = deriveWorktree(events, wiki, Date.now())
    const labels = worktreeLabels(wiki)
    const lanes = tree.lanes.map((lane: CbeWorktreeLane) => Object.freeze({
      ...lane,
      parentLabel: lane.parentLineId === null
        ? null
        : labels.get(lane.parentLineId) ?? lane.parentLineId,
    }))
    const view: ResearchWorktreeView = Object.freeze({
      derivedAt: tree.asOf,
      lanes: Object.freeze(lanes),
      mainline: tree.mainline === null ? null : declaredView(tree.mainline, labels),
      mainlineHistory: Object.freeze(tree.mainlineHistory.map(item => declaredView(item, labels))),
      counts: Object.freeze({ ...tree.counts }),
    })
    return success({ worktree: view })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the worktree could not be derived' })
  }
}

/**
 * Move the mainline ref (one `cbe.mainline.set` event): the user's explicit
 * declaration of the current mainline — the system never moves it and never
 * ranks lines into it. Exactly one of `ideaId`/`projectId` (unknown ids and
 * non-active ideas are `invalid-input` — the mainline is a live direction).
 * The reflog is the event history itself: 大改变 stays on the record.
 * @param deps - open wiki domain.
 * @param request - the line to declare (exactly one ref kind).
 * @returns the stored declaration event.
 */
export async function setMainlineRemote(
  deps: LedgerDeps,
  request: {
    ideaId?: string | undefined
    projectId?: string | undefined
  },
): Promise<ResearchSetMainlineResult> {
  const { ideaId, projectId } = request
  if ((ideaId === undefined) === (projectId === undefined)) {
    return rejected({
      code: 'invalid-input',
      message: 'setMainline takes exactly one of ideaId or projectId',
    })
  }
  if (ideaId !== undefined) {
    const idea = deps.domain.table('ideas').get(ideaId)
    if (idea === undefined) {
      return rejected({ code: 'invalid-input', message: `unknown ideaId: ${ideaId}` })
    }
    if (idea.status !== 'active') {
      return rejected({
        code: 'invalid-input',
        message: `only an active line can be the mainline (this one is ${idea.status})`,
      })
    }
  } else if (projectId !== undefined && deps.domain.table('projects').get(projectId) === undefined) {
    return rejected({ code: 'project-not-found', projectId })
  }
  try {
    const event = await appendEvent(deps.domain, {
      actor: PANEL_ACTOR,
      action: MAINLINE_ACTION,
      refs: ideaId !== undefined ? { ideaId } : { projectId: projectId as string },
    })
    return success({ event })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the mainline declaration could not be written' })
  }
}

/**
 * Declare (or clear) one derivation edge — a branch point, in the
 * surveyor's own words: `refs.ideaId` carries the child, the payload the
 * parent. `parentIdeaId: null` clears the edge (an append, never a rewrite
 * — the history of re-declarations stays on the record). Edges are NEVER
 * inferred; the cycle guard walks the existing declared edges so the
 * genealogy stays a forest.
 * @param deps - open wiki domain.
 * @param request - the child idea plus its parent (or null to clear).
 * @returns the stored edge event.
 */
export async function setIdeaParentRemote(
  deps: LedgerDeps,
  request: {
    ideaId: string
    parentIdeaId: string | null
  },
): Promise<ResearchSetIdeaParentResult> {
  const { ideaId, parentIdeaId } = request
  if (typeof ideaId !== 'string' || ideaId === '') {
    return rejected({ code: 'invalid-input', message: 'ideaId must be a non-empty string' })
  }
  if (deps.domain.table('ideas').get(ideaId) === undefined) {
    return rejected({ code: 'invalid-input', message: `unknown ideaId: ${ideaId}` })
  }
  if (parentIdeaId === null) {
    try {
      const event = await appendEvent(deps.domain, {
        actor: PANEL_ACTOR,
        action: IDEA_PARENT_ACTION,
        refs: { ideaId },
        payload: { parentIdeaId: null },
      })
      return success({ event })
    } catch {
      return rejected({ code: 'operation-failed', message: 'the derivation edge could not be written' })
    }
  }
  if (deps.domain.table('ideas').get(parentIdeaId) === undefined) {
    return rejected({ code: 'invalid-input', message: `unknown parentIdeaId: ${parentIdeaId}` })
  }
  if (parentIdeaId === ideaId) {
    return rejected({ code: 'invalid-input', message: 'a line cannot derive from itself' })
  }
  // The cycle guard: walk the DECLARED edges up from the proposed parent;
  // meeting the child again would close a loop the map must never carry.
  const edges = ideaParentEdges(await listEvents(deps.domain, {
    actionPrefix: 'cbe.idea.',
    limit: LIST_EVENTS_MAX_LIMIT,
  }))
  let cursor: string | undefined = edges.get(parentIdeaId)
  for (let hops = 0; cursor !== undefined && hops < 1000; hops += 1) {
    if (cursor === ideaId) {
      return rejected({ code: 'invalid-input', message: 'that derivation would create a cycle' })
    }
    cursor = edges.get(cursor)
  }
  try {
    const event = await appendEvent(deps.domain, {
      actor: PANEL_ACTOR,
      action: IDEA_PARENT_ACTION,
      refs: { ideaId },
      payload: { parentIdeaId },
    })
    return success({ event })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the derivation edge could not be written' })
  }
}

/**
 * Close one idea line as a dead end — a documented No: the wiki record
 * flips to `failed` with the reason, and one `knowledge.idea.failed` event
 * lands in the ledger under the PANEL actor (an explicit, user-refusable
 * action, so origin attribution is 'user' by construction — whoever bears
 * the uncertainty of the No owns it). The reason is required and capped at
 * {@link IDEA_CLOSE_REASON_MAX_CHARS} characters; only an active line can
 * be closed (an adopted line is a merge, not a dead end). Dead ends are
 * never pruned — every ✗ stays on the tree with its reason and its GUT
 * number.
 * @param deps - open wiki domain.
 * @param request - the idea plus its one-line lesson.
 * @returns the stored close event.
 */
export async function closeIdeaRemote(
  deps: LedgerDeps,
  request: {
    ideaId: string
    reason: string
  },
): Promise<ResearchCloseIdeaResult> {
  const { ideaId, reason } = request
  if (typeof reason !== 'string' || reason.trim() === '') {
    return rejected({ code: 'invalid-input', message: 'close reason must not be empty' })
  }
  if (reason.length > IDEA_CLOSE_REASON_MAX_CHARS) {
    return rejected({
      code: 'invalid-input',
      message: `close reason is capped at ${IDEA_CLOSE_REASON_MAX_CHARS} characters`,
    })
  }
  const idea = deps.domain.table('ideas').get(ideaId)
  if (idea === undefined) {
    return rejected({ code: 'invalid-input', message: `unknown ideaId: ${ideaId}` })
  }
  if (idea.status === 'failed') {
    return rejected({ code: 'invalid-input', message: 'that line is already closed (a documented No)' })
  }
  if (idea.status === 'adopted') {
    return rejected({ code: 'invalid-input', message: 'an adopted line is a merge, not a dead end' })
  }
  try {
    await deps.domain.table('ideas').update(ideaId, current => ({
      ...current,
      status: 'failed' as const,
      failureReason: reason,
    }))
    const event = await appendEvent(deps.domain, {
      actor: PANEL_ACTOR,
      action: 'knowledge.idea.failed',
      refs: { ideaId },
      payload: { reason },
    })
    return success({ event })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the close could not be written' })
  }
}

/**
 * Adopt one idea line — declare the merge: the wiki record flips to
 * `adopted` and one `knowledge.idea.adopted` event lands in the ledger
 * under the PANEL actor (an explicit, user-refusable action; origin rule
 * holds — whoever bears the uncertainty of the Yes owns it). Only an
 * active line can be merged: a documented No is a dead end, not a merge,
 * and a merge is written once. The merge is the positive terminal —
 * symmetric weight of the close (+2.5 vs −2.5) and a +1 outcome for the
 * evidence engine — but it is NOT a GUT departure: giving-up time is
 * measured on documented closes only, so the foraging baseline does not
 * refresh on a merge.
 * @param deps - open wiki domain.
 * @param request - the idea being merged.
 * @returns the stored adopt event.
 */
export async function adoptIdeaRemote(
  deps: LedgerDeps,
  request: {
    ideaId: string
  },
): Promise<ResearchAdoptIdeaResult> {
  const { ideaId } = request
  if (typeof ideaId !== 'string' || ideaId === '') {
    return rejected({ code: 'invalid-input', message: 'ideaId must not be empty' })
  }
  const idea = deps.domain.table('ideas').get(ideaId)
  if (idea === undefined) {
    return rejected({ code: 'invalid-input', message: `unknown ideaId: ${ideaId}` })
  }
  if (idea.status === 'adopted') {
    return rejected({ code: 'invalid-input', message: 'that line is already merged (an adoption is written once)' })
  }
  if (idea.status === 'failed') {
    return rejected({ code: 'invalid-input', message: 'a documented No is a dead end, not a merge' })
  }
  try {
    await deps.domain.table('ideas').update(ideaId, current => ({
      ...current,
      status: 'adopted' as const,
    }))
    const event = await appendEvent(deps.domain, {
      actor: PANEL_ACTOR,
      action: 'knowledge.idea.adopted',
      refs: { ideaId },
      payload: {},
    })
    return success({ event })
  } catch {
    return rejected({ code: 'operation-failed', message: 'the adoption could not be written' })
  }
}
