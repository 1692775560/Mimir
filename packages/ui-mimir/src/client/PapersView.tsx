/**
 * The papers view: the literature library as a card grid — title (linked to
 * the arXiv page), authors, added date, a three-line-clamped summary the
 * reader can expand, and the agent's working notes.
 * @module dsh-client-ui-mimir/client/PapersView
 */

import { useState } from 'react'
import type { ResearchPapersView } from './controller.ts'
import { failureCopy, type ResearchT } from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import css from './ResearchPanel.module.css'

/**
 * @param props - the literature view, the load verb, and copy.
 * @returns the library grid, or the status placeholder.
 */
export function PapersView({ papers, ensurePapers, t }: {
  readonly papers: ResearchPapersView
  readonly ensurePapers: () => void
  readonly t: ResearchT
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  if (papers.status === 'cold' || papers.status === 'loading') {
    return <p className={css.hint}>{t('papers.loading')}</p>
  }
  if (papers.status === 'error') {
    return (
      <p className={css.failure} role="alert">
        {t('error.papers')}：{failureCopy(t, papers.failure)}
        <button type="button" className={css.retry} onClick={ensurePapers}>
          {t('error.retry')}
        </button>
      </p>
    )
  }
  if (papers.list.length === 0) {
    return <EmptyState glyph="📚">{t('papers.empty')}</EmptyState>
  }
  return (
    <div className={css.papersGrid}>
      {papers.list.map((paper) => {
        const open = Boolean(expanded[paper.arxivId])
        return (
          <article key={paper.arxivId} className={css.paperCard}>
            <h3 className={css.paperCardTitle}>
              {paper.url === ''
                ? paper.title
                : (
                  <a href={paper.url} target="_blank" rel="noreferrer">
                    {paper.title}
                  </a>
                )}
            </h3>
            <p className={css.paperCardMeta}>
              {paper.authors.length > 0 && `${paper.authors.join('，')} · `}
              {t('papers.addedAt')}
              {' '}
              {paper.addedAt.slice(0, 10)}
            </p>
            <button
              type="button"
              className={css.paperSummary}
              data-open={open || undefined}
              onClick={() => {
                setExpanded(prev => ({ ...prev, [paper.arxivId]: !prev[paper.arxivId] }))
              }}
            >
              {paper.summary}
            </button>
            {paper.notes !== '' && (
              <p className={css.paperNotes}>{t('papers.notes')}：{paper.notes}</p>
            )}
          </article>
        )
      })}
    </div>
  )
}
