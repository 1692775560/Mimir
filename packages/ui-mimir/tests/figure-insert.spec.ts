/**
 * Unit tests for the figure insert rules: label sanitization, the standard
 * block, the duplicate-reference detection, and the insertion-point math.
 */

import { describe, expect, it } from 'vitest'
import {
  figureBlockOf, figureLabelOf, findFigureReferenceLine, insertFigureBlock, isSvgFigure,
} from '../src/client/figure-insert.ts'

describe('isSvgFigure', () => {
  it('flags .svg case-insensitively and passes raster/pdf names', () => {
    expect(isSvgFigure('plot.svg')).toBe(true)
    expect(isSvgFigure('plot.SVG')).toBe(true)
    expect(isSvgFigure('plot.png')).toBe(false)
    expect(isSvgFigure('plot.pdf')).toBe(false)
    expect(isSvgFigure('svg-notes.png')).toBe(false)
  })
})

describe('figureLabelOf', () => {
  it('uses the basename stem and folds unsafe runs to one dash', () => {
    expect(figureLabelOf('figures/accuracy.png')).toBe('accuracy')
    expect(figureLabelOf('figures/ablation v2 (final).png')).toBe('ablation-v2-final')
    expect(figureLabelOf('loss_curve.pdf')).toBe('loss-curve')
    expect(figureLabelOf('figures/arch:v2.jpg')).toBe('arch:v2')
  })

  it('trims edge dashes and falls back for an all-unsafe stem', () => {
    expect(figureLabelOf('figures/--weird--.png')).toBe('weird')
    expect(figureLabelOf('figures/图 表.png')).toBe('figure')
  })
})

describe('figureBlockOf', () => {
  it('renders the standard top-float block with the caption and sanitized label', () => {
    expect(figureBlockOf('figures/accuracy.png', 'Accuracy over epochs')).toBe(
      '\\begin{figure}[t]\n'
      + '  \\centering\n'
      + '  \\includegraphics[width=\\linewidth]{figures/accuracy.png}\n'
      + '  \\caption{Accuracy over epochs}\n'
      + '  \\label{fig:accuracy}\n'
      + '\\end{figure}',
    )
  })

  it('renders an empty caption for unregistered files', () => {
    const block = figureBlockOf('chart.pdf', '')
    expect(block).toContain('\\caption{}')
    expect(block).toContain('\\label{fig:chart}')
  })
})

describe('findFigureReferenceLine', () => {
  const PAPER = [
    '\\documentclass{article}',
    '\\begin{document}',
    '\\section{Results}',
    '\\begin{figure}[t]',
    '  \\includegraphics[width=0.8\\linewidth]{figures/accuracy.png}',
    '\\end{figure}',
    '\\end{document}',
  ].join('\n')

  it('finds an existing reference, options bracket included', () => {
    expect(findFigureReferenceLine(PAPER, 'figures/accuracy.png')).toBe(5)
  })

  it('matches the extension-less LaTeX spelling of the same file', () => {
    const content = PAPER.replace('{figures/accuracy.png}', '{figures/accuracy}')
    expect(findFigureReferenceLine(content, 'figures/accuracy.png')).toBe(5)
  })

  it('ignores commented-out references and unrelated paths', () => {
    expect(findFigureReferenceLine('% \\includegraphics{figures/accuracy.png}\ntext', 'figures/accuracy.png')).toBeNull()
    expect(findFigureReferenceLine(PAPER, 'figures/other.png')).toBeNull()
  })
})

describe('insertFigureBlock', () => {
  const BLOCK = figureBlockOf('figures/accuracy.png', 'Accuracy')

  it('inserts before \\end{document} with blank-line separation', () => {
    const content = '\\begin{document}\n\\section{Intro}\ntext\n\\end{document}\n'
    const { content: next, line } = insertFigureBlock(content, BLOCK)
    expect(next).toBe(
      '\\begin{document}\n\\section{Intro}\ntext\n\n'
      + `${BLOCK}\n\n\\end{document}\n`,
    )
    expect(line).toBe(5)
    expect(next.split('\n')[line - 1]).toBe('\\begin{figure}[t]')
  })

  it('does not double the blank line when one already precedes \\end{document}', () => {
    const content = '\\begin{document}\ntext\n\n\\end{document}\n'
    const { content: next, line } = insertFigureBlock(content, BLOCK)
    expect(next).toBe(`\\begin{document}\ntext\n\n${BLOCK}\n\n\\end{document}\n`)
    expect(line).toBe(4)
  })

  it('appends after the last content line when the draft has no \\end{document}', () => {
    const content = '\\section{Intro}\ntext\n\n'
    const { content: next, line } = insertFigureBlock(content, BLOCK)
    expect(next).toBe(`\\section{Intro}\ntext\n\n${BLOCK}\n`)
    expect(line).toBe(4)
  })

  it('handles an empty draft', () => {
    const { content: next, line } = insertFigureBlock('', BLOCK)
    expect(next).toBe(`${BLOCK}\n`)
    expect(line).toBe(1)
  })

  it('round-trips: an inserted block is found by the duplicate guard', () => {
    const content = '\\begin{document}\ntext\n\\end{document}\n'
    const { content: next } = insertFigureBlock(content, BLOCK)
    expect(findFigureReferenceLine(next, 'figures/accuracy.png')).not.toBeNull()
  })
})
