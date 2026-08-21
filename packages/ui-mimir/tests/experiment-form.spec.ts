/**
 * Behavior tests for the experiments form's metrics row editor helpers:
 * expanding stored metrics into editable rows, and folding rows back with
 * empty-key filtering, trimming, number conversion, and last-write-wins.
 */

import { describe, expect, it } from 'vitest'
import { metricRowsFromMetrics, metricsFromRows } from '../src/client/experiment-form.ts'

describe('metricRowsFromMetrics', () => {
  it('expands entries in order, stringifying values', () => {
    expect(metricRowsFromMetrics({ mpjpe: 92.4, note: 'warmup' })).toEqual([
      { key: 'mpjpe', value: '92.4' },
      { key: 'note', value: 'warmup' },
    ])
    expect(metricRowsFromMetrics({})).toEqual([])
  })
})

describe('metricsFromRows', () => {
  it('drops rows whose key trims to empty', () => {
    expect(metricsFromRows([
      { key: '', value: '1' },
      { key: '   ', value: '2' },
      { key: 'acc', value: '0.9' },
    ])).toEqual({ acc: 0.9 })
  })

  it('stores fully numeric values as numbers, everything else as trimmed strings', () => {
    expect(metricsFromRows([
      { key: 'mpjpe', value: ' 88.1 ' },
      { key: 'epochs', value: '1e3' },
      { key: 'note', value: '  warmup  ' },
      { key: 'partial', value: '12abc' },
      { key: 'empty', value: '' },
    ])).toEqual({ mpjpe: 88.1, epochs: 1000, note: 'warmup', partial: '12abc', empty: '' })
  })

  it('trims keys, and a later row with the same key wins', () => {
    expect(metricsFromRows([
      { key: ' loss ', value: '0.5' },
      { key: 'loss', value: '0.4' },
    ])).toEqual({ loss: 0.4 })
  })
})
