/**
 * The servers view's remote-jobs section: a submit form (server select,
 * command input, and an optional experiment link from the selected project's
 * loaded experiments) above the job table — status pill, command, linked
 * server, submit time, expandable stdout/stderr tails, delete. While any job
 * is queued/running the section polls the Host every
 * {@link JOB_POLL_INTERVAL_MS}; a terminal flip observed between polls
 * surfaces as a toast (controller-side).
 * @module dsh-client-ui-mimir/client/JobsSection
 */

import { useEffect, useState } from 'react'
import type { ExperimentRecord, JobRecord } from 'dsh-mimir/types'
import type {
  ResearchFailureView, ResearchJobsView, ResearchProjectSlice, ResearchServersView,
} from './controller.ts'
import { failureCopy, relativeTime, type ResearchT } from './view-common.ts'
import css from './ResearchPanel.module.css'

/** Poll cadence while any job is queued/running. */
const JOB_POLL_INTERVAL_MS = 2000

/** Whether one job still has a status flip coming (the polling condition). */
function isActive(job: JobRecord): boolean {
  return job.status === 'queued' || job.status === 'running'
}

/**
 * @param props - the jobs slice, the servers slice (submit options and row
 * names), the selected project's experiments slice (the link options), the
 * ensure/poll/submit/delete verbs, and copy.
 * @returns the submit form card plus the job table.
 */
