/**
 * Behavior tests for the live-refresh pure logic: the change→slice mapping
 * and the trailing-debounce aggregator that collapses an agent's write burst
 * into one refresh pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWikiChangeAggregator, slicesForWikiChange } from '../src/client/live-refresh.ts'
import type { LiveSlice } from '../src/client/live-refresh.ts'
import type { ResearchWikiChangeEvent } from 'dsh-mimir/types'

/** One change frame shorthand. */
function change(table: string, key = 'k'): ResearchWikiChangeEvent {
  return { table, key, operation: 'put' }
}

describe('slicesForWikiChange', () => {
  it('maps every domain table and the file-side pseudo-tables to their slices', () => {
    expect(slicesForWikiChange(change('projects'))).toEqual(['projects'])
    expect(slicesForWikiChange(change('papers'))).toEqual(['papers'])
    expect(slicesForWikiChange(change('experiments'))).toEqual(['experiments'])
    expect(slicesForWikiChange(change('figures'))).toEqual(['figures'])
    expect(slicesForWikiChange(change('servers'))).toEqual(['servers'])
    expect(slicesForWikiChange(change('jobs'))).toEqual(['jobs'])
    expect(slicesForWikiChange(change('venue_watches'))).toEqual(['venues'])
    expect(slicesForWikiChange(change('events'))).toEqual(['ledger'])
    expect(slicesForWikiChange(change('paper-source', 'p1'))).toEqual(['paper'])
    expect(slicesForWikiChange(change('bibliography', 'p1'))).toEqual(['bibliography'])
  })

  it('maps CBE-internal and unknown tables to nothing', () => {
    expect(slicesForWikiChange(change('ideas'))).toEqual([])
    expect(slicesForWikiChange(change('claims'))).toEqual([])
    expect(slicesForWikiChange(change('nope'))).toEqual([])
  })
})

describe('createWikiChangeAggregator', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('collapses a burst into one flush carrying the slice union', () => {
    const flushes: ReadonlySet<LiveSlice>[] = []
    const aggregator = createWikiChangeAggregator(slices => flushes.push(slices), 400)
    // An agent importing ten papers in a row.
    for (let index = 0; index < 10; index += 1) {
      aggregator.push(change('papers', `2608.0000${index}`))
      vi.advanceTimersByTime(100)
    }
    expect(aggregator.pending()).toBe(true)
    expect(flushes).toHaveLength(0)
    vi.advanceTimersByTime(400)
    expect(flushes).toHaveLength(1)
    expect([...flushes[0]!]).toEqual(['papers'])
    expect(aggregator.pending()).toBe(false)
  })

  it('unions distinct slices of one burst and ignores unmappable events', () => {
    const flushes: ReadonlySet<LiveSlice>[] = []
    const aggregator = createWikiChangeAggregator(slices => flushes.push(slices), 400)
    aggregator.push(change('papers'))
    aggregator.push(change('ideas')) // unmappable: no slice, no re-arm needed
    aggregator.push(change('venue_watches'))
    vi.advanceTimersByTime(400)
    expect(flushes).toHaveLength(1)
    expect([...flushes[0]!].sort()).toEqual(['papers', 'venues'])
  })

  it('flushNow fires immediately and cancel drops the pending set', () => {
    const flushes: ReadonlySet<LiveSlice>[] = []
    const aggregator = createWikiChangeAggregator(slices => flushes.push(slices), 400)
    aggregator.push(change('figures'))
    aggregator.flushNow()
    expect(flushes).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(flushes).toHaveLength(1)
    aggregator.push(change('servers'))
    aggregator.cancel()
    expect(aggregator.pending()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(flushes).toHaveLength(1)
  })
})
