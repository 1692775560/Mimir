/**
 * Feasibility proof for the CBE habit profile (S6): synthetic event streams
 * with known ground truth, checking that the pure derivation recovers the
 * researcher's rhythm from timestamps alone — session cutting at the map's
 * own gap, hour and weekday buckets, the local-calendar streak, and the I2
 * silence rule below the floor. Hour/weekday assertions are written
 * timezone-agnostically (counts must reconcile with the event total) because
 * "late evening" is read on the host's own clock by design.
 * @module dsh-mimir/tests/habits
 */

import { describe, expect, it } from 'vitest'
import {
  deriveHabits,
  deriveSessions,
  CBE_HABIT_MIN_EVENTS,
  CBE_HABIT_MIN_SESSIONS,
} from '../src/habits.ts'
import { CBE_SESSION_GAP_MINUTES } from '../src/cognitive-map.ts'
import type { EventRecord, LedgerActor, LedgerJsonValue } from '../src/types.ts'

const USER: LedgerActor = { kind: 'user', id: 'panel' }

let seq = 0
function ev(ts: string, action = 'knowledge.idea.added'): EventRecord {
  seq += 1
  return Object.freeze({
    id: `ev-${String(seq).padStart(3, '0')}`,
    ts,
    actor: USER,
    action,
    refs: Object.freeze({}),
    payload: Object.freeze({} as Record<string, LedgerJsonValue>),
  })
}

const MS_PER_MINUTE = 60_000

describe('session cutting', () => {
  it('keeps events inside the session gap together and splits across it', () => {
    const base = Date.parse('2026-08-20T10:00:00.000Z')
    const events = [
      ev(new Date(base).toISOString()),
      ev(new Date(base + 10 * MS_PER_MINUTE).toISOString()),
      ev(new Date(base + (CBE_SESSION_GAP_MINUTES + 30) * MS_PER_MINUTE).toISOString()),
    ]
    const sessions = deriveSessions(events)
    expect(sessions).toHaveLength(2)
    expect(sessions[0]?.eventCount).toBe(2)
    expect(sessions[0]?.minutes).toBe(10)
    expect(sessions[1]?.eventCount).toBe(1)
    expect(sessions[1]?.minutes).toBe(0)
  })

  it('produces one zero-length session for a single event', () => {
    const sessions = deriveSessions([ev('2026-08-20T10:00:00.000Z')])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.minutes).toBe(0)
  })

  it('skips unparseable timestamps rather than misplacing them', () => {
    const sessions = deriveSessions([ev('not-a-date')])
    expect(sessions).toEqual([])
  })
})

