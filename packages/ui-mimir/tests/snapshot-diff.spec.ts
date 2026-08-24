/**
 * Behavior tests for the snapshot line diff: exact rows for edits, insertions
 * and deletions (with 1-based line numbers on the owning side), the common
 * prefix/suffix trim, and the display compaction that folds long unchanged
 * runs into gap markers.
 */

import { describe, expect, it } from 'vitest'
import { collapseDiffRows, diffLines } from '../src/client/snapshot-diff.ts'

describe('diffLines', () => {
  it('reports identical texts as all-same rows', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'a' },
      { type: 'same', oldLine: 2, newLine: 2, text: 'b' },
      { type: 'same', oldLine: 3, newLine: 3, text: 'c' },
    ])
  })

  it('reports one edited line as del+add between the same runs', () => {
    expect(diffLines('a\nold\nc', 'a\nnew\nc')).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'a' },
      { type: 'del', oldLine: 2, text: 'old' },
      { type: 'add', newLine: 2, text: 'new' },
      { type: 'same', oldLine: 3, newLine: 3, text: 'c' },
    ])
  })

  it('reports a pure insertion with shifted new-side line numbers', () => {
    expect(diffLines('a\nc', 'a\nb\nc')).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'a' },
      { type: 'add', newLine: 2, text: 'b' },
      { type: 'same', oldLine: 2, newLine: 3, text: 'c' },
    ])
  })

  it('reports a pure deletion with shifted old-side line numbers', () => {
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'a' },
      { type: 'del', oldLine: 2, text: 'b' },
      { type: 'same', oldLine: 3, newLine: 2, text: 'c' },
    ])
  })

  it('handles empty texts and single-line texts', () => {
    expect(diffLines('', '')).toEqual([{ type: 'same', oldLine: 1, newLine: 1, text: '' }])
    expect(diffLines('', 'new')).toEqual([
      { type: 'del', oldLine: 1, text: '' },
      { type: 'add', newLine: 1, text: 'new' },
    ])
    expect(diffLines('a\nb', '')).toEqual([
      { type: 'del', oldLine: 1, text: 'a' },
      { type: 'del', oldLine: 2, text: 'b' },
      { type: 'add', newLine: 1, text: '' },
    ])
  })

  it('diffs two disjoint middles as del block then add block', () => {
    const rows = diffLines('head\nx\ny\ntail', 'head\np\nq\nr\ntail')
    expect(rows).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'head' },
      { type: 'del', oldLine: 2, text: 'x' },
      { type: 'del', oldLine: 3, text: 'y' },
      { type: 'add', newLine: 2, text: 'p' },
      { type: 'add', newLine: 3, text: 'q' },
      { type: 'add', newLine: 4, text: 'r' },
      { type: 'same', oldLine: 4, newLine: 5, text: 'tail' },
    ])
  })
})

describe('collapseDiffRows', () => {
  it('keeps short same runs expanded', () => {
    const rows = diffLines('a\nb\nc\nd', 'a\nb\nc\nD')
    expect(collapseDiffRows(rows)).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'a' },
      { type: 'same', oldLine: 2, newLine: 2, text: 'b' },
      { type: 'same', oldLine: 3, newLine: 3, text: 'c' },
      { type: 'del', oldLine: 4, text: 'd' },
      { type: 'add', newLine: 4, text: 'D' },
    ])
  })

  it('folds a long same run into a gap keeping three context lines per side', () => {
    const before = ['top', ...Array.from({ length: 10 }, (_, index) => `same${index}`), 'old'].join('\n')
    const after = ['top', ...Array.from({ length: 10 }, (_, index) => `same${index}`), 'new'].join('\n')
    expect(collapseDiffRows(diffLines(before, after))).toEqual([
      { type: 'same', oldLine: 1, newLine: 1, text: 'top' },
      { type: 'same', oldLine: 2, newLine: 2, text: 'same0' },
      { type: 'same', oldLine: 3, newLine: 3, text: 'same1' },
      { type: 'gap', count: 5 },
      { type: 'same', oldLine: 9, newLine: 9, text: 'same7' },
      { type: 'same', oldLine: 10, newLine: 10, text: 'same8' },
      { type: 'same', oldLine: 11, newLine: 11, text: 'same9' },
      { type: 'del', oldLine: 12, text: 'old' },
      { type: 'add', newLine: 12, text: 'new' },
    ])
  })

  it('folds the leading and trailing same runs of an all-change middle', () => {
    const same = Array.from({ length: 8 }, (_, index) => `s${index}`)
    const rows = diffLines([...same, 'a'].join('\n'), ['b', ...same].join('\n'))
    const display = collapseDiffRows(rows)
    // The LCS anchors on the shared block: the add lands on top, the del at
    // the bottom (any minimal alignment is fine), and the eight-line same run
    // folds to 3 + gap(2) + 3.
    expect(display[0]).toEqual({ type: 'add', newLine: 1, text: 'b' })
    expect(display.at(-1)).toEqual({ type: 'del', oldLine: 9, text: 'a' })
    expect(display).toContainEqual({ type: 'gap', count: 2 })
  })
})
