/**
 * CBE experience capsules (S8b): the week/month/project report's atoms —
 * six INDEPENDENT data slices, one capsule per observed fact. The six
 * perspectives are not six prompts to one model; they are six different
 * physical measurements of the same window, so "three slices point at X" is
 * finally meaningful here (the independence STORM's critics demanded, which
 * role-played personas can never supply).
 *
 * The discipline carried from the rest of the engine:
 *  - **Pure fold**: every capsule is derived from the already-derived layers
 *    (worktree, moments, library themes, habits, brief). It stores NOTHING.
 *  - **Evidence is real**: every capsule that can name its events does; a
 *    capsule with no event ids (a theme drift, a rhythm summary) says so by
 *    leaving `evidence` empty and carrying its fact in `theme`/`metric`.
 *  - **No advisory voice**: the one-liner is a description of what the data
 *    shows (drift +2.1, gave up after 8 days), never a suggestion.
 *  - **No critical-state prompt**: the EWS work lives in {@link module:dsh-mimir/src/eureka}
 *    and is surfaced only as a DESCRIPTIVE table in the project digest; this
 *    module never announces "you are approaching an insight".
 *
 * Localization: the capsule carries structured fields only; {@link
 * formatCapsule} builds the one-liner in either language, so the same model
 * renders in the panel and in the exported MMS without re-deriving.
 * @module dsh-mimir/src/report-capsules
 */

import type { CbeBrief } from './cognitive-map.ts'
import type { CbeCuratedMoment } from './moment-index.ts'
import type { CbeHabitProfile } from './habits.ts'
import type { CbeLibraryThemes } from './library-themes.ts'
import type { CbeWorktree, CbeWorktreeLane } from './worktree.ts'

/** The six independent perspectives a capsule can belong to. */
export type CbeCapsulePerspective =
  | 'mainline'   // progress on live lines (topology)
  | 'dead-branch' // documented Nos (status field + GUT)
  | 'literature'  // theme drift (the papers table)
  | 'rhythm'      // working habit (timestamps, orthogonal to action semantics)
  | 'moment'      // memorable instants (burst/pin index)
  | 'open-loop'   // started-but-unclosed threads (event open/close pairing)

/** Locale the one-liner is rendered in. */
export type CapsuleLang = 'zh' | 'en'

/** One self-contained, retrievable experience unit. */
export interface CbeExperienceCapsule {
  /** Stable id (perspective-scoped); the view keys on it. */
  readonly id: string
  readonly perspective: CbeCapsulePerspective
  /** The fact's timestamp (the lane's last touch, the moment's anchor, …). */
  readonly at: string
  /** A lane / moment id the view can resolve a label for, or null. */
  readonly labelRef: string | null
  /** Event ids backing the capsule (empty when the fact has no events). */
  readonly evidence: readonly string[]
  /** A theme name for literature capsules, or null. */
  readonly theme: string | null
  /** The headline number (drift, GUT days, Δshare, streak), or null. */
  readonly metric: number | null
  /** A sub-kind label (rising/falling/gone, failed, …), or null. */
  readonly kind: string | null
}

/** The derived layers one window's capsules are folded from. */
export interface CbeCapsuleInput {
  readonly window: { readonly since: string; readonly until: string }
  readonly worktree: CbeWorktree
  readonly moments: readonly CbeCuratedMoment[]
  readonly library: CbeLibraryThemes
  readonly habits: CbeHabitProfile
  readonly brief: CbeBrief
}

/** Round to 2 decimals for stable, human-readable one-liners. */
function r2(value: number): number {
  return Math.round(value * 100) / 100
}

/** The six perspectives in the fixed report order. */
const PERSPECTIVE_ORDER: readonly CbeCapsulePerspective[] = [
  'mainline', 'dead-branch', 'literature', 'rhythm', 'moment', 'open-loop',
]

/**
 * Fold all six perspectives of one window into capsules. Each perspective is
 * derived from its own independent layer, so the array is a set of distinct
 * measurements — not six restatements of one model's opinion. The capsule
 * count is NOT capped here; the tier assembler (report-tier.ts) chooses how
 * many of each to surface at weekly/monthly/project depth.
 * @param input - the derived layers of one window.
 * @returns capsules in perspective order, then time order within a perspective.
 */
