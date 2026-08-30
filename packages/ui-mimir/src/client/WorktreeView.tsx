/**
 * The worktree (S2) card of the ledger view: the research process rendered
 * as a git-like working tree — lanes (branches) grouped mainline-first,
 * then open, then merged (✓), then dead ends (✗, each with its documented
 * No: the reason and the days since the lane's last touch at close). The
 * three structural writes are the user's own declarations (the mainline ref
 * move, the derivation edge, the close); the system never infers or ranks.
 * All reads and writes flow through the injected controller verbs; this
 * component owns only the close-reason draft and the per-lane busy state.
 * @module dsh-client-ui-mimir/client/WorktreeView
 */

import { useState } from 'react'
import type { ResearchWorktreeLaneView, ResearchWorktreeView } from 'dsh-mimir/types'
import type { ResearchWorktreeSlice, ResearchFailureView } from './controller.ts'
import type { ResearchKey } from './locales.ts'
import type { ResearchT } from './view-common.ts'
import { closeReasonState, isIdeaLane, worktreeHighlights, WORKTREE_REASON_MAX_CHARS } from './worktree-view.ts'
import { beadRadius, layoutWorktreeFlow } from './worktree-map.ts'
import type { WorktreeFlowBead, WorktreeFlowLayout } from './worktree-map.ts'
import css from './ResearchPanel.module.css'

/** Whole days, rounded for display (the wire carries r3 precision). */
function days(value: number): string {
  return String(Math.max(0, Math.round(value)))
}

/**
 * The branch flow — the git-workflow illustration form in a clay skin:
 * time flows left→right on a compressed scale, the mainline lane rides the
 * axis, every other research line bows out as a fat colored curve and
 * either merges back (adopted), stops at its documented No (failed), or
 * runs to the now-line (open). Every work node is a bead ON its curve —
 * terminal outcomes largest, eureka creations next, weighted work mid,
 * zero-weight touches smallest. NO TEXT renders inside the SVG: status
 * speaks through shape and color (dashed gray tail = dead end, double
 * stroke = merge); names, dates, and magnitudes live in the lane list and
 * the tooltips.
 * @param props - the worktree view model and copy.
 * @returns the flow SVG block (or nothing before any lane exists).
 */
/** The localized label of one ledger action (raw name when unmapped). */
function actionText(action: string, t: ResearchT): string {
  const key = `action.${action}` as Parameters<ResearchT>[0]
  try {
    const text = t(key)
    if (typeof text === 'string' && text !== key) return text
  } catch {
    // unmapped action: the raw name is the honest fallback
  }
  return action
}

