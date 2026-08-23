/**
 * Behavior tests for the library organization helpers behind the papers
 * view's filter bar: collecting the deduped tag list and filtering by one
 * tag and/or one linked project.
 */

import { describe, expect, it } from 'vitest'
import type { PaperRecord } from 'dsh-mimir/types'
import { collectTags, arxivIdFromUrl, filterPapers, paperPdfUrl } from '../src/client/view-common.ts'

/** One paper fixture; only the fields the helpers read. */
function paper(arxivId: string, tags: string[], projectIds: string[]): PaperRecord {
  return {
    arxivId, title: arxivId, authors: [], summary: '', url: '', notes: '',
    tags, projectIds, addedAt: '2026-08-01T00:00:00Z',
  }
}

const LIBRARY = [
  paper('a', ['baseline', 'egocentric'], ['p1']),
  paper('b', ['mesh-recovery'], ['p1', 'p2']),
  paper('c', ['baseline'], []),
  paper('d', [], ['p2']),
]

describe('collectTags', () => {
  it('collects the deduped, alphabetically sorted tag list', () => {
    expect(collectTags(LIBRARY)).toEqual(['baseline', 'egocentric', 'mesh-recovery'])
    expect(collectTags([])).toEqual([])
    expect(collectTags([paper('x', [], [])])).toEqual([])
  })
})

describe('filterPapers', () => {
  it('passes everything when both selectors are null', () => {
    expect(filterPapers(LIBRARY, null, null)).toHaveLength(4)
  })

  it('filters by one tag, by one project, and by both together', () => {
    expect(filterPapers(LIBRARY, 'baseline', null).map(p => p.arxivId)).toEqual(['a', 'c'])
    expect(filterPapers(LIBRARY, null, 'p2').map(p => p.arxivId)).toEqual(['b', 'd'])
    expect(filterPapers(LIBRARY, 'mesh-recovery', 'p2').map(p => p.arxivId)).toEqual(['b'])
    // A combination nothing satisfies is empty, not an error.
    expect(filterPapers(LIBRARY, 'egocentric', 'p2')).toEqual([])
  })
})

describe('paperPdfUrl', () => {
  it('builds the paper-pdf route URL with the cache-bust version', () => {
    expect(paperPdfUrl('2103.00020v2', 1724)).toBe('/research/paper-pdf/2103.00020v2?v=1724')
    // Old-style ids carry a slash; it must be encoded.
    expect(paperPdfUrl('hep-th/9901001', 1)).toBe('/research/paper-pdf/hep-th%2F9901001?v=1')
  })
})

describe('arxivIdFromUrl', () => {
  it('extracts bare ids from arXiv abstract and pdf URLs, version suffix included', () => {
    expect(arxivIdFromUrl('https://arxiv.org/abs/1706.03762')).toBe('1706.03762')
    expect(arxivIdFromUrl('http://arxiv.org/abs/2206.03003v2')).toBe('2206.03003v2')
    expect(arxivIdFromUrl('https://arxiv.org/pdf/1706.03762.pdf')).toBe('1706.03762')
    expect(arxivIdFromUrl('https://arxiv.org/pdf/hep-th/9901001')).toBe('hep-th/9901001')
  })

  it('returns null for every other URL shape', () => {
    expect(arxivIdFromUrl('https://example.com/abs/1706.03762')).toBeNull()
    expect(arxivIdFromUrl('https://arxiv.org/list/cs.LG/recent')).toBeNull()
    expect(arxivIdFromUrl('')).toBeNull()
    expect(arxivIdFromUrl('not a url')).toBeNull()
  })
})
