/**
 * The papers view: an arXiv search bar on top (results import into the wiki
 * with one click), then the literature library as a card grid — title (linked
 * to the arXiv page), authors, added date, a three-line-clamped summary the
 * reader can expand, tag pills and linked-project badges, the agent's working
 * notes, a PDF section (fetch the arXiv PDF into the workspace, then read it
 * in the embedded iframe on the `/research/paper-pdf/<id>` route, with a
 * reading-notes side panel appending timestamped entries into the record's
 * notes), and
 * edit/delete actions. The edit action opens an inline editor
 * (tags, project links, notes); a filter bar above the grid narrows the
 * library by one tag and/or the currently selected project; each card can be
 * appended to the selected project's `references.bib` in one click. A
 * toolbar button hands the currently filtered selection to the current
 * session's agent as a "draft the related work section" prompt.
 * @module dsh-client-ui-mimir/client/PapersView
 */

import { useEffect, useRef, useState } from 'react'
import type { ArxivEntry, PaperRecord, ResearchProjectView } from 'dsh-mimir/types'
import type {
  ResearchArxivSearchView, ResearchFailureView, ResearchImportCounts, ResearchPapersView,
  ResearchSubscriptionsView,
} from './controller.ts'
import { collectTags, failureCopy, filterPapers, paperPdfUrl, type ResearchT } from './view-common.ts'
import { appendReadingNote, parseReadingNotes } from './paper-notes.ts'
import { buildRelatedWorkPrompt } from './related-work.ts'
import { EmptyState } from './EmptyState.tsx'
import { SubscriptionsBar } from './SubscriptionsBar.tsx'
import { ViewHead } from './ViewHead.tsx'
import css from './ResearchPanel.module.css'

/** Fields the inline editor saves back through `updatePaper`. */
interface PaperPatch {
  readonly tags?: string[]
  readonly projectIds?: string[]
  readonly notes?: string
}

/** Settle feedback of one card's add-to-bibliography button. */
type AddToBibState = 'idle' | 'adding' | 'added' | 'exists'

/** How long the added/exists feedback shows before the button resets. */
const ADD_TO_BIB_RESET_MS = 2000

/**
 * One card's PDF section: a fetch button (downloads the arXiv PDF into the
 * workspace through `fetchPaperPdf`, labeled refetch once linked) and, once
 * the record carries a `pdfPath`, a read toggle opening the embedded iframe
 * reader on the `/research/paper-pdf/<id>` route next to the reading-notes
 * side panel. A successful fetch bumps the cache-bust version and opens the
 * reader.
 */
