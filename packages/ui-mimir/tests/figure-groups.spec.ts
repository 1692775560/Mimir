/**
 * Unit tests for the figures view's grouping rules: same-stem files fold into
 * one card, the preview/insert representatives follow their preference lists,
 * and the metadata merges across siblings.
 */

import { describe, expect, it } from 'vitest'
import type { FigureEntry } from 'dsh-mimir/types'
import { groupFigures } from '../src/client/figure-groups.ts'

/** One bare figure entry fixture. */
function entry(relPath: string, extra: Partial<FigureEntry> = {}): FigureEntry {
  return {
    name: relPath.split('/').pop() ?? relPath,
    relPath,
    sizeBytes: 100,
    mtimeMs: 1,
    ...extra,
  }
}

describe('groupFigures', () => {
  it('folds same-stem PNG/SVG/PDF siblings into one card', () => {
    const groups = groupFigures([
      entry('figures/loss.png'),
      entry('figures/loss.svg', { caption: 'Loss curve' }),
      entry('figures/loss.pdf'),
      entry('figures/bars.png'),
    ])
    expect(groups.length).toBe(2)
    const loss = groups[0]!
    expect(loss.stem).toBe('figures/loss')
    expect(loss.name).toBe('loss')
    expect(loss.entries.length).toBe(3)
    expect(loss.formats).toEqual(['pdf', 'png', 'svg'])
    // Preview prefers the raster sibling; insert prefers the LaTeX vector product.
    expect(loss.preview?.relPath).toBe('figures/loss.png')
    expect(loss.insert.relPath).toBe('figures/loss.pdf')
    expect(loss.caption).toBe('Loss curve')
    expect(loss.sizeBytes).toBe(300)
  })

  it('keeps same-name files of different directories in separate groups', () => {
    const groups = groupFigures([entry('plot.png'), entry('figures/plot.png')])
    expect(groups.map(group => group.stem)).toEqual(['plot', 'figures/plot'])
  })

  it('falls back to the PDF badge card and the SVG insert path', () => {
    const groups = groupFigures([entry('figures/diagram.svg'), entry('figures/vector.pdf')])
    const svgOnly = groups.find(group => group.stem === 'figures/diagram')!
    expect(svgOnly.preview?.relPath).toBe('figures/diagram.svg')
    expect(svgOnly.insert.relPath).toBe('figures/diagram.svg')
    const pdfOnly = groups.find(group => group.stem === 'figures/vector')!
    expect(pdfOnly.preview).toBeNull()
    expect(pdfOnly.insert.relPath).toBe('figures/vector.pdf')
  })

  it('merges the experiment link from whichever sibling carries it', () => {
    const groups = groupFigures([
      entry('figures/a.png'),
      entry('figures/a.svg', { experimentId: 'exp-9' }),
    ])
    expect(groups[0]?.experimentId).toBe('exp-9')
  })
})