export function deriveCapsules(input: CbeCapsuleInput): readonly CbeExperienceCapsule[] {
  const capsules: CbeExperienceCapsule[] = [
    ...mainlineCapsules(input.worktree.lanes),
    ...deadBranchCapsules(input.worktree.lanes),
    ...literatureCapsules(input.library),
    ...rhythmCapsules(input.habits),
    ...momentCapsules(input.moments),
    ...openLoopCapsules(input.brief),
  ]
  capsules.sort((a, b) => {
    const pa = PERSPECTIVE_ORDER.indexOf(a.perspective)
    const pb = PERSPECTIVE_ORDER.indexOf(b.perspective)
    if (pa !== pb) return pa - pb
    // Moments keep the pinned-first order momentCapsules already produced; a
    // chronological re-sort would bury the researcher's own pins.
    if (a.perspective === 'moment') return 0
    return a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  })
  return Object.freeze(capsules)
}

/** Live lines (open / adopted): the process still in motion. */
function mainlineCapsules(lanes: readonly CbeWorktreeLane[]): CbeExperienceCapsule[] {
  const out: CbeExperienceCapsule[] = []
  for (const lane of lanes) {
    if (lane.status === 'failed') continue
    out.push(Object.freeze({
      id: `mainline:${lane.lineId}`,
      perspective: 'mainline',
      at: lane.lastSeen,
      labelRef: lane.lineId,
      // Worktree touches carry timestamps, not event ids; the lane is the label.
      evidence: Object.freeze([]),
      theme: null,
      metric: r2(lane.drift),
      kind: lane.status,
    }))
  }
  return out
}

/** Documented Nos: the lesson each dead end taught, and how long it took. */
function deadBranchCapsules(lanes: readonly CbeWorktreeLane[]): CbeExperienceCapsule[] {
  const out: CbeExperienceCapsule[] = []
  for (const lane of lanes) {
    if (lane.status !== 'failed') continue
    out.push(Object.freeze({
      id: `dead-branch:${lane.lineId}`,
      perspective: 'dead-branch',
      at: lane.closedAt ?? lane.lastSeen,
      labelRef: lane.lineId,
      evidence: Object.freeze([]),
      theme: lane.closeReason,
      metric: lane.gutDays === null ? null : r2(lane.gutDays),
      kind: 'failed',
    }))
  }
  return out
}

/** Theme drift: intake growth (rising/new) and departure (falling/gone). */
function literatureCapsules(library: CbeLibraryThemes): CbeExperienceCapsule[] {
  const out: CbeExperienceCapsule[] = []
  for (const row of library.drift) {
    if (row.direction === 'flat') continue
    out.push(Object.freeze({
      id: `literature:${row.theme}`,
      perspective: 'literature',
      at: library.current.until,
      labelRef: null,
      evidence: Object.freeze([]),
      theme: row.theme,
      metric: r2(row.deltaShare),
      kind: row.direction,
    }))
  }
  return out
}

/** One rhythm capsule when the habit profile may speak (I2's floor). */
function rhythmCapsules(habits: CbeHabitProfile): CbeExperienceCapsule[] {
  if (!habits.speaks || habits.activeHours.length === 0) return []
  const busiest = habits.activeHours[0]
  return [Object.freeze({
    id: 'rhythm:profile',
    perspective: 'rhythm',
    at: habits.asOf,
    labelRef: null,
    evidence: Object.freeze([]),
    theme: null,
    metric: habits.currentStreakDays,
    kind: busiest === undefined ? null : `${busiest.hour}:00`,
  })]
}

/** Memorable instants: pinned moments first, then the auto-candidates. */
function momentCapsules(moments: readonly CbeCuratedMoment[]): CbeExperienceCapsule[] {
  const out: CbeExperienceCapsule[] = []
  const ordered = [...moments].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  })
  for (const moment of ordered) {
    out.push(Object.freeze({
      id: `moment:${moment.id}`,
      perspective: 'moment',
      at: moment.at,
      labelRef: moment.id,
      evidence: Object.freeze(moment.evidence),
      theme: moment.note,
      metric: moment.eventCount,
      kind: moment.kind,
    }))
  }
  return out
}

