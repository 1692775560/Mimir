/**
 * Tests for the paper view's layout math: the rail drag clamp with the
 * collapse snap, the editor/preview split clamp with both minimums, and the
 * localStorage codec's fallbacks (missing key, malformed JSON, out-of-range
 * values).
 */

import { describe, expect, it } from 'vitest'
import {
  EDITOR_MIN_WIDTH,
  editorShareFromDrag,
  loadPaperLayout,
  PAPER_LAYOUT_DEFAULT,
  PAPER_LAYOUT_STORAGE_KEY,
  PAPER_NARROW_BREAKPOINT,
  paperSoloPane,
  PREVIEW_MIN_WIDTH,
  railWidthFromDrag,
  RAIL_COLLAPSE_BELOW,
  RAIL_MAX_WIDTH,
  serializePaperLayout,
} from '../src/client/paper-layout.ts'

describe('railWidthFromDrag', () => {
  it('adds the pointer delta to the start width, rounded', () => {
    expect(railWidthFromDrag(200, 40)).toBe(240)
    expect(railWidthFromDrag(200, -50.4)).toBe(150)
  })

  it('clamps to the maximum rail width', () => {
    expect(railWidthFromDrag(200, 500)).toBe(RAIL_MAX_WIDTH)
    expect(railWidthFromDrag(0, RAIL_MAX_WIDTH + 1)).toBe(RAIL_MAX_WIDTH)
  })

  it('snaps to collapsed below the threshold instead of leaving a sliver', () => {
    expect(railWidthFromDrag(200, -141)).toBe(0) // 59 < 60
    expect(railWidthFromDrag(200, -140)).toBe(RAIL_COLLAPSE_BELOW) // exactly at the threshold
    expect(railWidthFromDrag(0, -30)).toBe(0)
  })
})

describe('editorShareFromDrag', () => {
  it('converts the dragged editor px into a share of the available width', () => {
    expect(editorShareFromDrag(600, 1000)).toBeCloseTo(0.6)
  })

  it('keeps the editor minimum', () => {
    expect(editorShareFromDrag(100, 1000)).toBeCloseTo(EDITOR_MIN_WIDTH / 1000)
  })

  it('keeps the preview minimum', () => {
    expect(editorShareFromDrag(900, 1000)).toBeCloseTo((1000 - PREVIEW_MIN_WIDTH) / 1000)
  })

  it('lets the editor minimum win when the container cannot fit both', () => {
    // 400px available cannot hold 360 + 280: the editor clamps to 360.
    expect(editorShareFromDrag(390, 400)).toBeCloseTo(EDITOR_MIN_WIDTH / 400)
  })

  it('falls back to the default share on a zero-width container', () => {
    expect(editorShareFromDrag(100, 0)).toBe(PAPER_LAYOUT_DEFAULT.editor)
  })
})

describe('loadPaperLayout', () => {
  it('returns the default when nothing is stored', () => {
    expect(loadPaperLayout(() => null)).toEqual(PAPER_LAYOUT_DEFAULT)
  })

  it('parses a stored layout', () => {
    const stored = serializePaperLayout({ rail: 260, editor: 0.75 })
    expect(loadPaperLayout(key => (key === PAPER_LAYOUT_STORAGE_KEY ? stored : null)))
      .toEqual({ rail: 260, editor: 0.75 })
  })

  it('falls back on malformed JSON', () => {
    expect(loadPaperLayout(() => '{oops')).toEqual(PAPER_LAYOUT_DEFAULT)
  })

  it('falls back on out-of-range values', () => {
    expect(loadPaperLayout(() => JSON.stringify({ rail: -5, editor: 0.6 }))).toEqual(PAPER_LAYOUT_DEFAULT)
    expect(loadPaperLayout(() => JSON.stringify({ rail: RAIL_MAX_WIDTH + 1, editor: 0.6 })))
      .toEqual(PAPER_LAYOUT_DEFAULT)
    expect(loadPaperLayout(() => JSON.stringify({ rail: 200, editor: 0 }))).toEqual(PAPER_LAYOUT_DEFAULT)
    expect(loadPaperLayout(() => JSON.stringify({ rail: 200, editor: 1 }))).toEqual(PAPER_LAYOUT_DEFAULT)
    expect(loadPaperLayout(() => JSON.stringify({ rail: 200 }))).toEqual(PAPER_LAYOUT_DEFAULT)
  })

  it('falls back when storage itself throws', () => {
    expect(loadPaperLayout(() => { throw new Error('denied') })).toEqual(PAPER_LAYOUT_DEFAULT)
  })
})

describe('paperSoloPane', () => {
  it('exposes the narrow breakpoint at 900px', () => {
    expect(PAPER_NARROW_BREAKPOINT).toBe(900)
  })

  it('follows the tab selection under the narrow breakpoint', () => {
    expect(paperSoloPane(true, 'editor', null)).toBe('editor')
    expect(paperSoloPane(true, 'preview', null)).toBe('preview')
  })

  it('lets the tab override a stale fullscreen flag while narrow', () => {
    expect(paperSoloPane(true, 'editor', 'preview')).toBe('editor')
  })

  it('follows the fullscreen flag at full width', () => {
    expect(paperSoloPane(false, 'editor', 'preview')).toBe('preview')
    expect(paperSoloPane(false, 'preview', 'editor')).toBe('editor')
  })

  it('keeps the split layout at full width with no fullscreen', () => {
    expect(paperSoloPane(false, 'editor', null)).toBeNull()
    expect(paperSoloPane(false, 'preview', null)).toBeNull()
  })
})