function WorktreeFlowStrip({ view, flow, t }: {
  readonly view: ResearchWorktreeView
  readonly flow: WorktreeFlowLayout
  readonly t: ResearchT
}) {
  const [hovered, setHovered] = useState<WorktreeFlowBead | null>(null)
  if (flow.lanes.length === 0) return null
  const labelOf = (lineId: string): string =>
    view.lanes.find(lane => lane.lineId === lineId)?.label ?? lineId
  return (
    <div className={css.worktreeFlowBox} role="img" aria-label={t('worktree.graph')}>
      <svg viewBox={`0 0 ${String(flow.width)} ${String(flow.height)}`} preserveAspectRatio="xMidYMin meet">
        {flow.epochs.map(epoch => (
          <line
            key={`epoch-${epoch.label}-${epoch.at}`}
            x1={epoch.x} x2={epoch.x} y1={0} y2={flow.height}
            className={css.worktreeFlowEpoch}
          >
            <title>{`${epoch.label} · ${epoch.at.slice(0, 10)}`}</title>
          </line>
        ))}
        {flow.lanes.map(entry => (
          <path
            key={`lane-${entry.lane.lineId}`}
            d={entry.path}
            fill="none"
            strokeLinecap="round"
            className={
              entry.lane.status === 'failed' ? css.worktreeFlowDead
                : entry.lane.status === 'adopted' ? css.worktreeFlowAdopted
                  : entry.isMain ? css.worktreeFlowMain
                    : css.worktreeFlowCurve
            }
            stroke="#E5E5EA"
          >
            <title>{`${entry.lane.label} · ${entry.lane.firstSeen.slice(0, 10)} → ${(entry.lane.closedAt ?? entry.lane.lastSeen).slice(0, 10)}`}</title>
          </path>
        ))}
        {flow.beads.map(bead => {
          const key = `bead-${bead.lineId}-${bead.at}-${String(bead.count)}`
          return (
            <circle
              key={key}
              cx={bead.x} cy={bead.y} r={beadRadius(bead.kind, bead.count)}
              className={
                bead.kind === 'terminal' ? css.worktreeFlowBeadTerminal
                  : bead.kind === 'meta' ? css.worktreeFlowBeadMeta
                    : css.worktreeFlowBead
              }
              fill={bead.color}
              onMouseEnter={() => { setHovered(bead) }}
              onMouseLeave={() => { setHovered(null) }}
            >
              <title>{`${labelOf(bead.lineId)} · ${actionText(bead.action, t)}${bead.count > 1 ? ` × ${String(bead.count)}` : ''} · ${bead.at.slice(0, 16).replace('T', ' ')}`}</title>
            </circle>
          )
        })}
        <line
          x1={flow.nowX} x2={flow.nowX} y1={0} y2={flow.height}
          className={css.worktreeFlowNow}
        >
          <title>{view.derivedAt.slice(0, 16).replace('T', ' ')}</title>
        </line>
      </svg>
        {hovered !== null && (
          <div
            className={css.worktreeFlowTip}
            style={{
              left: `${String((hovered.x / flow.width) * 100)}%`,
              top: `${String((hovered.y / flow.height) * 100)}%`,
            }}
          >
            <span className={css.worktreeFlowTipLane}>{labelOf(hovered.lineId)}</span>
            <span className={css.worktreeFlowTipMeta}>
              {actionText(hovered.action, t)}{hovered.count > 1 ? ` × ${String(hovered.count)}` : ''}
            </span>
            <span className={css.worktreeFlowTipMeta}>
              {hovered.at.slice(0, 16).replace('T', ' ')}
            </span>
          </div>
        )}
      <p className={css.worktreeFlowNote}>
        {t('worktree.graph.note')}
        {flow.momentCount > flow.cols
          ? ` · ${t('worktree.graph.compressed', { moments: String(flow.momentCount), rows: String(flow.cols) })}`
          : ''}
      </p>
    </div>
  )
}

/**
 * The highlight strip: the trajectory's memorable beats, phrased as sentences
 * rather than counters. These are the moments worth keeping until a bigger
 * Eureka arrives — described, never ranked or advised on.
 */
