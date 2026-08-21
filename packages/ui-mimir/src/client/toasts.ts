/**
 * The workbench's toast notifications: the pure queue rules behind the
 * corner stack. A toast carries a locale copy key (the controller stays
 * locale-free) plus an optional detail suffix (counts, the failure message).
 * Pushes dedupe — the same copy+detail inside one TTL refreshes the existing
 * toast instead of stacking a twin — and the queue is capped, dropping the
 * oldest first. DOM-free so every rule is unit-testable.
 * @module dsh-client-ui-mimir/client/toasts
 */

import type { ResearchKey } from './locales.ts'

/** Toast severity, mapping to the stack's green/blue/red accent. */
export type ResearchToastKind = 'success' | 'info' | 'error'

/** One toast in the corner stack. */
export interface ResearchToast {
  readonly id: number
  readonly kind: ResearchToastKind
  /** Locale copy key, rendered through `t()` by the host component. */
  readonly copy: ResearchKey
  /** Optional suffix (e.g. `× 3` or the failure message), appended verbatim. */
  readonly detail: string | null
  readonly createdAt: number
}

/** How long one toast stays on screen before the host sweeps it. */
export const TOAST_TTL_MS = 4000
/** Stack cap; pushes beyond it drop the oldest toast. */
export const TOAST_LIMIT = 4

/** Outcome of {@link pushToast}: the new queue and the pushed toast's id. */
export interface ToastPush {
  readonly list: readonly ResearchToast[]
  readonly id: number
}

/**
 * Append one toast. When the queue already holds a toast with the same copy
 * and detail (regardless of age), that toast is refreshed — new id, new
 * timestamp, moved to the end — instead of stacking a duplicate. The queue
 * never exceeds {@link TOAST_LIMIT}: the oldest toasts drop first.
 * @param list - the current queue (oldest first).
 * @param kind - toast severity.
 * @param copy - locale copy key.
 * @param detail - optional suffix, null for none.
 * @param now - the push timestamp (ms).
 * @param id - the id to assign.
 * @returns the updated queue and the assigned id.
 */
export function pushToast(
  list: readonly ResearchToast[],
  kind: ResearchToastKind,
  copy: ResearchKey,
  detail: string | null,
  now: number,
  id: number,
): ToastPush {
  const toast: ResearchToast = Object.freeze({ id, kind, copy, detail, createdAt: now })
  const rest = list.filter(entry => !(entry.copy === copy && entry.detail === detail))
  const next = [...rest, toast]
  return { list: Object.freeze(next.slice(Math.max(0, next.length - TOAST_LIMIT))), id }
}

/**
 * Drop every toast whose TTL has elapsed (`createdAt + TTL <= now`).
 * @param list - the current queue.
 * @param now - the sweep timestamp (ms).
 * @returns the surviving queue (the same reference when nothing expired).
 */
export function pruneExpiredToasts(
  list: readonly ResearchToast[],
  now: number,
): readonly ResearchToast[] {
  const kept = list.filter(entry => entry.createdAt + TOAST_TTL_MS > now)
  return kept.length === list.length ? list : Object.freeze(kept)
}

/**
 * The timestamp at which the next toast expires (the oldest one's deadline),
 * or null when the queue is empty — the host arms its sweep timer with this.
 * @param list - the current queue.
 * @returns the next expiry (ms) or null.
 */
export function nextToastExpiry(list: readonly ResearchToast[]): number | null {
  if (list.length === 0) return null
  return Math.min(...list.map(entry => entry.createdAt)) + TOAST_TTL_MS
}
