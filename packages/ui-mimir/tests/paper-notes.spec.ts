/**
 * Behavior tests for the reading-notes helpers behind the papers view's PDF
 * reader side panel: timestamp formatting, appending an entry without
 * touching existing content, and parsing entries back out while skipping
 * free-form (agent-written or legacy) blocks.
 */

import { describe, expect, it } from 'vitest'
import { appendReadingNote, formatNoteStamp, parseReadingNotes } from '../src/client/paper-notes.ts'

/** One fixed local moment: 2026-08-23 07:05. */
const MORNING = new Date(2026, 7, 23, 7, 5)
/** One fixed local moment later that day: 2026-08-23 15:42. */
const AFTERNOON = new Date(2026, 7, 23, 15, 42)

describe('formatNoteStamp', () => {
  it('formats local time as YYYY-MM-DD HH:mm with zero padding', () => {
    expect(formatNoteStamp(MORNING)).toBe('2026-08-23 07:05')
    expect(formatNoteStamp(AFTERNOON)).toBe('2026-08-23 15:42')
  })
})

describe('appendReadingNote', () => {
  it('starts an empty notes string without a leading separator', () => {
    expect(appendReadingNote('', 'great baseline trick', MORNING))
      .toBe('[2026-08-23 07:05]\ngreat baseline trick')
  })

  it('appends after a blank line and preserves existing content verbatim', () => {
    const existing = 'agent note, free-form'
    const next = appendReadingNote(existing, ' multi-line\nidea ', MORNING)
    expect(next).toBe('agent note, free-form\n\n[2026-08-23 07:05]\nmulti-line\nidea')
  })

  it('drops trailing blank space of the existing notes instead of compounding it', () => {
    expect(appendReadingNote('old note\n\n\n', 'fresh', MORNING))
      .toBe('old note\n\n[2026-08-23 07:05]\nfresh')
  })

  it('is a no-op for a blank body', () => {
    expect(appendReadingNote('keep me', '   \n ', MORNING)).toBe('keep me')
    expect(appendReadingNote('', '  ', MORNING)).toBe('')
  })
})

describe('parseReadingNotes', () => {
  it('parses entries in stored order and skips free-form blocks', () => {
    const notes = [
      'agent note, free-form',
      '[2026-08-23 07:05]\nfirst entry',
      '[2026-08-23 15:42]\nsecond entry\nwith a second line',
    ].join('\n\n')
    expect(parseReadingNotes(notes)).toEqual([
      { at: '2026-08-23 07:05', text: 'first entry' },
      { at: '2026-08-23 15:42', text: 'second entry\nwith a second line' },
    ])
  })

  it('returns an empty list for empty or headerless notes', () => {
    expect(parseReadingNotes('')).toEqual([])
    expect(parseReadingNotes('just a thought\n\nanother one')).toEqual([])
    // A bracketed block without the full timestamp shape is not an entry.
    expect(parseReadingNotes('[todo] check citations')).toEqual([])
  })

  it('round-trips through appendReadingNote', () => {
    let notes = ''
    notes = appendReadingNote(notes, 'first', MORNING)
    notes = appendReadingNote(notes, 'second', AFTERNOON)
    expect(parseReadingNotes(notes).map(entry => entry.text)).toEqual(['first', 'second'])
  })
})
