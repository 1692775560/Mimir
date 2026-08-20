/**
 * Shared presentational helpers for the research workbench views: the stage
 * label map, failure-copy translation, byte-size formatting, the figure route
 * URL builder, the experiments comparison-chart helpers (numeric metric
 * keys, chart rows, bar widths, value formatting), and the library tag
 * collection/filter helpers. No JSX, no subscriptions.
 * @module dsh-client-ui-mimir/client/view-common
 */

import type { BibEntry, ExperimentRecord, ExperimentStatus, PaperRecord, ProjectStage, SectionMove } from 'dsh-mimir/types'
import type { ResearchFailureView, ResearchSaveState } from './controller.ts'
import type { ResearchKey } from './locales.ts'

/** The `t` function shape every view receives from the panel. */
export type ResearchT = (key: ResearchKey, params?: Record<string, unknown>) => string

/** Locale key of one autosave state label (the editor's and the bib panel's pill). */
export const SAVE_KEYS: Record<ResearchSaveState, ResearchKey> = {
  clean: 'save.saved',
  dirty: 'save.dirty',
  saving: 'save.saving',
  saved: 'save.saved',
  conflict: 'save.conflict',
  'save-error': 'save.error',
}

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

/**
 * Character range of one 1-based line in one text (the issue/outline
 * click-to-jump selection). Offsets count newlines; the last line runs to the
 * text's end. Returns null for a line past the end or below 1.
 */
export function lineRangeOf(text: string, line: number): { readonly start: number; readonly end: number } | null {
  if (line < 1) return null
  let start = 0
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf('\n', start)
    if (next === -1) return null
    start = next + 1
  }
  const newline = text.indexOf('\n', start)
  return { start, end: newline === -1 ? text.length : newline }
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

/** One run's row in one metric's comparison chart. */
export interface MetricChartRow {
  readonly id: string
  readonly name: string
  readonly status: ExperimentStatus
  readonly value: number
}

/**
 * Metric keys shared as finite numbers by at least two experiments — the keys
 * worth a comparison chart (a key only one run carries has nothing to compare
 * against). Sorted alphabetically so the chart grid is stable across renders.
 */
export function numericMetricKeys(experiments: readonly ExperimentRecord[]): string[] {
  const counts = new Map<string, number>()
  for (const record of experiments) {
    for (const [key, value] of Object.entries(record.metrics)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([key]) => key)
    .sort()
}

/**
 * Rows of one metric's comparison chart: every run carrying a finite number
 * for the key, oldest first (updatedAt order) so the bars read as a trend.
 */
export function metricChartRows(experiments: readonly ExperimentRecord[], key: string): MetricChartRow[] {
  const rows: Array<{ readonly record: ExperimentRecord; readonly value: number }> = []
  for (const record of experiments) {
    const value = record.metrics[key]
    if (typeof value === 'number' && Number.isFinite(value)) rows.push({ record, value })
  }
  rows.sort((left, right) => left.record.updatedAt.localeCompare(right.record.updatedAt))
  return rows.map(({ record, value }) => ({
    id: record.id,
    name: record.name,
    status: record.status,
    value,
  }))
}

/**
 * Bar widths (0–100) for one chart's values, normalized to the largest.
 * Negative values and an all-non-positive chart (e.g. a zero-only metric)
 * collapse to zero-width bars.
 */
export function barWidthPercents(values: readonly number[]): number[] {
  const max = Math.max(...values, 0)
  if (max <= 0) return values.map(() => 0)
  return values.map(value => Math.max(0, Math.min(100, (value / max) * 100)))
}

/**
 * Compact display form of one metric value: strings pass through, integers
 * print as-is, other numbers keep at most four significant digits.
 */
export function formatMetricValue(value: number | string): string {
  if (typeof value === 'string') return value
  if (!Number.isFinite(value) || Number.isInteger(value)) return String(value)
  return String(Number(value.toPrecision(4)))
}

/**
 * One-line summary of one bibliography entry (the bib panel's row): the
 * title when present, else the author/year pair, else the entry type.
 * Whitespace runs collapse; the result truncates at 80 characters.
 */
export function bibSummaryOf(entry: BibEntry): string {
  const title = entry.fields['title']?.replace(/\s+/g, ' ').trim()
  if (title !== undefined && title !== '') {
    return title.length > 80 ? `${title.slice(0, 80)}…` : title
  }
  const fallback = [entry.fields['author']?.trim(), entry.fields['year']?.trim()]
    .filter(part => part !== undefined && part !== '')
    .join(' · ')
  return fallback === '' ? entry.type : fallback
}

/**
 * Translate one outline drop into a section move. `insertAt` is the insertion
 * indicator's index in the CURRENT top-level order (0..titles.length); the
 * move's `targetIndex` addresses the order after the dragged section is
 * removed. Returns null for a no-op drop (back onto its own slot) or an
 * unknown title.
 */
export function sectionMoveFromDrop(
  titles: readonly string[],
  title: string,
  insertAt: number,
): SectionMove | null {
  const from = titles.indexOf(title)
  if (from === -1) return null
  const clamped = Math.min(Math.max(insertAt, 0), titles.length)
  const target = clamped > from ? clamped - 1 : clamped
  return target === from ? null : { title, targetIndex: target }
}

/** All tags across the library, deduped and alphabetically sorted (the filter bar). */
export function collectTags(papers: readonly PaperRecord[]): string[] {
  const tags = new Set<string>()
  for (const paper of papers) for (const tag of paper.tags) tags.add(tag)
  return [...tags].sort()
}

/**
 * Filter the library by one active tag and/or one linked project; a null
 * selector passes everything on its axis.
 */
export function filterPapers(
  papers: readonly PaperRecord[],
  tag: string | null,
  projectId: string | null,
): PaperRecord[] {
  return papers.filter(paper =>
    (tag === null || paper.tags.includes(tag))
    && (projectId === null || paper.projectIds.includes(projectId)))
}
