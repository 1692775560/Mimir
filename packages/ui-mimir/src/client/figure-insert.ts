/**
 * The figures view's "insert into paper" pure rules: the `\label` sanitization,
 * the standard figure block, duplicate detection against the current
 * `main.tex` draft, and the insertion-point computation. The button lives on
 * the figures view, where the paper editor is UNMOUNTED, so no cursor-based
 * anchor exists — the block lands at the end of the document body, right
 * before `\end{document}` (a `[t]` float, so the source position barely
 * matters to the rendered page). DOM-free so every rule is unit-testable.
 * @module dsh-client-ui-mimir/client/figure-insert
 */

/**
 * Whether one figure file name is an SVG. LaTeX's `\includegraphics` cannot
 * embed SVG directly and the paper scaffold carries no SVG convention (no
 * inkscape/`svg` package), so the insert flow first asks the host to convert
 * the SVG into an embeddable product (see {@link svgConvertedRelPaths})
 * instead of writing a block that breaks the compile.
 */
export function isSvgFigure(name: string): boolean {
  return name.toLowerCase().endsWith('.svg')
}

/**
 * The paper-directory-relative paths one SVG's converted product can land on,
 * most preferred first: the vector pipeline's `foo.pdf`, then the raster
 * fallback's `foo.png` (same directory, same stem). The duplicate guard
 * checks these alongside the SVG's own path so an already-inserted product
 * reads as "already inserted" instead of converting again.
 */
export function svgConvertedRelPaths(relPath: string): string[] {
  if (!isSvgFigure(relPath)) return []
  const stem = relPath.replace(/\.svg$/i, '')
  return [`${stem}.pdf`, `${stem}.png`]
}

/**
 * The `\label` stem of one figure path: the basename minus its extension, with
 * every run of label-unsafe characters folded to a single dash and edge dashes
 * trimmed. An all-unsafe stem falls back to `figure` so the label is never
 * empty.
 */
export function figureLabelOf(relPath: string): string {
  const name = relPath.split('/').pop() ?? relPath
  const stem = name.replace(/\.[^.]+$/, '')
  const label = stem.replace(/[^a-zA-Z0-9:-]+/g, '-').replace(/^-+|-+$/g, '')
  return label === '' ? 'figure' : label
}

/**
 * The standard figure block one insert writes: a top float spanning the
 * column, captioned with the figure's wiki-recorded caption (empty when the
 * file was never registered through `figure_save`) and labelled from the
 * sanitized file stem.
 */
export function figureBlockOf(relPath: string, caption: string): string {
  return `\\begin{figure}[t]\n  \\centering\n  \\includegraphics[width=\\linewidth]{${relPath}}\n  \\caption{${caption}}\n  \\label{fig:${figureLabelOf(relPath)}}\n\\end{figure}`
}

/** One `\includegraphics` line, tolerant of the options bracket and spacing. */
const GRAPHICS_RE = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/

/** Drop a line's trailing comment (an unescaped `%` starts it). */
function stripComment(line: string): string {
  return line.replace(/(?<!\\)%.*/, '')
}

/**
 * Find the 1-based line of the first `\includegraphics` already referencing
 * one figure path — the insert button's duplicate guard. LaTeX allows dropping
 * the extension, so `{figures/foo}` counts as a reference to
 * `figures/foo.png`. Commented-out lines do not count.
 * @param content - the current `main.tex` draft.
 * @param relPath - figure path relative to the paper directory.
 * @returns the 1-based line of the existing reference, or null.
 */
export function findFigureReferenceLine(content: string, relPath: string): number | null {
  const extless = relPath.replace(/\.[^.]+$/, '')
  const lines = content.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = GRAPHICS_RE.exec(stripComment(lines[index] ?? ''))
    if (match === null) continue
    const target = (match[1] ?? '').trim()
    if (target === relPath || target === extless) return index + 1
  }
  return null
}

/** Outcome of {@link insertFigureBlock}: the next draft and where the block landed. */
export interface FigureInsertion {
  readonly content: string
  /** 1-based line of the inserted block's `\begin{figure}` row. */
  readonly line: number
}

/**
 * Splice one figure block into the draft at the end of the document body:
 * right before the `\end{document}` line, with one blank line separating the
 * block from its neighbors. A draft without `\end{document}` (a fragment, or
 * a template still being written) appends the block after the last content
 * line instead. Everything else survives byte-for-byte.
 * @param content - the current `main.tex` draft.
 * @param block - the block text from {@link figureBlockOf}.
 * @returns the next draft plus the 1-based line the block starts on.
 */
export function insertFigureBlock(content: string, block: string): FigureInsertion {
  const blockLines = block.split('\n')
  const lines = content.split('\n')
  const endIndex = lines.findIndex(line => stripComment(line).includes('\\end{document}'))
  if (endIndex !== -1) {
    const before = lines.slice(0, endIndex)
    if (before.length > 0 && (before.at(-1) ?? '').trim() !== '') before.push('')
    const line = before.length + 1
    return { content: [...before, ...blockLines, '', ...lines.slice(endIndex)].join('\n'), line }
  }
  if (content === '') return { content: `${block}\n`, line: 1 }
  const before = [...lines]
  // A trailing newline splits into a trailing empty row; drop it, then drop
  // the trailing blank rows, so the block gets exactly one blank separator.
  if (before.at(-1) === '') before.pop()
  while (before.length > 0 && (before.at(-1) ?? '').trim() === '') before.pop()
  before.push('')
  const line = before.length + 1
  return { content: [...before, ...blockLines, ''].join('\n'), line }
}