export function JobsSection({
  jobs, servers, experiments, ensureJobs, refreshJobs, submitJob, deleteJob, t,
}: {
  readonly jobs: ResearchJobsView
  readonly servers: ResearchServersView
  readonly experiments: ResearchProjectSlice<readonly ExperimentRecord[]> | null
  readonly ensureJobs: () => void
  readonly refreshJobs: () => void
  readonly submitJob: (serverId: string, command: string, experimentId?: string) => Promise<ResearchFailureView | null>
  readonly deleteJob: (id: string) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  const [serverId, setServerId] = useState('')
  const [experimentId, setExperimentId] = useState('')
  const [command, setCommand] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [openOutput, setOpenOutput] = useState<Record<string, boolean>>({})

  useEffect(() => { ensureJobs() }, [ensureJobs])
  // Poll only while a status flip is still coming; a settled list is static.
  useEffect(() => {
    if (jobs.status !== 'ready' || !jobs.list.some(isActive)) return
    const timer = setInterval(refreshJobs, JOB_POLL_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [jobs, refreshJobs])

  const serverNameOf = (id: string): string =>
    servers.status === 'ready' ? servers.list.find(server => server.id === id)?.name ?? id : id
  const experimentNameOf = (id: string): string =>
    experiments !== null && experiments.status === 'ready'
      ? experiments.list.find(record => record.id === id)?.name ?? id
      : id
  // The form's server select defaults to the first listed server.
  const selectedServer = serverId !== '' ? serverId : servers.list[0]?.id ?? ''
  const experimentOptions = experiments !== null && experiments.status === 'ready' ? experiments.list : []

  const submit = (): void => {
    if (submitting || selectedServer === '' || command.trim() === '') return
    setSubmitting(true)
    setFormError(null)
    void submitJob(selectedServer, command.trim(), experimentId === '' ? undefined : experimentId)
      .then((failure) => {
        if (failure !== null) {
          setFormError(failure.message)
          return
        }
        setCommand('')
        setExperimentId('')
      })
      .finally(() => { setSubmitting(false) })
  }
  const removeJob = (record: JobRecord): void => {
    if (!window.confirm(t('jobs.confirmDelete'))) return
    void deleteJob(record.id).then((failure) => {
      setActionError(failure === null ? null : `${t('jobs.deleteFailed')}：${failure.message}`)
    })
  }

  return (
    <div className={css.jobsSection}>
      <h3 className={css.sectionTitle}>{t('jobs.title')}</h3>
      <div className={css.jobForm}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('jobs.server')}</span>
          <select
            className={css.serverSelect}
            value={selectedServer}
            aria-label={t('jobs.server')}
            onChange={(event) => { setServerId(event.target.value) }}
          >
            {servers.list.map(server => (
              <option key={server.id} value={server.id}>{server.name}</option>
            ))}
          </select>
        </label>
        <label className={css.field} data-wide>
          <span className={css.fieldLabel}>{t('jobs.command')}</span>
          <input
            className={css.input}
            value={command}
            placeholder={t('jobs.commandPlaceholder')}
            onChange={event => { setCommand(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </label>
        {experimentOptions.length > 0 && (
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('jobs.experiment')}</span>
            <select
              className={css.serverSelect}
              value={experimentId}
              aria-label={t('jobs.experiment')}
              onChange={(event) => { setExperimentId(event.target.value) }}
            >
              <option value="">{t('jobs.noExperiment')}</option>
              {experimentOptions.map(record => (
                <option key={record.id} value={record.id}>{record.name}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={css.btnPrimary}
          disabled={submitting || selectedServer === '' || command.trim() === ''}
          onClick={submit}
        >
          {submitting ? t('jobs.submitting') : t('jobs.submit')}
        </button>
      </div>
      {formError !== null && <p className={css.failure} role="alert">{formError}</p>}
      {actionError !== null && <p className={css.failure} role="alert">{actionError}</p>}
      {jobs.status === 'cold' || jobs.status === 'loading' ? (
        <p className={css.hint}>{t('jobs.loading')}</p>
      ) : jobs.status === 'error' ? (
        <p className={css.failure} role="alert">
          {t('error.jobs')}：{failureCopy(t, jobs.failure)}
          <button type="button" className={css.btn} onClick={refreshJobs}>
            {t('error.retry')}
          </button>
        </p>
      ) : jobs.list.length === 0 ? (
        <p className={css.hint}>{t('jobs.empty')}</p>
      ) : (
        <div className={css.experimentTableWrap}>
          <table className={css.experimentTable}>
            <thead>
              <tr>
                <th>{t('jobs.colCommand')}</th>
                <th>{t('jobs.colServer')}</th>
                <th>{t('jobs.colStatus')}</th>
                <th>{t('jobs.colCreated')}</th>
                <th>{t('experiments.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.list.map((record) => {
                const open = Boolean(openOutput[record.id])
                const hasOutput = record.stdoutTail !== '' || record.stderrTail !== ''
                return (
                  <tr key={record.id}>
                    <td>
                      <code className={css.jobCommand} title={record.command}>{record.command}</code>
                      {record.experimentId !== undefined && (
                        <span className={css.serverBadge}>🧪 {experimentNameOf(record.experimentId)}</span>
                      )}
                      {open && hasOutput && (
                        <div className={css.jobOutput}>
                          {record.stdoutTail !== '' && <pre>{record.stdoutTail}</pre>}
                          {record.stderrTail !== '' && <pre data-kind="stderr">{record.stderrTail}</pre>}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={css.serverBadge}>⚡ {serverNameOf(record.serverId)}</span>
                    </td>
                    <td>
                      <span className={css.jobStatus} data-status={record.status}>
                        {t(`jobStatus.${record.status}`)}
                      </span>
                      {record.exitCode !== null && record.exitCode !== 0 && (
                        <span className={css.jobExitCode}>{t('jobs.exitCode')} {record.exitCode}</span>
                      )}
                    </td>
                    <td>{relativeTime(t, record.createdAt)}</td>
                    <td>
                      {hasOutput && (
                        <button
                          type="button"
                          className={css.metricsToggle}
                          aria-expanded={open}
                          onClick={() => {
                            setOpenOutput(prev => ({ ...prev, [record.id]: !prev[record.id] }))
                          }}
                        >
                          {t('jobs.output')}
                        </button>
                      )}
                      <button
                        type="button"
                        className={css.btn}
                        data-danger
                        onClick={() => { removeJob(record) }}
                      >
                        {t('jobs.delete')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
