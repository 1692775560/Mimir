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

/** One section move: the titled top-level section goes to `targetIndex`. */
export interface SectionMove {
  /** Title of the top-level `\section` to move (exact match on the parsed title). */
  readonly title: string
  /** Target position among the top-level sections AFTER the moved block is removed. */
  readonly targetIndex: number
}

/** Structured outcome of one {@link reorderSections} call. */
export type ReorderOutcome =
  | { readonly kind: 'reordered'; readonly tex: string }
  | { readonly kind: 'section-not-found'; readonly title: string }
  | { readonly kind: 'invalid-move'; readonly targetIndex: number }

/** Whether one raw line is the document's closing `\end{document}`. */
function isDocumentEnd(line: string): boolean {
  return line.trimStart().startsWith('\\end{document}')
}

/**
 * Move top-level `\section` blocks within one LaTeX source. A section block
 * runs from its `\section` line to the line before the next top-level
 * `\section` (subsections ride along); the last block yields to the
 * `\end{document}` tail when one follows. Everything outside the moved
 * blocks — the preamble head, the document tail, and the unmoved blocks —
 * survives byte-for-byte (the rebuild is a line permutation joined on `\n`).
 * Moves apply in order, each addressing the section by title and its target
 * as the index among the remaining sections. A `\section`-looking line
 * inside a comment or a verbatim environment is not a section (the parser's
 * own rules); a literal `\end{document}` inside a verbatim block would
 * still truncate the last block — a documented tolerance, not handled.
 * @param tex - full source text of the document (typically `main.tex`).
 * @param moves - the moves to apply, in order.
 * @returns the reordered source, or the first failing move's failure.
 */
export function reorderSections(tex: string, moves: readonly SectionMove[]): ReorderOutcome {
  const sections = parseTexOutline(tex).filter(node => node.level === 1)
  const firstMove = moves[0]
  if (sections.length === 0) {
    return firstMove === undefined
      ? { kind: 'reordered', tex }
      : { kind: 'section-not-found', title: firstMove.title }
  }
  const lines = tex.split('\n')
  const starts = sections.map(node => node.line - 1)
  let tailStart = lines.length
  const lastStart = starts[starts.length - 1] ?? 0
  for (let index = lastStart + 1; index < lines.length; index += 1) {
    if (isDocumentEnd(lines[index] ?? '')) {
      tailStart = index
      break
    }
  }
  interface Block { title: string; lines: string[] }
  const blocks: Block[] = sections.map((node, index) => ({
    title: node.title,
    lines: lines.slice(starts[index] ?? 0, index + 1 < starts.length ? starts[index + 1] ?? 0 : tailStart),
  }))
  const head = lines.slice(0, starts[0] ?? 0)
  const tail = lines.slice(tailStart)
  for (const move of moves) {
    const from = blocks.findIndex(block => block.title === move.title)
    if (from === -1) return { kind: 'section-not-found', title: move.title }
    const [block] = blocks.splice(from, 1)
    if (block === undefined) return { kind: 'section-not-found', title: move.title }
    if (!Number.isInteger(move.targetIndex) || move.targetIndex < 0 || move.targetIndex > blocks.length) {
      return { kind: 'invalid-move', targetIndex: move.targetIndex }
    }
    blocks.splice(move.targetIndex, 0, block)
  }
  return { kind: 'reordered', tex: [...head, ...blocks.flatMap(block => block.lines), ...tail].join('\n') }
}

/** One subsection move: the titled subsection goes to `targetIndex` inside the target section. */
export interface SubsectionMove {
  /** Title of the `\section` currently holding the subsection (exact match). */
  readonly sectionTitle: string
  /** Title of the `\subsection` to move (exact match within its section). */
  readonly title: string
  /** Title of the `\section` receiving the block (may equal `sectionTitle`). */
  readonly targetSectionTitle: string
  /**
   * Target position among the target section's subsection blocks. When source
   * and target section coincide, the index addresses the order AFTER the
   * moved block is removed (same convention as {@link SectionMove.targetIndex});
   * otherwise it addresses the target section's current order.
   */
  readonly targetIndex: number
}

