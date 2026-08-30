/**
 * Client helpers of the worktree (S2) view: the mirror of the server's
 * close-reason cap (the same discipline `brief-view.ts` applies to the
 * journal cap) and the lane-kind probe the view's actions branch on.
 * @module dsh-client-ui-mimir/client/worktree-view
 */

import type { ResearchWorktreeView } from 'dsh-mimir/types'

/** Mirror of the server's `IDEA_CLOSE_REASON_MAX_CHARS` (the documented-No cap). */
export const WORKTREE_REASON_MAX_CHARS = 48

/** Draft state of one close reason (the documented-No input box). */
export type CloseReasonState = 'empty' | 'ok' | 'too-long'

/** Validate one close-reason draft client-side; the server re-validates. */
export function closeReasonState(reason: string): CloseReasonState {
  if (reason.trim() === '') return 'empty'
  return reason.length > WORKTREE_REASON_MAX_CHARS ? 'too-long' : 'ok'
}

/**
 * Whether one lane is an idea line (closeable, parent-declarable). Project
 * lanes (`project:<id>`) can carry the mainline ref but never a parent or a
 * close in v1.
 */
export function isIdeaLane(lineId: string): boolean {
  return !lineId.startsWith('project:')
}

/** One memorable beat of the trajectory (the highlight strip's row). */
export interface WorktreeHighlight {
  readonly kind: 'mainline' | 'busiest' | 'eureka' | 'adopted' | 'failed'
  /** The headline figure or name. */
  readonly value: string
  /** The human framing around it (locale copy wraps this). */
  readonly detail: string
}

/**
 * Distil a worktree into its memorable beats — the trajectory's highlights,
 * not its raw counters. Deliberately descriptive: "the主线 moved 3 times"
 * is a fact about attention spent, never advice about where to spend more.
 *
 * Pure and order-independent; an empty worktree yields no highlights rather
 * than invented ones.
 * @param view - the derived worktree.
 * @returns the highlights, most structurally significant first.
 */
export function worktreeHighlights(view: ResearchWorktreeView): readonly WorktreeHighlight[] {
  const highlights: WorktreeHighlight[] = []

  const busiest = [...view.lanes].sort(
    (a, b) => b.eventCount - a.eventCount || a.label.localeCompare(b.label),
  )[0]
  if (busiest !== undefined && busiest.eventCount > 0) {
    highlights.push(Object.freeze({
      kind: 'busiest',
      value: busiest.label,
      detail: String(busiest.eventCount),
    }))
  }

  const terminals = view.lanes
    .flatMap(lane => lane.touches
      .filter(touch => touch.kind === 'terminal')
      .map(touch => ({ lane, at: touch.at, action: touch.action })))
    .sort((a, b) => b.at.localeCompare(a.at))
  const latest = terminals[0]
  if (latest !== undefined) {
    highlights.push(Object.freeze({
      kind: 'eureka',
      value: latest.lane.label,
      detail: latest.at.slice(0, 10),
    }))
  }

  if (view.mainline !== null) {
    highlights.push(Object.freeze({
      kind: 'mainline',
      value: view.mainline.label,
      detail: String(view.mainlineHistory.length),
    }))
  }
  if (view.counts.adopted > 0) {
    highlights.push(Object.freeze({
      kind: 'adopted',
      value: String(view.counts.adopted),
      detail: String(view.counts.adopted),
    }))
  }
  if (view.counts.failed > 0) {
    highlights.push(Object.freeze({
      kind: 'failed',
      value: String(view.counts.failed),
      detail: String(view.counts.failed),
    }))
  }
  return Object.freeze(highlights)
}
