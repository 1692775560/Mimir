/**
 * The experiments view: the selected project's experiment-run table (status
 * pill, expandable metrics) above a minimal markdown rendering of the
 * whitelisted EXPERIMENT_LOG.md artifact. No markdown dependency: the log is
 * rendered line-wise (fences, headings, list items, bold spans).
 * @module dsh-client-ui-mimir/client/ExperimentsView
 */

import { useState, type ReactNode } from 'react'
import type { ExperimentRecord } from 'dsh-mimir/types'
import type { ResearchArtifactView, ResearchProjectSlice } from './controller.ts'
import { failureCopy, type ResearchT } from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import { ViewHead } from './ViewHead.tsx'
import css from './ResearchPanel.module.css'

/** Render `**bold**` spans inside one text line. */
function inlineBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>)
}

/** Render one markdown document line-wise: fences, headings, list items, paragraphs. */
function renderMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let inCode = false
  let codeLines: string[] = []
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        out.push(<pre key={index}>{codeLines.join('\n')}</pre>)
        codeLines = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }
    if (line.startsWith('### ')) out.push(<h4 key={index}>{inlineBold(line.slice(4))}</h4>)
    else if (line.startsWith('## ')) out.push(<h3 key={index}>{inlineBold(line.slice(3))}</h3>)
    else if (line.startsWith('# ')) out.push(<h2 key={index}>{inlineBold(line.slice(2))}</h2>)
    else if (line.startsWith('- ')) out.push(<li key={index}>{inlineBold(line.slice(2))}</li>)
    else if (line.trim() !== '') out.push(<p key={index}>{inlineBold(line)}</p>)
  }
  if (inCode && codeLines.length > 0) out.push(<pre key="trailing">{codeLines.join('\n')}</pre>)
  return out
}

/**
 * @param props - the experiments slice, the artifact view, the selected
 * project id, and copy.
 * @returns the experiment table plus the log viewer.
 */
export function ExperimentsView({ experiments, artifact, projectId, t }: {
  readonly experiments: ResearchProjectSlice<readonly ExperimentRecord[]> | null
  readonly artifact: ResearchArtifactView | null
  readonly projectId: string | null
  readonly t: ResearchT
}) {
  const [openMetrics, setOpenMetrics] = useState<Record<string, boolean>>({})
  return (
    <div className={css.experiments}>
      <ViewHead title={t('tab.experiments')} subtitle={t('view.experiments.subtitle')} />
      {experiments === null || experiments.status === 'loading' ? (
        <p className={css.hint}>{t('experiments.loading')}</p>
      ) : experiments.status === 'error' ? (
        <p className={css.failure} role="alert">
          {t('error.experiments')}：{failureCopy(t, experiments.failure)}
        </p>
      ) : experiments.list.length === 0 ? (
        <EmptyState glyph="🧪">{t('experiments.empty')}</EmptyState>
      ) : (
        <div className={css.experimentTableWrap}>
          <h3 className={css.sectionTitle}>{t('experiments.title')}</h3>
          <table className={css.experimentTable}>
            <thead>
              <tr>
                <th>{t('experiments.colName')}</th>
                <th>{t('experiments.colStatus')}</th>
                <th>{t('experiments.colMetrics')}</th>
                <th>{t('experiments.colUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {experiments.list.map((record) => {
                const entries = Object.entries(record.metrics)
                const open = Boolean(openMetrics[record.id])
                return (
                  <tr key={record.id}>
                    <td>{record.name}</td>
                    <td>
                      <span className={css.experimentStatus} data-status={record.status}>
                        {t(`experimentStatus.${record.status}`)}
                      </span>
                    </td>
                    <td>
                      {entries.length > 0 && (
                        <button
                          type="button"
                          className={css.metricsToggle}
                          onClick={() => {
                            setOpenMetrics(prev => ({ ...prev, [record.id]: !prev[record.id] }))
                          }}
                        >
                          {entries.length} {t('experiments.metrics')}
                        </button>
                      )}
                      {open && (
                        <dl className={css.metricsList}>
                          {entries.map(([key, value]) => (
                            <div key={key} className={css.metricsRow}>
                              <dt>{key}</dt>
                              <dd>{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                    <td>{record.updatedAt.slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {projectId === null || artifact === null || artifact.status === 'loading' ? (
        <p className={css.hint}>{t('experiments.loading')}</p>
      ) : artifact.status === 'error' ? (
        artifact.failure?.code === 'artifact-not-found' ? (
          <EmptyState glyph="🗒️">{t('experiments.noLog')}</EmptyState>
        ) : (
          <p className={css.failure} role="alert">
            {t('error.experiments')}：{failureCopy(t, artifact.failure)}
          </p>
        )
      ) : (
        <div className={css.experimentLog}>
          <h3 className={css.sectionTitle}>{t('experiments.log')}</h3>
          {renderMarkdown(artifact.content)}
        </div>
      )}
    </div>
  )
}