/** Started-but-unclosed threads (the known-unknown quadrant). */
function openLoopCapsules(brief: CbeBrief): CbeExperienceCapsule[] {
  return brief.openLoops.map(loop => Object.freeze({
    id: `open-loop:${loop.refId}`,
    perspective: 'open-loop' as const,
    at: loop.openedAt,
    labelRef: loop.refId,
    evidence: Object.freeze([loop.openedBy]),
    theme: null,
    metric: null,
    kind: loop.kind,
  }))
}

/* ── Localized one-liner (the only place strings are built) ────────────── */

/**
 * Render one capsule's one-liner in the requested language. The capsule's
 * structured fields carry every fact; this function only lays them out — it
 * never invents a claim (drift is reported, never praised; a No is reported,
 * never mourned). `labelOf` resolves a lane/moment id to a display name when
 * the caller has one; absent, the id is used verbatim.
 * @param capsule - the capsule to render.
 * @param lang - 'zh' or 'en'.
 * @param labelOf - optional id → display label resolver (the view's wiki map).
 * @returns the one-line fact.
 */
export function formatCapsule(
  capsule: CbeExperienceCapsule,
  lang: CapsuleLang,
  labelOf?: (id: string) => string | undefined,
): string {
  const label = capsule.labelRef !== null ? (labelOf?.(capsule.labelRef) ?? capsule.labelRef) : null
  switch (capsule.perspective) {
    case 'mainline': {
      const name = label ?? capsule.labelRef ?? 'line'
      const m = capsule.metric === null ? '' : (lang === 'zh' ? `（drift ${capsule.metric}）` : `(drift ${capsule.metric})`)
      return lang === 'zh'
        ? `${name} 仍有活动${m}`
        : `${name} still active${m}`
    }
    case 'dead-branch': {
      const name = label ?? capsule.labelRef ?? 'line'
      const gut = capsule.metric === null
        ? ''
        : (lang === 'zh' ? `，放弃前坚持了 ${capsule.metric} 天` : `, gave up after ${capsule.metric} days`)
      const reason = capsule.theme === null || capsule.theme === ''
        ? (lang === 'zh' ? '（未写理由）' : ' (no reason recorded)')
        : `：${capsule.theme}`
      return (lang === 'zh' ? `${name} 已终止${gut}${reason}` : `${name} closed${gut}${reason}`)
    }
    case 'literature': {
      const dir = capsule.kind
      const word = dir === 'new' ? (lang === 'zh' ? '新出现' : 'new')
        : dir === 'rising' ? (lang === 'zh' ? '升温' : 'rising')
        : dir === 'falling' ? (lang === 'zh' ? '降温' : 'falling')
        : (lang === 'zh' ? '消失' : 'gone')
      const m = capsule.metric === null ? '' : (lang === 'zh' ? `（Δ ${capsule.metric}）` : ` (Δ ${capsule.metric})`)
      return (lang === 'zh' ? `主题「${capsule.theme}」${word}${m}` : `theme "${capsule.theme}" ${word}${m}`)
    }
    case 'rhythm': {
      const streak = capsule.metric ?? 0
      const hour = capsule.kind ?? ''
      return lang === 'zh'
        ? `连续 ${streak} 天有记录，最活跃的时段在 ${hour}`
        : `${streak}-day streak; busiest around ${hour}`
    }
    case 'moment': {
      // The one-liner is the researcher's own words (the note) when they left
      // one; a moment's id is not a human label, so it never outranks the note.
      if (capsule.theme !== null && capsule.theme !== '') return capsule.theme
      const kindWord = capsule.kind ?? ''
      return lang === 'zh'
        ? `${kindWord} · ${capsule.metric} 个事件`
        : `${kindWord} · ${capsule.metric} events`
    }
    case 'open-loop': {
      const word = capsule.kind === 'job-unsettled'
        ? (lang === 'zh' ? '未结算的任务' : 'unsettled job')
        : (lang === 'zh' ? '未解决的编译' : 'unresolved compile')
      const name = label ?? capsule.labelRef ?? ''
      return (lang === 'zh' ? `${word} ${name} 仍未收尾` : `${word} ${name} still open`)
    }
  }
}
