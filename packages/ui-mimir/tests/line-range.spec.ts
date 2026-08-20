/**
 * Behavior tests for lineRangeOf: the pure character-range math behind the
 * paper view's issue/outline click-to-jump selection.
 */

import { describe, expect, it } from 'vitest'
import { lineRangeOf } from '../src/client/view-common.ts'

describe('lineRangeOf', () => {
  it('returns the character range of one 1-based line', () => {
    const text = 'alpha\nbeta gamma\n\ndelta'
    expect(lineRangeOf(text, 1)).toEqual({ start: 0, end: 5 })
    expect(lineRangeOf(text, 2)).toEqual({ start: 6, end: 16 })
    // An empty line selects an empty range at its offset.
    expect(lineRangeOf(text, 3)).toEqual({ start: 17, end: 17 })
    // The last line runs to the text's end.
    expect(lineRangeOf(text, 4)).toEqual({ start: 18, end: 23 })
  })

  it('handles a single-line text and a trailing newline', () => {
    expect(lineRangeOf('only', 1)).toEqual({ start: 0, end: 4 })
    expect(lineRangeOf('a\n', 2)).toEqual({ start: 2, end: 2 })
  })

  it('returns null for out-of-range lines', () => {
    expect(lineRangeOf('a\nb', 0)).toBeNull()
    expect(lineRangeOf('a\nb', -3)).toBeNull()
    expect(lineRangeOf('a\nb', 3)).toBeNull()
    expect(lineRangeOf('', 2)).toBeNull()
    // Line 1 of an empty text is the empty range, not out of range.
    expect(lineRangeOf('', 1)).toEqual({ start: 0, end: 0 })
  })
})
