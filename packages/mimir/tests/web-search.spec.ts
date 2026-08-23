/**
 * Behavior tests for the sxng-backed web search: argument assembly, the
 * SearXNG JSON envelope parse, and failure mapping. The CLI runner is
 * injected — no test touches the real `sxng` executable or PATH.
 */

import { describe, expect, it } from 'vitest'
import { createWebSearchTool, fetchWebSearch } from '../src/tools/web-search.ts'

/** A runner capturing its argv and answering with one canned payload. */
function runCapturing(stdout: string): { run: (command: string, args: readonly string[], timeoutMs: number) => Promise<string>; argv: () => readonly string[] } {
  const seen: string[][] = []
  return {
    run: (_command, args, _timeoutMs) => { seen.push([...args]); return Promise.resolve(stdout) },
    argv: () => seen[0] ?? [],
  }
}

const SXNG_OK = JSON.stringify({
  status: 'ok',
  data: {
    query: 'attention',
    totalResults: 2,
    results: [
      {
        title: 'Attention Is All You Need',
        url: 'https://arxiv.org/abs/1706.03762',
        content: 'The dominant sequence transduction models…',
        engine: 'arxiv',
        category: 'science',
        publishedDate: '2017-06-12T17:57:34',
        thumbnail: '',
        score: 3,
      },
      {
        title: 'A blog post about attention',
        url: 'https://example.com/post',
        content: 'Second row.',
        engine: 'brave',
        category: 'general',
        publishedDate: '',
        thumbnail: '',
        score: 1,
      },
    ],
  },
})

describe('fetchWebSearch', () => {
  it('passes the query and flags through to the CLI', async () => {
    const fake = runCapturing(SXNG_OK)
    await fetchWebSearch('attention mechanism', {
      command: 'sxng',
      timeoutMs: 30_000,
      maxResults: 5,
      categories: 'science',
      lang: 'en',
      timeRange: 'year',
      run: fake.run,
    })
    expect(fake.argv()).toEqual([
      '-f', 'json', '-l', '5', '-c', 'science', '--lang', 'en', '--time', 'year', 'attention mechanism',
    ])
  })

  it('parses the ok envelope into entries', async () => {
    const results = await fetchWebSearch('attention', {
      command: 'sxng', timeoutMs: 1000, maxResults: 10, run: runCapturing(SXNG_OK).run,
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Attention Is All You Need',
      url: 'https://arxiv.org/abs/1706.03762',
      content: 'The dominant sequence transduction models…',
      engine: 'arxiv',
      category: 'science',
      publishedDate: '2017-06-12T17:57:34',
    })
  })

  it('rejects the error envelope with its message', async () => {
    const stderr = JSON.stringify({
      status: 'error', data: null,
      error: { code: 'SEARCH_FAILED', message: 'connect ECONNREFUSED 127.0.0.1:3668' },
    })
    await expect(fetchWebSearch('q', {
      command: 'sxng', timeoutMs: 1000, maxResults: 10, run: runCapturing(stderr).run,
    })).rejects.toThrow(/connect ECONNREFUSED/)
  })

  it('rejects a non-JSON stdout with a readable message', async () => {
    await expect(fetchWebSearch('q', {
      command: 'sxng', timeoutMs: 1000, maxResults: 10, run: () => Promise.resolve('not json'),
    })).rejects.toThrow(/sxng output was not valid JSON/)
  })

  it('rejects an unknown envelope shape', async () => {
    await expect(fetchWebSearch('q', {
      command: 'sxng', timeoutMs: 1000, maxResults: 10, run: () => Promise.resolve('{}'),
    })).rejects.toThrow(/unexpected sxng output shape/)
  })
})

describe('createWebSearchTool', () => {
  it('executes through the injected runner and renders entries as text', async () => {
    const tool = createWebSearchTool({ command: 'sxng', timeoutMs: 1000, maxResults: 10, run: runCapturing(SXNG_OK).run })
    const value = await tool.execute({ query: 'attention', limit: 2 }, {} as never) as Record<string, unknown>
    expect(value).toMatchObject({ results: [{ engine: 'arxiv' }, { engine: 'brave' }] })
    const rendered = tool.output?.render?.({}, value)
    expect(String(rendered?.[0]?.text)).toContain('Attention Is All You Need')
  })

  it('rejects a non-positive limit', async () => {
    const tool = createWebSearchTool({ command: 'sxng', timeoutMs: 1000, maxResults: 10, run: runCapturing(SXNG_OK).run })
    await expect(tool.execute({ query: 'q', limit: 0 }, {} as never)).rejects.toThrow('limit must be a positive integer')
  })
})
