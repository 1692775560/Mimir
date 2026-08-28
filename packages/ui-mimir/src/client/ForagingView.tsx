/**
 * The foraging (S4) card of the ledger view: the territory ledger — one
 * E0 row per declared project (events, clean-compile harvests, day gaps)
 * — the personal GUT baseline, and the GUT cards. The card's discipline
 * is two numbers and zero verbs: it reports "N days since the last
 * harvest · your median close interval is M days" and never says go or
 * stay (the foraging paradigm is map vocabulary and instruments, not an
 * optimization backbone — R6's verdict, enforced here as copy law).
 * Reads flow through the injected controller slice; the card owns nothing.
 * @module dsh-client-ui-mimir/client/ForagingView
 */

import type { ResearchForagingView } from 'dsh-mimir/types'
import type { ResearchForagingSlice } from './controller.ts'
import type { ResearchT } from './view-common.ts'
import css from './ResearchPanel.module.css'

/** Whole days, rounded for display (the wire carries r3 precision). */
function days(value: number): string {
  return String(Math.max(0, Math.round(value)))
}

/**
 * @param props - the foraging slice, the refresh verb, and copy.
 * @returns the foraging card (baseline line + territory rows + GUT cards).
 */
export function ForagingView({
  foraging, refreshForaging, t,
}: {
  readonly foraging: ResearchForagingSlice
  readonly refreshForaging: () => void
  readonly t: ResearchT
}) {
  const view: ResearchForagingView | null = foraging.view
  return (
    <section className={css.reportCard}>
      <div className={css.reportCardHead}>
        <h3 className={css.reportCardTitle}>{t('foraging.title')}</h3>
        <div className={css.viewActions}>
          <button
            type="button"
            className={css.btn}
            onClick={refreshForaging}
            disabled={foraging.status === 'loading'}
          >
            {t('foraging.refresh')}
          </button>
        </div>
      </div>
      {(foraging.status === 'cold' || foraging.status === 'loading') && (
        <p className={css.hint}>{t('foraging.loading')}</p>
      )}
      {foraging.status === 'error' && (
        <p className={css.failure} role="status">
          {foraging.failure?.message ?? t('foraging.failed')}
          <button type="button" className={css.retry} onClick={refreshForaging}>
            {t('error.retry')}
          </button>
        </p>
      )}
      {foraging.status === 'ready' && view !== null && (
        <>
          <p className={css.foragingBaseline}>
            {view.baseline.speaks && view.baseline.medianDays !== null && view.baseline.iqrDays !== null
              ? t('foraging.baseline.speaks', {
                median: days(view.baseline.medianDays),
                iqr: days(view.baseline.iqrDays),
                samples: String(view.baseline.samples),
              })
              : t('foraging.baseline.silent', {
                samples: String(view.baseline.samples),
                min: String(view.baseline.minSamples),
              })}
          </p>
          {view.territories.length === 0 && <p className={css.hint}>{t('foraging.empty')}</p>}
          <ul className={css.foragingList}>
            {view.territories.map(territory => {
              const card = view.cards.find(item => item.projectId === territory.projectId)
              return (
                <li key={territory.projectId} className={css.foragingRow}>
                  <span className={css.worktreeLaneLabel}>{territory.label}</span>
                  <span className={css.worktreeLaneMeta}>
                    <span>{t('foraging.territory.events', { count: String(territory.eventCount) })}</span>
                    <span>{t('foraging.territory.harvests', { count: String(territory.harvestCount) })}</span>
                  </span>
                  <span className={css.foragingGut}>
                    {card === undefined || card.daysSinceHarvest === null
                      ? territory.eventCount === 0
                        ? t('foraging.territory.quiet')
                        : t('foraging.territory.sinceActivity', { days: days(territory.daysSinceActivity) })
                      : t('foraging.territory.sinceHarvest', { days: days(card.daysSinceHarvest) })
                        + (card.baselineMedianDays === null
                          ? ''
                          : ` · ${t('foraging.territory.baseline', { median: days(card.baselineMedianDays) })}`)}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className={css.foragingNote}>{t('foraging.note')}</p>
        </>
      )}
    </section>
  )
}
