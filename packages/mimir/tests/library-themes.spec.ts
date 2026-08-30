/**
 * Feasibility proof for the CBE library themes (S5): synthetic shelves with
 * known ground truth, checking that the pure derivation recovers the theme
 * mix and its drift from the `papers` table alone — declared tags winning
 * over repeated keywords, the keyword floor, the window split, and the I2
 * silence rule below the floor.
 * @module dsh-mimir/tests/library-themes
 */

import { describe, expect, it } from 'vitest'
import {
  countThemes,
  deriveLibraryThemes,
  tagThemesOf,
  themeTokens,
  CBE_THEME_MIN_PAPERS,
} from '../src/library-themes.ts'
import type { PaperRecord } from '../src/types.ts'

let seq = 0
function paper(addedAt: string, title: string, tags: readonly string[] = [], summary = ''): PaperRecord {
  seq += 1
  return {
    arxivId: `2608.${String(seq).padStart(5, '0')}`,
    title,
    authors: [],
    summary,
    url: '',
    notes: '',
    tags: [...tags],
    projectIds: [],
    addedAt,
  }
}

describe('library theme tokenization', () => {
  it('drops stopwords, short tokens, and bare numbers', () => {
    const tokens = themeTokens('A novel transformer study of 42 layers')
    expect(tokens).toContain('transformer')
    expect(tokens).toContain('layers')
    expect(tokens).not.toContain('novel')
    expect(tokens).not.toContain('study')
    expect(tokens).not.toContain('42')
  })

  it('cuts CJK runs into character bigrams', () => {
    const tokens = themeTokens('扩散模型综述')
    expect(tokens).toContain('扩散')
    expect(tokens).toContain('散模')
  })

  it('reads declared tags case-insensitively and deduplicates them', () => {
    const tags = tagThemesOf(paper('2026-08-01T00:00:00.000Z', 't', ['Diffusion', ' diffusion ', '', 'GUT']))
    expect(tags).toEqual(['diffusion', 'gut'])
  })
})

describe('theme counting', () => {
  it('requires a keyword to appear in at least two papers', () => {
    const one = countThemes([paper('2026-08-01T00:00:00.000Z', 'Transformer pruning')])
    expect(one.map(row => row.theme)).not.toContain('transformer')

    const two = countThemes([
      paper('2026-08-01T00:00:00.000Z', 'Transformer pruning'),
      paper('2026-08-02T00:00:00.000Z', 'Transformer distillation'),
    ])
    expect(two.map(row => row.theme)).toContain('transformer')
  })

  it('lets a declared tag win over a keyword of the same string', () => {
    const rows = countThemes([
      paper('2026-08-01T00:00:00.000Z', 'Diffusion guidance', ['diffusion']),
      paper('2026-08-02T00:00:00.000Z', 'Diffusion samplers', []),
    ])
    const diffusion = rows.find(row => row.theme === 'diffusion')
    expect(diffusion).toBeDefined()
    expect(diffusion?.source).toBe('tag')
    // Counted over both papers: the tag one and the keyword one.
    expect(diffusion?.count).toBe(2)
  })

  it('computes share against the window paper count', () => {
    const rows = countThemes([
      paper('2026-08-01T00:00:00.000Z', 'Diffusion guidance', ['x']),
      paper('2026-08-02T00:00:00.000Z', 'Other thing'),
      paper('2026-08-03T00:00:00.000Z', 'Another thing'),
      paper('2026-08-04T00:00:00.000Z', 'Fourth thing'),
    ])
    // Rows sort by count, so assert on the tagged theme by name.
    const tagged = rows.find(row => row.theme === 'x')
    expect(tagged?.count).toBe(1)
    expect(tagged?.share).toBe(0.25)
  })
})

