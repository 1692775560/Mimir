/**
 * Windowing helpers for the paper editor's highlight overlay and gutter.
 * Rendering every token span and gutter row of a multi-thousand-line
 * `main.tex` on each keystroke is the editor's dominant cost, so the overlay
 * mounts only the lines around the textarea's viewport and pads the rest
 * with fixed-height spacers (the editor forbids soft wrap, so every logical
 * line is exactly {@link EDITOR_LINE_HEIGHT_PX} tall). All functions here are
 * pure; the component owns the scroll state.
 * @module dsh-client-ui-mimir/client/highlight-window
 */

import type { LatexToken } from './latex-highlight.ts'

/** Editor line height in px; keep in sync with `.editor` in the module CSS. */
export const EDITOR_LINE_HEIGHT_PX = 19

/** Extra lines mounted above/below the viewport so small scrolls reuse the DOM. */
export const HIGHLIGHT_OVERSCAN_LINES = 20

/** A half-open line window: `start` inclusive, `end` exclusive, both 0-based. */
export interface LineRange {
  readonly start: number
  readonly end: number
}

/**
 * Convert a scroll position into the line window to mount, clamped to
 * `[0, lineCount]` and widened by the overscan on both sides.
 * @param scrollTop - the textarea's vertical scroll offset in px.
 * @param viewportHeight - the textarea's visible height in px (0 when hidden).
 * @param lineCount - total logical lines of the source.
 * @param lineHeight - the fixed editor line height in px.
 * @param overscan - extra lines mounted on each side of the viewport.
 * @returns the clamped half-open line window.
 */
export function visibleLineRange(
  scrollTop: number,
  viewportHeight: number,
  lineCount: number,
  lineHeight: number = EDITOR_LINE_HEIGHT_PX,
  overscan: number = HIGHLIGHT_OVERSCAN_LINES,
): LineRange {
  const firstVisible = Math.floor(Math.max(0, scrollTop) / lineHeight)
  const lastVisibleExclusive = Math.ceil(Math.max(0, scrollTop + viewportHeight) / lineHeight)
  return {
    start: Math.max(0, Math.min(lineCount, firstVisible - overscan)),
    end: Math.max(0, Math.min(lineCount, lastVisibleExclusive + overscan)),
  }
}

/**
 * Split a flat token list into one token list per logical line. Newlines are
 * consumed by the split, so the concatenation of `lines[i]` equals
 * `content.split('\n')[i]`; a token spanning lines (only `$$...$$` math and
 * `plain` runs can) is divided at the line boundary with its type preserved.
 * @param tokens - the full-document tokens from `tokenizeLatex`.
 * @returns per-line token lists; `lines.length` is the source's line count.
 */
export function splitTokensByLine(tokens: readonly LatexToken[]): LatexToken[][] {
  const lines: LatexToken[][] = [[]]
  for (const token of tokens) {
    let segmentStart = 0
    for (let i = 0; i <= token.text.length; i += 1) {
      if (i === token.text.length || token.text[i] === '\n') {
        if (i > segmentStart) {
          lines[lines.length - 1]?.push({ type: token.type, text: token.text.slice(segmentStart, i) })
        }
        if (i < token.text.length) lines.push([])
        segmentStart = i + 1
      }
    }
  }
  return lines
}

/**
 * Display width of one line in monospace columns: a tab advances to the next
 * multiple of `tabSize`, East-Asian wide code points count double, everything
 * else counts one. Heuristic by design — it only picks the sizer line that
 * keeps the overlay's scrollable width in step with the textarea's.
 * @param line - one logical source line (no trailing newline).
 * @param tabSize - the editor's tab stop (CSS `tab-size`).
 * @returns the line's width in `ch` columns.
 */
export function displayColumns(line: string, tabSize: number = 8): number {
  let columns = 0
  for (const ch of line) {
    if (ch === '\t') {
      columns += tabSize - (columns % tabSize)
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    columns += (code >= 0x1100 && code <= 0x115f)
      || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe4f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
      || (code >= 0x20000 && code <= 0x3fffd)
      ? 2
      : 1
  }
  return columns
}

/**
 * Pick the widest line by {@link displayColumns}. The overlay renders it in a
 * zero-height hidden sizer so its scrollable width matches the textarea's
 * even though only a window of lines is mounted (the browser measures the
 * glyphs itself, so tabs and wide chars expand exactly as in the textarea).
 * @param lines - the source split into logical lines.
 * @param tabSize - the editor's tab stop (CSS `tab-size`).
 * @returns the widest line's text, or `''` for an empty source.
 */
export function widestLine(lines: readonly string[], tabSize: number = 8): string {
  let widest = ''
  let widestColumns = -1
  for (const line of lines) {
    // Cheap upper bound first: no code point exceeds `tabSize` columns (a tab
    // at column 0), so a short enough line can never dethrone the champion.
    // 1-column ASCII lines dominate real sources, so this skips most measuring.
    if (line.length * tabSize <= widestColumns) continue
    const columns = displayColumns(line, tabSize)
    if (columns > widestColumns) {
      widestColumns = columns
      widest = line
    }
  }
  return widest
}
