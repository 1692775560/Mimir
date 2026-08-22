/**
 * The figures view: a thumbnail grid of the selected project's paper figures,
 * served through the `/research/figure` route. Raster and SVG entries show an
 * inline thumbnail and open a lightbox on click; PDF figures show a badge
 * card that opens in a new tab. Hovering a card reveals its two file
 * operations — copy the LaTeX figure block, delete the file — and the view
 * head carries the upload button (POST `/research/figure-upload`) plus the
 * forced rescan. Cards show the wiki-recorded caption and a linked-experiment
 * badge when the `figure_save` tool registered metadata for the file. Image
 * files can also be dragged anywhere onto the view: a
 * dashed overlay shows while hovering, the drop reuses the upload channel,
 * and files outside the accept list are reported, not silently ignored.
 * @module dsh-client-ui-mimir/client/FiguresView
 */

import { useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import type { ExperimentRecord, FigureEntry } from 'dsh-mimir/types'
import type { ResearchFailureView, ResearchProjectSlice } from './controller.ts'
import {
  failureCopy, FIGURE_ACCEPT_EXTENSIONS, figureUrl, filterDropFiles, formatSize, type ResearchT,
} from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import { ViewHead } from './ViewHead.tsx'
import css from './ResearchPanel.module.css'

/** The LaTeX figure block one card's copy button puts on the clipboard. */
function latexOf(entry: FigureEntry): string {
  const label = entry.name.replace(/\.[^.]+$/, '')
  return `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${entry.relPath}}\n  \\caption{${entry.caption ?? ''}}\n  \\label{fig:${label}}\n\\end{figure}`
}

/** How long the copied confirmation replaces the copy button's label. */
const COPIED_FEEDBACK_MS = 1500

/**
 * @param props - the figures slice, the selected project and its paperDir,
 * the rescan/upload/delete verbs, and copy.
 * @returns the thumbnail grid plus the lightbox overlay.
 */
export function FiguresView({ figures, experiments, projectId, dir, loadFigures, uploadFigures, deleteFigure, t }: {
  readonly figures: ResearchProjectSlice<readonly FigureEntry[]> | null
  /** Experiment list of the same project, used to name linked-experiment badges. */
  readonly experiments: ResearchProjectSlice<readonly ExperimentRecord[]> | null
  readonly projectId: string | null
  readonly dir: string | undefined
  readonly loadFigures: (projectId: string, force?: boolean) => void
  readonly uploadFigures: (
    projectId: string,
    dir: string | undefined,
    files: readonly File[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>
  readonly deleteFigure: (projectId: string, relPath: string) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  const [preview, setPreview] = useState<FigureEntry | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // True while a file drag hovers the view (drives the dashed drop overlay).
  const [dragActive, setDragActive] = useState(false)
  // Enter/leave fire per child element; the depth counter keeps the overlay
  // from flickering as the pointer crosses cards.
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement | null>(null)
  if (projectId === null) {
    return <EmptyState glyph="🖼️">{t('figures.noProject')}</EmptyState>
  }
  const url = (entry: FigureEntry): string => figureUrl(projectId, entry.relPath, dir)
  /** Resolve one linked experiment id to its display name (id as fallback). */
  const experimentNameOf = (id: string): string => {
    if (experiments !== null && experiments.status === 'ready') {
      const found = experiments.list.find(record => record.id === id)
      if (found !== undefined) return found.name
    }
    return id
  }

  const copyLatex = (entry: FigureEntry): void => {
    void navigator.clipboard.writeText(latexOf(entry)).then(() => {
      setCopiedPath(entry.relPath)
      setTimeout(() => {
        setCopiedPath(current => (current === entry.relPath ? null : current))
      }, COPIED_FEEDBACK_MS)
    })
  }

  const removeFigure = (entry: FigureEntry): void => {
    if (!window.confirm(t('figures.confirmDelete'))) return
    void deleteFigure(projectId, entry.relPath).then((failure) => {
      setActionError(failure === null ? null : `${t('figures.deleteFailed')}：${failure.message}`)
    })
  }

  const pickFiles = (files: readonly File[]): void => {
    if (files.length === 0 || upload !== null) return
    setActionError(null)
    setUpload({ done: 0, total: files.length })
    void uploadFigures(projectId, dir, files, (done, total) => { setUpload({ done, total }) })
      .catch((error: unknown) => {
        setActionError(`${t('figures.uploadFailed')}：${error instanceof Error ? error.message : 'upload failed'}`)
      })
      .finally(() => { setUpload(null) })
  }

  const onDragEnter = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    // The host app runs its own page-level file-drop overlay; keep it off
    // while a file drag is over the figures view.
    event.stopPropagation()
    dragDepth.current += 1
    setDragActive(true)
  }
  const onDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    // preventDefault opts the view into being a drop target.
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (): void => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }
  const onDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDragActive(false)
    const { accepted, rejected } = filterDropFiles(
      [...event.dataTransfer.files],
      FIGURE_ACCEPT_EXTENSIONS,
    )
    pickFiles(accepted)
    // After pickFiles (which clears the banner): the rejection note wins.
    if (rejected.length > 0) {
      setActionError(`${t('figures.dropRejected')}：${rejected.map(file => file.name).join('、')}`)
    }
  }

  return (
    <div
      className={css.figures}
      data-drag-active={dragActive || undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragActive && (
        <div className={css.figuresDropOverlay} aria-hidden>
          <span>{t('figures.dropHint')}</span>
        </div>
      )}
      <ViewHead title={t('tab.figures')} subtitle={t('view.figures.subtitle')}>
        <button
          type="button"
          className={css.btnPrimary}
          disabled={upload !== null}
          onClick={() => { fileInput.current?.click() }}
        >
          {upload === null ? t('figures.upload') : `${t('figures.uploading')} ${upload.done}/${upload.total}`}
        </button>
        <button type="button" className={css.btn} onClick={() => { loadFigures(projectId, true) }}>
          {t('figures.refresh')}
        </button>
      </ViewHead>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FIGURE_ACCEPT_EXTENSIONS.join(',')}
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          pickFiles(files)
        }}
      />
      {actionError !== null && (
        <p className={css.failure} role="alert">{actionError}</p>
      )}
      {figures === null || figures.status === 'loading' ? (
        <p className={css.hint}>{t('figures.loading')}</p>
      ) : figures.status === 'error' ? (
        <p className={css.failure} role="alert">
          {t('error.figures')}：{failureCopy(t, figures.failure)}
          <button type="button" className={css.btn} onClick={() => { loadFigures(projectId, true) }}>
            {t('error.retry')}
          </button>
        </p>
      ) : figures.list.length === 0 ? (
        <EmptyState glyph="🖼️">{t('figures.empty')}</EmptyState>
      ) : (
        <div className={css.figuresGrid}>
          {figures.list.map((entry) => {
            const isPdf = entry.name.toLowerCase().endsWith('.pdf')
            return (
              <div key={entry.relPath} className={css.figureCard}>
                <button
                  type="button"
                  className={css.figurePreview}
                  title={isPdf ? t('figures.openPdf') : undefined}
                  onClick={() => {
                    if (isPdf) window.open(url(entry), '_blank')
                    else setPreview(entry)
                  }}
                >
                  {isPdf
                    ? <span className={css.figureBadge}>{t('figures.pdfBadge')}</span>
                    : <img className={css.figureThumb} src={url(entry)} alt={entry.name} loading="lazy" />}
                </button>
                <span className={css.figureName} title={entry.relPath}>{entry.name}</span>
                {entry.caption !== undefined && entry.caption !== '' && <span className={css.figureSize}>{entry.caption}</span>}
                {entry.experimentId !== undefined && <span className={css.figureBadge}>#{entry.experimentId}</span>}
                <span className={css.figureSize}>{formatSize(entry.sizeBytes)}</span>
                {entry.caption !== undefined && (
                  <span className={css.figureCaption} title={entry.caption}>{entry.caption}</span>
                )}
                {entry.experimentId !== undefined && (
                  <span className={css.figureExpBadge}>⚡ {experimentNameOf(entry.experimentId)}</span>
                )}
                <div className={css.figureActions}>
                  <button
                    type="button"
                    className={css.figureAction}
                    data-copied={copiedPath === entry.relPath || undefined}
                    onClick={() => { copyLatex(entry) }}
                  >
                    {copiedPath === entry.relPath ? t('figures.copied') : t('figures.copyLatex')}
                  </button>
                  <button
                    type="button"
                    className={css.figureAction}
                    data-danger
                    onClick={() => { removeFigure(entry) }}
                  >
                    {t('figures.delete')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {preview !== null && (
        <button
          type="button"
          className={css.figureLightbox}
          aria-label={t('figures.closePreview')}
          onClick={() => { setPreview(null) }}
        >
          <img src={url(preview)} alt={preview.name} />
        </button>
      )}
    </div>
  )
}
