/**
 * A dependency-free, deliberately restricted Markdown parser for the
 * experiment-log artifact viewer. Two pure stages: {@link parseMarkdown}
 * splits the source into a block tree (headings, paragraphs, fenced code,
 * lists, quotes, rules, tables), {@link parseInline} tokenizes inline spans
 * (bold, italic, inline code, links). Anything unrecognized stays literal
 * text. {@link safeLinkUrl} is the XSS line: only http/https and relative
 * URLs survive, every other scheme (`javascript:`, `data:`, …) is neutralized
 * to null so the renderer drops the link and keeps the label as plain text.
 * DOM-free so every rule is unit-testable.
 * @module dsh-client-ui-mimir/client/markdown
 */

/** One inline span inside a block. */
export type MarkdownInline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'bold'; readonly text: string }
  | { readonly type: 'italic'; readonly text: string }
  | { readonly type: 'code'; readonly text: string }
  /** `href` is null when the URL was neutralized by {@link safeLinkUrl}. */
  | { readonly type: 'link'; readonly text: string; readonly href: string | null }

/** One block-level node. */
export type MarkdownBlock =
  | { readonly type: 'heading'; readonly level: 1 | 2 | 3 | 4; readonly text: string }
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'code'; readonly code: string }
  | { readonly type: 'list'; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly type: 'quote'; readonly text: string }
  | { readonly type: 'hr' }
  | { readonly type: 'table'; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }

/**
 * Keep a link URL only when it is http(s) or scheme-relative/relative; any
 * other scheme is neutralized to null. Whitespace and control characters are
 * stripped before the scheme check so `java\tscript:` cannot slip through.
 */
export function safeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const compact = trimmed.replace(/[\x00-\x20]+/g, '')
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact)?.[1]
  if (scheme === undefined) return trimmed
  return scheme.toLowerCase() === 'http' || scheme.toLowerCase() === 'https' ? trimmed : null
}

/** Inline token: backtick code, bold, italic, or a link; bold wins over italic. */
const INLINE_RE = /`([^`\n]+)`|\*\*([^*\n]+(?:\*(?!\*)[^*\n]*)*)\*\*|\*([^*\n]+)\*|\[([^\]\n]*)\]\(([^)\n]*)\)/g

/** Tokenize one inline string into text/bold/italic/code/link spans. */
export function parseInline(text: string): MarkdownInline[] {
  const out: MarkdownInline[] = []
  let last = 0
  INLINE_RE.lastIndex = 0
  for (let match = INLINE_RE.exec(text); match !== null; match = INLINE_RE.exec(text)) {
    if (match.index > last) out.push({ type: 'text', text: text.slice(last, match.index) })
    const [raw, code, bold, italic, label, url] = match
    if (code !== undefined) out.push({ type: 'code', text: code })
    else if (bold !== undefined) out.push({ type: 'bold', text: bold })
    else if (italic !== undefined) out.push({ type: 'italic', text: italic })
    else out.push({ type: 'link', text: label ?? '', href: safeLinkUrl(url ?? '') })
    last = match.index + raw.length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

const FENCE_RE = /^```/
const HEADING_RE = /^(#{1,4})\s+(\S.*)$/
const HR_RE = /^-{3,}\s*$/
const QUOTE_RE = /^>\s?(.*)$/
const UL_ITEM_RE = /^[-*]\s+(\S.*)$/
const OL_ITEM_RE = /^\d+\.\s+(\S.*)$/
/** A table separator row: `| --- | :-: | ---: |` and friends. */
const TABLE_SEP_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/

/** Split one table row into trimmed cells, dropping the outer pipes. */
function tableCells(line: string): string[] {
  const cells = line.split('|').map(cell => cell.trim())
  return cells.filter((_, index) => !(index === 0 && cells[0] === '') && !(index === cells.length - 1 && cells[cells.length - 1] === ''))
}

/** Does `line` open a new block (given its successor for table lookahead)? */
function isBlockStart(line: string, next: string | undefined): boolean {
  if (line.trim() === '') return true
  return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line)
    || QUOTE_RE.test(line) || UL_ITEM_RE.test(line) || OL_ITEM_RE.test(line)
    || (line.includes('|') && next !== undefined && TABLE_SEP_RE.test(next))
}

/**
 * Parse `text` into blocks. CRLF/CR are normalized to LF first. An unclosed
 * fence swallows the rest of the input as code (forgiving, like CommonMark).
 */
export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = FENCE_RE.exec(line)
    if (fence !== null) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !FENCE_RE.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '')
        index += 1
      }
      index += 1 // skip the closing fence (or EOF for an unclosed one)
      blocks.push({ type: 'code', code: code.join('\n') })
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1]?.length as 1 | 2 | 3 | 4, text: heading[2] ?? '' })
      index += 1
      continue
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }
    if (QUOTE_RE.test(line)) {
      const quoted: string[] = []
      while (index < lines.length) {
        const quoteLine = QUOTE_RE.exec(lines[index] ?? '')
        if (quoteLine === null) break
        quoted.push(quoteLine[1] ?? '')
        index += 1
      }
      blocks.push({ type: 'quote', text: quoted.join(' ').trim() })
      continue
    }
    if (line.includes('|') && TABLE_SEP_RE.test(lines[index + 1] ?? '')) {
      const header = tableCells(line)
      index += 2 // header + separator
      const rows: string[][] = []
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim() !== '') {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }
    const unordered = UL_ITEM_RE.exec(line)
    const ordered = OL_ITEM_RE.exec(line)
    if (unordered !== null || ordered !== null) {
      const itemRe = unordered !== null ? UL_ITEM_RE : OL_ITEM_RE
      const items: string[] = []
      while (index < lines.length) {
        const item = itemRe.exec(lines[index] ?? '')
        if (item === null) break
        items.push(item[1] ?? '')
        index += 1
      }
      blocks.push({ type: 'list', ordered: ordered !== null, items })
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length && !isBlockStart(lines[index] ?? '', lines[index + 1])) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}