describe('habit profile', () => {
  const NOW = Date.parse('2026-08-20T18:00:00.000Z')
  const DAY_MS = 86_400_000
  // Wide enough that locally-built "today" timestamps cannot fall outside it
  // (NOW is a UTC instant whose local calendar day may be the next one).
  const WINDOW_SINCE = new Date(NOW - 10 * DAY_MS).toISOString()
  const WINDOW_UNTIL = new Date(NOW + DAY_MS).toISOString()

  it('reconciles the hour buckets with the event total', () => {
    const base = Date.parse('2026-08-20T09:00:00.000Z')
    const events = [
      ev(new Date(base).toISOString()),
      ev(new Date(base + 5 * MS_PER_MINUTE).toISOString()),
      ev(new Date(base + (CBE_SESSION_GAP_MINUTES + 10) * MS_PER_MINUTE).toISOString()),
      ev(new Date(base + (CBE_SESSION_GAP_MINUTES + 15) * MS_PER_MINUTE).toISOString()),
      ev(new Date(base + 2 * (CBE_SESSION_GAP_MINUTES + 10) * MS_PER_MINUTE).toISOString()),
    ]
    const profile = deriveHabits(events, WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.eventCount).toBe(5)
    const bucketTotal = profile.activeHours.reduce((sum, bucket) => sum + bucket.count, 0)
    expect(bucketTotal).toBe(5)
    // Busiest hour first.
    expect(profile.activeHours[0]?.count).toBeGreaterThanOrEqual(profile.activeHours[1]?.count ?? 0)
  })

  it('emits a full seven-day histogram, Monday first', () => {
    const profile = deriveHabits([ev('2026-08-20T10:00:00.000Z')], WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.weekdayHistogram).toHaveLength(7)
    expect(profile.weekdayHistogram[0]?.weekday).toBe(1)
    expect(profile.weekdayHistogram[6]?.weekday).toBe(0)
    const total = profile.weekdayHistogram.reduce((sum, bucket) => sum + bucket.count, 0)
    expect(total).toBe(1)
  })

  it('counts a consecutive-days streak back from now on the local calendar', () => {
    // Today and yesterday (local), built the same way the derivation reads them.
    const today = new Date(NOW)
    const yesterday = new Date(NOW - DAY_MS)
    const events = [
      ev(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 21, 0).toISOString()),
      ev(new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 21, 0).toISOString()),
    ]
    const profile = deriveHabits(events, WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.activeDays).toBe(2)
    expect(profile.currentStreakDays).toBe(2)
  })

  it('breaks the streak on a gap day instead of pretending today happened', () => {
    const today = new Date(NOW)
    const twoDaysAgo = new Date(NOW - 2 * DAY_MS)
    const events = [
      ev(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 21, 0).toISOString()),
      ev(new Date(twoDaysAgo.getFullYear(), twoDaysAgo.getMonth(), twoDaysAgo.getDate(), 21, 0).toISOString()),
    ]
    const profile = deriveHabits(events, WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.currentStreakDays).toBe(1)
  })

  it('stays silent below the floor while still counting sessions', () => {
    const base = Date.parse('2026-08-20T10:00:00.000Z')
    const events = [
      ev(new Date(base).toISOString()),
      ev(new Date(base + (CBE_SESSION_GAP_MINUTES + 5) * MS_PER_MINUTE).toISOString()),
    ]
    const profile = deriveHabits(events, WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.sessionCount).toBeLessThan(CBE_HABIT_MIN_SESSIONS)
    expect(profile.speaks).toBe(false)
    expect(profile.medianSessionMinutes).toBeNull()
    expect(profile.longestSessionMinutes).toBeNull()
    // The bare counts remain — they are descriptive, not comparative.
    expect(profile.sessionCount).toBe(2)
  })

  it('reports median and longest sitting length once it speaks', () => {
    const base = Date.parse('2026-08-20T10:00:00.000Z')
    const gap = (CBE_SESSION_GAP_MINUTES + 60) * MS_PER_MINUTE
    const events = [
      // Intra-sitting gaps stay at or below the session gap (30 min), so each
      // pair is one sitting; the `gap` separators are well above it.
      ev(new Date(base).toISOString()),
      ev(new Date(base + 20 * MS_PER_MINUTE).toISOString()),
      ev(new Date(base + gap).toISOString()),
      ev(new Date(base + gap + 20 * MS_PER_MINUTE).toISOString()),
      ev(new Date(base + 2 * gap).toISOString()),
      ev(new Date(base + 2 * gap + 30 * MS_PER_MINUTE).toISOString()),
    ]
    expect(events.length).toBeGreaterThanOrEqual(CBE_HABIT_MIN_EVENTS)
    const profile = deriveHabits(events, WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.speaks).toBe(true)
    expect(profile.sessionCount).toBe(3)
    expect(profile.longestSessionMinutes).toBe(30)
    expect(profile.medianSessionMinutes).toBe(20)
  })

  it('ignores events outside the window', () => {
    const events = [
      ev('2026-01-01T10:00:00.000Z'),
      ev('2026-08-20T10:00:00.000Z'),
    ]
    const profile = deriveHabits(events, WINDOW_SINCE, WINDOW_UNTIL, NOW)
    expect(profile.eventCount).toBe(1)
  })
})
