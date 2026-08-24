/**
 * The experiments view's "generate paper figure" pure rules: render one
 * metric's comparison rows as a standalone SVG bar-chart document (zero
 * dependencies, no CSS variables — the file must render identically outside
 * the panel's theme), derive its destination file name in the paper's
 * `figures/` directory, and compose the LaTeX-safe caption the wiki's
 * figures table registers. DOM-free so every rule is unit-testable.
 * @module dsh-client-ui-mimir/client/metric-figure
 */

import { barWidthPercents, chartNameLines, formatMetricValue } from './view-common.ts'
import type { MetricChartRow } from './view-common.ts'

/** Escape the five XML specials so names/values can ride SVG text safely. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Escape the LaTeX specials a generated caption can contain (metric keys like
 * `pa_mpjpe` carry an underscore; experiment names are free text). The
 * figure block inserts the caption verbatim, so an unescaped `_` would break
 * the compile.
 */
export function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
}

/**
 * The destination file name of one metric's figure inside the paper's
 * `figures/` directory: `metric-<key>.svg` with every run of unsafe
 * characters folded to a single dash and edge dashes trimmed. An all-unsafe
 * key falls back to `metric-chart.svg` so the name is never empty.
 */
export function metricFigureFileName(metricKey: string): string {
  const stem = metricKey.replace(/[^a-zA-Z0-9:-]+/g, '-').replace(/^-+|-+$/g, '')
  return `metric-${stem === '' ? 'chart' : stem}.svg`
}

/**
 * The caption one metric figure registers and the LaTeX block carries: the
 * metric key plus every compared run's name and value, LaTeX-escaped. Runs
 * keep the chart's order (oldest first), so the caption reads like the bars.
 */
export function metricFigureCaption(metricKey: string, rows: readonly MetricChartRow[]): string {
  const entries = rows.map(row => `${escapeLatex(row.name)} (${escapeLatex(formatMetricValue(row.value))})`)
  return `Comparison of ${escapeLatex(metricKey)} across experiments: ${entries.join(', ')}.`
}

/** Chart geometry: 640-wide canvas, a 216-unit label lane, 30-unit rows. */
const FIG_WIDTH = 640
const FIG_TITLE_HEIGHT = 38
const FIG_ROW_HEIGHT = 30
const FIG_BAR_HEIGHT = 18
const FIG_LABEL_WIDTH = 216
const FIG_BAR_MAX_WIDTH = 330
const FIG_BOTTOM_PAD = 12

/** Neutral gray-blue palette; literal values, never theme variables. */
const COLOR_BACKGROUND = '#ffffff'
const COLOR_TITLE = '#2f3b4a'
const COLOR_TEXT = '#4a5560'
const COLOR_BASELINE = '#c8d0d8'
const COLOR_BAR = '#6a8caf'
const COLOR_BAR_BEST = '#3f5f7f'
const FONT_STACK = 'Helvetica, Arial, sans-serif'

/**
 * Render one metric's comparison rows as a self-contained SVG document: one
 * horizontal bar per run, normalized to the largest value (the
 * {@link barWidthPercents} rule the panel chart uses), the run name wrapped
 * to two lines in the label lane, and the formatted value at each bar's end.
 * The best run's bar is shaded darker so it reads at a glance. An empty row
 * list still yields a valid, title-only document.
 */
export function metricFigureSvg(metricKey: string, rows: readonly MetricChartRow[]): string {
  const height = FIG_TITLE_HEIGHT + rows.length * FIG_ROW_HEIGHT + FIG_BOTTOM_PAD
  const widths = barWidthPercents(rows.map(row => row.value))
  const best = rows.reduce((top, row) => Math.max(top, row.value), Number.NEGATIVE_INFINITY)
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FIG_WIDTH}" height="${height}" viewBox="0 0 ${FIG_WIDTH} ${height}" font-family="${FONT_STACK}">`,
    `<title>${escapeXml(metricKey)}</title>`,
    `<rect width="${FIG_WIDTH}" height="${height}" fill="${COLOR_BACKGROUND}"/>`,
    `<text x="16" y="24" font-size="15" font-weight="bold" fill="${COLOR_TITLE}">${escapeXml(metricKey)}</text>`,
  ]
  rows.forEach((row, index) => {
    const y = FIG_TITLE_HEIGHT + index * FIG_ROW_HEIGHT
    const barWidth = (widths[index] ?? 0) / 100 * FIG_BAR_MAX_WIDTH
    const [nameFirst, nameSecond] = chartNameLines(row.name)
    const nameY = nameSecond === undefined ? y + 16 : y + 10
    parts.push(
      `<text x="${FIG_LABEL_WIDTH - 8}" y="${nameY}" font-size="12" text-anchor="end" fill="${COLOR_TEXT}">${escapeXml(nameFirst)}</text>`,
    )
    if (nameSecond !== undefined) {
      parts.push(`<text x="${FIG_LABEL_WIDTH - 8}" y="${nameY + 12}" font-size="12" text-anchor="end" fill="${COLOR_TEXT}">${escapeXml(nameSecond)}</text>`)
    }
    parts.push(
      `<rect x="${FIG_LABEL_WIDTH}" y="${y + 4}" width="${barWidth}" height="${FIG_BAR_HEIGHT}" rx="2" fill="${row.value === best && best > 0 ? COLOR_BAR_BEST : COLOR_BAR}"/>`,
      `<text x="${FIG_LABEL_WIDTH + barWidth + 6}" y="${y + 17}" font-size="12" fill="${COLOR_TEXT}">${escapeXml(formatMetricValue(row.value))}</text>`,
    )
  })
  if (rows.length > 0) {
    parts.push(`<line x1="${FIG_LABEL_WIDTH}" y1="${FIG_TITLE_HEIGHT}" x2="${FIG_LABEL_WIDTH}" y2="${height - FIG_BOTTOM_PAD}" stroke="${COLOR_BASELINE}" stroke-width="1"/>`)
  }
  parts.push('</svg>')
  return `${parts.join('\n')}\n`
}
