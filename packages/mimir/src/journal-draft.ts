/**
 * The journal draft (S7): the pre-filled 日记 / 周报 the researcher is
 * handed instead of a blank page.
 *
 * This is the organ that answers "为什么不用 Notion / Obsidian / tex-diary":
 * those tools hand the researcher an empty editor and ask them to
 * reconstruct the day from memory. This renderer walks the ALREADY-RECORDED
 * ledger and writes the day out for them — every section below is a
 * machine fact rendered as a sentence — leaving only one bracketed slot,
 * `我自己的话`, for the words only a person can supply. The researcher's
 * job shrinks from "remember and write" to "read and react".
 *
 * Discipline, inherited from the layers it renders:
 *  - **Facts only, in the past tense.** The draft reports what the ledger
 *    recorded; it never evaluates, ranks, or advises. No "you should".
 *  - **E0 numbers stay E0** — counts, dates, and minutes, never a score.
 *  - **Silent organs stay silent**: when the theme or habit layer is below
 *    its floor, the section says so in one honest line rather than
 *    inventing a reading.
 *  - **Empty sections are not failures.** "今天没有落定的转折" is a true
 *    sentence about a quiet day, and a quiet day is worth recording.
 * @module dsh-mimir/src/journal-draft
 */

import type { CbeBrief, CbeLineState } from './cognitive-map.ts'
import type { CbeLibraryThemes } from './library-themes.ts'
import type { CbeHabitProfile } from './habits.ts'

/** The draft's span: one day, one week, or one month. */
export type JournalDraftKind = 'day' | 'week' | 'month'

/** The draft's language: Chinese first (the researcher's working tongue). */
export type JournalDraftLang = 'zh' | 'en'

/** Everything the draft renderer needs — all of it derivable, none of it authored. */
export interface JournalDraftInput {
  readonly kind: JournalDraftKind
  readonly brief: CbeBrief
  /** The shelf's theme drift; omitted when the caller has no library. */
  readonly themes?: CbeLibraryThemes | undefined
  /** The working-rhythm profile; omitted when the caller has no events. */
  readonly habits?: CbeHabitProfile | undefined
  readonly lang?: JournalDraftLang
}

const LINE_STATE_LABELS: Readonly<Record<CbeLineState, { readonly zh: string; readonly en: string }>> = {
  settled: { zh: '已定案', en: 'settled' },
  dominant: { zh: '主线', en: 'dominant' },
  stalled: { zh: '被否定中', en: 'stalled' },
  converging: { zh: '收敛中', en: 'converging' },
  'returning-side': { zh: '反复回看的支路', en: 'a returning side road' },
  exploring: { zh: '仍在探索', en: 'exploring' },
}

const DIRECTION_LABELS: Readonly<Record<string, { readonly zh: string; readonly en: string }>> = {
  new: { zh: '新增', en: 'new' },
  rising: { zh: '上升', en: 'rising' },
  flat: { zh: '持平', en: 'flat' },
  falling: { zh: '回落', en: 'falling' },
  gone: { zh: '消失', en: 'gone' },
}

const WEEKDAY_NAMES: Readonly<Record<number, { readonly zh: string; readonly en: string }>> = {
  0: { zh: '周日', en: 'Sun' },
  1: { zh: '周一', en: 'Mon' },
  2: { zh: '周二', en: 'Tue' },
  3: { zh: '周三', en: 'Wed' },
  4: { zh: '周四', en: 'Thu' },
  5: { zh: '周五', en: 'Fri' },
  6: { zh: '周六', en: 'Sat' },
}

/** Round to 3 decimals (the ledger's own precision). */
function r3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** `YYYY-MM-DD` in the host's local calendar. */
function localDate(ms: number): string {
  const at = new Date(ms)
  const month = `${at.getMonth() + 1}`.padStart(2, '0')
  const day = `${at.getDate()}`.padStart(2, '0')
  return `${at.getFullYear()}-${month}-${day}`
}

/** `HH:MM` in the host's local clock. */
function localTime(ms: number): string {
  const at = new Date(ms)
  return `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`
}

