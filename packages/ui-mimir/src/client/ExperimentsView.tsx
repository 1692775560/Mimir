/**
 * The experiments view: the selected project's experiment-run table (status
 * pill, expandable metrics, the linked-server badge with an inline relink
 * dropdown, delete action) topped by a metric-comparison section — one
 * hand-drawn inline SVG bar chart per numeric metric key shared by at least
 * two runs — above a minimal markdown rendering of the whitelisted
 * EXPERIMENT_LOG.md artifact. No markdown dependency: the log is rendered
 * line-wise (fences, headings, list items, bold spans).
 * @module dsh-client-ui-mimir/client/ExperimentsView
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { ExperimentRecord } from 'dsh-mimir/types'
import type {
  ResearchArtifactView, ResearchFailureView, ResearchProjectSlice, ResearchServersView,
} from './controller.ts'
import {
  barWidthPercents,
  failureCopy,
  formatMetricValue,
  metricChartRows,
  numericMetricKeys,
  type MetricChartRow,
  type ResearchT,
} from './view-common.ts'
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

/** Bar-chart geometry: bars span x 110–270 of the 320-wide viewBox. */
const CHART_WIDTH = 320
const CHART_BAR_X = 110
const CHART_BAR_MAX_WIDTH = 160
const CHART_ROW_HEIGHT = 26
/** Run names are ellipsized past this many characters to fit the label lane. */
const CHART_NAME_MAX = 14

/**
 * One metric's comparison chart: one horizontal bar per run carrying a finite
 * number for the key, oldest run on top, width normalized to the largest
 * value. Pure inline SVG — no charting dependency.
 */
function MetricChart({ metricKey, rows }: {
  readonly metricKey: string
  readonly rows: readonly MetricChartRow[]
}) {
  const widths = barWidthPercents(rows.map(row => row.value))
  const height = rows.length * CHART_ROW_HEIGHT + 4
  return (
    <div className={css.metricChart}>
      <h4 title={metricKey}>{metricKey}</h4>
      <svg
        className={css.metricChartSvg}
        viewBox={`0 0 ${String(CHART_WIDTH)} ${String(height)}`}
        role="img"
        aria-label={metricKey}
      >
        {rows.map((row, index) => {
          const y = 2 + index * CHART_ROW_HEIGHT
          const name = row.name.length > CHART_NAME_MAX ? `${row.name.slice(0, CHART_NAME_MAX - 1)}…` : row.name
          return (
            <g key={row.id}>
              <text className={css.metricName} x={0} y={y + 15}>
                <title>{row.name}</title>
                {name}
              </text>
              <rect
                className={css.metricBar}
                data-status={row.status}
                x={CHART_BAR_X}
                y={y + 4}
                width={(widths[index] ?? 0) / 100 * CHART_BAR_MAX_WIDTH}
                height={14}
                rx={4}
              />
              <text className={css.metricValue} x={CHART_BAR_X + CHART_BAR_MAX_WIDTH + 6} y={y + 15}>
                {formatMetricValue(row.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * @param props - the experiments slice, the artifact view, the servers slice
 * (the relink dropdown's options), the selected project id, the verbs, and
 * copy.
 * @returns the metric charts, the experiment table, and the log viewer.
 */
export function ExperimentsView({
  experiments, artifact, servers, projectId, ensureServers, deleteExperiment, updateExperiment, t,
}: {
  readonly experiments: ResearchProjectSlice<readonly ExperimentRecord[]> | null
  readonly artifact: ResearchArtifactView | null
  readonly servers: ResearchServersView
  readonly projectId: string | null
  readonly ensureServers: () => void
  readonly deleteExperiment: (id: string) => Promise<ResearchFailureView | null>
  readonly updateExperiment: (id: string, serverId: string | null) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  const [openMetrics, setOpenMetrics] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  // The relink dropdown needs the server list; load it once per view mount.
  useEffect(() => { ensureServers() }, [ensureServers])
  const removeExperiment = (record: ExperimentRecord): void => {
    if (!window.confirm(t('experiments.confirmDelete'))) return
    void deleteExperiment(record.id).then((failure) => {
      setActionError(failure === null ? null : `${t('experiments.deleteFailed')}：${failure.message}`)
    })
  }
  const relink = (id: string, serverId: string | null): void => {
    void updateExperiment(id, serverId).then((failure) => {
      setActionError(failure === null ? null : `${t('experiments.linkFailed')}：${failure.message}`)
    })
  }
  /** Display name of one linked server; unknown ids show raw. */
  const serverNameOf = (id: string): string =>
    servers.status === 'ready' ? servers.list.find(server => server.id === id)?.name ?? id : id
  const chartKeys = experiments !== null && experiments.status === 'ready'
    ? numericMetricKeys(experiments.list)
    : []
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
        <>
          {chartKeys.length > 0 && (
            <div className={css.metricCharts}>
              <h3 className={css.sectionTitle}>{t('experiments.compare')}</h3>
              <div className={css.metricChartGrid}>
                {chartKeys.map(key => (
                  <MetricChart key={key} metricKey={key} rows={metricChartRows(experiments.list, key)} />
                ))}
              </div>
            </div>
          )}
          {actionError !== null && <p className={css.failure} role="alert">{actionError}</p>}
          <div className={css.experimentTableWrap}>
            <h3 className={css.sectionTitle}>{t('experiments.title')}</h3>
            <table className={css.experimentTable}>
              <thead>
                <tr>
                  <th>{t('experiments.colName')}</th>
                  <th>{t('experiments.colStatus')}</th>
                  <th>{t('experiments.colMetrics')}</th>
                  <th>{t('experiments.colServer')}</th>
                  <th>{t('experiments.colUpdated')}</th>
                  <th>{t('experiments.colActions')}</th>
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
                                <dd>{formatMetricValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                      <td>
                        {record.serverId !== undefined && (
                          <span className={css.serverBadge}>⚡ {serverNameOf(record.serverId)}</span>
                        )}
                        <select
                          className={css.serverSelect}
                          value={record.serverId ?? ''}
                          aria-label={t('experiments.linkServer')}
                          onChange={(event) => {
                            relink(record.id, event.target.value === '' ? null : event.target.value)
                          }}
                        >
                          <option value="">{t('experiments.noServer')}</option>
                          {servers.status === 'ready' && servers.list.map(server => (
                            <option key={server.id} value={server.id}>{server.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>{record.updatedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>
                        <button
                          type="button"
                          className={css.btn}
                          data-danger
                          onClick={() => { removeExperiment(record) }}
                        >
                          {t('experiments.delete')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
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
