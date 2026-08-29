/**
 * CBE library themes (S5): the reading shelf's own drift — the THEME MIX of
 * the papers collected in one window, compared against the equal-length
 * window immediately before it. This is the "收集的 pdf 的主题范围演变"
 * organ: the ledger already knows which papers arrived when (the wiki
 * `papers` table carries `addedAt`), so the shelf's movement is derivable
 * without the researcher ever writing a line about it.
 *
 * Everything here is E0 arithmetic: counts, shares, and date buckets — the
 * same discipline as {@link module:dsh-mimir/src/foraging}. Two honesty
 * notes, registered rather than hidden:
 *
 *  1. **`tag` themes are DECLARED**, not inferred — they come from the
 *     paper's own `tags` field (the surveyor's vocabulary). They are the
 *     highest-fidelity signal and the only one that is the user's words.
 *  2. **`keyword` themes are term-frequency clusters** over title+summary.
 *     They are DESCRIPTIVE ("these words dominate the shelf"), never
 *     semantic inference, and never a reading recommendation: no go/stay
 *     language, per the origin rule. A keyword is a string the shelf
 *     repeats, not a topic the system claims to understand.
 *
 * v1 known limitation (registered, not silent): CJK titles are cut into
 * character bigrams, which is a crude proxy for Chinese keywords — it
 * finds repeated substrings, not words.
 *
 * The organ reads papers DIRECTLY (not through `CbeWikiSnapshot`), because
 * the library is not a line and carries no drift: it is the shelf, and the
 * shelf has no opinions.
 * @module dsh-mimir/src/library-themes
 */

import type { PaperRecord } from './types.ts'

/** Papers in the current window before the drift comparison may speak (I2's floor). */
export const CBE_THEME_MIN_PAPERS = 3

/** A keyword must appear in at least this many papers to become a theme. */
export const CBE_THEME_KEYWORD_MIN_DOCS = 2

/** How many themes each window reports (top-N by count). */
export const CBE_THEME_TOP_N = 8

/** Share movement that still counts as flat (guards against float noise). */
export const CBE_THEME_FLAT_BAND = 0.05

/** Shortest ASCII token kept as a keyword candidate. */
const CBE_THEME_MIN_TOKEN_CHARS = 3

