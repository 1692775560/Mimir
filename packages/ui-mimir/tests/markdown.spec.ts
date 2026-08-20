/**
 * Tests for the restricted Markdown parser: every supported block and inline
 * form, the link-URL XSS line (http/https/relative survive, every other
 * scheme is neutralized), the forgiving unclosed fence, CRLF normalization,
 * and the passthrough of unrecognized syntax.
 */

import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, safeLinkUrl } from '../src/client/markdown.ts'

describe('safeLinkUrl', () => {
  it('keeps http and https URLs', () => {
    expect(safeLinkUrl('https://arxiv.org/abs/1234')).toBe('https://arxiv.org/abs/1234')
    expect(safeLinkUrl('http://example.com')).toBe('http://example.com')
    expect(safeLinkUrl('  https://example.com/a-b  ')).toBe('https://example.com/a-b')
  })

  it('keeps relative and anchor URLs', () => {
    expect(safeLinkUrl('./figures/loss.svg')).toBe('./figures/loss.svg')
    expect(safeLinkUrl('/research/figure?x=1')).toBe('/research/figure?x=1')
    expect(safeLinkUrl('#results')).toBe('#results')
    expect(safeLinkUrl('notes.md')).toBe('notes.md')
  })

  it('neutralizes script and data schemes', () => {
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull()
    expect(safeLinkUrl('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeLinkUrl('data:text/html,<script>x</script>')).toBeNull()
    expect(safeLinkUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('sees through embedded whitespace and control characters', () => {
    expect(safeLinkUrl('java\tscript:alert(1)')).toBeNull()
    expect(safeLinkUrl('java\nscript:alert(1)')).toBeNull()
    expect(safeLinkUrl(' javascript:alert(1) ')).toBeNull()
  })

  it('rejects an empty URL', () => {
    expect(safeLinkUrl('')).toBeNull()
    expect(safeLinkUrl('   ')).toBeNull()
  })
})

describe('parseInline', () => {
  it('splits bold, italic, and inline code', () => {
    expect(parseInline('a **b** c *d* e `f` g')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' c ' },
      { type: 'italic', text: 'd' },
      { type: 'text', text: ' e ' },
      { type: 'code', text: 'f' },
      { type: 'text', text: ' g' },
    ])
  })

  it('prefers bold over italic for double stars', () => {
    expect(parseInline('**x**')).toEqual([{ type: 'bold', text: 'x' }])
  })

  it('renders links and neutralizes unsafe URLs', () => {
    expect(parseInline('[paper](https://arxiv.org)')).toEqual([
      { type: 'link', text: 'paper', href: 'https://arxiv.org' },
    ])
    // The URL runs to the first `)`, so a `)` inside it stays literal text.
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { type: 'link', text: 'click', href: null },
      { type: 'text', text: ')' },
    ])
  })

  it('leaves unrecognized markup as literal text', () => {
    expect(parseInline('a **unclosed and `unclosed')).toEqual([
      { type: 'text', text: 'a **unclosed and `unclosed' },
    ])
    expect(parseInline('[no url here]')).toEqual([{ type: 'text', text: '[no url here]' }])
  })
})

describe('parseMarkdown blocks', () => {
  it('parses headings level 1 through 4', () => {
    const blocks = parseMarkdown('# one\n## two\n### three\n#### four')
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'one' },
      { type: 'heading', level: 2, text: 'two' },
      { type: 'heading', level: 3, text: 'three' },
      { type: 'heading', level: 4, text: 'four' },
    ])
  })

  it('treats five hashes as a paragraph', () => {
    expect(parseMarkdown('##### five')).toEqual([{ type: 'paragraph', text: '##### five' }])
  })

  it('parses a fenced code block verbatim', () => {
    expect(parseMarkdown('```\nconst a = 1\n**not bold**\n```')).toEqual([
      { type: 'code', code: 'const a = 1\n**not bold**' },
    ])
  })

  it('swallows the rest of the input on an unclosed fence', () => {
    expect(parseMarkdown('```\nline one\n# not a heading\n')).toEqual([
      { type: 'code', code: 'line one\n# not a heading\n' },
    ])
  })

  it('parses unordered and ordered lists', () => {
    expect(parseMarkdown('- a\n- b')).toEqual([{ type: 'list', ordered: false, items: ['a', 'b'] }])
    expect(parseMarkdown('1. a\n2. b\n10. c')).toEqual([
      { type: 'list', ordered: true, items: ['a', 'b', 'c'] },
    ])
  })

  it('parses blockquotes and horizontal rules', () => {
    expect(parseMarkdown('> quoted **text**\n> more')).toEqual([
      { type: 'quote', text: 'quoted **text** more' },
    ])
    expect(parseMarkdown('above\n\n---\n\nbelow')).toEqual([
      { type: 'paragraph', text: 'above' },
      { type: 'hr' },
      { type: 'paragraph', text: 'below' },
    ])
  })

  it('parses a table with header and rows', () => {
    const blocks = parseMarkdown('| run | mpjpe |\n| --- | ---: |\n| base | 86.4 |\n| ours | 82.9 |')
    expect(blocks).toEqual([{
      type: 'table',
      header: ['run', 'mpjpe'],
      rows: [['base', '86.4'], ['ours', '82.9']],
    }])
  })

  it('does not mistake a lone pipe line for a table', () => {
    expect(parseMarkdown('| not a table')).toEqual([{ type: 'paragraph', text: '| not a table' }])
  })

  it('joins soft-wrapped paragraph lines and normalizes CRLF', () => {
    expect(parseMarkdown('first\r\nsecond\r\n\r\nthird')).toEqual([
      { type: 'paragraph', text: 'first second' },
      { type: 'paragraph', text: 'third' },
    ])
  })

  it('ends a paragraph at the next block start', () => {
    expect(parseMarkdown('intro line\n# heading')).toEqual([
      { type: 'paragraph', text: 'intro line' },
      { type: 'heading', level: 1, text: 'heading' },
    ])
  })

  it('handles a mixed document', () => {
    const doc = '# Log\n\nResult **82.9**, see [sheet](./s.md)\n\n- fit\n- eval\n\n```\nlatexmk\n```'
    expect(parseMarkdown(doc).map(block => block.type)).toEqual([
      'heading', 'paragraph', 'list', 'code',
    ])
  })
})
