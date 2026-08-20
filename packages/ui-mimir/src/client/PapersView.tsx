/**
 * The papers view: an arXiv search bar on top (results import into the wiki
 * with one click), then the literature library as a card grid — title (linked
 * to the arXiv page), authors, added date, a three-line-clamped summary the
 * reader can expand, the agent's working notes, and a delete action.
 * @module dsh-client-ui-mimir/client/PapersView
 */

import { useState } from 'react'
import type { ArxivEntry, PaperRecord } from 'dsh-mimir/types'
import type {
  ResearchArxivSearchView, ResearchFailureView, ResearchPapersView,
} from './controller.ts'
import { failureCopy, type ResearchT } from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import { ViewHead } from './ViewHead.tsx'
import css from './ResearchPanel.module.css'

/**
 * @param props - the literature view, the arXiv search slice, the load/search/
 * import/remove verbs, and copy.
 * @returns the search bar and results over the library grid.
 */
export function PapersView({ papers, arxivSearch, ensurePapers, searchArxiv, importPaper, removePaper, t }: {
  readonly papers: ResearchPapersView
  readonly arxivSearch: ResearchArxivSearchView | null
  readonly ensurePapers: () => void
  readonly searchArxiv: (query: string) => void
  readonly importPaper: (entry: ArxivEntry) => Promise<ResearchFailureView | null>
  readonly removePaper: (arxivId: string) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const importedIds = new Set(papers.list.map(paper => paper.arxivId))

  const submitSearch = (): void => {
    if (query.trim() === '') return
    setActionError(null)
    searchArxiv(query)
  }
  const importEntry = (entry: ArxivEntry): void => {
    if (importing !== null) return
    setImporting(entry.id)
    setActionError(null)
    void importPaper(entry)
      .then((failure) => {
        setActionError(failure === null ? null : `${t('papers.importFailed')}：${failure.message}`)
      })
      .finally(() => { setImporting(null) })
  }
  const removeEntry = (paper: PaperRecord): void => {
    if (!window.confirm(t('papers.confirmDelete'))) return
    setActionError(null)
    void removePaper(paper.arxivId).then((failure) => {
      setActionError(failure === null ? null : `${t('papers.deleteFailed')}：${failure.message}`)
    })
  }

  return (
    <div className={css.papers}>
      <ViewHead title={t('tab.papers')} subtitle={t('view.papers.subtitle')} />
      <form
        className={css.papersSearchBar}
        onSubmit={(event) => {
          event.preventDefault()
          submitSearch()
        }}
      >
        <input
          className={css.input}
          value={query}
          placeholder={t('papers.searchPlaceholder')}
          onChange={event => { setQuery(event.target.value) }}
        />
        <button
          type="submit"
          className={css.btnPrimary}
          disabled={query.trim() === '' || arxivSearch?.status === 'loading'}
        >
          {arxivSearch?.status === 'loading' ? t('papers.searching') : t('papers.search')}
        </button>
      </form>
      {actionError !== null && (
        <p className={css.failure} role="alert">{actionError}</p>
      )}
      {arxivSearch !== null && (
        <section className={css.papersSearchPanel}>
          <h3 className={css.sectionTitle}>
            {t('papers.searchResults')}：{arxivSearch.query}
          </h3>
          {arxivSearch.status === 'loading' ? (
            <p className={css.hint}>{t('papers.searching')}</p>
          ) : arxivSearch.status === 'error' ? (
            <p className={css.failure} role="alert">
              {t('error.arxivSearch')}：{failureCopy(t, arxivSearch.failure)}
              <button type="button" className={css.btn} onClick={() => { searchArxiv(arxivSearch.query) }}>
                {t('error.retry')}
              </button>
            </p>
          ) : arxivSearch.list.length === 0 ? (
            <p className={css.hint}>{t('papers.searchEmpty')}</p>
          ) : (
            <div className={css.papersResults}>
              {arxivSearch.list.map(entry => (
                <article key={entry.id} className={css.paperResult}>
                  <div className={css.paperResultHead}>
                    <h3 className={css.paperCardTitle}>
                      <a href={entry.url} target="_blank" rel="noreferrer">
                        {entry.title}
                      </a>
                    </h3>
                    {importedIds.has(entry.id) ? (
                      <button type="button" className={css.btn} disabled>
                        {t('papers.imported')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={css.btnPrimary}
                        disabled={importing !== null}
                        onClick={() => { importEntry(entry) }}
                      >
                        {importing === entry.id ? t('papers.importing') : t('papers.import')}
                      </button>
                    )}
                  </div>
                  <p className={css.paperCardMeta}>
                    {entry.authors.length > 0 && `${entry.authors.join('，')} · `}
                    {entry.published.slice(0, 4)}
                  </p>
                  <p className={css.paperSummary} data-static>{entry.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {papers.status === 'cold' || papers.status === 'loading' ? (
        <p className={css.hint}>{t('papers.loading')}</p>
      ) : papers.status === 'error' ? (
        <p className={css.failure} role="alert">
          {t('error.papers')}：{failureCopy(t, papers.failure)}
          <button type="button" className={css.btn} onClick={ensurePapers}>
            {t('error.retry')}
          </button>
        </p>
      ) : papers.list.length === 0 ? (
        <EmptyState glyph="📚">{t('papers.empty')}</EmptyState>
      ) : (
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
                <div className={css.paperCardFoot}>
                  <button
                    type="button"
                    className={css.btn}
                    data-danger
                    onClick={() => { removeEntry(paper) }}
                  >
                    {t('papers.delete')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
