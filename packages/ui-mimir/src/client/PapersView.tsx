/**
 * The papers view: an arXiv search bar on top (results import into the wiki
 * with one click), then the literature library as a card grid — title (linked
 * to the arXiv page), authors, added date, a three-line-clamped summary the
 * reader can expand, tag pills and linked-project badges, the agent's working
 * notes, and edit/delete actions. The edit action opens an inline editor
 * (tags, project links, notes); a filter bar above the grid narrows the
 * library by one tag and/or the currently selected project.
 * @module dsh-client-ui-mimir/client/PapersView
 */

import { useState } from 'react'
import type { ArxivEntry, PaperRecord, ResearchProjectView } from 'dsh-mimir/types'
import type {
  ResearchArxivSearchView, ResearchFailureView, ResearchPapersView,
} from './controller.ts'
import { collectTags, failureCopy, filterPapers, type ResearchT } from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import { ViewHead } from './ViewHead.tsx'
import css from './ResearchPanel.module.css'

/** Fields the inline editor saves back through `updatePaper`. */
interface PaperPatch {
  readonly tags?: string[]
  readonly projectIds?: string[]
  readonly notes?: string
}

/**
 * @param props - the literature view, the arXiv search slice, the project
 * list (for link checkboxes and badges), the selected project (the
 * current-project filter), the load/search/import/update/remove verbs, and
 * copy.
 * @returns the search bar and results over the filterable library grid.
 */
