/**
 * The ledger (growth record) view — the workbench's seventh tab: the
 * transparent record of the research process, rendered as an archive-style
 * timeline (time window × project scope, newest first) above the one-click
 * progress report (generated from the same window, shown as a printed sheet,
 * downloadable as Markdown). All reads flow through the controller's ledger
 * slice; this component owns only the window/scope selection and the
 * report's download/copy actions.
 * @module dsh-client-ui-mimir/client/LedgerView
 */

import { useEffect, useState } from 'react'
import type { EventRecord, ResearchEventFilter, ResearchProgressReportOptions } from 'dsh-mimir/types'
import type { ResearchFailureView, ResearchLedgerView, ResearchReportView } from './controller.ts'
import type { ResearchKey } from './locales.ts'
import type { ResearchT } from './view-common.ts'
import { renderMarkdown } from './MarkdownView.tsx'
import { ViewHead } from './ViewHead.tsx'
import {
  ACTOR_KEYS, LEDGER_LIST_LIMIT, LEDGER_WINDOWS,
  ledgerIsDestructive, ledgerPayloadLine, ledgerTimeParts, ledgerWindowFilter,
  reportFileName, reportWindowOptions, type LedgerWindow,
} from './ledger-view.ts'
import css from './ResearchPanel.module.css'

/** The ledger view's project scope. */
type LedgerScope = 'all' | 'project'

/** One timeline row: the microtext timestamp, the spine node, and the event. */
function LedgerRow({ event, t }: {
  readonly event: EventRecord
  readonly t: ResearchT
}) {
  const parts = ledgerTimeParts(event.ts, Date.now())
  const detail = ledgerPayloadLine(event)
  const destructive = ledgerIsDestructive(event)
  return (
    <li className={css.ledgerRow} data-destructive={destructive || undefined}>
      <span className={css.ledgerTime} title={event.ts}>
        {parts === null
          ? <span className={css.ledgerTimeDate}>{event.ts}</span>
          : (
            <>
              <span className={css.ledgerTimeDate}>{parts.date}</span>
              <span className={css.ledgerTimeClock}>{parts.time}</span>
            </>
          )}
      </span>
      <span className={css.ledgerNode} aria-hidden />
      <div className={css.ledgerBody}>
        <div className={css.ledgerLine}>
          <code className={css.ledgerAction}>{event.action}</code>
          {destructive && <span className={css.ledgerMark}>{t('ledger.destructive')}</span>}
          <span className={css.actorBadge}>
            {t(ACTOR_KEYS[event.actor.kind] as ResearchKey)}
            {event.actor.id !== '' ? ` · ${event.actor.id}` : ''}
          </span>
        </div>
        {detail !== '' && <p className={css.ledgerDetail}>{detail}</p>}
      </div>
    </li>
  )
}

/**
 * @param props - the ledger slice, the report slice, the project scope input,
 * the controller verbs, and copy.
 * @returns the ledger view.
 */
