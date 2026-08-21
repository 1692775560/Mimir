/**
 * Behavior tests for the workbench toast queue: push dedupe and the stack
 * cap, TTL pruning, and the host's next-sweep deadline.
 */

import { describe, expect, it } from 'vitest'
import {
  nextToastExpiry,
  pruneExpiredToasts,
  pushToast,
  TOAST_LIMIT,
  TOAST_TTL_MS,
  type ResearchToast,
} from '../src/client/toasts.ts'

/** Push shorthand: the copy/detail strings below are valid locale keys. */
function push(
  list: readonly ResearchToast[],
  copy: ResearchToast['copy'],
  detail: string | null,
  now: number,
  id: number,
): readonly ResearchToast[] {
  return pushToast(list, 'success', copy, detail, now, id).list
}

describe('pushToast', () => {
  it('appends a fresh toast with the assigned id and timestamp', () => {
    const { list, id } = pushToast([], 'success', 'toast.deleted', null, 1000, 7)
    expect(id).toBe(7)
    expect(list).toEqual([{ id: 7, kind: 'success', copy: 'toast.deleted', detail: null, createdAt: 1000 }])
  })

  it('keeps pushes in arrival order, oldest first', () => {
    const list = push(push([], 'toast.deleted', null, 1000, 1), 'toast.compileOk', null, 2000, 2)
    expect(list.map(t => t.id)).toEqual([1, 2])
  })

  it('refreshes a same copy+detail twin instead of stacking it', () => {
    let list = push([], 'toast.deleted', null, 1000, 1)
    list = push(list, 'toast.compileOk', null, 1500, 2)
    list = push(list, 'toast.deleted', null, 2000, 3)
    // The twin moved to the end with a new id and timestamp; nothing stacked.
    expect(list.map(t => [t.id, t.copy, t.createdAt])).toEqual([
      [2, 'toast.compileOk', 1500],
      [3, 'toast.deleted', 2000],
    ])
  })

  it('treats a different detail as a different toast', () => {
    let list = push([], 'toast.bibImported', '× 1', 1000, 1)
    list = push(list, 'toast.bibImported', '× 2', 2000, 2)
    expect(list).toHaveLength(2)
  })

  it('drops the oldest toasts first once the queue hits the cap', () => {
    let list: readonly ResearchToast[] = []
    for (let i = 1; i <= TOAST_LIMIT + 2; i++) {
      list = push(list, 'toast.serversChecked', `× ${i}`, i * 1000, i)
    }
    expect(list).toHaveLength(TOAST_LIMIT)
    expect(list.map(t => t.id)).toEqual([3, 4, 5, 6])
  })
})

describe('pruneExpiredToasts', () => {
  it('keeps a toast whose deadline is still ahead, drops one that just elapsed', () => {
    const alive = push([], 'toast.deleted', null, 1000, 1)
    expect(pruneExpiredToasts(alive, 1000 + TOAST_TTL_MS - 1)).toHaveLength(1)
    expect(pruneExpiredToasts(alive, 1000 + TOAST_TTL_MS)).toHaveLength(0)
  })

  it('returns the same reference when nothing expired', () => {
    const list = push([], 'toast.deleted', null, 1000, 1)
    expect(pruneExpiredToasts(list, 2000)).toBe(list)
  })

  it('sweeps only the expired prefix of a mixed queue', () => {
    let list = push([], 'toast.deleted', null, 1000, 1)
    list = push(list, 'toast.compileOk', null, 4000, 2)
    const kept = pruneExpiredToasts(list, 1000 + TOAST_TTL_MS)
    expect(kept.map(t => t.id)).toEqual([2])
  })
})

describe('nextToastExpiry', () => {
  it('is null on an empty queue', () => {
    expect(nextToastExpiry([])).toBeNull()
  })

  it('is the oldest toast deadline, even when arrivals interleave', () => {
    let list = push([], 'toast.deleted', null, 3000, 1)
    list = push(list, 'toast.compileOk', null, 1000, 2)
    expect(nextToastExpiry(list)).toBe(1000 + TOAST_TTL_MS)
  })
})