function PaperPdfSection({ paper, fetchPaperPdf, updatePaper, onError, t }: {
  readonly paper: PaperRecord
  readonly fetchPaperPdf: (arxivId: string) => Promise<ResearchFailureView | null>
  readonly updatePaper: (arxivId: string, patch: PaperPatch) => Promise<ResearchFailureView | null>
  readonly onError: (message: string) => void
  readonly t: ResearchT
}) {
  const [fetching, setFetching] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [version, setVersion] = useState(() => Date.now())

  const fetchPdf = (): void => {
    if (fetching) return
    setFetching(true)
    void fetchPaperPdf(paper.arxivId)
      .then((failure) => {
        if (failure === null) {
          setVersion(Date.now())
          setReaderOpen(true)
        } else {
          onError(`${t('papers.fetchPdfFailed')}：${failure.message}`)
        }
      })
      .finally(() => { setFetching(false) })
  }

  return (
    <div className={css.paperPdf}>
      {paper.pdfPath !== undefined && readerOpen && (
        <div className={css.paperPdfReader}>
          <iframe
            className={css.paperPdfFrame}
            title={`${t('papers.readPdf')}：${paper.title}`}
            src={paperPdfUrl(paper.arxivId, version)}
          />
          <PaperNotesPanel paper={paper} updatePaper={updatePaper} onError={onError} t={t} />
        </div>
      )}
      <div className={css.paperPdfActions}>
        <button
          type="button"
          className={css.btn}
          disabled={fetching}
          onClick={fetchPdf}
        >
          {fetching
            ? t('papers.fetchingPdf')
            : paper.pdfPath === undefined ? t('papers.fetchPdf') : t('papers.refetchPdf')}
        </button>
        {paper.pdfPath !== undefined && (
          <button
            type="button"
            className={css.btn}
            data-active={readerOpen || undefined}
            aria-expanded={readerOpen}
            onClick={() => { setReaderOpen(prev => !prev) }}
          >
            {readerOpen ? t('papers.closePdf') : t('papers.readPdf')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The reading-notes side panel next to the open PDF reader: the record's
 * timestamped entries (parsed out of `notes`) as a list, then a quick-add
 * box appending a new `[YYYY-MM-DD HH:mm]` entry through the existing
 * `updatePaper` verb. The entry list re-derives from the refreshed record
 * after every save.
 */
function PaperNotesPanel({ paper, updatePaper, onError, t }: {
  readonly paper: PaperRecord
  readonly updatePaper: (arxivId: string, patch: PaperPatch) => Promise<ResearchFailureView | null>
  readonly onError: (message: string) => void
  readonly t: ResearchT
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const entries = parseReadingNotes(paper.notes)

  const addNote = (): void => {
    if (saving || draft.trim() === '') return
    setSaving(true)
    void updatePaper(paper.arxivId, { notes: appendReadingNote(paper.notes, draft, new Date()) })
      .then((failure) => {
        if (failure === null) {
          setDraft('')
        } else {
          onError(`${t('papers.addNoteFailed')}：${failure.message}`)
        }
      })
      .finally(() => { setSaving(false) })
  }

  return (
    <aside className={css.paperNotesPanel}>
      <h4 className={css.paperNotesTitle}>{t('papers.readingNotes')}</h4>
      {entries.length === 0 ? (
        <p className={css.hint}>{t('papers.readingNotesEmpty')}</p>
      ) : (
        <div className={css.paperNoteList}>
          {entries.map((entry, index) => (
            <div key={`${entry.at}-${index}`} className={css.paperNoteItem}>
              <span className={css.paperNoteAt}>{entry.at}</span>
              <p className={css.paperNoteText}>{entry.text}</p>
            </div>
          ))}
        </div>
      )}
      <textarea
        className={css.input}
        rows={3}
        value={draft}
        placeholder={t('papers.noteInputPlaceholder')}
        onChange={event => { setDraft(event.target.value) }}
      />
      <button
        type="button"
        className={css.btnPrimary}
        disabled={saving || draft.trim() === ''}
        onClick={addNote}
      >
        {saving ? t('papers.addingNote') : t('papers.addNote')}
      </button>
    </aside>
  )
}

/**
 * One card's "add to bibliography" button: appends the paper to the selected
 * project's `references.bib` and shows the settled outcome briefly. Disabled
 * until a project is selected.
 */
function AddToBibButton({ paper, projectId, importPapersToBib, onError, t }: {
  readonly paper: PaperRecord
  readonly projectId: string | null
  readonly importPapersToBib: (
    projectId: string,
    arxivIds: string[],
  ) => Promise<ResearchFailureView | ResearchImportCounts>
  readonly onError: (message: string) => void
  readonly t: ResearchT
}) {
  const [state, setState] = useState<AddToBibState>('idle')
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel a pending feedback reset on unmount.
  useEffect(() => () => {
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
  }, [])

  const add = (): void => {
    if (projectId === null || state === 'adding') return
    setState('adding')
    void importPapersToBib(projectId, [paper.arxivId]).then((outcome) => {
      if ('code' in outcome) {
        setState('idle')
        onError(`${t('papers.addToBibFailed')}：${outcome.message}`)
        return
      }
      setState(outcome.added.length > 0 ? 'added' : 'exists')
      resetTimerRef.current = setTimeout(() => { setState('idle') }, ADD_TO_BIB_RESET_MS)
    })
  }

  const copy = state === 'adding'
    ? t('papers.addingToBib')
    : state === 'added'
      ? t('papers.addedToBib')
      : state === 'exists'
        ? t('papers.alreadyInBib')
        : t('papers.addToBib')
  return (
    <button
      type="button"
      className={css.btn}
      disabled={projectId === null || state === 'adding'}
      title={projectId === null ? t('bib.noProject') : undefined}
      onClick={add}
    >
      {copy}
    </button>
  )
}

/**
 * @param props - the literature view, the arXiv search slice, the project
 * list (for link checkboxes and badges), the selected project (the
 * current-project filter), the load/search/import/update/remove verbs, and
 * copy.
 * @returns the search bar and results over the filterable library grid.
 */
export function PapersView({
  papers, arxivSearch, arxivSubscriptions, projects, selectedProjectId, ensurePapers, searchArxiv,
  saveArxivSubscription, deleteArxivSubscription, checkArxivSubscriptions,
  importPaper, updatePaper, removePaper, importPapersToBib, fetchPaperPdf, requestRelatedWork, t,
}: {
  readonly papers: ResearchPapersView
  readonly arxivSearch: ResearchArxivSearchView | null
  readonly arxivSubscriptions: ResearchSubscriptionsView
  readonly projects: readonly ResearchProjectView[]
  readonly selectedProjectId: string | null
  readonly ensurePapers: () => void
  readonly saveArxivSubscription: (query: string) => Promise<ResearchFailureView | null>
  readonly deleteArxivSubscription: (id: string) => Promise<ResearchFailureView | null>
  readonly checkArxivSubscriptions: () => Promise<ResearchFailureView | null>
  readonly searchArxiv: (query: string) => void
  readonly importPaper: (entry: ArxivEntry) => Promise<ResearchFailureView | null>
  readonly updatePaper: (arxivId: string, patch: PaperPatch) => Promise<ResearchFailureView | null>
  readonly removePaper: (arxivId: string) => Promise<ResearchFailureView | null>
  readonly importPapersToBib: (
    projectId: string,
    arxivIds: string[],
  ) => Promise<ResearchFailureView | ResearchImportCounts>
  readonly fetchPaperPdf: (arxivId: string) => Promise<ResearchFailureView | null>
  readonly requestRelatedWork: (prompt: string) => Promise<void>
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
  const selectedProject = projects.find(project => project.id === selectedProjectId) ?? null

  // The related-work button covers exactly the papers on screen (the tag /
  // current-project filter IS the selection), and lands in toasts.
  const draftRelatedWork = (): void => {
    if (selectedProject === null || visible.length === 0) return
    setActionError(null)
    void requestRelatedWork(buildRelatedWorkPrompt({
      papers: visible,
      projectTitle: selectedProject.title,
      dir: selectedProject.paperDir,
    }))
  }

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
      <SubscriptionsBar
        subscriptions={arxivSubscriptions}
        importedIds={importedIds}
        importPaper={importPaper}
        saveArxivSubscription={saveArxivSubscription}
        deleteArxivSubscription={deleteArxivSubscription}
        checkArxivSubscriptions={checkArxivSubscriptions}
        t={t}
      />
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
          <div className={css.papersFilters}>
            <button
              type="button"
              className={css.btnPrimary}
              disabled={selectedProject === null || visible.length === 0}
              title={selectedProject === null ? t('bib.noProject') : t('papers.relworkScope')}
              onClick={draftRelatedWork}
            >
              {t('papers.relwork')} × {visible.length}
            </button>
          </div>
          {(allTags.length > 0 || selectedProjectId !== null) && (
            <div className={css.papersFilters}>
              {allTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={css.tagPill}
                  data-active={activeTag === tag || undefined}
                  aria-pressed={activeTag === tag}
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
                  aria-pressed={currentOnly}
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
                            aria-pressed={activeTag === tag}
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
                      aria-expanded={open}
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
                    <PaperPdfSection
                      paper={paper}
                      fetchPaperPdf={fetchPaperPdf}
                      updatePaper={updatePaper}
                      onError={setActionError}
                      t={t}
                    />
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
                      <AddToBibButton
                        paper={paper}
                        projectId={selectedProjectId}
                        importPapersToBib={importPapersToBib}
                        onError={setActionError}
                        t={t}
                      />
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