export function LedgerView({
  ledger, report, selectedProjectId, loadLedger, generateReport, t,
}: {
  readonly ledger: ResearchLedgerView
  readonly report: ResearchReportView
  readonly selectedProjectId: string | null
  readonly loadLedger: (filter: ResearchEventFilter) => void
  readonly generateReport: (options: ResearchProgressReportOptions) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  // Named ledgerWindow (not `window`): the global window (timers, clipboard)
  // must stay reachable inside this component.
  const [ledgerWindow, setWindow] = useState<LedgerWindow>('7d')
  const [scope, setScope] = useState<LedgerScope>('all')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  // The selected project id only feeds the filter while the project scope is
  // active; a scope switch or project change refetches the window.
  const scopedProjectId = scope === 'project' && selectedProjectId !== null ? selectedProjectId : null
  useEffect(() => {
    loadLedger(ledgerWindowFilter(ledgerWindow, scopedProjectId, Date.now()))
  }, [ledgerWindow, scopedProjectId, loadLedger])

  const refresh = (): void => {
    loadLedger(ledgerWindowFilter(ledgerWindow, scopedProjectId, Date.now()))
  }

  const onGenerate = async (): Promise<void> => {
    if (report.status === 'loading') return
    await generateReport(reportWindowOptions(ledgerWindow, scopedProjectId, Date.now()))
  }

  const onDownload = (): void => {
    if (report.status !== 'ready') return
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = reportFileName(report.generatedAt, Date.now())
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
  }

  const onCopy = async (): Promise<void> => {
    if (report.status !== 'ready') return
    try {
      await navigator.clipboard.writeText(report.markdown)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => { setCopyState('idle') }, 1600)
  }

  const generatedAt = report.generatedAt ?? new Date().toISOString()

  return (
    <div className={css.ledger}>
      <ViewHead title={t('tab.ledger')} subtitle={t('view.ledger.subtitle')}>
        <button
          type="button"
          className={css.btn}
          onClick={refresh}
          disabled={ledger.status === 'loading'}
        >
          {t('ledger.refresh')}
        </button>
      </ViewHead>

      {/* Window × scope controls: the report and the timeline share them. */}
      <div className={css.ledgerControls}>
        <span className={css.ledgerControlLabel}>{t('ledger.windowLabel')}</span>
        {LEDGER_WINDOWS.map(value => (
          <button
            key={value}
            type="button"
            className={css.tagPill}
            data-active={ledgerWindow === value || undefined}
            onClick={() => { setWindow(value) }}
          >
            {t(`ledger.window.${value}` as ResearchKey)}
          </button>
        ))}
        <span className={css.ledgerControlLabel}>{t('ledger.scopeLabel')}</span>
        <button
          type="button"
          className={css.tagPill}
          data-active={scope === 'all' || undefined}
          onClick={() => { setScope('all') }}
        >
          {t('ledger.scope.all')}
        </button>
        <button
          type="button"
          className={css.tagPill}
          data-active={scope === 'project' || undefined}
          disabled={selectedProjectId === null}
          title={selectedProjectId === null ? t('projects.empty') : undefined}
          onClick={() => { setScope('project') }}
        >
          {t('ledger.scope.project')}
        </button>
      </div>

      {/* The one-click progress report of the selected window. */}
      <section className={css.reportCard}>
        <div className={css.reportCardHead}>
          <h3 className={css.reportCardTitle}>{t('ledger.report.title')}</h3>
          <div className={css.viewActions}>
            <button
              type="button"
              className={css.btn}
              onClick={() => { void onCopy() }}
              disabled={report.status !== 'ready'}
            >
              {copyState === 'copied' ? t('ledger.report.copied') : t('ledger.report.copy')}
            </button>
            <button
              type="button"
              className={css.btn}
              onClick={onDownload}
              disabled={report.status !== 'ready'}
            >
              {t('ledger.report.download')}
            </button>
            <button
              type="button"
              className={css.btnPrimary}
              onClick={() => { void onGenerate() }}
              disabled={report.status === 'loading'}
            >
              {report.status === 'loading' ? t('ledger.report.generating') : t('ledger.report.generate')}
            </button>
          </div>
        </div>
        {report.status === 'error' && (
          <p className={css.failure} role="status">
            {report.failure?.message ?? t('ledger.report.failed')}
            <button type="button" className={css.retry} onClick={() => { void onGenerate() }}>
              {t('error.retry')}
            </button>
          </p>
        )}
        {report.status === 'ready' && (
          <div className={css.reportSheet}>
            <p className={css.reportMeta}>
              <span>{t('ledger.report.generatedAt')} {new Date(generatedAt).toLocaleString()}</span>
              <span>{report.eventCount} {t('ledger.report.events')}</span>
            </p>
            {renderMarkdown(report.markdown)}
          </div>
        )}
      </section>

      {/* The timeline of the selected window, newest first. */}
      <section className={css.timelineCard}>
        {(ledger.status === 'cold' || (ledger.status === 'loading' && ledger.list.length === 0)) && (
          <p className={css.hint}>{t('ledger.loading')}</p>
        )}
        {ledger.status === 'error' && (
          <p className={css.failure} role="status">
            {t('ledger.error')}
            <button type="button" className={css.retry} onClick={refresh}>
              {t('error.retry')}
            </button>
          </p>
        )}
        {ledger.status === 'ready' && ledger.list.length === 0 && (
          <p className={css.hint}>{t('ledger.empty')}</p>
        )}
        {ledger.status === 'ready' && ledger.list.length > 0 && (
          <>
            {ledger.list.length >= LEDGER_LIST_LIMIT && (
              <p className={css.ledgerCap}>{t('ledger.capped', { count: String(LEDGER_LIST_LIMIT) })}</p>
            )}
            <ol className={css.ledgerList}>
              {ledger.list.map(event => <LedgerRow key={event.id} event={event} t={t} />)}
            </ol>
          </>
        )}
      </section>
    </div>
  )
}
