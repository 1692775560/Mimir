/**
 * The wiki export/import snapshot: the format envelope constants, the pure
 * validation shared by both Remote methods, and the snapshot constructor
 * shared by `exportWiki` and the scheduled backup. `snapshotEnvelopeError`
 * guards the envelope (format/version/table arrays) and `tableRowsError`
 * validates every row of one table against its durable zod schema — both
 * return the first problem as a message (null when clean) so `importWiki`
 * rejects the whole request before any write. DOM-free, so every rule is
 * unit-testable.
 * @module dsh-mimir/src/wiki-snapshot
 */

import type { ZodType } from 'zod'
import {
  claimRecord, experimentRecord, ideaRecord, paperRecord, projectRecord, serverRecord,
} from './store.ts'
import type { ResearchWikiSnapshot, ResearchWikiTableName } from './types.ts'

/** Snapshot envelope marker (`format` field). */
export const WIKI_SNAPSHOT_FORMAT = 'mimir-wiki'
/** Snapshot envelope version (`version` field); matches the domain version. */
export const WIKI_SNAPSHOT_VERSION = 2

/** The six wiki tables, in domain order. */
export const WIKI_TABLE_NAMES = [
  'papers', 'ideas', 'claims', 'projects', 'experiments', 'servers',
] as const satisfies readonly ResearchWikiTableName[]

/** Primary-key field of each table's record (papers key by the arXiv id). */
export const WIKI_TABLE_KEY: Record<ResearchWikiTableName, string> = {
  papers: 'arxivId',
  ideas: 'id',
  claims: 'id',
  projects: 'id',
  experiments: 'id',
  servers: 'id',
}

const TABLE_SCHEMAS: Record<ResearchWikiTableName, ZodType> = {
  papers: paperRecord,
  ideas: ideaRecord,
  claims: claimRecord,
  projects: projectRecord,
  experiments: experimentRecord,
  servers: serverRecord,
}

/** Minimal read surface the snapshot builder needs from an open wiki domain. */
export interface WikiSnapshotSource {
  table(name: ResearchWikiTableName): { entries(): IterableIterator<[string, unknown]> }
}

/**
 * Snapshot the whole wiki: every record of all six tables under the format
 * envelope. Shared by the `exportWiki` Remote and the scheduled backup, so
 * both always emit the same shape.
 * @param domain - the open wiki domain (anything with per-table `entries`).
 * @param now - the `exportedAt` timestamp (defaults to the current time).
 * @returns the snapshot, tables frozen.
 */
export function buildWikiSnapshot(domain: WikiSnapshotSource, now = new Date()): ResearchWikiSnapshot {
  const rows = (name: ResearchWikiTableName): readonly unknown[] =>
    Object.freeze([...domain.table(name).entries()].map(([, record]) => record))
  return {
    format: WIKI_SNAPSHOT_FORMAT,
    version: WIKI_SNAPSHOT_VERSION,
    exportedAt: now.toISOString(),
    tables: {
      papers: rows('papers') as ResearchWikiSnapshot['tables']['papers'],
      ideas: rows('ideas') as ResearchWikiSnapshot['tables']['ideas'],
      claims: rows('claims') as ResearchWikiSnapshot['tables']['claims'],
      projects: rows('projects') as ResearchWikiSnapshot['tables']['projects'],
      experiments: rows('experiments') as ResearchWikiSnapshot['tables']['experiments'],
      servers: rows('servers') as ResearchWikiSnapshot['tables']['servers'],
    },
  }
}

/**
 * Validate the snapshot envelope; returns the first problem or null. A clean
 * envelope narrows `raw` to {@link ResearchWikiSnapshot} for the caller
 * (rows still need {@link tableRowsError}).
 */
export function snapshotEnvelopeError(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return 'snapshot must be an object'
  // Untyped on purpose: every field is runtime-checked below, so the cast
  // must not narrow anything away.
  const snapshot = raw as {
    format?: unknown
    version?: unknown
    exportedAt?: unknown
    tables?: unknown
  }
  if (snapshot.format !== WIKI_SNAPSHOT_FORMAT) return `format must be "${WIKI_SNAPSHOT_FORMAT}"`
  if (snapshot.version !== WIKI_SNAPSHOT_VERSION) return `version must be ${WIKI_SNAPSHOT_VERSION}`
  if (typeof snapshot.exportedAt !== 'string') return 'exportedAt must be a string'
  if (typeof snapshot.tables !== 'object' || snapshot.tables === null) return 'tables must be an object'
  const tables = snapshot.tables as Record<string, unknown>
  for (const name of WIKI_TABLE_NAMES) {
    if (!Array.isArray(tables[name])) return `tables.${name} must be an array`
  }
  return null
}

/**
 * Validate every row of one table against its schema; returns the first
 * problem (`tables.<name>[<index>]: …`) or null. A row missing/duplicating
 * its primary key is rejected here too.
 */
export function tableRowsError(table: ResearchWikiTableName, rows: readonly unknown[]): string | null {
  const keyField = WIKI_TABLE_KEY[table]
  const seen = new Set<string>()
  for (const [index, row] of rows.entries()) {
    const parsed = TABLE_SCHEMAS[table].safeParse(row)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue === undefined ? '' : ` (${issue.path.join('.')}: ${issue.message})`
      return `tables.${table}[${index}] is invalid${where}`
    }
    const key = (parsed.data as Record<string, unknown>)[keyField]
    if (typeof key !== 'string' || key === '') return `tables.${table}[${index}] has no ${keyField}`
    if (seen.has(key)) return `tables.${table}[${index}] duplicates ${keyField} "${key}"`
    seen.add(key)
  }
  return null
}
