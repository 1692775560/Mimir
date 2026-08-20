/**
 * The overview view: the selected project's card — title, the five-stage
 * pipeline progress (idea→plan→experiment→writing→done), review-round count,
 * paper directory, artifact list, and the last-updated timestamp.
 * @module dsh-client-ui-mimir/client/OverviewView
 */

import type { ResearchProjectView } from 'dsh-mimir/types'
import { STAGE_KEYS, STAGES } from './view-common.ts'
import type { ResearchT } from './view-common.ts'
import { EmptyState } from './EmptyState.tsx'
import css from './ResearchPanel.module.css'

/**
 * @param props - the selected project row (undefined before selection) and copy.
 * @returns the overview card, or the no-selection hint.
 */
export function OverviewView({ project, t }: {
  readonly project: ResearchProjectView | undefined
  readonly t: ResearchT
}) {
  if (project === undefined) {
    return <EmptyState glyph="🧭">{t('overview.noProject')}</EmptyState>
  }
  const stageIndex = STAGES.indexOf(project.stage)
  return (
    <div className={css.overviewWrap}>
      <div className={css.overviewCard}>
        <h2 className={css.overviewTitle}>{project.title}</h2>
        <ol className={css.stageBar} aria-label={t(STAGE_KEYS[project.stage])}>
          {STAGES.map((stage, index) => (
            <li
              key={stage}
              className={css.stageStep}
              data-reached={index <= stageIndex || undefined}
              data-current={index === stageIndex || undefined}
            >
              {t(STAGE_KEYS[stage])}
            </li>
          ))}
        </ol>
        <dl className={css.overviewMeta}>
          <div>
            <dt>{t('project.reviewRounds')}</dt>
            <dd>{project.reviewRounds}</dd>
          </div>
          <div>
            <dt>{t('overview.paperDir')}</dt>
            <dd><code>{project.paperDir ?? 'paper'}</code></dd>
          </div>
          <div>
            <dt>{t('overview.updatedAt')}</dt>
            <dd>{new Date(project.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
        <h3 className={css.sectionTitle}>{t('overview.artifacts')}</h3>
        {project.artifacts.length === 0
          ? <p className={css.hint}>{t('overview.noArtifacts')}</p>
          : (
            <ul className={css.artifactList}>
              {project.artifacts.map(artifact => <li key={artifact}><code>{artifact}</code></li>)}
            </ul>
          )}
      </div>
    </div>
  )
}
