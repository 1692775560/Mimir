/**
 * Tests for `sectionMoveFromDrop`: translating one outline drop (the dragged
 * title plus the insertion indicator's index in the current top-level order)
 * into a `SectionMove`, whose `targetIndex` addresses the order after the
 * dragged section is removed.
 */

import { describe, expect, it } from 'vitest'
import { sectionMoveFromDrop } from '../src/client/view-common.ts'

const TITLES = ['Intro', 'Related', 'Method', 'Conclusion']

describe('sectionMoveFromDrop', () => {
  it('moves a section forward (drop below a later row)', () => {
    expect(sectionMoveFromDrop(TITLES, 'Intro', 3)).toEqual({ title: 'Intro', targetIndex: 2 })
  })

  it('moves a section backward (drop above an earlier row)', () => {
    expect(sectionMoveFromDrop(TITLES, 'Conclusion', 0)).toEqual({ title: 'Conclusion', targetIndex: 0 })
  })

  it('moves a section to the very end (drop past the last row)', () => {
    expect(sectionMoveFromDrop(TITLES, 'Related', 4)).toEqual({ title: 'Related', targetIndex: 3 })
  })

  it('returns null when the drop lands back on the section itself', () => {
    expect(sectionMoveFromDrop(TITLES, 'Method', 2)).toBeNull()
    expect(sectionMoveFromDrop(TITLES, 'Method', 3)).toBeNull()
  })

  it('clamps an out-of-range insertion index', () => {
    expect(sectionMoveFromDrop(TITLES, 'Conclusion', -2)).toEqual({ title: 'Conclusion', targetIndex: 0 })
    expect(sectionMoveFromDrop(TITLES, 'Intro', 99)).toEqual({ title: 'Intro', targetIndex: 3 })
  })

  it('returns null for a title outside the top-level order', () => {
    expect(sectionMoveFromDrop(TITLES, 'Appendix', 0)).toBeNull()
    expect(sectionMoveFromDrop(TITLES, 'Appendix', 1)).toBeNull()
  })
})