export function PapersView({ papers, arxivSearch, projects, selectedProjectId, ensurePapers, searchArxiv, importPaper, updatePaper, removePaper, t }: {
  readonly papers: ResearchPapersView
  readonly arxivSearch: ResearchArxivSearchView | null
  readonly projects: readonly ResearchProjectView[]
  readonly selectedProjectId: string | null
  readonly ensurePapers: () => void
  readonly searchArxiv: (query: string) => void
  readonly importPaper: (entry: ArxivEntry) => Promise<ResearchFailureView | null>
  readonly updatePaper: (arxivId: string, patch: PaperPatch) => Promise<ResearchFailureView | null>
  readonly removePaper: (arxivId: string) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [currentOnly, setCurrentOnly] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [draftProjectIds, setDraftProjectIds] = useState<string[]>([])
  const [draftNotes, setDraftNotes] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const importedIds = new Set(papers.list.map(paper => paper.arxivId))
  const allTags = collectTags(papers.list)
  const visible = filterPapers(papers.list, activeTag, currentOnly ? selectedProjectId : null)

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

  const openEdit = (paper: PaperRecord): void => {
    setEditing(paper.arxivId)
    setDraftTags([...paper.tags])
    setDraftProjectIds([...paper.projectIds])
    setDraftNotes(paper.notes)
    setTagInput('')
    setActionError(null)
  }
  const addTag = (): void => {
    const tag = tagInput.trim()
    if (tag === '') return
    setDraftTags(prev => (prev.includes(tag) ? prev : [...prev, tag]))
    setTagInput('')
  }
  const toggleProject = (projectId: string): void => {
    setDraftProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId])
  }
  const saveEdit = (paper: PaperRecord): void => {
    if (saving) return
    // A tag typed but not yet committed with Enter rides along.
    const pending = tagInput.trim()
    const tags = pending === '' || draftTags.includes(pending) ? draftTags : [...draftTags, pending]
    setSaving(true)
    setActionError(null)
    void updatePaper(paper.arxivId, { tags, projectIds: draftProjectIds, notes: draftNotes })
      .then((failure) => {
        if (failure === null) {
          setEditing(null)
        } else {
          setActionError(`${t('papers.saveFailed')}：${failure.message}`)
        }
      })
      .finally(() => { setSaving(false) })
  }

  /** Project badges of one card: linked project titles, unknown ids shown raw. */
  const projectBadges = (paper: PaperRecord): Array<{ id: string; title: string }> =>
    paper.projectIds.map(id => ({ id, title: projects.find(project => project.id === id)?.title ?? id }))

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
        <>
          {(allTags.length > 0 || selectedProjectId !== null) && (
            <div className={css.papersFilters}>
              {allTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={css.tagPill}
                  data-active={activeTag === tag || undefined}
                  onClick={() => { setActiveTag(prev => (prev === tag ? null : tag)) }}
                >
                  {tag}
                </button>
              ))}
              {selectedProjectId !== null && (
                <button
                  type="button"
                  className={css.tagPill}
                  data-kind="project"
                  data-active={currentOnly || undefined}
                  onClick={() => { setCurrentOnly(prev => !prev) }}
                >
                  {t('papers.currentProjectOnly')}
                </button>
              )}
            </div>
          )}
          {visible.length === 0 ? (
            <p className={css.hint}>{t('papers.noMatch')}</p>
          ) : (
            <div className={css.papersGrid}>
              {visible.map((paper) => {
                const open = Boolean(expanded[paper.arxivId])
                const badges = projectBadges(paper)
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
                    {(paper.tags.length > 0 || badges.length > 0) && (
                      <p className={css.paperTags}>
                        {paper.tags.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            className={css.tagPill}
                            data-active={activeTag === tag || undefined}
                            onClick={() => { setActiveTag(prev => (prev === tag ? null : tag)) }}
                          >
                            {tag}
                          </button>
                        ))}
                        {badges.map(badge => (
                          <span key={badge.id} className={css.projectBadge} title={badge.title}>
                            {badge.title}
                          </span>
                        ))}
                      </p>
                    )}
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
                    {paper.notes !== '' && editing !== paper.arxivId && (
                      <p className={css.paperNotes}>{t('papers.notes')}：{paper.notes}</p>
                    )}
                    {editing === paper.arxivId && (
                      <div className={css.paperEditor}>
                        <span className={css.paperEditorLabel}>{t('papers.tags')}</span>
                        <div className={css.tagEditor}>
                          {draftTags.map(tag => (
                            <span key={tag} className={css.tagPill} data-static>
                              {tag}
                              <button
                                type="button"
                                className={css.tagRemove}
                                aria-label={`${t('papers.removeTag')} ${tag}`}
                                onClick={() => { setDraftTags(prev => prev.filter(item => item !== tag)) }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <input
                            className={css.input}
                            value={tagInput}
                            placeholder={t('papers.tagInputPlaceholder')}
                            onChange={event => { setTagInput(event.target.value) }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ',') {
                                event.preventDefault()
                                addTag()
                              }
                            }}
                          />
                        </div>
                        <span className={css.paperEditorLabel}>{t('papers.projects')}</span>
                        <div className={css.projectChecks}>
                          {projects.map(project => (
                            <label key={project.id} className={css.projectCheck}>
                              <input
                                type="checkbox"
                                checked={draftProjectIds.includes(project.id)}
                                onChange={() => { toggleProject(project.id) }}
                              />
                              {project.title}
                            </label>
                          ))}
                        </div>
                        <span className={css.paperEditorLabel}>{t('papers.notes')}</span>
                        <textarea
                          className={css.input}
                          rows={3}
                          value={draftNotes}
                          onChange={event => { setDraftNotes(event.target.value) }}
                        />
                        <div className={css.paperEditorFoot}>
                          <button
                            type="button"
                            className={css.btnPrimary}
                            disabled={saving}
                            onClick={() => { saveEdit(paper) }}
                          >
                            {saving ? t('papers.saving') : t('papers.save')}
                          </button>
                          <button
                            type="button"
                            className={css.btn}
                            disabled={saving}
                            onClick={() => { setEditing(null) }}
                          >
                            {t('papers.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className={css.paperCardFoot}>
                      {editing !== paper.arxivId && (
                        <button
                          type="button"
                          className={css.btn}
                          onClick={() => { openEdit(paper) }}
                        >
                          {t('papers.edit')}
                        </button>
                      )}
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
        </>
      )}
    </div>
  )
}
