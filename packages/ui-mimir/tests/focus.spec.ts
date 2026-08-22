/**
 * Tests for the workbench's pure focus logic: the cyclic index wrap, the
 * dialog focus trap (wrap at both ends, pull focus back in from outside), and
 * the rail tablist's arrow-key cycling.
 */

import { describe, expect, it } from 'vitest'
import { arrowTab, trapFocusIndex, wrapIndex } from '../src/client/focus.ts'
import { TABS } from '../src/client/shortcuts.ts'

describe('wrapIndex', () => {
  it('moves within the range without wrapping', () => {
    expect(wrapIndex(1, 1, 5)).toBe(2)
    expect(wrapIndex(3, -1, 5)).toBe(2)
  })

  it('cycles past both ends', () => {
    expect(wrapIndex(4, 1, 5)).toBe(0)
    expect(wrapIndex(0, -1, 5)).toBe(4)
  })

  it('returns -1 for an empty list', () => {
    expect(wrapIndex(0, 1, 0)).toBe(-1)
  })
})

describe('trapFocusIndex', () => {
  it('lets the browser handle Tab movement that stays inside', () => {
    expect(trapFocusIndex(0, 3, false)).toBeNull()
    expect(trapFocusIndex(2, 4, true)).toBeNull()
  })

  it('wraps Tab past the last element back to the first', () => {
    expect(trapFocusIndex(2, 3, false)).toBe(0)
  })

  it('wraps Shift+Tab before the first element to the last', () => {
    expect(trapFocusIndex(0, 3, true)).toBe(2)
  })

  it('pulls focus that sits outside the container back inside', () => {
    expect(trapFocusIndex(-1, 3, false)).toBe(0)
    expect(trapFocusIndex(-1, 3, true)).toBe(2)
    expect(trapFocusIndex(7, 3, false)).toBe(0)
  })

  it('handles a container with no focusable elements', () => {
    expect(trapFocusIndex(-1, 0, false)).toBeNull()
  })
})

describe('arrowTab', () => {
  it('moves right/down to the next tab and left/up to the previous', () => {
    expect(arrowTab('overview', 'ArrowRight')).toBe('paper')
    expect(arrowTab('overview', 'ArrowDown')).toBe('paper')
    expect(arrowTab('paper', 'ArrowLeft')).toBe('overview')
    expect(arrowTab('paper', 'ArrowUp')).toBe('overview')
  })

  it('cycles past both ends of the rail', () => {
    expect(arrowTab('overview', 'ArrowLeft')).toBe(TABS[TABS.length - 1])
    expect(arrowTab(TABS[TABS.length - 1] ?? 'servers', 'ArrowRight')).toBe('overview')
  })

  it('ignores non-arrow keys', () => {
    expect(arrowTab('overview', 'Enter')).toBeNull()
    expect(arrowTab('overview', 'Tab')).toBeNull()
  })
})
