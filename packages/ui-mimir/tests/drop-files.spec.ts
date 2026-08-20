/**
 * Tests for the figures view's drop filter: accept-listed extensions pass
 * (case-insensitively), everything else is reported as rejected so the view
 * can name the skipped files instead of silently ignoring them.
 */

import { describe, expect, it } from 'vitest'
import { FIGURE_ACCEPT_EXTENSIONS, filterDropFiles } from '../src/client/view-common.ts'

const file = (name: string): { name: string } => ({ name })

describe('filterDropFiles', () => {
  it('accepts every extension in the accept list', () => {
    const files = [file('a.png'), file('b.jpg'), file('c.jpeg'), file('d.svg'), file('e.pdf')]
    const { accepted, rejected } = filterDropFiles(files, FIGURE_ACCEPT_EXTENSIONS)
    expect(accepted.map(f => f.name)).toEqual(['a.png', 'b.jpg', 'c.jpeg', 'd.svg', 'e.pdf'])
    expect(rejected).toEqual([])
  })

  it('matches extensions case-insensitively', () => {
    const { accepted } = filterDropFiles([file('chart.PNG'), file('fig.SVG')], FIGURE_ACCEPT_EXTENSIONS)
    expect(accepted.map(f => f.name)).toEqual(['chart.PNG', 'fig.SVG'])
  })

  it('rejects unsupported types without dropping them silently', () => {
    const { accepted, rejected } = filterDropFiles(
      [file('ok.png'), file('notes.md'), file('archive.zip'), file('noext')],
      FIGURE_ACCEPT_EXTENSIONS,
    )
    expect(accepted.map(f => f.name)).toEqual(['ok.png'])
    expect(rejected.map(f => f.name)).toEqual(['notes.md', 'archive.zip', 'noext'])
  })

  it('handles an empty drop', () => {
    expect(filterDropFiles([], FIGURE_ACCEPT_EXTENSIONS)).toEqual({ accepted: [], rejected: [] })
  })
})
