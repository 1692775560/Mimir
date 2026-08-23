/**
 * Pure helpers behind the papers view's reading-notes side panel. Reading
 * notes live inside the paper record's free-form `notes` string (no extra
 * storage): each entry the panel appends is one block headed by a
 * `[YYYY-MM-DD HH:mm]` timestamp, blocks separated by a blank line — the
 * same blank-line convention the agent's note appends already use. Blocks
 * not carrying the header (legacy or agent-written notes) are preserved
 * verbatim by the append and simply skipped by the parse.
 * @module dsh-client-ui-mimir/client/paper-notes
 */

/** One parsed reading-note entry: the header timestamp and the body text. */
export interface ReadingNote {
  readonly at: string
  readonly text: string
}

/** Matches one entry block's `[YYYY-MM-DD HH:mm]` header line. */
const NOTE_HEADER = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\n/

/**
 * Format one moment as the entry header timestamp, in local time — the
 * reader thinks in "this afternoon while reading", not UTC.
 * @param date - the moment the note is taken.
 * @returns the `YYYY-MM-DD HH:mm` stamp.
 */
export function formatNoteStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Append one timestamped entry to a notes string. Existing content (entries
 * and free-form blocks alike) is kept untouched; an empty body is a no-op.
 * @param notes - the paper record's current notes, possibly empty.
 * @param text - the new entry's body; surrounding whitespace is trimmed.
 * @param now - the moment the note is taken.
 * @returns the notes string with the entry appended.
 */
export function appendReadingNote(notes: string, text: string, now: Date): string {
  const body = text.trim()
  if (body === '') return notes
  const entry = `[${formatNoteStamp(now)}]\n${body}`
  return notes.trimEnd() === '' ? entry : `${notes.trimEnd()}\n\n${entry}`
}

/**
 * Parse the timestamped entries out of a notes string, in stored order.
 * Blocks without the `[YYYY-MM-DD HH:mm]` header are not reading-note
 * entries and are skipped (they stay visible in the card's raw notes line).
 * @param notes - the paper record's notes.
 * @returns the entries, oldest first.
 */
export function parseReadingNotes(notes: string): ReadingNote[] {
  const entries: ReadingNote[] = []
  for (const block of notes.split(/\n{2,}/)) {
    const match = NOTE_HEADER.exec(block)
    if (match === null || match[1] === undefined) continue
    entries.push({ at: match[1], text: block.slice(match[0].length) })
  }
  return entries
}
