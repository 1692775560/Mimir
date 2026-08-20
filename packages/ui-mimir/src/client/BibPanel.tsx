/**
 * The bibliography panel: the selected project's `references.bib` as an
 * entry list (citation key, type badge, one-line summary, delete), the
 * autosave-style status pill and conflict banner for entry deletes, and a
 * collapsible import picker that appends checked library papers through
 * `importPapersToBib`. The panel replaces the paper view's PDF preview while
 * open; the file stays the agent's — the panel only reads and rewrites it
 * under optimistic concurrency.
 * @module dsh-client-ui-mimir/client/BibPanel
 */

import { useEffect, useState } from 'react'
import type {
  ResearchBibView, ResearchFailureView, ResearchImportCounts, ResearchPapersView,
} from './controller.ts'
import { bibSummaryOf, failureCopy, SAVE_KEYS, type ResearchT } from './view-common.ts'
import css from './ResearchPanel.module.css'

/**
 * @param props - the bib slice, the literature list (the import picker), the
 * selected project, the inject verbs, the close callback, and copy.
 * @returns the bibliography editor.
 */
export function BibPanel({
  bib, papers, projectId, ensureBibliography, reloadBibliography,
  deleteBibEntry, importPapersToBib, ensurePapers, onClose, t,
}: {
  readonly bib: ResearchBibView | null
  readonly papers: ResearchPapersView
  readonly projectId: string
  readonly ensureBibliography: (projectId: string) => void
  readonly reloadBibliography: () => void
  readonly deleteBibEntry: (key: string) => Promise<ResearchFailureView | null>
  readonly importPapersToBib: (
    projectId: string,
    arxivIds: string[],
  ) => Promise<ResearchFailureView | ResearchImportCounts>
  readonly ensurePapers: () => void
  readonly onClose: () => void
  readonly t: ResearchT
}) {
  const [importOpen, setImportOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Load on open and on every project switch while open.
  useEffect(() => { ensureBibliography(projectId) }, [projectId, ensureBibliography])

  const currentBib = bib !== null && bib.projectId === projectId ? bib : null

  const removeEntry = (key: string): void => {
    if (!window.confirm(t('bib.confirmDelete'))) return
    setActionError(null)
    void deleteBibEntry(key).then((failure) => {
      setActionError(failure === null ? null : `${t('bib.deleteFailed')}：${failure.message}`)
    })
  }

  const openImport = (): void => {
    setImportOpen(true)
    setSelected([])
    setActionError(null)
    ensurePapers()
  }
  const togglePaper = (arxivId: string): void => {
    setSelected(prev => (prev.includes(arxivId) ? prev.filter(id => id !== arxivId) : [...prev, arxivId]))
  }
  const runImport = (): void => {
    if (importing || selected.length === 0) return
    setImporting(true)
    setActionError(null)
    void importPapersToBib(projectId, selected)
      .then((outcome) => {
        if ('code' in outcome) {
          setActionError(`${t('bib.importFailed')}：${outcome.message}`)
        } else {
          // The counts line rides the bib view's lastImport; just reset the picker.
          setSelected([])
        }
      })
      .finally(() => { setImporting(false) })
  }

  return (
    <div className={css.bibPanel}>
      <div className={css.bibHead}>
        <h3 className={css.sectionTitle}>{t('bib.title')}</h3>
        <div className={css.bibHeadActions}>
          {currentBib !== null && currentBib.status === 'ready' && (
            <span className={css.savePill} data-state={currentBib.saveState} role="status">
              {t(SAVE_KEYS[currentBib.saveState])}
            </span>
          )}
          <button type="button" className={css.btn} onClick={onClose}>
            {t('bib.close')}
          </button>
        </div>
      </div>
      {currentBib !== null && currentBib.saveState === 'conflict' && (
        <p className={css.conflictBanner} role="alert">
          {t('save.conflict')}
          <button type="button" className={css.retry} onClick={reloadBibliography}>
            {t('save.reload')}
          </button>
        </p>
      )}
      {actionError !== null && (
        <p className={css.failure} role="alert">{actionError}</p>
      )}
      {currentBib === null || currentBib.status === 'loading' ? (
        <p className={css.hint}>{t('bib.loading')}</p>
      ) : currentBib.status === 'error' ? (
        <p className={css.failure} role="alert">
          {t('error.bib')}：{failureCopy(t, currentBib.failure)}
          <button type="button" className={css.btn} onClick={reloadBibliography}>
            {t('error.retry')}
          </button>
        </p>
      ) : (
        <>
          {currentBib.entries.length === 0 ? (
            <p className={css.hint}>{t('bib.empty')}</p>
          ) : (
            <ul className={css.bibList}>
              {currentBib.entries.map(entry => (
                <li key={entry.key} className={css.bibRow}>
                  <div className={css.bibRowMain}>
                    <span className={css.bibKey}>{entry.key}</span>
                    <span className={css.bibType}>{entry.type}</span>
                    <span className={css.bibSummary} title={bibSummaryOf(entry)}>
                      {bibSummaryOf(entry)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={css.btn}
                    data-danger
                    disabled={currentBib.saveState === 'saving' || currentBib.saveState === 'conflict'}
                    onClick={() => { removeEntry(entry.key) }}
                  >
                    {t('bib.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {currentBib.lastImport !== null && (
            <p className={css.hint} role="status">
              {t('bib.importDone', {
                added: currentBib.lastImport.added.length,
                skipped: currentBib.lastImport.skipped.length,
              })}
            </p>
          )}
          {importOpen ? (
            <div className={css.bibImport}>
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
                <p className={css.hint}>{t('bib.noPapers')}</p>
              ) : (
                <div className={css.projectChecks}>
                  {papers.list.map(paper => (
                    <label key={paper.arxivId} className={css.projectCheck}>
                      <input
                        type="checkbox"
                        checked={selected.includes(paper.arxivId)}
                        onChange={() => { togglePaper(paper.arxivId) }}
                      />
                      <span className={css.bibCheckTitle}>{paper.title}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className={css.bibImportFoot}>
                <button
                  type="button"
                  className={css.btnPrimary}
                  disabled={importing || selected.length === 0}
                  onClick={runImport}
                >
                  {importing ? t('bib.importing') : `${t('bib.importSelected')} (${String(selected.length)})`}
                </button>
                <button
                  type="button"
                  className={css.btn}
                  disabled={importing}
                  onClick={() => { setImportOpen(false) }}
                >
                  {t('bib.importCancel')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button type="button" className={css.btn} onClick={openImport}>
                {t('bib.import')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
