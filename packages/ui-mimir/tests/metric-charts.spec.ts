/**
 * Behavior tests for the experiments comparison-chart helpers: which metric
 * keys earn a chart, which runs form a chart's rows, how bar widths
 * normalize, and how values print.
 */

import { describe, expect, it } from 'vitest'
import type { ExperimentRecord } from 'dsh-mimir/types'
import {
  barWidthPercents,
  chartNameLines,
  formatMetricValue,
  metricChartRows,
  numericMetricKeys,
} from '../src/client/view-common.ts'

/** One experiment fixture; only the fields the helpers read. */
function run(id: string, metrics: Record<string, number | string>, updatedAt: string): ExperimentRecord {
  return { id, projectId: 'p1', name: id, status: 'success', metrics, updatedAt }
}

describe('numericMetricKeys', () => {
  it('keeps only numeric keys shared by at least two runs, sorted', () => {
    const keys = numericMetricKeys([
      run('e1', { mpjpe: 92.4, 'pa-mpjpe': 61.2, note: 'a' }, '2026-08-01T00:00:00Z'),
      run('e2', { mpjpe: 88.1, 'pa-mpjpe': 58.7 }, '2026-08-02T00:00:00Z'),
      // A key only one run carries has nothing to compare against.
      run('e3', { mpjpe: 90.0, throughput: 12 }, '2026-08-03T00:00:00Z'),
    ])
    expect(keys).toEqual(['mpjpe', 'pa-mpjpe'])
  })

  it('returns no keys without numeric metrics (the empty state)', () => {
    expect(numericMetricKeys([])).toEqual([])
    expect(numericMetricKeys([
      run('e1', { note: 'x' }, '2026-08-01T00:00:00Z'),
      run('e2', {}, '2026-08-02T00:00:00Z'),
    ])).toEqual([])
    // Non-finite numbers never earn a chart.
    expect(numericMetricKeys([
      run('e1', { loss: Number.NaN }, '2026-08-01T00:00:00Z'),
      run('e2', { loss: Number.POSITIVE_INFINITY }, '2026-08-02T00:00:00Z'),
    ])).toEqual([])
  })
})

describe('metricChartRows', () => {
  it('collects the numeric carriers of one key, oldest first', () => {
    const rows = metricChartRows([
      run('newest', { mpjpe: 88.1 }, '2026-08-03T00:00:00Z'),
      run('skipped', { mpjpe: 'n/a' }, '2026-08-02T00:00:00Z'),
      run('missing', {}, '2026-08-01T00:00:00Z'),
      run('oldest', { mpjpe: 92.4 }, '2026-07-30T00:00:00Z'),
    ], 'mpjpe')
    expect(rows.map(row => row.id)).toEqual(['oldest', 'newest'])
    expect(rows.map(row => row.value)).toEqual([92.4, 88.1])
  })
})

describe('barWidthPercents', () => {
  it('normalizes to the largest value and clamps into 0–100', () => {
    expect(barWidthPercents([92.4, 88.1, 46.2])).toEqual([100, (88.1 / 92.4) * 100, 50])
  })

  it('collapses an all-non-positive chart to zero-width bars', () => {
    expect(barWidthPercents([0, 0])).toEqual([0, 0])
    expect(barWidthPercents([])).toEqual([])
    expect(barWidthPercents([-1, -2])).toEqual([0, 0])
  })
})

describe('formatMetricValue', () => {
  it('prints integers as-is and rounds other numbers to four significant digits', () => {
    expect(formatMetricValue(92.4)).toBe('92.4')
    expect(formatMetricValue(88.123456)).toBe('88.12')
    expect(formatMetricValue(0.002345678)).toBe('0.002346')
    expect(formatMetricValue(123456)).toBe('123456')
    expect(formatMetricValue('n/a')).toBe('n/a')
  })
})

describe('chartNameLines', () => {
  it('keeps a short name on one line', () => {
    expect(chartNameLines('消融：FAPE 编码开关')).toEqual(['消融：FAPE 编码开关'])
    expect(chartNameLines('full model')).toEqual(['full model'])
  })

  it('wraps a long name greedily at a word boundary without ellipsizing the tail', () => {
    expect(chartNameLines('基线复现：EgoHMR 在 EgoBody 上的指标')).toEqual([
      '基线复现：EgoHMR 在',
      'EgoBody 上的指标',
    ])
  })

  it('wraps a long latin name at the last space inside the budget', () => {
    const [first, second] = chartNameLines('full model: EgoSync whole body recovery')
    expect(first).toBe('full model: EgoSync')
    expect(second).toBe('whole body recovery')
  })

  it('ellipsizes the second line when two lines still overflow', () => {
    const [first, second] = chartNameLines(
      '完整模型：EgoSync-full 在 EgoBody3D 全量数据集上的长序列压力测试指标',
    )
    expect(first).toBe('完整模型：')
    expect(second?.endsWith('…')).toBe(true)
    // The ellipsized tail keeps the full name out of the bar lane.
    expect(chartNameLines('完整模型：EgoSync-full 在 EgoBody3D 全量数据集上的长序列压力测试指标')[1])
      .not.toContain('指标')
  })
})
