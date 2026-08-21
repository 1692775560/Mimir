/**
 * The bibliography panel: the selected project's `references.bib` as an
 * entry list (citation key, type badge, one-line summary, delete), a
 * field-level inline editor (common fields form-ized, the rest as raw
 * name/value rows; the citation key and entry type are editable too), the
 * autosave-style status pill and conflict banner for entry edits/deletes, and
 * a collapsible import picker that appends checked library papers through
 * `importPapersToBib`. The panel replaces the paper view's PDF preview while
 * open; the file stays the agent's — the panel only reads and rewrites it
 * under optimistic concurrency.
 * @module dsh-client-ui-mimir/client/BibPanel
 */

import { useEffect, useState } from 'react'
import type { BibEntry } from 'dsh-mimir/types'
import type {
  ResearchBibView, ResearchFailureView, ResearchImportCounts, ResearchPapersView,
} from './controller.ts'
import {
  bibDraftFromEntry, bibEntryFromDraft, bibSummaryOf, COMMON_BIB_FIELDS, failureCopy,
  SAVE_KEYS, type BibEntryDraft, type ResearchT,
} from './view-common.ts'
import css from './ResearchPanel.module.css'

/**
 * One entry's field editor: the citation key and entry type, the common
 * fields as labeled inputs, and every other field as a raw name/value row
 * (removable, with an add-row button). Save assembles the draft through
 * {@link bibEntryFromDraft} and hands it to the controller's optimistic
 * commit; a rejection keeps the editor open with the failure surfaced.
 */
