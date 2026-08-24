/**
 * The figures view's grouping rules: files sharing one paper-directory-relative
 * stem (`figures/foo.png` + `figures/foo.svg`) are format siblings of ONE
 * figure and render as one card. This module picks the group's preview and
 * LaTeX-insert representative and merges the siblings' wiki metadata. DOM-free
 * so every rule is unit-testable.
 * @module dsh-client-ui-mimir/client/figure-groups
 */

import type { FigureEntry } from 'dsh-mimir/types'

/**
 * One figure card: every same-stem file grouped together. `preview` is the
 * sibling the card's thumbnail renders (raster first, then SVG, then the PDF
 * badge); `insert` is the sibling the LaTeX block references (the vector PDF
 * first — `figure_save`'s converted product — then raster, then SVG, whose
 * insert flow converts on demand).
 */
export interface FigureGroup {
  /** The shared paper-directory-relative stem (`figures/foo`). */
  readonly stem: string
  /** Display name: the stem's basename. */
  readonly name: string
  /** Every sibling, in the view's original order. */
  readonly entries: readonly FigureEntry[]
  /** The sibling whose image the card renders; null for a PDF-only group. */
  readonly preview: FigureEntry | null
  /** The sibling one insert/copy/delete acts on by default. */
  readonly insert: FigureEntry
  /** The first non-empty caption across the siblings, when any has one. */
  readonly caption?: string | undefined
  /** The first linked experiment id across the siblings, when any has one. */
  readonly experimentId?: string | undefined
  /** The group's extensions, lowercase without the dot, sorted. */
  readonly formats: readonly string[]
  /** Total bytes across the siblings. */
  readonly sizeBytes: number
  /** The newest mtime across the siblings. */
  readonly mtimeMs: number
}

/** Preview preference: the formats a browser `<img>` renders, best first. */
const PREVIEW_PREFERENCE = ['.png', '.jpg', '.jpeg', '.svg'] as const
/** Insert preference: what LaTeX embeds most directly, best first. */
const INSERT_PREFERENCE = ['.pdf', '.png', '.jpg', '.jpeg', '.svg'] as const

/** One entry's lowercase extension with the dot (`.png`). */
function extensionOf(entry: FigureEntry): string {
  const dot = entry.name.lastIndexOf('.')
  return dot === -1 ? '' : entry.name.slice(dot).toLowerCase()
}

/** Pick the group's representative by one preference list. */
function pickBy(entries: readonly FigureEntry[], preference: readonly string[]): FigureEntry | undefined {
  for (const ext of preference) {
    const found = entries.find(entry => extensionOf(entry) === ext)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Group one project's figure list into cards by the paper-directory-relative
 * stem. A lone file forms a singleton group; the cards keep the view's order
 * of each group's first entry.
 * @param entries - the host's figure list.
 * @returns one card per stem, in first-seen order.
 */
export function groupFigures(entries: readonly FigureEntry[]): FigureGroup[] {
  const byStem = new Map<string, FigureEntry[]>()
  for (const entry of entries) {
    const stem = entry.relPath.replace(/\.[^.]+$/, '')
    const bucket = byStem.get(stem)
    if (bucket === undefined) byStem.set(stem, [entry])
    else bucket.push(entry)
  }
  const groups: FigureGroup[] = []
  for (const [stem, siblings] of byStem) {
    const insert = pickBy(siblings, INSERT_PREFERENCE) ?? siblings[0]!
    const caption = siblings.find(entry => entry.caption !== undefined && entry.caption !== '')?.caption
    const experimentId = siblings.find(entry => entry.experimentId !== undefined)?.experimentId
    groups.push({
      stem,
      name: stem.split('/').pop() ?? stem,
      entries: Object.freeze(siblings),
      preview: pickBy(siblings, PREVIEW_PREFERENCE) ?? null,
      insert,
      ...(caption === undefined ? {} : { caption }),
      ...(experimentId === undefined ? {} : { experimentId }),
      formats: Object.freeze(siblings.map(entry => extensionOf(entry).slice(1)).sort()),
      sizeBytes: siblings.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      mtimeMs: Math.max(...siblings.map(entry => entry.mtimeMs)),
    })
  }
  return groups
}
