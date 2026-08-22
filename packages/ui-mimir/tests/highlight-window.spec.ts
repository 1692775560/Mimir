/**
 * Behavior tests for the highlight overlay's windowing helpers: the scroll→
 * line-window clamping, the token→line split's round-trip invariant, the
 * display-width heuristic behind the horizontal sizer, and the window's core
 * performance guarantee — its size stays bounded no matter how large the
 * document grows.
 */

import { describe, expect, it } from 'vitest'
import {
  displayColumns, EDITOR_LINE_HEIGHT_PX, HIGHLIGHT_OVERSCAN_LINES,
  splitTokensByLine, visibleLineRange, widestLine,
} from '../src/client/highlight-window.ts'
import { tokenizeLatex } from '../src/client/latex-highlight.ts'

/** Join per-line token lists back into lines. */
function linesOf(lines: readonly { readonly text: string }[][]): string[] {
  return lines.map(tokens => tokens.map(token => token.text).join(''))
}

describe('visibleLineRange', () => {
  const viewportLines = 40

  it('mounts the viewport plus the overscan on both sides', () => {
    const range = visibleLineRange(100 * EDITOR_LINE_HEIGHT_PX, viewportLines * EDITOR_LINE_HEIGHT_PX, 1000)
    expect(range).toEqual({ start: 100 - HIGHLIGHT_OVERSCAN_LINES, end: 140 + HIGHLIGHT_OVERSCAN_LINES })
  })

  it('clamps to the document at both ends', () => {
    expect(visibleLineRange(0, 500, 1000).start).toBe(0)
    const tail = visibleLineRange(995 * EDITOR_LINE_HEIGHT_PX, 500, 1000)
    expect(tail.end).toBe(1000)
  })

  it('never produces a negative or inverted range for tiny documents', () => {
    const range = visibleLineRange(0, 800, 5)
    expect(range).toEqual({ start: 0, end: 5 })
  })

  it('treats a zero-height viewport (hidden editor) as overscan only', () => {
    const range = visibleLineRange(50 * EDITOR_LINE_HEIGHT_PX, 0, 1000)
    expect(range).toEqual({ start: 50 - HIGHLIGHT_OVERSCAN_LINES, end: 50 + HIGHLIGHT_OVERSCAN_LINES })
  })

  it('keeps the window bounded as the document grows (the perf invariant)', () => {
    for (const lineCount of [100, 1_000, 10_000, 100_000]) {
      const range = visibleLineRange(lineCount * EDITOR_LINE_HEIGHT_PX / 2, 800, lineCount)
      expect(range.end - range.start).toBeLessThanOrEqual(Math.ceil(800 / EDITOR_LINE_HEIGHT_PX) + 2 * HIGHLIGHT_OVERSCAN_LINES)
    }
  })

  it('clamps a scroll position past the end of the document', () => {
    const range = visibleLineRange(999_999, 500, 200)
    expect(range.start).toBeGreaterThanOrEqual(0)
    expect(range.end).toBe(200)
  })
})

describe('splitTokensByLine', () => {
  it('reproduces the source line for line (the overlay alignment invariant)', () => {
    const source = '\\section{Intro} % TODO\nbody $x^2$ more\n\n\\begin{itemize}\n\\end{itemize}\n'
    expect(linesOf(splitTokensByLine(tokenizeLatex(source)))).toEqual(source.split('\n'))
  })

  it('splits a multi-line $$ math token at the boundary, preserving its type', () => {
    const source = 'before $$\na+b\n$$ after'
    const lines = splitTokensByLine(tokenizeLatex(source))
    expect(linesOf(lines)).toEqual(source.split('\n'))
    expect(lines[0]?.at(-1)).toEqual({ type: 'math', text: '$$' })
    expect(lines[1]).toEqual([{ type: 'math', text: 'a+b' }])
    expect(lines[2]?.[0]).toEqual({ type: 'math', text: '$$' })
  })

  it('returns one empty line for empty input and preserves trailing empties', () => {
    expect(splitTokensByLine([])).toEqual([[]])
    expect(linesOf(splitTokensByLine(tokenizeLatex('a\n\n')))).toEqual(['a', '', ''])
  })

  it('handles a 3000-line document without dropping a character', () => {
    const source = Array.from(
      { length: 3_200 },
      (_, i) => `\\subsection{Setup ${i}} % step ${i}\nBody $x_${i}$ with \\textbf{bold} and [opts].`,
    ).join('\n')
    expect(linesOf(splitTokensByLine(tokenizeLatex(source)))).toEqual(source.split('\n'))
  })
})

describe('displayColumns', () => {
  it('counts ASCII one column per char', () => {
    expect(displayColumns('hello world')).toBe(11)
  })

  it('advances tabs to the next multiple of the tab size', () => {
    expect(displayColumns('\t', 8)).toBe(8)
    expect(displayColumns('ab\t', 8)).toBe(8)
    expect(displayColumns('ab\t', 4)).toBe(4)
  })

  it('counts East-Asian wide code points double', () => {
    expect(displayColumns('公式')).toBe(4)
    expect(displayColumns('a公')).toBe(3)
  })
})

describe('widestLine', () => {
  it('picks the widest line by display columns, not code units', () => {
    expect(widestLine(['short', 'a much longer ascii line', '中文宽字符'])).toBe('a much longer ascii line')
    expect(widestLine(['xxxxxxxxxx', '中文字符宽度'])).toBe('中文字符宽度')
  })

  it('expands tabs like the editor does', () => {
    expect(widestLine(['aaaaaaa', '\tx'])).toBe('\tx')
  })

  it("returns '' for an empty source", () => {
    expect(widestLine([])).toBe('')
    expect(widestLine([''])).toBe('')
  })
})
