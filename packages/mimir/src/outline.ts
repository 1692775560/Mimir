/**
 * Pure parser for the section outline of a LaTeX source: `\section`,
 * `\subsection`, and `\subsubsection` headings folded into a tree, with
 * 1-based source line numbers. Comment lines (first non-space character `%`)
 * and `verbatim` environments are skipped, so a heading-like line inside
 * either never enters the tree.
 * @module dsh-mimir/src/outline
 */

/** One heading in a parsed LaTeX outline tree. */
export interface OutlineNode {
  /** Heading depth: 1 = section, 2 = subsection, 3 = subsubsection. */
  readonly level: 1 | 2 | 3
  /** Heading text with the surrounding braces removed. */
  readonly title: string
  /** 1-based source line carrying the heading command. */
  readonly line: number
  readonly children: readonly OutlineNode[]
}

/** One recognized heading command, longest first so `sub` prefixes win. */
const COMMANDS = [
  { command: 'subsubsection', level: 3 },
  { command: 'subsection', level: 2 },
  { command: 'section', level: 1 },
] as const

/** Mutable parse accumulator; children arrays are frozen only in the output. */
interface MutableNode {
  readonly level: 1 | 2 | 3
  readonly title: string
  readonly line: number
  readonly children: MutableNode[]
}

/** Extract the first balanced brace group starting at `open` (the `{` index). */
function braceGroup(text: string, open: number): string | undefined {
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(open + 1, index)
    }
  }
  return undefined
}

/**
 * Read a heading command at `start` (the index just past the backslash).
 * Tolerates the starred form and an optional `[short]` argument.
 * @returns the heading level and title, or undefined when no command matches.
 */
function headingAt(line: string, start: number): { level: 1 | 2 | 3; title: string } | undefined {
  for (const { command, level } of COMMANDS) {
    if (!line.startsWith(command, start)) continue
    let cursor = start + command.length
    if (line[cursor] === '*') cursor += 1
    while (line[cursor] === ' ' || line[cursor] === '\t') cursor += 1
    if (line[cursor] === '[') {
      const close = line.indexOf(']', cursor)
      if (close === -1) return undefined
      cursor = close + 1
      while (line[cursor] === ' ' || line[cursor] === '\t') cursor += 1
    }
    if (line[cursor] !== '{') return undefined
    const title = braceGroup(line, cursor)
    if (title === undefined) return undefined
    return { level, title: title.trim() }
  }
  return undefined
}

/** Whether one trimmed line opens or closes a verbatim environment. */
function verbatimBoundary(line: string): 'open' | 'close' | undefined {
  if (/^\\begin\{verbatim\*?\}/.test(line)) return 'open'
  if (/^\\end\{verbatim\*?\}/.test(line)) return 'close'
  return undefined
}

/** Freeze one accumulator subtree into the immutable output shape. */
function freezeNode(node: MutableNode): OutlineNode {
  return Object.freeze({
    level: node.level,
    title: node.title,
    line: node.line,
    children: Object.freeze(node.children.map(freezeNode)),
  })
}

/**
 * Parse the section outline of one LaTeX source.
 * @param tex - Full source text of the document (typically `main.tex`).
 * @returns the top-level heading tree in document order.
 */
export function parseTexOutline(tex: string): OutlineNode[] {
  const roots: MutableNode[] = []
  // The stack holds the open heading path; index 0 is the deepest open level-1.
  const stack: MutableNode[] = []
  let inVerbatim = false

  const lines = tex.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trimStart()
    const boundary = verbatimBoundary(trimmed)
    if (!inVerbatim && boundary === 'open') {
      inVerbatim = true
      continue
    }
    if (inVerbatim) {
      if (boundary === 'close') inVerbatim = false
      continue
    }
    if (trimmed.startsWith('%')) continue
    if (!trimmed.startsWith('\\')) continue
    const heading = headingAt(trimmed, 1)
    if (heading === undefined) continue
    const node: MutableNode = { level: heading.level, title: heading.title, line: index + 1, children: [] }
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= node.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
    stack.push(node)
  }

  return roots.map(freezeNode)
}
