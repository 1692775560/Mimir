/**
 * arXiv API tools: `arxiv_search` (query → paper list) and `paper_fetch`
 * (id → one paper). The Atom response is parsed with plain string handling;
 * both tools honor the execution's abort signal and reject on transport or
 * HTTP failure.
 * @module dsh-mimir/src/tools/arxiv
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** One parsed arXiv entry, shared by both tools' output. */
export interface ArxivEntry {
  readonly id: string
  readonly title: string
  readonly authors: string[]
  readonly summary: string
  readonly published: string
  readonly url: string
}

/** Undo the small XML-entity vocabulary the arXiv Atom feed uses. */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Collapse the feed's pretty-printed whitespace inside one extracted field. */
function normalizeField(text: string): string {
  return unescapeXml(text).trim().replace(/\s+/g, ' ')
}

/** Extract the first `<name>...</name>` body from one entry block. */
function firstTag(block: string, name: string): string {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block)
  return match?.[1] === undefined ? '' : normalizeField(match[1])
}

/** Parse the Atom feed body into entries; a resultless feed yields `[]`. */
export function parseArxivFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = []
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  for (const block of entryBlocks) {
    const rawId = firstTag(block, 'id')
    const id = rawId.replace(/^https?:\/\/arxiv\.org\/abs\//, '')
    if (id.length === 0) continue
    const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .map(match => normalizeField(match[1] ?? ''))
      .filter(name => name.length > 0)
    entries.push({
      id,
      title: firstTag(block, 'title'),
      authors,
      summary: firstTag(block, 'summary'),
      published: firstTag(block, 'published'),
      url: `https://arxiv.org/abs/${id}`,
    })
  }
  return entries
}

/** Fetch one arXiv API URL, rejecting transport and HTTP failures as-is. */
async function fetchArxiv(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`arXiv API request failed: HTTP ${response.status} for ${url}`)
  }
  return response.text()
}

/** JSON-schema properties of one {@link ArxivEntry} in tool output. */
const ENTRY_PROPERTIES = {
  id: { type: 'string', required: true },
  title: { type: 'string', required: true },
  authors: { type: 'array', required: true, items: { type: 'string' } },
  summary: { type: 'string', required: true },
  published: { type: 'string', required: true },
  url: { type: 'string', required: true },
} as const

/** Render one entry list as model-facing text. */
function renderEntries(entries: readonly ArxivEntry[]): string {
  if (entries.length === 0) return 'No arXiv results.'
  return entries.map(entry =>
    `- ${entry.id}: ${entry.title}\n  Authors: ${entry.authors.join(', ')}\n  Published: ${entry.published}\n  ${entry.url}\n  ${entry.summary}`,
  ).join('\n')
}

/**
 * Build the `arxiv_search` tool.
 * @param defaultMaxResults - Deployment default for the result cap.
 * @returns the registry-ready tool definition.
 */
export function createArxivSearchTool(defaultMaxResults: number): ToolDefinition {
  return defineTool({
    name: 'arxiv_search',
    description: 'Search arXiv for papers matching a free-text query. Returns ids, titles, authors, summaries, and URLs.',
    parameters: {
      query: { type: 'string', required: true, description: 'Free-text search query matched against all fields.' },
      max_results: { type: 'integer', description: `Maximum results to return (default ${defaultMaxResults}).` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          results: {
            type: 'array',
            required: true,
            items: { type: 'object', additionalProperties: false, properties: ENTRY_PROPERTIES },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderEntries(value.results) }],
    },
    async execute(args, exec) {
      const maxResults = args.max_results ?? defaultMaxResults
      if (!Number.isSafeInteger(maxResults) || maxResults < 1) {
        throw new TypeError('max_results must be a positive integer')
      }
      const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(args.query)}&start=0&max_results=${maxResults}`
      return { results: parseArxivFeed(await fetchArxiv(url, exec.signal)) }
    },
  })
}

/**
 * Build the `paper_fetch` tool.
 * @returns the registry-ready tool definition.
 */
export function createPaperFetchTool(): ToolDefinition {
  return defineTool({
    name: 'paper_fetch',
    description: 'Fetch one arXiv paper\'s full metadata record by its arXiv id (e.g. 2103.00020 or 2103.00020v2).',
    parameters: {
      arxiv_id: { type: 'string', required: true, description: 'Bare arXiv id, with or without a version suffix.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: ENTRY_PROPERTIES },
      render: (_args, value) => [{ type: 'text', text: renderEntries([value]) }],
    },
    async execute(args, exec) {
      const id = args.arxiv_id.trim().replace(/^https?:\/\/arxiv\.org\/abs\//, '')
      if (id.length === 0) throw new Error('arxiv_id must be a non-empty arXiv id')
      const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`
      const [entry] = parseArxivFeed(await fetchArxiv(url, exec.signal))
      if (entry === undefined) throw new Error(`arXiv holds no record for id '${id}'`)
      return entry
    },
  })
}
