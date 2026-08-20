/**
 * The figures view: a thumbnail grid of the selected project's paper figures,
 * served through the `/research/figure` route. Raster and SVG entries show an
 * inline thumbnail and open a lightbox on click; PDF figures show a badge
 * card that opens in a new tab. The refresh button forces a rescan.
 * @module dsh-client-ui-mimir/client/FiguresView
 */

import { useState } from 'react'
import type { FigureEntry } from 'dsh-mimir/types'
import type { ResearchProjectSlice } from './controller.ts'
import { failureCopy, figureUrl, formatSize, type ResearchT } from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import css from './ResearchPanel.module.css'

/**
 * @param props - the figures slice, the selected project and its paperDir,
 * the rescan verb, and copy.
 * @returns the thumbnail grid plus the lightbox overlay.
 */
export function FiguresView({ figures, projectId, dir, loadFigures, t }: {
  readonly figures: ResearchProjectSlice<readonly FigureEntry[]> | null
  readonly projectId: string | null
  readonly dir: string | undefined
  readonly loadFigures: (projectId: string, force?: boolean) => void
  readonly t: ResearchT
}) {
  const [preview, setPreview] = useState<FigureEntry | null>(null)
  if (projectId === null) {
    return <EmptyState glyph="🖼️">{t('figures.noProject')}</EmptyState>
  }
  const url = (entry: FigureEntry): string => figureUrl(projectId, entry.relPath, dir)
  return (
    <div className={css.figures}>
      <div className={css.figuresToolbar}>
        <button type="button" className={css.retry} onClick={() => { loadFigures(projectId, true) }}>
          {t('figures.refresh')}
        </button>
      </div>
      {figures === null || figures.status === 'loading' ? (
        <p className={css.hint}>{t('figures.loading')}</p>
      ) : figures.status === 'error' ? (
        <p className={css.failure} role="alert">
          {t('error.figures')}：{failureCopy(t, figures.failure)}
          <button type="button" className={css.retry} onClick={() => { loadFigures(projectId, true) }}>
            {t('error.retry')}
          </button>
        </p>
      ) : figures.list.length === 0 ? (
        <EmptyState glyph="🖼️">{t('figures.empty')}</EmptyState>
      ) : (
        <div className={css.figuresGrid}>
          {figures.list.map((entry) => {
            if (entry.name.toLowerCase().endsWith('.pdf')) {
              return (
                <button
                  key={entry.relPath}
                  type="button"
                  className={css.figureCard}
                  data-kind="pdf"
                  title={t('figures.openPdf')}
                  onClick={() => { window.open(url(entry), '_blank') }}
                >
                  <span className={css.figureBadge}>{t('figures.pdfBadge')}</span>
                  <span className={css.figureName}>{entry.name}</span>
                  <span className={css.figureSize}>{formatSize(entry.sizeBytes)}</span>
                </button>
              )
            }
            return (
              <button
                key={entry.relPath}
                type="button"
                className={css.figureCard}
                onClick={() => { setPreview(entry) }}
              >
                <img className={css.figureThumb} src={url(entry)} alt={entry.name} loading="lazy" />
                <span className={css.figureName}>{entry.name}</span>
                <span className={css.figureSize}>{formatSize(entry.sizeBytes)}</span>
              </button>
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
