/**
 * Pure logic of the cognitive brief (CBE) view: the brief options the view
 * asks the controller for (the same window contract as the progress report)
 * and the Markdown download's file name. DOM-free so it is unit-testable.
 * @module dsh-client-ui-mimir/client/brief-view
 */

import type { ResearchGenerateBriefOptions } from 'dsh-mimir/types'
import type { LedgerWindow } from './ledger-view.ts'

/**
 * Mirror of the service's `JOURNAL_TEXT_MAX_CHARS` cap, for the journal box's
 * live counter ONLY. Deliberately NOT a runtime import from `dsh-mimir` root:
 * the UI bundle must not pull the whole research library in — the server-side
 * constant is the source of truth and this copy must stay in sync.
 */
export const JOURNAL_MAX_CHARS = 1024

/** Days covered by one window; `all` means no lower bound (as ledger-view). */
function windowDays(window: LedgerWindow): number | null {
  switch (window) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case 'all': return null
  }
}

/**
 * The `generateBrief` options of one window + scope: the same ISO bounds and
 * project filter as the ledger view's window, without the fields the brief
 * does not take.
 * @param window - the selected time window.
 * @param projectId - the project scope, or null for all projects.
 * @param nowMs - the wall clock (injectable for tests).
 * @returns the options for one `generateBrief` call.
 */
export function briefWindowOptions(
  window: LedgerWindow,
  projectId: string | null,
  nowMs: number,
): ResearchGenerateBriefOptions {
  const days = windowDays(window)
  return {
    projectId: projectId ?? undefined,
    ...(days === null ? {} : { since: new Date(nowMs - days * 86_400_000).toISOString() }),
  }
}

/**
 * The Markdown download file name of one brief: dated from the brief's
 * `generatedAt` (falling back to now), so a week of briefs keep separate
 * files. Local-timezone date, like the report's name.
 * @param generatedAt - the brief's ISO timestamp, or null before one settles.
 * @param nowMs - the wall clock fallback (injectable for tests).
 * @returns e.g. `mimir-brief-2026-08-27.md`.
 */
export function briefFileName(generatedAt: string | null, nowMs: number): string {
  const base = generatedAt !== null && !Number.isNaN(new Date(generatedAt).getTime())
    ? new Date(generatedAt)
    : new Date(nowMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
  return `mimir-brief-${date}.md`
}

/**
 * The journal draft's validation state, driving the submit button and the
 * counter color.
 * @param text - the current draft.
 * @returns 'empty' when blank (trim-wise), 'too-long' past the cap, else 'ok'.
 */
export function journalTextState(text: string): 'empty' | 'ok' | 'too-long' {
  if (text.trim() === '') return 'empty'
  if (text.length > JOURNAL_MAX_CHARS) return 'too-long'
  return 'ok'
}
