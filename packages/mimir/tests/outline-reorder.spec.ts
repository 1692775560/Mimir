/**
 * Tests for `reorderSections`: top-level `\section` block moves with
 * byte-level invariants — the preamble head, the `\end{document}` tail, and
 * every unmoved block survive untouched; subsection content rides along with
 * its section; unknown titles and out-of-range targets fail closed.
 */

import { describe, expect, it } from 'vitest'
import { parseTexOutline, reorderSections } from '../src/outline.ts'

/** A three-section document with a preamble, subsections, and a tail. */
const DOC = [
  '\\documentclass{article}',
  '\\usepackage{geometry}',
  '',
  '\\begin{document}',
  '\\maketitle',
  '',
  '\\section{Introduction}',
  'Intro body line 1.',
  'Intro body line 2.',
  '',
  '\\section{Method}',
  'Method overview.',
  '\\subsection{Architecture}',
  'Arch details.',
  '\\subsection{Training}',
  'Training details.',
  '',
  '\\section{Experiments}',
  'Experiments body.',
  '',
  '\\end{document}',
  '% trailing comment after the document end',
  '',
].join('\n')

/** Top-level titles of one source, in order. */
function titles(tex: string): string[] {
  return parseTexOutline(tex).filter(node => node.level === 1).map(node => node.title)
}

/** Lines before the first `\section` (the head) and from `\end{document}` (the tail). */
function headAndTail(tex: string): { head: string; tail: string } {
  const lines = tex.split('\n')
  const firstSection = lines.findIndex(line => line.trimStart().startsWith('\\section'))
  const tailStart = lines.findIndex(line => line.trimStart().startsWith('\\end{document}'))
  return {
    head: lines.slice(0, firstSection).join('\n'),
    tail: tailStart === -1 ? '' : lines.slice(tailStart).join('\n'),
  }
}

/** The lines of one titled top-level block in one source. */
function blockOf(tex: string, title: string): string {
  const lines = tex.split('\n')
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trimStart().startsWith('\\section'))
  const from = starts.find(({ line }) => line.includes(`{${title}}`))?.index
  if (from === undefined) throw new Error(`no such section: ${title}`)
  const next = starts.find(({ index }) => index > from)?.index ?? lines.findIndex((line, index) => index > from && line.trimStart().startsWith('\\end{document}'))
  return lines.slice(from, next === -1 ? lines.length : next).join('\n')
}

describe('reorderSections', () => {
  it('moves a middle section to the front', () => {
    const outcome = reorderSections(DOC, [{ title: 'Method', targetIndex: 0 }])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(titles(outcome.tex)).toEqual(['Method', 'Introduction', 'Experiments'])
  })

  it('moves the first section to the end', () => {
    const outcome = reorderSections(DOC, [{ title: 'Introduction', targetIndex: 2 }])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(titles(outcome.tex)).toEqual(['Method', 'Experiments', 'Introduction'])
  })

  it('moves the last section to the front, keeping the document tail in place', () => {
    const outcome = reorderSections(DOC, [{ title: 'Experiments', targetIndex: 0 }])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(titles(outcome.tex)).toEqual(['Experiments', 'Introduction', 'Method'])
    expect(outcome.tex.trimEnd().endsWith('% trailing comment after the document end')).toBe(true)
  })

  it('moves a section with its subsections as one block', () => {
    const outcome = reorderSections(DOC, [{ title: 'Method', targetIndex: 2 }])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(titles(outcome.tex)).toEqual(['Introduction', 'Experiments', 'Method'])
    const moved = blockOf(outcome.tex, 'Method')
    expect(moved).toContain('\\subsection{Architecture}')
    expect(moved).toContain('Training details.')
    // The moved block is byte-identical to its original.
    expect(moved).toBe(blockOf(DOC, 'Method'))
  })

  it('keeps the head and the tail byte-for-byte identical', () => {
    const before = headAndTail(DOC)
    const outcome = reorderSections(DOC, [{ title: 'Method', targetIndex: 0 }])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    const after = headAndTail(outcome.tex)
    expect(after.head).toBe(before.head)
    expect(after.tail).toBe(before.tail)
    // The unmoved blocks are byte-identical too.
    expect(blockOf(outcome.tex, 'Introduction')).toBe(blockOf(DOC, 'Introduction'))
    expect(blockOf(outcome.tex, 'Experiments')).toBe(blockOf(DOC, 'Experiments'))
  })

  it('applies several moves in order', () => {
    const outcome = reorderSections(DOC, [
      { title: 'Experiments', targetIndex: 0 },
      { title: 'Introduction', targetIndex: 2 },
    ])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(titles(outcome.tex)).toEqual(['Experiments', 'Method', 'Introduction'])
  })

  it('returns the source untouched for an empty move list', () => {
    const outcome = reorderSections(DOC, [])
    expect(outcome).toEqual({ kind: 'reordered', tex: DOC })
  })

  it('fails closed on an unknown section title', () => {
    expect(reorderSections(DOC, [{ title: 'Conclusion', targetIndex: 0 }]))
      .toEqual({ kind: 'section-not-found', title: 'Conclusion' })
  })

  it('fails closed on an out-of-range target index', () => {
    expect(reorderSections(DOC, [{ title: 'Method', targetIndex: 3 }]))
      .toEqual({ kind: 'invalid-move', targetIndex: 3 })
    expect(reorderSections(DOC, [{ title: 'Method', targetIndex: -1 }]))
      .toEqual({ kind: 'invalid-move', targetIndex: -1 })
    expect(reorderSections(DOC, [{ title: 'Method', targetIndex: 1.5 }]))
      .toEqual({ kind: 'invalid-move', targetIndex: 1.5 })
  })

  it('ignores section-looking lines inside comments and verbatim', () => {
    const tricky = [
      '\\begin{document}',
      '\\section{Real}',
      '% \\section{Commented}',
      '\\begin{verbatim}',
      '\\section{VerbatimOne}',
      '\\end{verbatim}',
      'body',
      '\\end{document}',
    ].join('\n')
    const outcome = reorderSections(tricky, [{ title: 'Real', targetIndex: 0 }])
    expect(outcome).toEqual({ kind: 'reordered', tex: tricky })
    expect(reorderSections(tricky, [{ title: 'Commented', targetIndex: 0 }]))
      .toEqual({ kind: 'section-not-found', title: 'Commented' })
  })

  it('handles a document without \\end{document}', () => {
    const bare = '\\section{Only}\nbody\n'
    const outcome = reorderSections(bare, [])
    expect(outcome).toEqual({ kind: 'reordered', tex: bare })
  })

  it('reports section-not-found for a sectionless document', () => {
    expect(reorderSections('\\begin{document}\nhi\n\\end{document}\n', [{ title: 'X', targetIndex: 0 }]))
      .toEqual({ kind: 'section-not-found', title: 'X' })
  })
})
