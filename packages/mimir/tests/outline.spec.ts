/**
 * Behavior tests for the LaTeX outline parser: heading levels fold into a
 * tree with source line numbers, comment lines and verbatim environments are
 * skipped, and the starred/short-title forms still parse.
 */

import { describe, expect, it } from 'vitest'
import { parseTexOutline } from '../src/outline.ts'

describe('parseTexOutline', () => {
  it('returns an empty tree for a document without headings', () => {
    expect(parseTexOutline('\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}')).toEqual([])
  })

  it('folds sections, subsections, and subsubsections into a tree with 1-based lines', () => {
    const tex = [
      '\\documentclass{article}',      // line 1
      '\\begin{document}',             // line 2
      '\\section{Introduction}',       // line 3
      'Some text.',                    // line 4
      '\\subsection{Background}',      // line 5
      '\\subsubsection{Prior work}',   // line 6
      '\\subsection{Contribution}',    // line 7
      '\\section{Method}',             // line 8
      '\\end{document}',               // line 9
    ].join('\n')
    expect(parseTexOutline(tex)).toEqual([
      {
        level: 1, title: 'Introduction', line: 3, children: [
          { level: 2, title: 'Background', line: 5, children: [
            { level: 3, title: 'Prior work', line: 6, children: [] },
          ] },
          { level: 2, title: 'Contribution', line: 7, children: [] },
        ],
      },
      { level: 1, title: 'Method', line: 8, children: [] },
    ])
  })

  it('attaches a subsection to the preceding section even across deeper gaps', () => {
    const tex = [
      '\\subsubsection{Orphan}',   // line 1: no open section — becomes a root
      '\\section{A}',              // line 2
      '\\subsection{B}',           // line 3
    ].join('\n')
    expect(parseTexOutline(tex)).toEqual([
      { level: 3, title: 'Orphan', line: 1, children: [] },
      { level: 1, title: 'A', line: 2, children: [
        { level: 2, title: 'B', line: 3, children: [] },
      ] },
    ])
  })

  it('parses the starred form and drops the optional short title', () => {
    const tex = '\\section*[Short]{Long Title}'
    expect(parseTexOutline(tex)).toEqual([
      { level: 1, title: 'Long Title', line: 1, children: [] },
    ])
  })

  it('keeps nested braces inside a title', () => {
    const tex = '\\section{The $\\mathcal{O}(n)$ Bound}'
    expect(parseTexOutline(tex)).toEqual([
      { level: 1, title: 'The $\\mathcal{O}(n)$ Bound', line: 1, children: [] },
    ])
  })

  it('skips comment lines', () => {
    const tex = [
      '% \\section{Commented out}',
      '   % \\subsection{Also commented}',
      '\\section{Real}',
    ].join('\n')
    expect(parseTexOutline(tex)).toEqual([
      { level: 1, title: 'Real', line: 3, children: [] },
    ])
  })

  it('skips heading-like lines inside verbatim environments', () => {
    const tex = [
      '\\section{Before}',
      '\\begin{verbatim}',
      '\\section{Not a heading}',
      '\\end{verbatim}',
      '\\subsection{After}',
    ].join('\n')
    expect(parseTexOutline(tex)).toEqual([
      { level: 1, title: 'Before', line: 1, children: [
        { level: 2, title: 'After', line: 5, children: [] },
      ] },
    ])
  })

  it('ignores lines where a heading command appears mid-line', () => {
    const tex = 'Text mentioning \\section{Inline} stays prose.'
    expect(parseTexOutline(tex)).toEqual([])
  })
})
