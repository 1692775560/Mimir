/**
 * Tests for `buildCompileFixPrompt`: the verbatim issue line, the paper
 * directory resolution, and the draft context window (clamped at the file's
 * edges, omitted when the line or the matching draft is absent).
 */

import { describe, expect, it } from 'vitest'
import { buildCompileFixPrompt, FIX_CONTEXT_RADIUS } from '../src/client/compile-fix.ts'

const SOURCE = ['\\documentclass{article}', '\\begin{document}', 'Hello \\unknown{world}', '\\end{document}'].join('\n')

describe('buildCompileFixPrompt', () => {
  it('carries the issue verbatim and quotes the draft window around its line', () => {
    const prompt = buildCompileFixPrompt({
      issue: { severity: 'error', file: 'main.tex', line: 3, message: 'Undefined control sequence.' },
      source: SOURCE,
      dir: undefined,
    })
    expect(prompt).toContain('Issue: [error] paper/main.tex:3 Undefined control sequence.')
    expect(prompt).toContain('Paper directory: paper (relative to the workspace root)')
    expect(prompt).toContain('lines 1-4; the issue is at line 3')
    expect(prompt).toContain('3 | Hello \\unknown{world}')
    expect(prompt).toContain('```latex')
    expect(prompt).toContain('latex_compile tool with project_dir "paper"')
  })

  it('uses the project paperDir override verbatim', () => {
    const prompt = buildCompileFixPrompt({
      issue: { severity: 'warning', file: './main.tex', line: 1, message: 'There were undefined references.' },
      source: SOURCE,
      dir: 'papers/demo',
    })
    expect(prompt).toContain('Issue: [warning] papers/demo/main.tex:1 There were undefined references.')
    expect(prompt).toContain('project_dir "papers/demo"')
  })

  it('clamps the context window at the draft edges', () => {
    const prompt = buildCompileFixPrompt({
      issue: { severity: 'error', line: 4, message: 'LaTeX Error: \\end{document} ended by \\end{x}.' },
      source: SOURCE,
      dir: undefined,
    })
    const from = Math.max(1, 4 - FIX_CONTEXT_RADIUS)
    expect(prompt).toContain(`lines ${from}-4; the issue is at line 4`)
    expect(prompt).not.toContain('5 |')
  })

  it('omits the context window when the issue names another file', () => {
    const prompt = buildCompileFixPrompt({
      issue: { severity: 'error', file: 'sections/intro.tex', line: 9, message: 'Undefined control sequence.' },
      source: SOURCE,
      dir: undefined,
    })
    expect(prompt).toContain('Issue: [error] sections/intro.tex:9 Undefined control sequence.')
    expect(prompt).not.toContain('```latex')
  })

  it('omits the context window when no line or no draft is available', () => {
    const noLine = buildCompileFixPrompt({
      issue: { severity: 'error', message: 'Emergency stop.' },
      source: SOURCE,
      dir: undefined,
    })
    expect(noLine).toContain('Issue: [error] paper/main.tex Emergency stop.')
    expect(noLine).not.toContain('Source context')
    const noSource = buildCompileFixPrompt({
      issue: { severity: 'error', file: 'main.tex', line: 3, message: 'Undefined control sequence.' },
      source: null,
      dir: undefined,
    })
    expect(noSource).not.toContain('Source context')
    expect(noSource).toContain('Issue: [error] paper/main.tex:3 Undefined control sequence.')
  })
})