function BibEntryEditor({ entry, busy, onSave, onCancel, t }: {
  readonly entry: BibEntry
  readonly busy: boolean
  readonly onSave: (next: BibEntry) => void
  readonly onCancel: () => void
  readonly t: ResearchT
}) {
  const [draft, setDraft] = useState<BibEntryDraft>(() => bibDraftFromEntry(entry))
  const [invalid, setInvalid] = useState(false)

  const setCommon = (name: string, value: string): void => {
    setDraft(prev => ({ ...prev, common: { ...prev.common, [name]: value } }))
  }
  const setExtra = (index: number, part: Partial<{ name: string; value: string }>): void => {
    setDraft(prev => ({
      ...prev,
      extra: prev.extra.map((row, at) => (at === index ? { ...row, ...part } : row)),
    }))
  }

  const save = (): void => {
    const next = bibEntryFromDraft(draft)
    if (next === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSave(next)
  }

  return (
    <div className={css.bibEditor}>
      <div className={css.bibEditGrid}>
        <label className={css.bibField}>
          <span className={css.bibFieldLabel}>{t('bib.fieldKey')}</span>
          <input
            className={css.input}
            value={draft.key}
            disabled={busy}
            onChange={event => { setDraft(prev => ({ ...prev, key: event.target.value })) }}
          />
        </label>
        <label className={css.bibField}>
          <span className={css.bibFieldLabel}>{t('bib.fieldType')}</span>
          <input
            className={css.input}
            value={draft.type}
            disabled={busy}
            onChange={event => { setDraft(prev => ({ ...prev, type: event.target.value })) }}
          />
        </label>
      </div>
      <span className={css.bibFieldGroup}>{t('bib.commonFields')}</span>
      <div className={css.bibEditGrid}>
        {COMMON_BIB_FIELDS.map(name => (
          <label key={name} className={css.bibField}>
            <span className={css.bibFieldLabel}>{name}</span>
            <input
              className={css.input}
              value={draft.common[name] ?? ''}
              disabled={busy}
              onChange={event => { setCommon(name, event.target.value) }}
            />
          </label>
        ))}
      </div>
      <span className={css.bibFieldGroup}>{t('bib.otherFields')}</span>
      {draft.extra.map((row, index) => (
        <div key={index} className={css.bibExtraRow}>
          <input
            className={css.input}
            value={row.name}
            placeholder={t('bib.fieldNamePlaceholder')}
            disabled={busy}
            aria-label={t('bib.fieldNamePlaceholder')}
            onChange={event => { setExtra(index, { name: event.target.value }) }}
          />
          <input
            className={css.input}
            value={row.value}
            disabled={busy}
            aria-label={row.name === '' ? t('bib.otherFields') : row.name}
            onChange={event => { setExtra(index, { value: event.target.value }) }}
          />
          <button
            type="button"
            className={css.btn}
            data-danger
            disabled={busy}
            onClick={() => { setDraft(prev => ({ ...prev, extra: prev.extra.filter((_, at) => at !== index) })) }}
          >
            {t('bib.removeField')}
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className={css.btn}
          disabled={busy}
          onClick={() => { setDraft(prev => ({ ...prev, extra: [...prev.extra, { name: '', value: '' }] })) }}
        >
          {t('bib.addField')}
        </button>
      </div>
      {invalid && (
        <p className={css.failure} role="alert">{t('bib.keyRequired')}</p>
      )}
      <div className={css.bibEditFoot}>
        <button type="button" className={css.btnPrimary} disabled={busy} onClick={save}>
          {busy ? t('bib.saving') : t('bib.save')}
        </button>
        <button type="button" className={css.btn} disabled={busy} onClick={onCancel}>
          {t('bib.cancelEdit')}
        </button>
      </div>
    </div>
  )
}

/**
 * @param props - the bib slice, the literature list (the import picker), the
 * selected project, the inject verbs, the close callback, and copy.
 * @returns the bibliography editor.
 */
export function BibPanel({
  bib, papers, projectId, ensureBibliography, reloadBibliography,
  deleteBibEntry, updateBibEntry, importPapersToBib, ensurePapers, onClose, t,
}: {
  readonly bib: ResearchBibView | null
  readonly papers: ResearchPapersView
  readonly projectId: string
  readonly ensureBibliography: (projectId: string) => void
  readonly reloadBibliography: () => void
  readonly deleteBibEntry: (key: string) => Promise<ResearchFailureView | null>
  readonly updateBibEntry: (originalKey: string, entry: BibEntry) => Promise<ResearchFailureView | null>
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
  // The entry key whose field editor is open; null when none.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load on open and on every project switch while open; a switch also drops
  // the open editor (its draft belongs to the previous project's file).
  useEffect(() => {
    setEditingKey(null)
    ensureBibliography(projectId)
  }, [projectId, ensureBibliography])

  const currentBib = bib !== null && bib.projectId === projectId ? bib : null
  const bibBusy = currentBib === null || currentBib.saveState === 'saving' || currentBib.saveState === 'conflict'

  const removeEntry = (key: string): void => {
    if (!window.confirm(t('bib.confirmDelete'))) return
    setActionError(null)
    void deleteBibEntry(key).then((failure) => {
      if (failure === null && editingKey === key) setEditingKey(null)
      setActionError(failure === null ? null : `${t('bib.deleteFailed')}：${failure.message}`)
    })
  }

  const saveEntry = (originalKey: string, entry: BibEntry): void => {
    if (saving) return
    setSaving(true)
    setActionError(null)
    void updateBibEntry(originalKey, entry)
      .then((failure) => {
        if (failure === null) {
          setEditingKey(null)
        } else {
          setActionError(`${t('bib.saveFailed')}：${failure.message}`)
        }
      })
      .finally(() => { setSaving(false) })
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
                <li key={entry.key} className={css.bibItem}>
                  <div className={css.bibRow}>
                    <div className={css.bibRowMain}>
                      <span className={css.bibKey}>{entry.key}</span>
                      <span className={css.bibType}>{entry.type}</span>
                      <span className={css.bibSummary} title={bibSummaryOf(entry)}>
                        {bibSummaryOf(entry)}
                      </span>
                    </div>
                    {editingKey !== entry.key && (
                      <button
                        type="button"
                        className={css.btn}
                        disabled={bibBusy}
                        onClick={() => {
                          setActionError(null)
                          setEditingKey(entry.key)
                        }}
                      >
                        {t('bib.edit')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={css.btn}
                      data-danger
                      disabled={bibBusy}
                      onClick={() => { removeEntry(entry.key) }}
                    >
                      {t('bib.delete')}
                    </button>
                  </div>
                  {editingKey === entry.key && (
                    <BibEntryEditor
                      entry={entry}
                      busy={saving || bibBusy}
                      onSave={(next) => { saveEntry(entry.key, next) }}
                      onCancel={() => { setEditingKey(null) }}
                      t={t}
                    />
                  )}
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
