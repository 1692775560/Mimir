/**
 * The shared empty state: a centered dashed card with a glyph and one line of
 * copy, used by every workbench view so an empty tab never reads as a lone
 * grey sentence on a blank sheet.
 * @module dsh-client-ui-mimir/client/EmptyState
 */

import type { ReactNode } from 'react'
import css from './ResearchPanel.module.css'

/**
 * @param props - the glyph character and the explanatory copy.
 * @returns the dashed empty-state card.
 */
export function EmptyState({ glyph, children }: {
  readonly glyph: string
  readonly children: ReactNode
}) {
  return (
    <div className={css.emptyState}>
      <span className={css.emptyGlyph} aria-hidden>{glyph}</span>
      <span>{children}</span>
    </div>
  )
}
