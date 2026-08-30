/**
 * Behavior tests for the cognitive brief view's pure logic: the window →
 * brief-options translation (ISO bounds, project scope, the all-time special
 * case), the Markdown download's file name (local day of `generatedAt`, the
 * now fallback), and the journal draft's validation states.
 */

import { describe, expect, it } from 'vitest'
import {
  briefFileName,
  briefWindowOptions,
  journalTextState,
  JOURNAL_MAX_CHARS,
} from '../src/client/brief-view.ts'

/** A fixed wall clock: 2026-08-24T12:00:00Z. */
const NOW = Date.UTC(2026, 7, 24, 12, 0, 0)

describe('briefWindowOptions', () => {
  it('translates the window and scope without the list fields', () => {
    expect(briefWindowOptions('7d', 'p1', NOW)).toEqual({
      since: new Date(NOW - 7 * 86_400_000).toISOString(),
      projectId: 'p1',
    })
  })

  it('covers 30 and 90 day windows and omits since for all time', () => {
    expect(briefWindowOptions('30d', null, NOW).since).toBe(new Date(NOW - 30 * 86_400_000).toISOString())
    expect(briefWindowOptions('90d', null, NOW).since).toBe(new Date(NOW - 90 * 86_400_000).toISOString())
    expect(briefWindowOptions('all', 'p1', NOW)).toEqual({ projectId: 'p1' })
  })
})

describe('briefFileName', () => {
  it('dates the file from the brief timestamp (local day of generatedAt)', () => {
    const stamp = new Date('2026-08-24T12:00:00Z')
    const pad = (value: number): string => String(value).padStart(2, '0')
    const expected = `mimir-brief-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.md`
    expect(briefFileName('2026-08-24T12:00:00Z', NOW)).toBe(expected)
  })

  it('falls back to now for a missing or invalid timestamp', () => {
    expect(briefFileName(null, NOW)).toBe(briefFileName(new Date(NOW).toISOString(), NOW))
    expect(briefFileName('garbage', NOW)).toBe(briefFileName(null, NOW))
  })
})

describe('journalTextState', () => {
  it('reads whitespace-only drafts as empty and normal text as ok', () => {
    expect(journalTextState('')).toBe('empty')
    expect(journalTextState('   \n\t ')).toBe('empty')
    expect(journalTextState('这条线起来了')).toBe('ok')
    expect(journalTextState(' padded ')).toBe('ok')
  })

  it('flags a draft past the mirrored server cap as too-long', () => {
    expect(JOURNAL_MAX_CHARS).toBe(1024)
    expect(journalTextState('x'.repeat(JOURNAL_MAX_CHARS))).toBe('ok')
    expect(journalTextState('x'.repeat(JOURNAL_MAX_CHARS + 1))).toBe('too-long')
  })
})