describe('library theme drift', () => {
  // Two 30-day windows: July (previous) and August (current).
  const SINCE = '2026-08-01T00:00:00.000Z'
  const UNTIL = '2026-08-31T00:00:00.000Z'
  const NOW = Date.parse('2026-08-31T12:00:00.000Z')

  it('splits the shelf into the window and the equal-length window before it', () => {
    const layer = deriveLibraryThemes([
      paper('2026-07-10T00:00:00.000Z', 'Transformer pruning'),
      paper('2026-08-10T00:00:00.000Z', 'Diffusion guidance'),
    ], SINCE, UNTIL, NOW)
    expect(layer.current.paperCount).toBe(1)
    expect(layer.previous.paperCount).toBe(1)
    // The previous window starts exactly one span before `since`.
    expect(layer.previous.since).toBe('2026-07-02T00:00:00.000Z')
    expect(layer.previous.until).toBe(SINCE)
  })

  it('stays silent below the floor but still reports the counts', () => {
    const layer = deriveLibraryThemes([
      paper('2026-08-10T00:00:00.000Z', 'Diffusion guidance'),
    ], SINCE, UNTIL, NOW)
    expect(layer.current.paperCount).toBeLessThan(CBE_THEME_MIN_PAPERS)
    expect(layer.speaks).toBe(false)
    expect(layer.drift).toEqual([])
    expect(layer.newThemes).toEqual([])
    // Descriptive counts are safe even when the comparison is not.
    expect(layer.current.paperCount).toBe(1)
  })

  it('reports a theme that arrived and one that left', () => {
    const layer = deriveLibraryThemes([
      paper('2026-07-05T00:00:00.000Z', 'Transformer pruning'),
      paper('2026-07-06T00:00:00.000Z', 'Transformer distillation'),
      paper('2026-07-07T00:00:00.000Z', 'Transformer quantization'),
      paper('2026-08-05T00:00:00.000Z', 'Diffusion guidance'),
      paper('2026-08-06T00:00:00.000Z', 'Diffusion samplers'),
      paper('2026-08-07T00:00:00.000Z', 'Diffusion schedulers'),
    ], SINCE, UNTIL, NOW)
    expect(layer.speaks).toBe(true)
    expect(layer.newThemes).toContain('diffusion')
    expect(layer.departedThemes).toContain('transformer')

    const diffusion = layer.drift.find(row => row.theme === 'diffusion')
    expect(diffusion?.direction).toBe('new')
    expect(diffusion?.previousCount).toBe(0)

    const transformer = layer.drift.find(row => row.theme === 'transformer')
    expect(transformer?.direction).toBe('gone')
    expect(transformer?.currentCount).toBe(0)
  })

  it('marks a theme that grew and one that shrank', () => {
    const layer = deriveLibraryThemes([
      // Previous: evenly split (a theme needs two papers to appear at all).
      paper('2026-07-05T00:00:00.000Z', 'Transformer pruning'),
      paper('2026-07-06T00:00:00.000Z', 'Transformer distillation'),
      paper('2026-07-07T00:00:00.000Z', 'Diffusion guidance'),
      paper('2026-07-08T00:00:00.000Z', 'Diffusion samplers'),
      // Current: diffusion takes three of five — both themes still clear the
      // two-paper floor, so they read as rising/falling rather than new/gone.
      paper('2026-08-05T00:00:00.000Z', 'Diffusion schedulers'),
      paper('2026-08-06T00:00:00.000Z', 'Diffusion distillation'),
      paper('2026-08-07T00:00:00.000Z', 'Diffusion pruning'),
      paper('2026-08-08T00:00:00.000Z', 'Transformer quantization'),
      paper('2026-08-09T00:00:00.000Z', 'Transformer schedulers'),
    ], SINCE, UNTIL, NOW)
    const diffusion = layer.drift.find(row => row.theme === 'diffusion')
    const transformer = layer.drift.find(row => row.theme === 'transformer')
    expect(diffusion?.direction).toBe('rising')
    expect(transformer?.direction).toBe('falling')
    expect(diffusion?.deltaShare).toBeGreaterThan(0)
    expect(transformer?.deltaShare).toBeLessThan(0)
  })
})
