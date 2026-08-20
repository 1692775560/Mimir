/**
 * Tests for the overview data section's pure helpers: the export download's
 * filename (`mimir-wiki-YYYYMMDD.json`, UTC) and the import dialog's snapshot
 * summary (per-table row counts, null for anything not a recognizable
 * mimir-wiki snapshot).
 */

import { describe, expect, it } from 'vitest'
import { wikiExportFilename, wikiSnapshotSummary } from '../src/client/wiki-transfer.ts'

/** One well-formed minimal snapshot for the summary tests. */
function validSnapshot(): unknown {
  return {
    format: 'mimir-wiki',
    version: 2,
    exportedAt: '2026-08-20T12:00:00.000Z',
    tables: {
      papers: [{ arxivId: 'a' }, { arxivId: 'b' }],
      ideas: [],
      claims: [{ id: 'c' }],
      projects: [{ id: 'p' }],
      experiments: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
      servers: [],
    },
  }
}

describe('wikiExportFilename', () => {
  it('stamps the UTC date as mimir-wiki-YYYYMMDD.json', () => {
    expect(wikiExportFilename(new Date('2026-08-20T21:53:42.729Z'))).toBe('mimir-wiki-20260820.json')
  })

  it('uses the UTC date, not the local one', () => {
    // 23:30 UTC on the 1st is already the 2nd in UTC+8; the stamp must stay the 1st.
    expect(wikiExportFilename(new Date('2026-01-01T23:30:00.000Z'))).toBe('mimir-wiki-20260101.json')
  })
})

describe('wikiSnapshotSummary', () => {
  it('reads the export timestamp and every table count', () => {
    expect(wikiSnapshotSummary(validSnapshot())).toEqual({
      exportedAt: '2026-08-20T12:00:00.000Z',
      tables: [
        { name: 'papers', count: 2 },
        { name: 'ideas', count: 0 },
        { name: 'claims', count: 1 },
        { name: 'projects', count: 1 },
        { name: 'experiments', count: 3 },
        { name: 'servers', count: 0 },
      ],
    })
  })

  it('rejects a wrong format tag', () => {
    const raw = validSnapshot() as { format: string }
    raw.format = 'other-tool'
    expect(wikiSnapshotSummary(raw)).toBeNull()
  })

  it('rejects a wrong snapshot version', () => {
    const raw = validSnapshot() as { version: number }
    raw.version = 1
    expect(wikiSnapshotSummary(raw)).toBeNull()
  })

  it('rejects a missing exportedAt timestamp', () => {
    const raw = validSnapshot() as { exportedAt?: unknown }
    delete raw.exportedAt
    expect(wikiSnapshotSummary(raw)).toBeNull()
  })

  it('rejects a snapshot missing one table array', () => {
    const raw = validSnapshot() as { tables: Record<string, unknown> }
    delete raw.tables['claims']
    expect(wikiSnapshotSummary(raw)).toBeNull()
  })

  it('rejects a table that is not an array', () => {
    const raw = validSnapshot() as { tables: Record<string, unknown> }
    raw.tables['servers'] = { id: 's' }
    expect(wikiSnapshotSummary(raw)).toBeNull()
  })

  it('rejects non-object roots', () => {
    expect(wikiSnapshotSummary(null)).toBeNull()
    expect(wikiSnapshotSummary('mimir-wiki')).toBeNull()
    expect(wikiSnapshotSummary(42)).toBeNull()
  })
})
