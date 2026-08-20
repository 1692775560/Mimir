/**
 * The overview view: the selected project's card — title, the five-stage
 * pipeline progress (idea→plan→experiment→writing→done), review-round count,
 * paper directory, artifact list, and the last-updated timestamp — preceded
 * by the stat chips (papers/experiments/figures counts gathered from the
 * other views) and followed by the data section (wiki export/import).
 * @module dsh-client-ui-mimir/client/OverviewView
 */

import type { ResearchImportWikiMode, ResearchProjectView, ResearchWikiSnapshot } from 'dsh-mimir/types'
import type { ResearchKey } from './locales.ts'
import type { ResearchFailureView } from './controller.ts'
import { STAGE_KEYS, STAGES } from './view-common.ts'
import type { ResearchT } from './view-common.ts'
import { DataSection } from './DataSection.tsx'
import { EmptyState } from './EmptyState.tsx'
import { ViewHead } from './ViewHead.tsx'
import css from './ResearchPanel.module.css'

/** The overview's stat chips; null marks a view not yet loaded. */
export interface OverviewStats {
  readonly papers: number | null
  readonly experiments: number | null
  readonly figures: number | null
  readonly servers: number | null
}

/**
 * @param props - the selected project row (undefined before selection), the
 * stat-chip counts gathered from the other views, the wiki export/import
 * verbs, and copy.
 * @returns the overview card, or the no-selection hint.
 */
export function OverviewView({ project, stats, exportWiki, importWiki, t }: {
  readonly project: ResearchProjectView | undefined
  readonly stats: OverviewStats
  readonly exportWiki: () => Promise<ResearchWikiSnapshot | ResearchFailureView>
  readonly importWiki: (
    snapshot: unknown,
    mode: ResearchImportWikiMode,
    confirmReplace: boolean,
  ) => Promise<{ imported: Record<string, number>; skipped: Record<string, number> } | ResearchFailureView>
  readonly t: ResearchT
}) {
  if (project === undefined) {
    return <EmptyState glyph="🧭">{t('overview.noProject')}</EmptyState>
  }
  const stageIndex = STAGES.indexOf(project.stage)
  const chips: ReadonlyArray<{ key: ResearchKey; value: number | null }> = [
    { key: 'overview.statPapers', value: stats.papers },
    { key: 'overview.statExperiments', value: stats.experiments },
    { key: 'overview.statFigures', value: stats.figures },
    { key: 'overview.statServers', value: stats.servers },
  ]
  return (
    <div className={css.overviewWrap}>
      <ViewHead title={t('tab.overview')} subtitle={t('view.overview.subtitle')} />
      <div className={css.statChips}>
        {chips.map(chip => (
          <span key={chip.key} className={css.statChip}>
            <span className={css.statValue}>{chip.value === null ? '—' : chip.value}</span>
            <span className={css.statLabel}>{t(chip.key)}</span>
          </span>
        ))}
      </div>
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
      <DataSection exportWiki={exportWiki} importWiki={importWiki} t={t} />
    </div>
  )
}
