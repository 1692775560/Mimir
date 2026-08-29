/**
 * Proof for the digest assembler (S8c): the weekly / monthly / project report
 * as one pure fold over the ledger plus the wiki and the papers table. These
 * tests check the tier depth gradient (which stats, the project-only Mermaid
 * and Eureka table), the PRISMA-style retrieval banner, and the window filter
 * — all without requiring a populated wiki.
 * @module dsh-mimir/tests/report-tier
 */

import { describe, expect, it } from 'vitest'
import { assembleDigest, type CbeDigestTier } from '../src/report-tier.ts'
import type { CbeWikiSnapshot } from '../src/cognitive-map.ts'
import type { EventRecord, LedgerActor, LedgerJsonValue } from '../src/types.ts'

const USER: LedgerActor = { kind: 'user', id: 'panel' }

let seq = 0
function ev(
  ts: string,
  action = 'knowledge.idea.added',
  refs: Partial<EventRecord['refs']> = {},
  payload: Record<string, LedgerJsonValue> = {},
): EventRecord {
  seq += 1
  return Object.freeze({
    id: `ev-${String(seq).padStart(3, '0')}`,
    ts,
    actor: USER,
    action,
    refs: Object.freeze(refs),
    payload: Object.freeze(payload),
  })
}

const EMPTY_WIKI: CbeWikiSnapshot = { ideas: [], claims: [], projects: [] }
const SINCE = '2026-06-01T00:00:00.000Z'
const UNTIL = '2026-06-08T00:00:00.000Z'
const NOW = Date.parse('2026-06-08T12:00:00.000Z')

function digest(tier: CbeDigestTier, events: readonly EventRecord[] = []): ReturnType<typeof assembleDigest> {
  return assembleDigest({ events, wiki: EMPTY_WIKI, papers: [], since: SINCE, until: UNTIL, tier, nowMs: NOW })
}

describe('assembleDigest', () => {
  it('returns a frozen model and an honest retrieval banner on an empty window', () => {
    const r = digest('weekly')
    expect(Object.isFrozen(r)).toBe(true)
    expect(r.retrieval.source).toBe('events 表')
    expect(r.retrieval.eventsHit).toBe(0)
    expect(r.retrieval.eventsTotal).toBe(0)
    // habits / themes / eureka all stay silent without data.
    expect(r.retrieval.silences.length).toBeGreaterThan(0)
  })

  it('weekly overview carries the three light stats; project carries nine', () => {
    const weekly = digest('weekly')
    expect(weekly.overview.map(item => item.key)).toEqual(['events', 'creations', 'pinnedMoments'])

    const project = digest('project')
    expect(project.overview.map(item => item.key)).toEqual([
      'events', 'creations', 'mainlineActive', 'deadBranches', 'papers',
      'pinnedMoments', 'openLoops', 'eurekas', 'longestSession',
    ])
  })

  it('project tier adds the worktree Mermaid; weekly keeps it null', () => {
    const project = digest('project')
    expect(typeof project.mermaid).toBe('string')
    expect(project.mermaid).toContain('gitGraph')
    expect(project.eurekaTable).toEqual([])

    const weekly = digest('weekly')
    expect(weekly.mermaid).toBeNull()
  })

  it('counts only the events that land inside the window', () => {
    const r = digest('weekly', [
      ev('2026-06-02T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
      ev('2026-06-03T00:00:00.000Z', 'experiments.saved', { ideaId: 'i1' }),
      // Outside the [SINCE, UNTIL) window — excluded from the hit count.
      ev('2026-06-20T00:00:00.000Z', 'knowledge.idea.added', { ideaId: 'i1' }),
    ])
    expect(r.retrieval.eventsHit).toBe(2)
    expect(r.retrieval.eventsTotal).toBe(3)
  })

  it('tier-caps the mainline perspective at the weekly depth', () => {
    const lanes = Array.from({ length: 6 }, (_, i) =>
      ev(`2026-06-0${i + 1}T00:00:00.000Z`, 'knowledge.idea.added', { ideaId: `i${i}` }))
    const r = digest('weekly', lanes)
    const mainline = r.perspectives.find(item => item.perspective === 'mainline')
    // Weekly shows at most 3 mainline capsules.
    expect(mainline?.capsules.length ?? 0).toBeLessThanOrEqual(3)
    expect(mainline?.capsules.length ?? 0).toBeGreaterThan(0)
  })
})
