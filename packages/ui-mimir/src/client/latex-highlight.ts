/**
 * A minimal, dependency-free LaTeX tokenizer for the paper editor's syntax
 * highlight overlay. Robustness beats completeness: anything unrecognized
 * stays `plain` — a missed highlight is fine, a misaligned one is not.
 * Rules: comments run from an unescaped `%` to end of line; commands are
 * `\letters` with an optional `*`; the environment name inside
 * `\begin{env}`/`\end{env}` is its own token; `$...$` (same line only) and
 * `$$...$$` are one math token each, an unclosed `$` falls back to plain;
 * braces and brackets are single-char tokens; two-character backslash escapes
 * (`\%`, `\$`, `\\`…) are plain so they never start a comment or command.
 * @module dsh-client-ui-mimir/client/latex-highlight
 */

/** Token categories the overlay colors. */
export type LatexTokenType = 'plain' | 'comment' | 'command' | 'math' | 'brace' | 'bracket' | 'env'

/** One token: its category and exact source slice (concatenation reproduces the input). */
export interface LatexToken {
  readonly type: LatexTokenType
  readonly text: string
}

/**
 * Source length above which the editor skips highlighting entirely — the
 * token list is rebuilt on every keystroke, and a pathological file must not
 * freeze the panel.
 */
export const HIGHLIGHT_MAX_LENGTH = 200_000

/** LaTeX command names are ASCII letters only. */
function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'))
}

/**
 * Tokenize LaTeX source for the highlight overlay. The concatenation of all
 * token texts always equals the input, so the overlay can never drift from
 * the textarea's content.
 * @param text - the full `main.tex` source.
 * @returns the token list; adjacent `plain` runs are merged.
 */
export function tokenizeLatex(text: string): LatexToken[] {
  const tokens: LatexToken[] = []
  let plainStart = 0
  let i = 0
  const flushPlain = (until: number): void => {
    if (until > plainStart) tokens.push({ type: 'plain', text: text.slice(plainStart, until) })
  }

  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      const next = text[i + 1]
      // A lone trailing backslash or an escaped non-letter (\%, \$, \\)
      // stays plain — crucially, an escaped percent never opens a comment.
      if (!isLetter(next)) {
        i += next === undefined ? 1 : 2
        continue
      }
      flushPlain(i)
      let j = i + 1
      while (j < text.length && isLetter(text[j])) j += 1
      const name = text.slice(i + 1, j)
      if (text[j] === '*') j += 1
      tokens.push({ type: 'command', text: text.slice(i, j) })
      // \begin{env} / \end{env}: the environment name gets its own token;
      // anything unusual (unclosed, nested braces, newline inside) degrades
      // to the ordinary brace/plain path.
      if ((name === 'begin' || name === 'end') && text[j] === '{') {
        const close = text.indexOf('}', j + 1)
        const env = close === -1 ? '' : text.slice(j + 1, close)
        if (close !== -1 && env !== '' && !/[\n{}\\%$]/.test(env)) {
          tokens.push({ type: 'brace', text: '{' })
          tokens.push({ type: 'env', text: env })
          tokens.push({ type: 'brace', text: '}' })
          i = close + 1
          plainStart = i
          continue
        }
      }
      i = j
      plainStart = i
      continue
    }
    if (ch === '%') {
      flushPlain(i)
      let j = i
      while (j < text.length && text[j] !== '\n') j += 1
      tokens.push({ type: 'comment', text: text.slice(i, j) })
      i = j
      plainStart = i
      continue
    }
    if (ch === '$') {
      const double = text[i + 1] === '$'
      const closer = double ? '$$' : '$'
      const searchFrom = i + (double ? 2 : 1)
      let end = text.indexOf(closer, searchFrom)
      // Inline math never crosses a line; an unclosed $ is plain text.
      if (!double && end !== -1) {
        const newline = text.indexOf('\n', searchFrom)
        if (newline !== -1 && newline < end) end = -1
      }
      if (end === -1) {
        i += 1
        continue
      }
      flushPlain(i)
      tokens.push({ type: 'math', text: text.slice(i, end + closer.length) })
      i = end + closer.length
      plainStart = i
      continue
    }
    if (ch === '{' || ch === '}') {
      flushPlain(i)
      tokens.push({ type: 'brace', text: ch })
      i += 1
      plainStart = i
      continue
    }
    if (ch === '[' || ch === ']') {
      flushPlain(i)
      tokens.push({ type: 'bracket', text: ch })
      i += 1
      plainStart = i
      continue
    }
    i += 1
  }
  flushPlain(text.length)
  return tokens
}
