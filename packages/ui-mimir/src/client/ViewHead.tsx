/**
 * The shared view header: title plus one-line subtitle on the left, the view's
 * action buttons on the right. Every workbench view opens with one, so a view
 * never reads as a bare toolbar floating over content.
 * @module dsh-client-ui-mimir/client/ViewHead
 */

import type { ReactNode } from 'react'
import css from './ResearchPanel.module.css'

/**
 * @param props - the view's title, an optional subtitle, and the action slot.
 * @returns the view header row.
 */
export function ViewHead({ title, subtitle, children }: {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly children?: ReactNode
}) {
  return (
    <header className={css.viewHead}>
      <div className={css.viewHeadText}>
        <h2 className={css.viewTitle}>{title}</h2>
        {subtitle !== undefined && <p className={css.viewSubtitle}>{subtitle}</p>}
      </div>
      {children !== undefined && children !== false && (
        <div className={css.viewActions}>{children}</div>
      )}
    </header>
  )
}
