/**
 * Unit tests of the papers view's subscription-bar helpers: the unimported
 * filter, the badge counts, and the due-for-check rule of the open-triggered
 * automatic check.
 */

import { describe, expect, it } from 'vitest'
import {
  anySubscriptionDue,
  subscriptionDueForCheck,
  subscriptionNewCount,
  totalNewSubscriptionCount,
  unimportedNewEntries,
} from '../src/client/subscriptions.ts'
import type { ArxivEntry, ArxivSubscriptionView } from 'dsh-mimir/types'

/** One minimal entry factory. */
function entry(id: string): ArxivEntry {
  return {
    id,
    title: `Paper ${id}`,
    authors: ['Doe, Jane'],
    summary: `Summary of ${id}`,
    published: '2026-08-01T00:00:00Z',
    url: `https://arxiv.org/abs/${id}`,
  }
}

/** One subscription view factory. */
function subscription(
  id: string,
  newIds: readonly string[] = [],
  lastCheckedAt: string | null = '2026-08-23T00:00:00.000Z',
): ArxivSubscriptionView {
  return {
    id,
    query: `query ${id}`,
    createdAt: '2026-08-20T00:00:00.000Z',
    lastCheckedAt,
    newEntries: newIds.map(entry),
  }
}

describe('unimportedNewEntries / subscriptionNewCount', () => {
  it('drops the entries the library already holds, order preserved', () => {
    const sub = subscription('s1', ['a', 'b', 'c'])
    const imported = new Set(['b'])
    expect(unimportedNewEntries(sub, imported).map(item => item.id)).toEqual(['a', 'c'])
    expect(subscriptionNewCount(sub, imported)).toBe(2)
    expect(subscriptionNewCount(sub, new Set(['a', 'b', 'c']))).toBe(0)
  })
})

describe('totalNewSubscriptionCount', () => {
  it('sums the per-subscription counts', () => {
    const list = [subscription('s1', ['a', 'b']), subscription('s2', ['b', 'c'])]
    expect(totalNewSubscriptionCount(list, new Set())).toBe(4)
    expect(totalNewSubscriptionCount(list, new Set(['b']))).toBe(2)
    expect(totalNewSubscriptionCount([], new Set())).toBe(0)
  })
})

describe('subscriptionDueForCheck / anySubscriptionDue', () => {
  const NOW = Date.parse('2026-08-23T12:00:00.000Z')
  const GAP = 60 * 60 * 1000

  it('treats a never-checked subscription as due', () => {
    expect(subscriptionDueForCheck(subscription('s1', [], null), NOW, GAP)).toBe(true)
  })

  it('treats a fresh check as not due and a stale one as due', () => {
    expect(subscriptionDueForCheck(subscription('s1', [], '2026-08-23T11:30:00.000Z'), NOW, GAP)).toBe(false)
    expect(subscriptionDueForCheck(subscription('s1', [], '2026-08-23T10:59:59.000Z'), NOW, GAP)).toBe(true)
    expect(subscriptionDueForCheck(subscription('s1', [], '2026-08-23T11:00:00.000Z'), NOW, GAP)).toBe(true)
  })

  it('treats an unparseable lastCheckedAt as due and aggregates over the list', () => {
    expect(subscriptionDueForCheck(subscription('s1', [], 'garbage'), NOW, GAP)).toBe(true)
    expect(anySubscriptionDue([], NOW, GAP)).toBe(false)
    expect(anySubscriptionDue([subscription('s1', [], '2026-08-23T11:30:00.000Z')], NOW, GAP)).toBe(false)
    expect(anySubscriptionDue([
      subscription('s1', [], '2026-08-23T11:30:00.000Z'),
      subscription('s2', [], null),
    ], NOW, GAP)).toBe(true)
  })
})
