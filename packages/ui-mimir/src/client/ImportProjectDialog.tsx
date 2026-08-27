/**
 * The "import existing project" dialog of the sidebar project list: a path
 * input (absolute or `~`-prefixed), an optional title input, and the copy
 * notice; a settled import shows the returned summary (title, workspace
 * directory, entry file, figure count, warnings), a rejected one the failure
 * message. Rendered through a portal to `document.body`: inside the workbench
 * tree a transformed/backdrop-filtered ancestor would become the containing
 * block of the fixed backdrop (same trap as the fullscreen PDF reader).
 * @module dsh-client-ui-mimir/client/ImportProjectDialog
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ResearchImportedProject } from 'dsh-mimir/types'
import type { ResearchFailureView } from './controller.ts'
import type { ResearchT } from './view-common.ts'
import css from './ResearchPanel.module.css'

/**
 * @param props - the import verb (refreshes the list and selects the new
 * project on success), the close callback, and copy.
 * @returns the modal dialog, portaled to the document body.
 */
export function ImportProjectDialog({ importProject, onClose, t }: {
  readonly importProject: (path: string, title?: string) => Promise<ResearchImportedProject | ResearchFailureView>
  readonly onClose: () => void
  readonly t: ResearchT
}) {
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ResearchFailureView | null>(null)
  const [summary, setSummary] = useState<ResearchImportedProject | null>(null)

  const close = (): void => {
    if (busy) return
    onClose()
  }

  const submit = (): void => {
    if (busy || path.trim() === '') return
    setBusy(true)
    setFailure(null)
    void importProject(path.trim(), title.trim() === '' ? undefined : title.trim())
      .then((outcome) => {
        if ('code' in outcome) setFailure(outcome)
        else setSummary(outcome)
      })
      .finally(() => { setBusy(false) })
  }

  return createPortal(
    <div
      className={css.importOverlay}
      // Backdrop click and Esc close the dialog; stopPropagation keeps the
      // workbench's own Esc-to-close from firing underneath it.
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        event.preventDefault()
        close()
      }}
    >
      <div className={css.importDialog} role="dialog" aria-modal="true" aria-label={t('import.title')}>
        <h3 className={css.importDialogTitle}>{t('import.title')}</h3>
        {summary === null ? (
          <form
            className={css.importForm}
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <p className={css.hint}>{t('import.hint')}</p>
            <label className={css.importField}>
              <span className={css.importLabel}>{t('import.pathLabel')}</span>
              <input
                className={css.input}
                value={path}
                placeholder={t('import.pathPlaceholder')}
                disabled={busy}
                autoFocus
                onChange={event => { setPath(event.target.value) }}
              />
            </label>
            <label className={css.importField}>
              <span className={css.importLabel}>{t('import.titleLabel')}</span>
              <input
                className={css.input}
                value={title}
                placeholder={t('import.titlePlaceholder')}
                disabled={busy}
                onChange={event => { setTitle(event.target.value) }}
              />
            </label>
            {failure !== null && (
              <p className={css.failure} role="alert">{t('import.failed')}：{failure.message}</p>
            )}
            <div className={css.importActions}>
              <button type="submit" className={css.btnPrimary} disabled={busy || path.trim() === ''}>
                {busy ? t('import.importing') : t('import.submit')}
              </button>
              <button type="button" className={css.btn} disabled={busy} onClick={close}>
                {t('import.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className={css.importSummary}>
            <p className={css.importSuccessLine}>{t('import.successTitle')}</p>
            <dl className={css.overviewMeta}>
              <div>
                <dt>{t('import.summaryTitle')}</dt>
                <dd>{summary.title}</dd>
              </div>
              <div>
                <dt>{t('import.paperDir')}</dt>
                <dd><code>{summary.paperDir}</code></dd>
              </div>
              <div>
                <dt>{t('import.entryTex')}</dt>
                <dd><code>{summary.entryTex}</code></dd>
              </div>
              <div>
                <dt>{t('import.figures')}</dt>
                <dd>{summary.figureCount}</dd>
              </div>
            </dl>
            {summary.warnings.length > 0 && (
              <>
                <h4 className={css.sectionTitle}>{t('import.warnings')}</h4>
                <ul className={css.importWarnings}>
                  {summary.warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
              </>
            )}
            <div className={css.importActions}>
              <button type="button" className={css.btnPrimary} autoFocus onClick={onClose}>
                {t('import.done')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
