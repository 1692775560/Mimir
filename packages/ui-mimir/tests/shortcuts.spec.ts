/**
 * Behavior tests for the workbench-chrome pure logic: the keyboard-shortcut
 * mapping (tab digits, Escape, ⌘/Ctrl+Enter, the editable-target guard) and
 * the theme/locale toggle targets.
 */

import { describe, expect, it } from 'vitest'
import { nextColorScheme, nextLocale, shortcutFor, TABS } from '../src/client/shortcuts.ts'

/** A plain keydown with no modifiers and no editable focus. */
function key(keyValue: string, patch: Partial<Parameters<typeof shortcutFor>[0]> = {}) {
  return { key: keyValue, metaKey: false, ctrlKey: false, altKey: false, editable: false, ...patch }
}

describe('shortcutFor', () => {
  it('maps digits 1-6 to the rail tabs in order', () => {
    TABS.forEach((tab, index) => {
      expect(shortcutFor(key(String(index + 1)))).toEqual({ type: 'tab', tab })
    })
    expect(TABS).toHaveLength(6)
  })

  it('ignores digits outside the tab range and non-digit keys', () => {
    expect(shortcutFor(key('7'))).toBeNull()
    expect(shortcutFor(key('0'))).toBeNull()
    expect(shortcutFor(key('q'))).toBeNull()
    // A shifted digit arrives as the shifted character, not a digit.
    expect(shortcutFor(key('!'))).toBeNull()
  })

  it('maps Escape to close', () => {
    expect(shortcutFor(key('Escape'))).toEqual({ type: 'close' })
  })

  it('maps ⌘/Ctrl+Enter to compile, either modifier', () => {
    expect(shortcutFor(key('Enter', { metaKey: true }))).toEqual({ type: 'compile' })
    expect(shortcutFor(key('Enter', { ctrlKey: true }))).toEqual({ type: 'compile' })
  })

  it('ignores bare Enter and other ⌘/Ctrl combos', () => {
    expect(shortcutFor(key('Enter'))).toBeNull()
    expect(shortcutFor(key('s', { metaKey: true }))).toBeNull()
    expect(shortcutFor(key('1', { ctrlKey: true }))).toBeNull()
  })

  it('passes every combo through while a text-entry surface holds focus', () => {
    expect(shortcutFor(key('1', { editable: true }))).toBeNull()
    expect(shortcutFor(key('Escape', { editable: true }))).toBeNull()
    expect(shortcutFor(key('Enter', { metaKey: true, editable: true }))).toBeNull()
  })

  it('ignores alt combos (browser menu accelerators)', () => {
    expect(shortcutFor(key('1', { altKey: true }))).toBeNull()
    expect(shortcutFor(key('Enter', { metaKey: true, altKey: true }))).toBeNull()
  })
})

describe('toggle targets', () => {
  it('nextColorScheme flips the resolved scheme', () => {
    expect(nextColorScheme(true)).toBe('light')
    expect(nextColorScheme(false)).toBe('dark')
  })

  it('nextLocale flips between the two shipped locales', () => {
    expect(nextLocale('zh')).toBe('en')
    expect(nextLocale('en')).toBe('zh')
  })
})