/** Structured outcome of one {@link reorderSubsections} call. */
export type SubsectionReorderOutcome =
  | { readonly kind: 'reordered'; readonly tex: string }
  | { readonly kind: 'section-not-found'; readonly title: string }
  | { readonly kind: 'subsection-not-found'; readonly sectionTitle: string; readonly title: string }
  | { readonly kind: 'invalid-move'; readonly targetIndex: number }

/** The conflict-check snapshot of one section: its title plus its direct child headings, in order. */
export interface SectionOutlineTitles {
  /** Title of the top-level `\section`. */
  readonly title: string
  /** Titles of the section's direct child headings (normally its `\subsection`s), in order. */
  readonly subsections: readonly string[]
}

/**
 * Move `\subsection` blocks within one LaTeX source, inside their own section
 * or across sections. A section block decomposes into a head (from the
 * `\section` line to the line before its first direct child heading) plus one
 * block per direct child heading (running to the next direct child or the
 * section's end, so `\subsubsection`s ride along inside their subsection).
 * Everything outside the moved blocks — the preamble head, the document tail,
 * the section heads, and the unmoved blocks — survives byte-for-byte (the
 * rebuild is a line permutation joined on `\n`). Moves apply in order; the
 * parser's own rules apply (commented-out or verbatim headings are not
 * headings, and a literal `\end{document}` inside a verbatim block would
 * still truncate the last block).
 * @param tex - full source text of the document (typically `main.tex`).
 * @param moves - the moves to apply, in order.
 * @returns the reordered source, or the first failing move's failure.
 */
export function reorderSubsections(tex: string, moves: readonly SubsectionMove[]): SubsectionReorderOutcome {
  const sections = parseTexOutline(tex).filter(node => node.level === 1)
  const firstMove = moves[0]
  if (sections.length === 0) {
    return firstMove === undefined
      ? { kind: 'reordered', tex }
      : { kind: 'section-not-found', title: firstMove.sectionTitle }
  }
  const lines = tex.split('\n')
  const starts = sections.map(node => node.line - 1)
  let tailStart = lines.length
  const lastStart = starts[starts.length - 1] ?? 0
  for (let index = lastStart + 1; index < lines.length; index += 1) {
    if (isDocumentEnd(lines[index] ?? '')) {
      tailStart = index
      break
    }
  }
  interface SubBlock { title: string; lines: string[] }
  interface SectionBlock { title: string; head: string[]; subs: SubBlock[] }
  const blocks: SectionBlock[] = sections.map((node, index) => {
    const start = starts[index] ?? 0
    const end = index + 1 < starts.length ? starts[index + 1] ?? 0 : tailStart
    const children = node.children
    return {
      title: node.title,
      head: lines.slice(start, children.length === 0 ? end : (children[0]?.line ?? 0) - 1),
      subs: children.map((child, childIndex) => ({
        title: child.title,
        lines: lines.slice(child.line - 1, childIndex + 1 < children.length ? (children[childIndex + 1]?.line ?? 0) - 1 : end),
      })),
    }
  })
  const head = lines.slice(0, starts[0] ?? 0)
  const tail = lines.slice(tailStart)
  for (const move of moves) {
    const source = blocks.find(block => block.title === move.sectionTitle)
    if (source === undefined) return { kind: 'section-not-found', title: move.sectionTitle }
    const target = blocks.find(block => block.title === move.targetSectionTitle)
    if (target === undefined) return { kind: 'section-not-found', title: move.targetSectionTitle }
    const from = source.subs.findIndex(sub => sub.title === move.title)
    if (from === -1) return { kind: 'subsection-not-found', sectionTitle: move.sectionTitle, title: move.title }
    const limit = source === target ? target.subs.length - 1 : target.subs.length
    if (!Number.isInteger(move.targetIndex) || move.targetIndex < 0 || move.targetIndex > limit) {
      return { kind: 'invalid-move', targetIndex: move.targetIndex }
    }
    const [sub] = source.subs.splice(from, 1)
    if (sub === undefined) return { kind: 'subsection-not-found', sectionTitle: move.sectionTitle, title: move.title }
    target.subs.splice(move.targetIndex, 0, sub)
  }
  return {
    kind: 'reordered',
    tex: [...head, ...blocks.flatMap(block => [block.head, ...block.subs.map(sub => sub.lines)].flat()), ...tail].join('\n'),
  }
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
