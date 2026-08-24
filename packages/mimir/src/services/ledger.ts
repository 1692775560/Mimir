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
  buildProgressReport,
  LIST_EVENTS_MAX_LIMIT,
  listEvents,
} from '../ledger.ts'
import type {
  LedgerActorKind,
  ResearchListEventsResult,
  ResearchProgressReportOptions,
  ResearchProgressReportResult,
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
