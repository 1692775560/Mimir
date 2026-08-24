/**
 * Pure helpers of the papers view's arXiv subscription bar: the badge counts
 * (cached new entries minus the ones the library already holds) and the
 * due-for-check rule behind the open-triggered automatic check. No React, no
 * Remote — unit-tested directly.
 * @module dsh-client-ui-mimir/client/subscriptions
 */

import type { ArxivEntry, ArxivSubscriptionView } from 'dsh-mimir/types'

/**
 * Minimum age of a subscription's last settled check before the panel
 * auto-rechecks on the papers view's open (the host also runs a scheduled
 * daily check; this only freshens a stale list).
 */
export const SUBSCRIPTION_AUTO_CHECK_GAP_MS = 60 * 60 * 1000

/**
 * One subscription's unimported new entries (its cached `newEntries` minus
 * the ids the literature library already holds), newest first preserved.
 * @param subscription - one subscription view.
 * @param importedIds - the arXiv ids already in the library.
 */
export function unimportedNewEntries(
  subscription: ArxivSubscriptionView,
  importedIds: ReadonlySet<string>,
): ArxivEntry[] {
  return subscription.newEntries.filter(entry => !importedIds.has(entry.id))
}

/**
 * The badge count of one subscription: how many of its cached new entries
 * are not yet imported.
 */
export function subscriptionNewCount(
  subscription: ArxivSubscriptionView,
  importedIds: ReadonlySet<string>,
): number {
  return unimportedNewEntries(subscription, importedIds).length
}

/** The badge count across every subscription. */
export function totalNewSubscriptionCount(
  subscriptions: readonly ArxivSubscriptionView[],
  importedIds: ReadonlySet<string>,
): number {
  return subscriptions.reduce((sum, subscription) => sum + subscriptionNewCount(subscription, importedIds), 0)
}

/**
 * Whether one subscription is due for an automatic check: never checked, or
 * its last settled check is older than `gapMs`.
 * @param subscription - one subscription view.
 * @param nowMs - the current instant in milliseconds.
 * @param gapMs - the minimum check age that counts as fresh.
 */
export function subscriptionDueForCheck(
  subscription: ArxivSubscriptionView,
  nowMs: number,
  gapMs: number = SUBSCRIPTION_AUTO_CHECK_GAP_MS,
): boolean {
  if (subscription.lastCheckedAt === null) return true
  const checkedMs = Date.parse(subscription.lastCheckedAt)
  return Number.isNaN(checkedMs) || nowMs - checkedMs >= gapMs
}

/** Whether any subscription of the list is due for an automatic check. */
export function anySubscriptionDue(
  subscriptions: readonly ArxivSubscriptionView[],
  nowMs: number,
  gapMs: number = SUBSCRIPTION_AUTO_CHECK_GAP_MS,
): boolean {
  return subscriptions.some(subscription => subscriptionDueForCheck(subscription, nowMs, gapMs))
}
