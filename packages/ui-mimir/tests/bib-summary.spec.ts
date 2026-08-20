/**
 * Tests for `bibSummaryOf`: the bib panel row's one-line summary — the title
 * when present (whitespace-collapsed, truncated at 80 characters), else the
 * author/year pair, else the bare entry type.
 */

import { describe, expect, it } from 'vitest'
import { bibSummaryOf } from '../src/client/view-common.ts'

describe('bibSummaryOf', () => {
  it('prefers the title, collapsing whitespace runs', () => {
    expect(bibSummaryOf({
      key: 'a',
      type: 'article',
      fields: { title: 'A  Whole-Body\nPolicy', author: 'Ann', year: '2024' },
    })).toBe('A Whole-Body Policy')
  })

  it('truncates a long title at 80 characters with an ellipsis', () => {
    const title = 'x'.repeat(100)
    const summary = bibSummaryOf({ key: 'a', type: 'misc', fields: { title } })
    expect(summary).toBe(`${'x'.repeat(80)}…`)
  })

  it('falls back to the author/year pair when the title is missing or blank', () => {
    expect(bibSummaryOf({ key: 'a', type: 'misc', fields: { author: 'Ann and Bob', year: '2023' } }))
      .toBe('Ann and Bob · 2023')
    expect(bibSummaryOf({ key: 'a', type: 'misc', fields: { title: '  ', year: '2023' } }))
      .toBe('2023')
  })

  it('falls back to the entry type when no field yields a summary', () => {
    expect(bibSummaryOf({ key: 'a', type: 'inproceedings', fields: {} })).toBe('inproceedings')
  })
})
