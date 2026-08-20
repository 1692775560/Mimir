/**
 * Behavior tests for tokenizeLatex: every token type, the escape rules that
 * protect `\%` from becoming a comment, math pairing boundaries, and the
 * overlay's core invariant — token texts concatenate back to the input.
 */

import { describe, expect, it } from 'vitest'
import { tokenizeLatex, type LatexToken } from '../src/client/latex-highlight.ts'

/** Compact (type:text) pairs for assertion. */
function flat(tokens: readonly LatexToken[]): string[] {
  return tokens.map(token => `${token.type}:${token.text}`)
}

describe('tokenizeLatex', () => {
  it('recognizes comments, commands, braces, and plain text', () => {
    expect(flat(tokenizeLatex('\\section{Intro} % TODO\nbody'))).toEqual([
      'command:\\section',
      'brace:{',
      'plain:Intro',
      'brace:}',
      'plain: ',
      'comment:% TODO',
      'plain:\nbody',
    ])
  })

  it('supports starred commands and keeps escapes plain', () => {
    expect(flat(tokenizeLatex('\\section*{A}'))).toEqual([
      'command:\\section*', 'brace:{', 'plain:A', 'brace:}',
    ])
    // \% is an escaped percent: no comment starts, both chars stay plain.
    expect(flat(tokenizeLatex('50\\% off % real comment'))).toEqual([
      'plain:50\\% off ',
      'comment:% real comment',
    ])
    expect(flat(tokenizeLatex('a\\\\b'))).toEqual(['plain:a\\\\b'])
  })

  it('gives \\begin/\\end environment names their own token', () => {
    expect(flat(tokenizeLatex('\\begin{itemize}\\end{itemize}'))).toEqual([
      'command:\\begin', 'brace:{', 'env:itemize', 'brace:}',
      'command:\\end', 'brace:{', 'env:itemize', 'brace:}',
    ])
    // An unclosed environment degrades to command + brace + plain.
    expect(flat(tokenizeLatex('\\begin{itemize'))).toEqual([
      'command:\\begin', 'brace:{', 'plain:itemize',
    ])
  })

  it('treats paired $...$ and $$...$$ as one math token each', () => {
    expect(flat(tokenizeLatex('see $x_i$ and $$E=mc^2$$ end'))).toEqual([
      'plain:see ',
      'math:$x_i$',
      'plain: and ',
      'math:$$E=mc^2$$',
      'plain: end',
    ])
    // $$ math may span lines.
    expect(flat(tokenizeLatex('$$a\nb$$'))).toEqual(['math:$$a\nb$$'])
  })

  it('falls back to plain for an unclosed $ or one crossing a newline', () => {
    expect(flat(tokenizeLatex('cost is $5'))).toEqual(['plain:cost is $5'])
    expect(flat(tokenizeLatex('$x\ny$'))).toEqual(['plain:$x\ny$'])
    // An empty $$ $$ pair is still math; a single $$ alone is plain.
    expect(flat(tokenizeLatex('$$$$'))).toEqual(['math:$$$$'])
    expect(flat(tokenizeLatex('$$'))).toEqual(['plain:$$'])
  })

  it('recognizes square brackets separately from braces', () => {
    expect(flat(tokenizeLatex('\\includegraphics[width=0.5\\textwidth]{f}'))).toEqual([
      'command:\\includegraphics',
      'bracket:[',
      'plain:width=0.5',
      'command:\\textwidth',
      'bracket:]',
      'brace:{',
      'plain:f',
      'brace:}',
    ])
  })

  it('always reproduces the input and merges adjacent plain runs', () => {
    const samples = [
      '',
      'plain only',
      '\\',
      '%',
      '$',
      '\\begin{}',
      '\\begin{a{b}}',
      'text \\cmd $m$ % c\n\\begin{eq}x\\end{eq} [o] \\%',
    ]
    for (const sample of samples) {
      const tokens = tokenizeLatex(sample)
      expect(tokens.map(token => token.text).join('')).toBe(sample)
      for (let index = 1; index < tokens.length; index += 1) {
        expect(tokens[index]?.type === 'plain' && tokens[index - 1]?.type === 'plain').toBe(false)
      }
    }
  })
})
