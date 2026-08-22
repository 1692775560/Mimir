/**
 * Tests for `buildRelatedWorkPrompt` and `citationKeyOf`: the verbatim paper
 * blocks (notes only when present, URL fallback), the citation-key rule
 * matching the bibliography append, the paper directory resolution, and the
 * requirements tail (exact-key citations, bib backfill, compile loop).
 */

import { describe, expect, it } from 'vitest'
import type { PaperRecord } from 'dsh-mimir/types'
import { buildRelatedWorkPrompt, citationKeyOf } from '../src/client/related-work.ts'

function paper(overrides: Partial<PaperRecord>): PaperRecord {
  return {
    arxivId: '2103.00020v2',
    title: 'Attention Is All You Need',
    authors: ['Alice', 'Bob'],
    summary: 'We propose the Transformer.',
    url: 'https://arxiv.org/abs/2103.00020v2',
    notes: '',
    tags: [],
    projectIds: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('citationKeyOf', () => {
  it('strips dots and version separators, keeping alphanumerics, dash, underscore', () => {
    expect(citationKeyOf('2103.00020v2')).toBe('210300020v2')
    expect(citationKeyOf('cs/0601001')).toBe('cs0601001')
    expect(citationKeyOf('a-b_c')).toBe('a-b_c')
  })
})

describe('buildRelatedWorkPrompt', () => {
  it('lists every paper with its citation key, title, authors, abstract, and URL', () => {
    const prompt = buildRelatedWorkPrompt({
      papers: [paper({}), paper({ arxivId: '2201.00001', title: 'Second', notes: 'Compare loss curves.' })],
      projectTitle: 'Whole-body ego',
      dir: undefined,
    })
    expect(prompt).toContain('Project: Whole-body ego')
    expect(prompt).toContain('Paper directory: paper (relative to the workspace root)')
    expect(prompt).toContain('Source material — 2 paper(s)')
    expect(prompt).toContain('[1] citation key: 210300020v2')
    expect(prompt).toContain('    Title: Attention Is All You Need')
    expect(prompt).toContain('    Authors: Alice, Bob')
    expect(prompt).toContain('    Abstract: We propose the Transformer.')
    expect(prompt).toContain('[2] citation key: 220100001')
    expect(prompt).toContain('    Notes: Compare loss curves.')
  })

  it('omits the notes line when a paper has no notes', () => {
    const prompt = buildRelatedWorkPrompt({ papers: [paper({})], projectTitle: 'P', dir: undefined })
    expect(prompt).not.toContain('    Notes:')
  })

  it('falls back to the arXiv abstract URL when the record carries none', () => {
    const prompt = buildRelatedWorkPrompt({
      papers: [paper({ url: '' })],
      projectTitle: 'P',
      dir: undefined,
    })
    expect(prompt).toContain('    URL: https://arxiv.org/abs/2103.00020v2')
  })

  it('uses the project paperDir override verbatim', () => {
    const prompt = buildRelatedWorkPrompt({
      papers: [paper({})],
      projectTitle: 'P',
      dir: 'papers/demo',
    })
    expect(prompt).toContain('Paper directory: papers/demo')
    expect(prompt).toContain('project_dir "papers/demo"')
  })

  it('asks for the LaTeX section, exact-key citations, bib backfill, and a compile loop', () => {
    const prompt = buildRelatedWorkPrompt({ papers: [paper({})], projectTitle: 'P', dir: undefined })
    expect(prompt).toContain('\\section{Related Work}')
    expect(prompt).toContain('\\cite{<citation key>}')
    expect(prompt).toContain('never invent keys')
    expect(prompt).toContain('references.bib')
    expect(prompt).toContain('latex_compile tool with project_dir "paper"')
  })
})