/**
 * English function words plus the arXiv boilerplate that would otherwise
 * dominate every title in the corpus.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have',
  'had', 'but', 'not', 'you', 'your', 'our', 'its', 'their', 'can', 'may', 'all', 'any',
  'via', 'using', 'based', 'towards', 'toward', 'into', 'onto', 'over', 'under', 'when',
  'where', 'which', 'while', 'who', 'whom', 'how', 'why', 'what', 'also', 'more', 'most',
  'some', 'such', 'than', 'then', 'there', 'these', 'those', 'been', 'being', 'does',
  'did', 'doing', 'each', 'other', 'both', 'few', 'own', 'same', 'too', 'very', 'one',
  'two', 'three', 'new', 'novel', 'study', 'approach', 'method', 'methods', 'paper',
  'results', 'result', 'show', 'shows', 'shown', 'propose', 'proposed', 'we', 'our',
])

/** Round to 3 decimals for stable rendering/serialization. */
function r3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Parse one ISO-8601 timestamp to epoch ms (NaN → null). */
function tsToMs(ts: string): number | null {
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

/** Where one theme came from: the user's own tag, or a repeated keyword. */
export type CbeThemeSource = 'tag' | 'keyword'

/** How one theme moved between the previous window and the current one. */
export type CbeThemeDirection = 'new' | 'rising' | 'flat' | 'falling' | 'gone'

/** One theme's weight inside one window. */
export interface CbeThemeCount {
  readonly theme: string
  /** Papers in the window carrying this theme (once per paper, not per hit). */
  readonly count: number
  /** `count / windowPaperCount`; 0 when the window is empty. */
  readonly share: number
  readonly source: CbeThemeSource
}

/** One window's theme mix: the shelf's composition over that span. */
export interface CbeThemeWindow {
  readonly since: string
  readonly until: string
  readonly paperCount: number
  readonly themes: readonly CbeThemeCount[]
}

/** One theme's movement across the two windows. */
export interface CbeThemeDriftRow {
  readonly theme: string
  readonly source: CbeThemeSource
  readonly currentCount: number
  readonly previousCount: number
  /** Share change (current − previous), 3-decimal. */
  readonly deltaShare: number
  readonly direction: CbeThemeDirection
}

/** The whole derived theme layer (L1: re-derivable, never persisted). */
export interface CbeLibraryThemes {
  readonly asOf: string
  readonly current: CbeThemeWindow
  readonly previous: CbeThemeWindow
  /** Top-N by |deltaShare|, then by count, then by name (stable). */
  readonly drift: readonly CbeThemeDriftRow[]
  /** Themes present now that the previous window never saw. */
  readonly newThemes: readonly string[]
  /** Themes the previous window had that this one dropped entirely. */
  readonly departedThemes: readonly string[]
  /** Whether the comparison may speak (I2's floor; counts are always shown). */
  readonly speaks: boolean
}

/**
 * Cut one text into keyword candidates: ASCII word tokens (length ≥
 * {@link CBE_THEME_MIN_TOKEN_CHARS}, stopwords and bare numbers dropped)
 * plus CJK character bigrams. Deterministic and allocation-cheap; the CJK
 * path is the registered v1 limitation.
 */
export function themeTokens(text: string): readonly string[] {
  const tokens: string[] = []
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (raw.length < CBE_THEME_MIN_TOKEN_CHARS) continue
    if (/^\d+$/u.test(raw)) continue
    if (STOPWORDS.has(raw)) continue
    tokens.push(raw)
  }
  // CJK runs → character bigrams (crude, registered as such).
  for (const run of text.match(/[㐀-鿿]+/gu) ?? []) {
    if (run.length < 2) continue
    for (let i = 0; i + 1 < run.length; i += 1) tokens.push(run.slice(i, i + 2))
  }
  return tokens
}

/**
 * The declared themes of one paper: its `tags`, trimmed, lowercased, and
 * deduplicated (empty tags dropped). These are the surveyor's own words.
 */
export function tagThemesOf(paper: PaperRecord): readonly string[] {
  const seen = new Set<string>()
  for (const tag of paper.tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized !== '') seen.add(normalized)
  }
  return [...seen]
}

/**
 * Count themes over one set of papers: tags first (declared), then
 * keywords that clear {@link CBE_THEME_KEYWORD_MIN_DOCS} (repeated). A tag
 * wins over a keyword of the same string — the user's word is the word.
 * @param papers - the papers of one window.
 * @returns the top-N themes by count, then name.
 */
export function countThemes(papers: readonly PaperRecord[]): readonly CbeThemeCount[] {
  const tagDocs = new Map<string, Set<string>>()
  const keywordDocs = new Map<string, Set<string>>()
  for (const paper of papers) {
    for (const tag of tagThemesOf(paper)) {
      const docs = tagDocs.get(tag) ?? new Set<string>()
      docs.add(paper.arxivId)
      tagDocs.set(tag, docs)
    }
    for (const token of new Set(themeTokens(`${paper.title} ${paper.summary}`))) {
      const docs = keywordDocs.get(token) ?? new Set<string>()
      docs.add(paper.arxivId)
      keywordDocs.set(token, docs)
    }
  }
  // A repeated keyword the user ALSO declared as a tag folds INTO the tag
  // row: the tag wins the name and the source label (it is the user's
  // word), but the count is the union — declaring a theme on one paper does
  // not make the other papers that carry the same word stop carrying it.
  for (const [theme, docs] of keywordDocs) {
    const tagged = tagDocs.get(theme)
    if (tagged === undefined) continue
    for (const id of docs) tagged.add(id)
  }

  const rows: CbeThemeCount[] = []
  const total = papers.length
  const row = (theme: string, docs: ReadonlySet<string>, source: CbeThemeSource): CbeThemeCount =>
    Object.freeze({ theme, count: docs.size, share: r3(total === 0 ? 0 : docs.size / total), source })
  for (const [theme, docs] of tagDocs) rows.push(row(theme, docs, 'tag'))
  for (const [theme, docs] of keywordDocs) {
    if (tagDocs.has(theme)) continue
    if (docs.size < CBE_THEME_KEYWORD_MIN_DOCS) continue
    rows.push(row(theme, docs, 'keyword'))
  }
  rows.sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
  return Object.freeze(rows.slice(0, CBE_THEME_TOP_N))
}

