/**
 * Shared presentational helpers for the research workbench views: the stage
 * label map, failure-copy translation, byte-size formatting, and the figure
 * route URL builder. No JSX, no subscriptions.
 * @module dsh-client-ui-mimir/client/view-common
 */

import type { ProjectStage } from 'dsh-mimir/types'
import type { ResearchFailureView } from './controller.ts'
import type { ResearchKey } from './locales.ts'

/** The `t` function shape every view receives from the panel. */
export type ResearchT = (key: ResearchKey) => string

/** Locale key of one pipeline stage label. */
export const STAGE_KEYS: Record<ProjectStage, ResearchKey> = {
  idea: 'stage.idea',
  plan: 'stage.plan',
  experiment: 'stage.experiment',
  writing: 'stage.writing',
  done: 'stage.done',
}

/** Pipeline stages in order (the overview progress bar). */
export const STAGES: readonly ProjectStage[] = ['idea', 'plan', 'experiment', 'writing', 'done']

/** Localized copy for one failure; known codes map to dedicated strings. */
export function failureCopy(t: ResearchT, failure: ResearchFailureView | null): string {
  if (failure === null) return ''
  if (failure.code === 'invalid-dir') return t('error.invalidDir')
  return failure.message
}

/** Human-readable byte size (B/KB/MB, one decimal above 1 KB). */
export function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Localized relative timestamp (e.g. a probe's checkedAt), coarse-grained. */
export function relativeTime(t: ResearchT, iso: string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(elapsedMs) || elapsedMs < 60_000) return t('time.justNow')
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) return `${minutes} ${t('time.minutesAgo')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${t('time.hoursAgo')}`
  return `${Math.floor(hours / 24)} ${t('time.daysAgo')}`
}

/**
 * Build the figure route URL for one file of one project's paper directory.
 * The record's `paperDir` rides along as `?dir=`, same convention as the
 * PDF preview URL.
 */
export function figureUrl(projectId: string, relPath: string, dir: string | undefined): string {
  return `/research/figure/${encodeURIComponent(projectId)}?path=${encodeURIComponent(relPath)}`
    + (dir === undefined ? '' : `&dir=${encodeURIComponent(dir)}`)
}
