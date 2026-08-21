/**
 * Shared presentational helpers for the research workbench views: the stage
 * label map, failure-copy translation, byte-size formatting, the figure route
 * URL builder, the experiments comparison-chart helpers (numeric metric
 * keys, chart rows, bar widths, value formatting), the library tag
 * collection/filter helpers, and the figure-upload drop filter
 * ({@link filterDropFiles}). No JSX, no subscriptions.
 * @module dsh-client-ui-mimir/client/view-common
 */

import type { BibEntry, ExperimentRecord, ExperimentStatus, OutlineNode, PaperRecord, ProjectStage, SectionMove, SectionOutlineTitles, ServerRecord, SubsectionMove } from 'dsh-mimir/types'
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
 * Bibliography fields the bib panel edits through dedicated form inputs, in
 * display order; every other field of the entry rides the raw name/value rows.
 */
export const COMMON_BIB_FIELDS = [
  'title', 'author', 'year', 'journal', 'booktitle', 'eprint', 'archiveprefix', 'url', 'note',
] as const

/** One raw name/value field row of the bib entry editor. */
export interface BibFieldDraft {
  name: string
  value: string
}

/** The bib entry editor's draft: citation key, entry type, the common-field inputs, and the raw rows. */
export interface BibEntryDraft {
  key: string
  type: string
  /** Common-field input values keyed by field name (absent names read as ''). */
  common: Record<string, string>
  extra: BibFieldDraft[]
}

/** Open the editor on one entry: common fields into their inputs, the rest as raw rows. */
export function bibDraftFromEntry(entry: BibEntry): BibEntryDraft {
  const common: Record<string, string> = {}
  const extra: BibFieldDraft[] = []
  for (const [name, value] of Object.entries(entry.fields)) {
    if ((COMMON_BIB_FIELDS as readonly string[]).includes(name)) common[name] = value
    else extra.push({ name, value })
  }
  return { key: entry.key, type: entry.type, common, extra }
}

/**
 * Assemble the entry one draft saves to: key and type trimmed (an empty key
 * or type rejects with null — the panel shows its own validation copy), empty
 * common inputs dropped, empty-name or empty-value raw rows dropped, raw row
 * names lowercased, and a raw row naming a common field overriding the form
 * input (last write wins, matching the parser's field-merge rule).
 */
export function bibEntryFromDraft(draft: BibEntryDraft): BibEntry | null {
  const key = draft.key.trim()
  const type = draft.type.trim().toLowerCase()
  if (key === '' || type === '') return null
  const fields: Record<string, string> = {}
  for (const name of COMMON_BIB_FIELDS) {
    const value = (draft.common[name] ?? '').trim()
    if (value !== '') fields[name] = value
  }
  for (const row of draft.extra) {
    const name = row.name.trim().toLowerCase()
    const value = row.value.trim()
    if (name === '' || value === '') continue
    fields[name] = value
  }
  return { key, type, fields }
}

/**
 * Build the paper-PDF route URL of one remembered paper (the library card's
 * embedded reader). `version` cache-busts a refetch: the route serves the
 * same path after every fetch, and the no-cache reply alone does not force an
 * already-open iframe to re-request.
 */
export function paperPdfUrl(arxivId: string, version: number): string {
  return `/research/paper-pdf/${encodeURIComponent(arxivId)}?v=${version}`
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

/**
 * The conflict-check snapshot of one parsed outline: the top-level section
 * titles plus each section's direct child titles, in document order. This is
 * the `baseOutline` a subsection reorder commits against.
 */
export function outlineSectionTitles(nodes: readonly OutlineNode[]): SectionOutlineTitles[] {
  return nodes
    .filter(node => node.level === 1)
    .map(node => ({ title: node.title, subsections: node.children.map(child => child.title) }))
}

/** The dragged subsection of one drop: its current section title and its own title. */
export interface SubsectionDrag {
  readonly sectionTitle: string
  readonly title: string
}

/**
 * Translate one subsection drop into a subsection move. `insertAt` is the
 * insertion indicator's index in the CURRENT subsection order of the target
 * section (0..count); for a same-section drop the move's `targetIndex`
 * addresses the order after the dragged subsection is removed, mirroring
 * {@link sectionMoveFromDrop}. Returns null for a no-op drop (back onto its
 * own slot) or an unknown section/subsection.
 */
export function subsectionMoveFromDrop(
  nodes: readonly OutlineNode[],
  drag: SubsectionDrag,
  targetSectionTitle: string,
  insertAt: number,
): SubsectionMove | null {
  const sections = nodes.filter(node => node.level === 1)
  const source = sections.find(node => node.title === drag.sectionTitle)
  const target = sections.find(node => node.title === targetSectionTitle)
  if (source === undefined || target === undefined) return null
  const from = source.children.findIndex(child => child.title === drag.title)
  if (from === -1) return null
  const same = source === target
  const clamped = Math.min(Math.max(insertAt, 0), target.children.length)
  const targetIndex = same && clamped > from ? clamped - 1 : clamped
  if (same && targetIndex === from) return null
  return { sectionTitle: drag.sectionTitle, title: drag.title, targetSectionTitle, targetIndex }
}

/** All tags across the library, deduped and alphabetically sorted (the filter bar). */
export function collectTags(papers: readonly PaperRecord[]): string[] {
  const tags = new Set<string>()
  for (const paper of papers) for (const tag of paper.tags) tags.add(tag)
  return [...tags].sort()
}

/** All tags across the server list, deduped and alphabetically sorted (the filter bar). */
export function collectServerTags(servers: readonly ServerRecord[]): string[] {
  const tags = new Set<string>()
  for (const server of servers) for (const tag of server.tags) tags.add(tag)
  return [...tags].sort()
}

/** Filter the server list by one active tag; a null selector passes everything. */
export function filterServers(
  servers: readonly ServerRecord[],
  tag: string | null,
): ServerRecord[] {
  return servers.filter(server => tag === null || server.tags.includes(tag))
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

/** Extensions the figure upload accepts, shared by the file input and the drop filter. */
export const FIGURE_ACCEPT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.pdf'] as const

/** The result of splitting dragged files by the accept list. */
export interface DropFileFilter<T> {
  readonly accepted: T[]
  readonly rejected: T[]
}

/**
 * Split dragged files into those matching the accept list (by extension,
 * case-insensitive) and those rejected, so the figures view uploads the
 * accepted ones and reports the rest instead of silently dropping them.
 * Generic over anything carrying a `name` so it stays DOM-free and testable.
 */
export function filterDropFiles<T extends { readonly name: string }>(
  files: readonly T[],
  accept: readonly string[],
): DropFileFilter<T> {
  const accepted: T[] = []
  const rejected: T[] = []
  for (const file of files) {
    const name = file.name.toLowerCase()
    const bucket = accept.some(ext => name.endsWith(ext)) ? accepted : rejected
    bucket.push(file)
  }
  return { accepted, rejected }
}
