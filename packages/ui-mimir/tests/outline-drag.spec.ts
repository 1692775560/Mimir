/**
 * Tests for `sectionMoveFromDrop`: translating one outline drop (the dragged
 * title plus the insertion indicator's index in the current top-level order)
 * into a `SectionMove`, whose `targetIndex` addresses the order after the
 * dragged section is removed.
 */

import { describe, expect, it } from 'vitest'
import type { OutlineNode } from 'dsh-mimir/types'
import { outlineSectionTitles, sectionMoveFromDrop, subsectionMoveFromDrop } from '../src/client/view-common.ts'

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

/** A two-section outline with subsections under both. */
const NODES: readonly OutlineNode[] = [
  {
    level: 1, title: 'Intro', line: 5,
    children: [
      { level: 2, title: 'Background', line: 7, children: [] },
      { level: 2, title: 'Setup', line: 12, children: [] },
    ],
  },
  {
    level: 1, title: 'Method', line: 20,
    children: [
      { level: 2, title: 'Arch', line: 22, children: [{ level: 3, title: 'Details', line: 24, children: [] }] },
      { level: 2, title: 'Training', line: 30, children: [] },
    ],
  },
  { level: 1, title: 'Conclusion', line: 40, children: [] },
]

describe('outlineSectionTitles', () => {
  it('snapshots the section titles plus their direct child titles', () => {
    expect(outlineSectionTitles(NODES)).toEqual([
      { title: 'Intro', subsections: ['Background', 'Setup'] },
      { title: 'Method', subsections: ['Arch', 'Training'] },
      { title: 'Conclusion', subsections: [] },
    ])
  })
})

describe('subsectionMoveFromDrop', () => {
  it('moves a subsection within its own section', () => {
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Method', title: 'Arch' }, 'Method', 2))
      .toEqual({ sectionTitle: 'Method', title: 'Arch', targetSectionTitle: 'Method', targetIndex: 1 })
  })

  it('moves a subsection across sections', () => {
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Method', title: 'Training' }, 'Intro', 1))
      .toEqual({ sectionTitle: 'Method', title: 'Training', targetSectionTitle: 'Intro', targetIndex: 1 })
  })

  it('drops into a section without subsections', () => {
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Intro', title: 'Setup' }, 'Conclusion', 0))
      .toEqual({ sectionTitle: 'Intro', title: 'Setup', targetSectionTitle: 'Conclusion', targetIndex: 0 })
  })

  it('clamps an out-of-range insertion index', () => {
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Intro', title: 'Background' }, 'Method', 99))
      .toEqual({ sectionTitle: 'Intro', title: 'Background', targetSectionTitle: 'Method', targetIndex: 2 })
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Intro', title: 'Background' }, 'Method', -1))
      .toEqual({ sectionTitle: 'Intro', title: 'Background', targetSectionTitle: 'Method', targetIndex: 0 })
  })

  it('returns null for a no-op drop back onto the same slot', () => {
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Method', title: 'Arch' }, 'Method', 0)).toBeNull()
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Method', title: 'Arch' }, 'Method', 1)).toBeNull()
  })

  it('returns null for unknown sections or subsections', () => {
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Ghost', title: 'Arch' }, 'Method', 0)).toBeNull()
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Method', title: 'Arch' }, 'Ghost', 0)).toBeNull()
    expect(subsectionMoveFromDrop(NODES, { sectionTitle: 'Method', title: 'Ghost' }, 'Method', 0)).toBeNull()
  })
})
