/**
 * Tests for `reorderSections`: top-level `\section` block moves with
 * byte-level invariants — the preamble head, the `\end{document}` tail, and
 * every unmoved block survive untouched; subsection content rides along with
 * its section; unknown titles and out-of-range targets fail closed. The
 * `reorderSubsections` block covers subsection moves within and across
 * sections under the same byte-level invariants.
 */

import { describe, expect, it } from 'vitest'
import { parseTexOutline, reorderSections, reorderSubsections } from '../src/outline.ts'

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

/** A document with two subsections under Method, one under Intro, and a level-3 heading. */
const SUBDOC = [
  '\\documentclass{article}',
  '',
  '\\begin{document}',
  '',
  '\\section{Introduction}',
  'Intro body.',
  '\\subsection{Background}',
  'Background body.',
  '',
  '\\section{Method}',
  'Method overview.',
  '\\subsection{Architecture}',
  'Arch body.',
  '\\subsubsection{Layers}',
  'Layers body.',
  '\\subsection{Training}',
  'Training body.',
  '',
  '\\section{Conclusion}',
  'Conclusion body.',
  '',
  '\\end{document}',
  '',
].join('\n')

/** The <section, subsections> tree of one source. */
function subTree(tex: string): { title: string; subs: string[] }[] {
  return parseTexOutline(tex)
    .filter(node => node.level === 1)
    .map(node => ({ title: node.title, subs: node.children.map(child => child.title) }))
}

describe('reorderSubsections', () => {
  it('moves a subsection within its own section, byte-identical block', () => {
    const outcome = reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Training', targetSectionTitle: 'Method', targetIndex: 0 },
    ])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(subTree(outcome.tex)).toEqual([
      { title: 'Introduction', subs: ['Background'] },
      { title: 'Method', subs: ['Training', 'Architecture'] },
      { title: 'Conclusion', subs: [] },
    ])
    // The moved block kept its text verbatim.
    expect(outcome.tex).toContain('\\subsection{Training}\nTraining body.\n\n\\subsection{Architecture}')
  })

  it('moves a subsection across sections, carrying its subsubsection', () => {
    const outcome = reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Architecture', targetSectionTitle: 'Introduction', targetIndex: 1 },
    ])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(subTree(outcome.tex)).toEqual([
      { title: 'Introduction', subs: ['Background', 'Architecture'] },
      { title: 'Method', subs: ['Training'] },
      { title: 'Conclusion', subs: [] },
    ])
    // The level-3 heading rode along inside the moved block.
    const moved = outcome.tex.slice(
      outcome.tex.indexOf('\\subsection{Architecture}'),
      outcome.tex.indexOf('\\section{Method}'),
    )
    expect(moved).toContain('\\subsubsection{Layers}')
    expect(moved).toContain('Layers body.')
  })

  it('drops into a section without subsections, after its body', () => {
    const outcome = reorderSubsections(SUBDOC, [
      { sectionTitle: 'Introduction', title: 'Background', targetSectionTitle: 'Conclusion', targetIndex: 0 },
    ])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(subTree(outcome.tex)).toEqual([
      { title: 'Introduction', subs: [] },
      { title: 'Method', subs: ['Architecture', 'Training'] },
      { title: 'Conclusion', subs: ['Background'] },
    ])
    expect(outcome.tex).toContain('\\section{Conclusion}\nConclusion body.\n\n\\subsection{Background}')
  })

  it('keeps everything outside the moved block byte-for-byte identical', () => {
    const outcome = reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Architecture', targetSectionTitle: 'Introduction', targetIndex: 0 },
    ])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    // The result is a permutation of the original lines.
    expect(outcome.tex.split('\n').sort()).toEqual(SUBDOC.split('\n').sort())
    expect(outcome.tex.startsWith('\\documentclass{article}\n\n\\begin{document}\n\n\\section{Introduction}\n')).toBe(true)
    expect(outcome.tex.endsWith('\\end{document}\n')).toBe(true)
    // Unmoved regions stay contiguous and verbatim.
    expect(outcome.tex).toContain('\\subsection{Background}\nBackground body.')
    expect(outcome.tex).toContain('\\subsection{Training}\nTraining body.\n\n\\section{Conclusion}\nConclusion body.')
  })

  it('applies several moves in order', () => {
    const outcome = reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Architecture', targetSectionTitle: 'Introduction', targetIndex: 0 },
      { sectionTitle: 'Introduction', title: 'Background', targetSectionTitle: 'Method', targetIndex: 1 },
    ])
    expect(outcome.kind).toBe('reordered')
    if (outcome.kind !== 'reordered') return
    expect(subTree(outcome.tex)).toEqual([
      { title: 'Introduction', subs: ['Architecture'] },
      { title: 'Method', subs: ['Training', 'Background'] },
      { title: 'Conclusion', subs: [] },
    ])
  })

  it('returns the source untouched for an empty move list', () => {
    expect(reorderSubsections(SUBDOC, [])).toEqual({ kind: 'reordered', tex: SUBDOC })
  })

  it('fails closed on unknown sections and subsections', () => {
    expect(reorderSubsections(SUBDOC, [
      { sectionTitle: 'Ghost', title: 'X', targetSectionTitle: 'Method', targetIndex: 0 },
    ])).toEqual({ kind: 'section-not-found', title: 'Ghost' })
    expect(reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'X', targetSectionTitle: 'Ghost', targetIndex: 0 },
    ])).toEqual({ kind: 'section-not-found', title: 'Ghost' })
    expect(reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Ghost', targetSectionTitle: 'Method', targetIndex: 0 },
    ])).toEqual({ kind: 'subsection-not-found', sectionTitle: 'Method', title: 'Ghost' })
  })

  it('fails closed on an out-of-range target index', () => {
    // Method has two subsections; a same-section move allows at most index 1.
    expect(reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Training', targetSectionTitle: 'Method', targetIndex: 2 },
    ])).toEqual({ kind: 'invalid-move', targetIndex: 2 })
    // A cross-section move into Conclusion (no subsections) allows only index 0.
    expect(reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Training', targetSectionTitle: 'Conclusion', targetIndex: 1 },
    ])).toEqual({ kind: 'invalid-move', targetIndex: 1 })
    expect(reorderSubsections(SUBDOC, [
      { sectionTitle: 'Method', title: 'Training', targetSectionTitle: 'Method', targetIndex: -1 },
    ])).toEqual({ kind: 'invalid-move', targetIndex: -1 })
  })

  it('reports section-not-found for a sectionless document', () => {
    expect(reorderSubsections('\\begin{document}\nhi\n\\end{document}\n', [
      { sectionTitle: 'X', title: 'Y', targetSectionTitle: 'X', targetIndex: 0 },
    ])).toEqual({ kind: 'section-not-found', title: 'X' })
  })
})
