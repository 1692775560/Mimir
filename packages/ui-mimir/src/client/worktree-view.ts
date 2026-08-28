/**
 * Client helpers of the worktree (S2) view: the mirror of the server's
 * close-reason cap (the same discipline `brief-view.ts` applies to the
 * journal cap) and the lane-kind probe the view's actions branch on.
 * @module dsh-client-ui-mimir/client/worktree-view
 */

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