/** Parse one ISO-8601 timestamp to epoch ms (NaN → null). */
function tsToMs(ts: string): number | null {
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Render the pre-filled journal draft: the day (or week, or month) already
 * written out from the ledger, with one bracketed slot left for the words
 * only the researcher can supply.
 * @param input - the brief plus the optional theme and habit layers.
 * @returns the Markdown draft.
 */
export function renderJournalDraft(input: JournalDraftInput): string {
  const { brief, kind } = input
  const lang: JournalDraftLang = input.lang ?? 'zh'
  const zh = lang === 'zh'
  const out: string[] = []

  const sinceMs = tsToMs(brief.window.since)
  const untilMs = tsToMs(brief.window.until)
  const spanLabel = sinceMs === null || untilMs === null
    ? (zh ? '这段时间' : 'this stretch')
    : zh
      ? `${localDate(sinceMs)}${kind === 'day' ? '' : ` – ${localDate(untilMs - 1)}`}`
      : `${localDate(sinceMs)}${kind === 'day' ? '' : ` – ${localDate(untilMs - 1)}`}`

  const kindLabel = zh
    ? (kind === 'day' ? '研究日记' : kind === 'week' ? '本周进展' : '本月进展')
    : (kind === 'day' ? 'research diary' : kind === 'week' ? 'this week' : 'this month')

  out.push(`# ${spanLabel} · ${kindLabel}${zh ? '（草稿）' : ' (draft)'}`)
  out.push('')
  out.push(zh
    ? '> 这份草稿由账本自动填写——下面每一条都来自你已经记录下的事件。只有最后那一节是留给你自己的。'
    : '> This draft was written by the ledger from events you already recorded. Only the last section is yours.')
  out.push('')

  // ---- 1. What happened -------------------------------------------------
  out.push(zh ? '## 一、做了什么' : '## 1. What I did')
  out.push('')
  const lines = brief.lines
  if (lines.length === 0) {
    out.push(zh ? '- 这段时间账本里没有任何一条线的活动。' : '- No line recorded activity in this window.')
  } else {
    const named = lines
      .slice()
      .sort((a, b) => b.eventCount - a.eventCount || a.label.localeCompare(b.label))
      .slice(0, 5)
      .map(line => `${line.label}（${LINE_STATE_LABELS[line.state][zh ? 'zh' : 'en']}，${line.eventCount} 次）`)
    out.push(zh
      ? `- 触及 ${lines.length} 条线，最活跃的是：${named.join('、')}`
      : `- Touched ${lines.length} line(s); the busiest: ${named.join(', ')}`)
  }

  const themes = input.themes
  if (themes === undefined) {
    // No library layer supplied: say nothing rather than imply an empty shelf.
  } else if (themes.current.paperCount === 0) {
    out.push(zh ? '- 这段时间没有新收论文。' : '- No new papers in this window.')
  } else {
    const top = themes.current.themes.slice(0, 3).map(row => row.theme)
    out.push(zh
      ? `- 新收 ${themes.current.paperCount} 篇论文，主题集中在：${top.join('、') || '（尚未形成主题）'}`
      : `- Collected ${themes.current.paperCount} paper(s), themes: ${top.join(', ') || '(none yet)'}`)
  }

  const habits = input.habits
  if (habits !== undefined && habits.sessionCount > 0) {
    const longest = habits.longestSessionMinutes
    const when = habits.activeHours.slice(0, 2).map(bucket => `${bucket.hour}:00`)
    out.push(zh
      ? `- 坐下来 ${habits.sessionCount} 次${longest === null ? '' : `，最长一次 ${Math.round(longest)} 分钟`}；活跃时段在 ${when.join('、') || '—'}`
      : `- ${habits.sessionCount} sitting(s)${longest === null ? '' : `, longest ${Math.round(longest)} min`}; active around ${when.join(', ') || '—'}`)
    const busiest = habits.weekdayHistogram
      .filter(bucket => bucket.count > 0)
      .sort((a, b) => b.count - a.count)[0]
    if (busiest !== undefined) {
      const dayName = WEEKDAY_NAMES[busiest.weekday]?.[zh ? 'zh' : 'en'] ?? `${busiest.weekday}`
      out.push(zh
        ? `- 最常在${dayName}工作（${busiest.count} 次事件）`
        : `- Busiest weekday: ${dayName} (${busiest.count} events)`)
    }
    if (habits.currentStreakDays > 1) {
      out.push(zh ? `- 已经连续 ${habits.currentStreakDays} 天有记录。` : `- ${habits.currentStreakDays} day streak.`)
    }
  }
  out.push('')

  // ---- 2. Idea transitions ---------------------------------------------
  out.push(zh ? '## 二、想法的转变' : '## 2. How the thinking moved')
  out.push('')
  if (brief.transitions.length === 0) {
    out.push(zh ? '_这段时间没有落定的转折。_' : '_Nothing was decided in this window._')
  } else {
    for (const transition of brief.transitions.slice(0, 10)) {
      out.push(zh
        ? `- ${transition.kind === 'idea' ? '想法' : '论断'} \`${transition.id}\` → **${transition.to}**`
        : `- ${transition.kind} \`${transition.id}\` → **${transition.to}**`)
    }
  }
  out.push('')

  // ---- 3. Moments -------------------------------------------------------
  out.push(zh ? '## 三、值得记住的瞬间' : '## 3. Moments worth keeping')
  out.push('')
  if (brief.moments.length === 0) {
    out.push(zh ? '_没有出现爆发式的段落。_' : '_No bursts in this window._')
  } else {
    for (const moment of brief.moments.slice(0, 5)) {
      const from = tsToMs(moment.from)
      const to = tsToMs(moment.to)
      const span = from === null || to === null
        ? '—'
        : `${localTime(from)}–${localTime(to)}`
      out.push(zh
        ? `- ${span}：${moment.eventCount} 个事件，其中 ${moment.creationCount} 次新建（同期中位数 ${moment.baseline}）`
        : `- ${span}: ${moment.eventCount} events, ${moment.creationCount} creation(s) (median ${moment.baseline})`)
    }
  }
  out.push('')

  // ---- 4. Open loops ----------------------------------------------------
  out.push(zh ? '## 四、还没收的尾' : '## 4. Left open')
  out.push('')
  if (brief.openLoops.length === 0) {
    out.push(zh ? '_没有悬而未决的线程。_' : '_Nothing left hanging._')
  } else {
    for (const loop of brief.openLoops.slice(0, 10)) {
      const label = loop.kind === 'job-unsettled'
        ? (zh ? '实验任务未落定' : 'unsettled job')
        : (zh ? '编译未解决' : 'unresolved compile')
      out.push(zh ? `- ${label}：\`${loop.refId}\`` : `- ${label}: \`${loop.refId}\``)
    }
  }
  out.push('')

  // ---- 5. The shelf's drift --------------------------------------------
  if (themes !== undefined) {
    out.push(zh ? '## 五、书架的漂移' : '## 5. How the shelf moved')
    out.push('')
    if (!themes.speaks) {
      out.push(zh
        ? `_样本还不够（当前 ${themes.current.paperCount} 篇 / 上一期 ${themes.previous.paperCount} 篇），先不比较。_`
        : `_Too few papers to compare yet (${themes.current.paperCount} now / ${themes.previous.paperCount} before)._`)
    } else if (themes.drift.length === 0) {
      out.push(zh ? '_主题构成没有变化。_' : '_The theme mix did not move._')
    } else {
      for (const row of themes.drift.slice(0, 6)) {
        const direction = DIRECTION_LABELS[row.direction]?.[zh ? 'zh' : 'en'] ?? row.direction
        out.push(zh
          ? `- ${row.theme}：${direction}（${row.previousCount} → ${row.currentCount}，占比 ${r3(row.deltaShare * 100)}%）`
          : `- ${row.theme}: ${direction} (${row.previousCount} → ${row.currentCount}, ${r3(row.deltaShare * 100)}%)`)
      }
    }
    out.push('')
  }

  // ---- 6. The one slot only a person can fill ---------------------------
  const lastIndex = themes === undefined ? 5 : 6
  out.push(zh ? `## ${lastIndex}、我自己的话` : `## ${lastIndex}. In my own words`)
  out.push('')
  out.push('- [ ] ')
  out.push('')

  // ---- Closing footnote: the questions the map is still holding ---------
  if (brief.questions.length > 0) {
    out.push(zh
      ? `> 账本还留着 ${brief.questions.length} 个待你确认的边界问题。`
      : `> The ledger is still holding ${brief.questions.length} boundary question(s).`)
    out.push('')
  }

  return out.join('\n')
}
