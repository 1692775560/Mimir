/**
 * Renders the restricted Markdown block tree from `markdown.ts` into React
 * elements for the experiment-log artifact viewer. Styling rides the
 * `.experimentLog` descendant selectors in the panel CSS module, so the dark
 * theme follows the shared `--dsw-*` tokens on its own. Neutralized links
 * render their label as plain text. (Named MarkdownView, not Markdown: the
 * macOS case-insensitive filesystem would collide its build output with
 * `markdown.ts`.)
 * @module dsh-client-ui-mimir/client/MarkdownView
 */

import type { ReactNode } from 'react'
import { parseInline, parseMarkdown, type MarkdownBlock, type MarkdownInline } from './markdown.ts'

/** Render one inline span list. */
function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((span: MarkdownInline, index) => {
    switch (span.type) {
      case 'bold': return <strong key={index}>{span.text}</strong>
      case 'italic': return <em key={index}>{span.text}</em>
      case 'code': return <code key={index}>{span.text}</code>
      case 'link':
        return span.href === null
          ? <span key={index}>{span.text}</span>
          : <a key={index} href={span.href} target="_blank" rel="noreferrer noopener">{span.text}</a>
      default: return <span key={index}>{span.text}</span>
    }
  })
}

/** Render one block; the key comes from the caller's index. */
function renderBlock(block: MarkdownBlock, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${String(block.level)}` as 'h1' | 'h2' | 'h3' | 'h4'
      return <Tag key={key}>{renderInline(block.text)}</Tag>
    }
    case 'paragraph': return <p key={key}>{renderInline(block.text)}</p>
    case 'code': return <pre key={key}><code>{block.code}</code></pre>
    case 'list': {
      const items = block.items.map((item, index) => <li key={index}>{renderInline(item)}</li>)
      return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
    }
    case 'quote': return <blockquote key={key}>{renderInline(block.text)}</blockquote>
    case 'hr': return <hr key={key} />
    case 'table':
      return (
        <table key={key}>
          <thead>
            <tr>{block.header.map((cell, index) => <th key={index}>{renderInline(cell)}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )
  }
}

/** Parse and render one Markdown document. */
export function renderMarkdown(text: string): ReactNode {
  return parseMarkdown(text).map((block, index) => renderBlock(block, index))
}