/**
 * Split the papers into the current window and the equal-length window
 * immediately before it, then compare their theme mixes. Below
 * {@link CBE_THEME_MIN_PAPERS} the comparison stays SILENT (I2's rule:
 * not enough words have been earned) — the counts still render, because
 * "you added two papers, both about X" is descriptive and safe.
 * @param papers - every remembered paper (any order; filtered by `addedAt`).
 * @param since - window start, inclusive (ISO-8601).
 * @param until - window end, exclusive (ISO-8601).
 * @param nowMs - "now" in epoch ms (injectable for determinism).
 * @returns the derived theme layer.
 */
export function deriveLibraryThemes(
  papers: readonly PaperRecord[],
  since: string,
  until: string,
  nowMs: number,
): CbeLibraryThemes {
  const untilMs = tsToMs(until) ?? nowMs
  const sinceMs = tsToMs(since) ?? 0
  const span = Math.max(0, untilMs - sinceMs)
  const previousSinceMs = sinceMs - span

  const current: PaperRecord[] = []
  const previous: PaperRecord[] = []
  for (const paper of papers) {
    const ms = tsToMs(paper.addedAt)
    if (ms === null) continue
    if (ms >= sinceMs && ms < untilMs) current.push(paper)
    else if (ms >= previousSinceMs && ms < sinceMs) previous.push(paper)
  }

  const currentThemes = countThemes(current)
  const previousThemes = countThemes(previous)
  const speaks = current.length >= CBE_THEME_MIN_PAPERS && previous.length >= CBE_THEME_MIN_PAPERS

  const previousByTheme = new Map(previousThemes.map(row => [row.theme, row] as const))
  const drift: CbeThemeDriftRow[] = []
  if (speaks) {
    for (const row of currentThemes) {
      const before = previousByTheme.get(row.theme)
      const previousCount = before?.count ?? 0
      const deltaShare = r3(row.share - (before?.share ?? 0))
      const direction: CbeThemeDirection = previousCount === 0
        ? 'new'
        : deltaShare > CBE_THEME_FLAT_BAND ? 'rising'
          : deltaShare < -CBE_THEME_FLAT_BAND ? 'falling'
            : 'flat'
      drift.push(Object.freeze({
        theme: row.theme,
        source: row.source,
        currentCount: row.count,
        previousCount,
        deltaShare,
        direction,
      }))
    }
    const currentNames = new Set(currentThemes.map(row => row.theme))
    for (const row of previousThemes) {
      if (currentNames.has(row.theme)) continue
      drift.push(Object.freeze({
        theme: row.theme,
        source: row.source,
        currentCount: 0,
        previousCount: row.count,
        deltaShare: r3(-row.share),
        direction: 'gone',
      }))
    }
    drift.sort((a, b) => Math.abs(b.deltaShare) - Math.abs(a.deltaShare)
      || b.currentCount - a.currentCount
      || a.theme.localeCompare(b.theme))
  }

  return Object.freeze({
    asOf: new Date(nowMs).toISOString(),
    current: Object.freeze({
      since: new Date(sinceMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      paperCount: current.length,
      themes: currentThemes,
    }),
    previous: Object.freeze({
      since: new Date(previousSinceMs).toISOString(),
      until: new Date(sinceMs).toISOString(),
      paperCount: previous.length,
      themes: previousThemes,
    }),
    drift: Object.freeze(drift),
    newThemes: Object.freeze(drift.filter(row => row.direction === 'new').map(row => row.theme)),
    departedThemes: Object.freeze(drift.filter(row => row.direction === 'gone').map(row => row.theme)),
    speaks,
  })
}