function WorktreeHighlights({ view, t }: {
  readonly view: ResearchWorktreeView
  readonly t: ResearchT
}) {
  const highlights = worktreeHighlights(view)
  if (highlights.length === 0) return null
  return (
    <div className={css.worktreeHighlights}>
      <h4 className={css.worktreeHighlightsTitle}>{t('worktree.highlights')}</h4>
      <ul className={css.worktreeHighlightList}>
        {highlights.map(item => (
          <li key={item.kind} className={css.worktreeHighlight} data-kind={item.kind}>
            {t(`worktree.highlight.${item.kind}` as Parameters<ResearchT>[0], {
              value: item.value,
              detail: item.detail,
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One lane row: the glyph, the label, the E0 numbers, and the declared structure. */
function LaneRow({
  lane, isMain, ideaLanes, busy, color, onSetMainline, onSetParent, onAdopt, onClose, t,
}: {
  readonly lane: ResearchWorktreeLaneView
  readonly isMain: boolean
  readonly ideaLanes: readonly ResearchWorktreeLaneView[]
  readonly busy: boolean
  /** The lane's own hue — the same colour its curve's beads wear. */
  readonly color: string
  readonly onSetMainline: (lineId: string) => Promise<ResearchFailureView | null>
  readonly onSetParent: (ideaId: string, parentIdeaId: string | null) => Promise<ResearchFailureView | null>
  readonly onAdopt: (ideaId: string) => Promise<ResearchFailureView | null>
  readonly onClose: (ideaId: string, reason: string) => Promise<ResearchFailureView | null>
  readonly t: ResearchT
}) {
  const [reason, setReason] = useState('')
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonState = closeReasonState(reason)
  const closeable = isIdeaLane(lane.lineId) && lane.status === 'open' && !isMain
  const mergeable = isIdeaLane(lane.lineId) && lane.status === 'open'

  const onParentChange = async (value: string): Promise<void> => {
    if (busy) return
    const failure = await onSetParent(lane.lineId, value === '' ? null : value)
    if (failure !== null) setError(failure.message)
  }

  const onConfirmClose = async (): Promise<void> => {
    if (reasonState !== 'ok') return
    const failure = await onClose(lane.lineId, reason)
    if (failure !== null) {
      setError(failure.message)
      return
    }
    setClosing(false)
    setReason('')
    setError(null)
  }

  return (
    <li className={css.worktreeLane} data-status={lane.status} data-main={isMain || undefined}>
      <span className={css.worktreeLanePill} style={{ backgroundColor: color }} aria-hidden>
        {lane.status === 'failed' ? '✗' : lane.status === 'adopted' ? '✓' : '●'}
      </span>
      <div className={css.worktreeLaneBody}>
        <div className={css.worktreeLaneHead}>
          <span className={css.worktreeLaneLabel}>{lane.label}</span>
          {isMain && <span className={css.worktreeMainBadge}>{t('worktree.mainline')}</span>}
        </div>
        <div className={css.worktreeLaneMeta}>
          <span title={`${lane.firstSeen} → ${lane.lastSeen}`}>
            {new Date(lane.lastSeen).toLocaleDateString()}
          </span>
          <span>{t('worktree.lane.events', { count: String(lane.eventCount) })}</span>
          <span>{t('worktree.lane.drift', { value: String(lane.drift) })}</span>
          {lane.status === 'open' && lane.idleDays !== null && (
            <span>{t('worktree.idle', { days: days(lane.idleDays) })}</span>
          )}
          {lane.status === 'failed' && lane.gutDays !== null && (
            <span>{t('worktree.gut', { days: days(lane.gutDays) })}</span>
          )}
        </div>
        {lane.status === 'failed' && lane.closeReason !== null && (
          <p className={css.worktreeReason}>{lane.closeReason}</p>
        )}
        {isIdeaLane(lane.lineId) && lane.status !== 'failed' && (
          <div className={css.worktreeParent}>
            <label
              className={css.worktreeParentLabel}
              htmlFor={`mimir-worktree-parent-${lane.lineId}`}
            >
              {t('worktree.parent.label')}
            </label>
            <select
              id={`mimir-worktree-parent-${lane.lineId}`}
              className={css.worktreeSelect}
              value={lane.parentLineId ?? ''}
              disabled={busy}
              onChange={event => { void onParentChange(event.target.value) }}
            >
              <option value="">{t('worktree.parent.none')}</option>
              {ideaLanes.filter(other => other.lineId !== lane.lineId).map(other => (
                <option key={other.lineId} value={other.lineId}>
                  {other.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {lane.status === 'open' && (
          <div className={css.worktreeActions}>
            {!isMain && (
              <button
                type="button"
                className={css.btn}
                disabled={busy}
                onClick={() => { void onSetMainline(lane.lineId) }}
              >
                {t('worktree.mainline.set')}
              </button>
            )}
            {mergeable && (
              <button
                type="button"
                className={css.btn}
                disabled={busy}
                onClick={() => { void onAdopt(lane.lineId) }}
              >
                {t('worktree.adopt')}
              </button>
            )}
            {closeable && (
              <button
                type="button"
                className={css.btn}
                disabled={busy}
                onClick={() => { setClosing(!closing); setError(null) }}
              >
                {t('worktree.close')}
              </button>
            )}
          </div>
        )}
        {closing && closeable && (
          <div className={css.worktreeCloseBox}>
            <label
              className={css.worktreeParentLabel}
              htmlFor={`mimir-worktree-close-${lane.lineId}`}
            >
              {t('worktree.close.reason')}
            </label>
            <input
              id={`mimir-worktree-close-${lane.lineId}`}
              className={css.worktreeCloseInput}
              type="text"
              value={reason}
              onChange={event => { setReason(event.target.value) }}
            />
            <span className={css.worktreeCount} data-over={reasonState === 'too-long' || undefined}>
              {reason.length}/{WORKTREE_REASON_MAX_CHARS}
            </span>
            {reasonState === 'too-long' && (
              <span className={css.worktreeOver}>
                {t('worktree.close.tooLong', { count: String(WORKTREE_REASON_MAX_CHARS) })}
              </span>
            )}
            <div className={css.worktreeActions}>
              <button
                type="button"
                className={css.btnPrimary}
                disabled={reasonState !== 'ok' || busy}
                onClick={() => { void onConfirmClose() }}
              >
                {t('worktree.close.confirm')}
              </button>
              <button
                type="button"
                className={css.btn}
                onClick={() => { setClosing(false); setError(null) }}
              >
                {t('worktree.close.cancel')}
              </button>
            </div>
          </div>
        )}
        {error !== null && <p className={css.failure} role="status">{error}</p>}
      </div>
    </li>
  )
}

/**
 * @param props - the worktree slice, the controller verbs, and copy.
 * @returns the worktree card (banner + grouped lanes + counts).
 */
export function WorktreeView({
  worktree, refreshWorktree, setMainline, setIdeaParent, adoptIdea, closeIdea, refreshLedger, t,
}: {
  readonly worktree: ResearchWorktreeSlice
  readonly refreshWorktree: () => void
  readonly setMainline: (lineId: string) => Promise<ResearchFailureView | null>
  readonly setIdeaParent: (ideaId: string, parentIdeaId: string | null) => Promise<ResearchFailureView | null>
  readonly adoptIdea: (ideaId: string) => Promise<ResearchFailureView | null>
  readonly closeIdea: (ideaId: string, reason: string) => Promise<ResearchFailureView | null>
  /** Refresh the ledger timeline (a documented No lands as a ledger event too). */
  readonly refreshLedger: () => void
  readonly t: ResearchT
}) {
  const [busyLane, setBusyLane] = useState<string | null>(null)

  const view = worktree.view
  const mainlineId = view?.mainline?.lineId ?? null
  const lanes = view?.lanes ?? []
  const ideaLanes = lanes.filter(lane => isIdeaLane(lane.lineId))
  const groups: readonly { key: ResearchKey; lanes: readonly ResearchWorktreeLaneView[] }[] = [
    { key: 'worktree.group.open', lanes: lanes.filter(lane => lane.status === 'open') },
    { key: 'worktree.group.adopted', lanes: lanes.filter(lane => lane.status === 'adopted') },
    { key: 'worktree.group.failed', lanes: lanes.filter(lane => lane.status === 'failed') },
  ]

  // One layout pass feeds BOTH the graph and the lane pills, so a lane's
  // hue never disagrees between its curve and its label.
  const flow = view === null ? null : layoutWorktreeFlow(view)
  const colorOf = (lineId: string): string =>
    flow?.lanes.find(entry => entry.lane.lineId === lineId)?.color ?? '#9AA0A6'

  const run = async (
    laneId: string,
    action: () => Promise<ResearchFailureView | null>,
  ): Promise<ResearchFailureView | null> => {
    if (busyLane !== null) return null
    setBusyLane(laneId)
    const failure = await action()
    setBusyLane(null)
    return failure
  }

  return (
    <section className={css.reportCard}>
      <div className={css.reportCardHead}>
        <h3 className={css.reportCardTitle}>{t('worktree.title')}</h3>
        <div className={css.viewActions}>
          <button
            type="button"
            className={css.btn}
            onClick={refreshWorktree}
            disabled={worktree.status === 'loading'}
          >
            {t('worktree.refresh')}
          </button>
        </div>
      </div>
      {(worktree.status === 'cold' || worktree.status === 'loading') && (
        <p className={css.hint}>{t('worktree.loading')}</p>
      )}
      {worktree.status === 'error' && (
        <p className={css.failure} role="status">
          {worktree.failure?.message ?? t('worktree.failed')}
          <button type="button" className={css.retry} onClick={refreshWorktree}>
            {t('error.retry')}
          </button>
        </p>
      )}
      {worktree.status === 'ready' && view !== null && flow !== null && (
        <>
          <div className={css.worktreeBanner}>
            <span className={css.worktreeBannerKind}>{t('worktree.mainline')}</span>
            {view.mainline === null
              ? <span className={css.worktreeBannerMain}>{t('worktree.mainline.none')}</span>
              : (
                <>
                  <span className={css.worktreeBannerMain}>{view.mainline.label}</span>
                  <span className={css.worktreeBannerMeta}>
                    {t('worktree.mainline.declaredAt')} {new Date(view.mainline.declaredAt).toLocaleDateString()}
                    {view.mainlineHistory.length > 1
                      ? ` · reflog × ${String(view.mainlineHistory.length)}`
                      : ''}
                  </span>
                </>
              )}
          </div>
          {/* The branch flow: fat curves from the axis, beads = work nodes. */}
          <WorktreeFlowStrip view={view} flow={flow} t={t} />
          <WorktreeHighlights view={view} t={t} />

          {lanes.length === 0 && <p className={css.hint}>{t('worktree.empty')}</p>}
          {groups.map(group => group.lanes.length === 0 ? null : (
            <div key={group.key} className={css.worktreeGroup}>
              <h4 className={css.worktreeGroupTitle}>{t(group.key)}</h4>
              <ul className={css.worktreeList}>
                {group.lanes.map(lane => (
                  <LaneRow
                    key={lane.lineId}
                    lane={lane}
                    isMain={lane.lineId === mainlineId}
                    ideaLanes={ideaLanes}
                    busy={busyLane !== null}
                    color={colorOf(lane.lineId)}
                    onSetMainline={lineId => run(lineId, () => setMainline(lineId))}
                    onSetParent={(ideaId, parentIdeaId) =>
                      run(ideaId, () => setIdeaParent(ideaId, parentIdeaId))}
                    onAdopt={ideaId =>
                      run(ideaId, async () => {
                        const failure = await adoptIdea(ideaId)
                        if (failure === null) refreshLedger()
                        return failure
                      })}
                    onClose={(ideaId, reason) =>
                      run(ideaId, async () => {
                        const failure = await closeIdea(ideaId, reason)
                        if (failure === null) refreshLedger()
                        return failure
                      })}
                    t={t}
                  />
                ))}
              </ul>
            </div>
          ))}
          <p className={css.worktreeCounts}>
            <span className={css.statChip}>{t('worktree.group.open')} × {String(view.counts.open)}</span>
            <span className={css.statChip}>{t('worktree.group.adopted')} × {String(view.counts.adopted)}</span>
            <span className={css.statChip}>{t('worktree.group.failed')} × {String(view.counts.failed)}</span>
          </p>
        </>
      )}
    </section>
  )
}
