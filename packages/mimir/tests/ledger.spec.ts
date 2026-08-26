/**
 * Behavior tests for the research ledger (P0-1): event construction and
 * payload capping, the append + query semantics over the wiki's `events`
 * table, the audit-report renderer, and the decision-grade wiring in
 * ResearchService (panel actor) and the wiki_note tool (agent actor). Real
 * memory-backed domain, no mocks.
 */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'
import { researchWikiDomainSpec } from '../src/store.ts'
import type { ResearchWikiDomain } from '../src/store.ts'
import { ResearchService } from '../src/service.ts'
import { createWikiNoteTool } from '../src/tools/wiki.ts'
import {
  appendEvent,
  buildProgressReport,
  listEvents,
  newEvent,
  truncatePayload,
  EVENT_PAYLOAD_MAX_CHARS,
  LIST_EVENTS_MAX_LIMIT,
  PANEL_ACTOR,
  SERVICE_ACTOR,
  WIKI_AGENT_ACTOR,
} from '../src/ledger.ts'
import type { ProjectRecord, ClaimRecord, ExperimentRecord, EventRecord } from '../src/types.ts'

/** Boot one open research-wiki domain over a throwaway memory medium. */
async function domainHarness(): Promise<ResearchWikiDomain> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  return facility.open(researchWikiDomainSpec)
}

/** Boot a service over a memory-backed domain and a fresh temp workspace. */
async function serviceHarness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(researchWikiDomainSpec)
  const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-ledger-'))
  const service = new ResearchService(ctx, {
    workspaceDir,
    domain,
    latex: { engine: 'auto', timeoutMs: 1000 },
  })
  return { domain, workspaceDir, service }
}

const PROJECT: ProjectRecord = {
  id: 'p1',
  title: 'Long-context retrieval',
  stage: 'experiment',
  artifacts: [],
  reviewRounds: 0,
  updatedAt: '2026-08-20T00:00:00.000Z',
}

const CLAIM: ClaimRecord = {
  id: 'c1',
  text: 'Our retriever beats the dense baseline by 12% on the long split.',
  status: 'supported',
  evidence: 'run e3 (mpjpe 92.4 vs 82.0)',
}

const EXPERIMENT: ExperimentRecord = {
  id: 'e1',
  projectId: PROJECT.id,
  name: 'bhx-v2',
  status: 'success',
  metrics: { mpjpe: 92.4 },
  updatedAt: '2026-08-21T00:00:00.000Z',
}

describe('ledger event construction', () => {
  it('builds unique ids for same-millisecond events and carries the given ts', () => {
    const now = new Date('2026-08-24T00:00:00.000Z')
    const first = newEvent({ actor: PANEL_ACTOR, action: 'x.y', now })
    const second = newEvent({ actor: PANEL_ACTOR, action: 'x.y', now })
    expect(first.ts).toBe('2026-08-24T00:00:00.000Z')
    expect(first.id).not.toBe(second.id)
    expect(first.id.startsWith('ev-')).toBe(true)
    expect(first.refs).toEqual({})
    expect(first.payload).toEqual({})
  })

  it('passes a payload under the cap through unchanged', () => {
    const payload = { name: 'run', status: 'success' }
    expect(truncatePayload(payload)).toBe(payload)
  })

  it('truncates an over-cap payload to a marked preview', () => {
    const payload = { blob: 'x'.repeat(EVENT_PAYLOAD_MAX_CHARS + 500) }
    const truncated = truncatePayload(payload)
    expect(truncated['_truncated']).toBe(true)
    expect(typeof truncated['preview']).toBe('string')
    expect(JSON.stringify(truncated).length).toBeLessThan(EVENT_PAYLOAD_MAX_CHARS + 200)
  })
})

describe('ledger append + query', () => {
  it('appends events and orders them by (ts, id)', async () => {
    const domain = await domainHarness()
    const base = new Date('2026-08-01T00:00:00.000Z')
    await appendEvent(domain, { actor: PANEL_ACTOR, action: 'a.first', now: base })
    await appendEvent(domain, { actor: PANEL_ACTOR, action: 'a.second', now: base })
    await appendEvent(domain, { actor: SERVICE_ACTOR, action: 'a.third', now: new Date(base.getTime() + 1000) })
    const all = await listEvents(domain)
    expect(all.map(event => event.action)).toEqual(['a.first', 'a.second', 'a.third'])
  })

  it('filters by project ref, actor kind, action prefix, and time bounds', async () => {
    const domain = await domainHarness()
    const t0 = new Date('2026-08-01T00:00:00.000Z')
    await appendEvent(domain, {
      actor: PANEL_ACTOR, action: 'compute.job.submitted',
      refs: { projectId: 'p1', jobId: 'j1' }, now: t0,
    })
    await appendEvent(domain, {
      actor: WIKI_AGENT_ACTOR, action: 'knowledge.claim.added',
      refs: { projectId: 'p2', claimId: 'c9' }, now: new Date(t0.getTime() + 1000),
    })
    await appendEvent(domain, {
      actor: SERVICE_ACTOR, action: 'compute.job.settled',
      refs: { projectId: 'p1', jobId: 'j1' }, now: new Date(t0.getTime() + 2000),
    })

    const project = await listEvents(domain, { projectId: 'p1' })
    expect(project.map(event => event.action)).toEqual(['compute.job.submitted', 'compute.job.settled'])

    const agents = await listEvents(domain, { actorKind: 'agent' })
    expect(agents.map(event => event.action)).toEqual(['knowledge.claim.added'])

    const compute = await listEvents(domain, { actionPrefix: 'compute.' })
    expect(compute.map(event => event.action)).toEqual(['compute.job.submitted', 'compute.job.settled'])

    // since is inclusive, until exclusive.
    const bounded = await listEvents(domain, {
      since: t0.toISOString(),
      until: new Date(t0.getTime() + 2000).toISOString(),
    })
    expect(bounded.map(event => event.action)).toEqual(['compute.job.submitted', 'knowledge.claim.added'])
  })

  it('orders desc, caps the limit, and rejects illegal limits and bounds', async () => {
    const domain = await domainHarness()
    const base = new Date('2026-08-01T00:00:00.000Z')
    for (let i = 0; i < 5; i += 1) {
      await appendEvent(domain, { actor: PANEL_ACTOR, action: `a.${i}`, now: new Date(base.getTime() + i * 1000) })
    }
    const desc = await listEvents(domain, { order: 'desc', limit: 2 })
    expect(desc.map(event => event.action)).toEqual(['a.4', 'a.3'])
    await expect(listEvents(domain, { limit: 0 })).rejects.toThrow(RangeError)
    await expect(listEvents(domain, { limit: LIST_EVENTS_MAX_LIMIT + 1 })).rejects.toThrow(RangeError)
    await expect(listEvents(domain, { since: 'not-a-date' })).rejects.toThrow(RangeError)
    await expect(listEvents(domain, { until: 'not-a-date' })).rejects.toThrow(RangeError)
  })
})

describe('audit report', () => {
  /** Seed a project, claim, experiment, and a handful of decision-grade events. */
  async function seedReportFixture() {
    const domain = await domainHarness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await domain.table('claims').put(CLAIM.id, CLAIM)
    await domain.table('experiments').put(EXPERIMENT.id, EXPERIMENT)
    await domain.table('claims').put('c2', {
      id: 'c2',
      text: 'The gap closes under longer context.',
      status: 'pending',
      evidence: '',
    })
    const base = new Date('2026-08-20T09:00:00.000Z')
    await appendEvent(domain, {
      actor: WIKI_AGENT_ACTOR, action: 'knowledge.claim.added',
      refs: { projectId: PROJECT.id, claimId: CLAIM.id },
      payload: { text: CLAIM.text }, now: base,
    })
    await appendEvent(domain, {
      actor: WIKI_AGENT_ACTOR, action: 'knowledge.claim.set',
      refs: { projectId: PROJECT.id, claimId: CLAIM.id },
      payload: { status: 'supported', evidence: CLAIM.evidence }, now: new Date(base.getTime() + 60_000),
    })
    await appendEvent(domain, {
      actor: PANEL_ACTOR, action: 'data.wiki.imported',
      payload: { mode: 'replace', destructive: true }, now: new Date(base.getTime() + 120_000),
    })
    await appendEvent(domain, {
      actor: SERVICE_ACTOR, action: 'compute.job.settled',
      refs: { projectId: PROJECT.id, jobId: 'j1', experimentId: EXPERIMENT.id },
      payload: { status: 'succeeded', exitCode: 0, durationMs: 1_200_000 }, now: new Date(base.getTime() + 180_000),
    })
    await appendEvent(domain, {
      actor: { kind: 'subagent', id: 'reviewer' }, action: 'review.round.settled',
      refs: { projectId: PROJECT.id },
      payload: { verdict: 'PASS', issues: 0, scope: 'plan EXPERIMENT_PLAN.md' }, now: new Date(base.getTime() + 240_000),
    })
    return domain
  }

  it('renders summary, risk, claim ledger, runs, and events sections', async () => {
    const domain = await seedReportFixture()
    const markdown = await buildProgressReport(domain, {}, new Date('2026-08-24T00:00:00.000Z'))
    expect(markdown).toContain('# Mimir Research Progress Report')
    expect(markdown).toContain('all projects (1)') // global scope: the whole library
    expect(markdown).toContain('5 event(s)')
    // The TL;DR line: two claim moves, one settled run, one review round,
    // one destructive op — in the 组会 order.
    expect(markdown).toContain(
      '- **TL;DR:** 2 claim updates · 1 run settled (1 succeeded) · 1 review round (PASS) · 1 destructive op',
    )
    // Progress leads: the full timeline, newest first.
    expect(markdown).toContain('## Progress (newest 5 of 5)')
    expect(markdown).toContain('review.round.settled')
    // Learning: the growth — the claim flip and the review verdict.
    expect(markdown).toContain('## Learning & judgment changes')
    expect(markdown).toContain('knowledge.claim.set')
    // Current-state rows.
    expect(markdown).toContain('## Current state')
    expect(markdown).toContain('Claims | supported 1 · pending 1')
    expect(markdown).toContain('Experiments | success 1')
    expect(markdown).toContain('wall 20m0s')
    expect(markdown).toContain('Review rounds | PASS 1')
    expect(markdown).toContain('user/panel')
    // Claim ledger with the last ledgered change (the set_claim flip).
    expect(markdown).toContain('## Claim ledger')
    expect(markdown).toContain('→ supported')
    // Experiments & runs.
    expect(markdown).toContain('## Experiments & runs')
    expect(markdown).toContain('`e1`')
    expect(markdown).toContain('mpjpe=92.4')
    // Destructive ops flagged as the closing risk footnote.
    expect(markdown).toContain('## Destructive & high-risk operations')
    expect(markdown).toContain('`data.wiki.imported`')
    // Growth-first ordering: progress → learning → state → risk footnote.
    expect(markdown.indexOf('## Progress')).toBeLessThan(markdown.indexOf('## Learning & judgment changes'))
    expect(markdown.indexOf('## Learning & judgment changes')).toBeLessThan(markdown.indexOf('## Current state'))
    expect(markdown.indexOf('## Current state')).toBeLessThan(markdown.indexOf('## Destructive & high-risk operations'))
  })

  it('scopes to one project and to a time window', async () => {
    const domain = await seedReportFixture()
    // A second project with its own event outside p1's scope.
    await domain.table('projects').put('p2', { ...PROJECT, id: 'p2', title: 'Other' })
    await appendEvent(domain, {
      actor: PANEL_ACTOR, action: 'literature.paper.imported',
      refs: { projectId: 'p2', paperId: 'x1' },
      now: new Date('2026-08-20T10:00:00.000Z'),
    })
    const scoped = await buildProgressReport(domain, { projectId: 'p1' })
    expect(scoped).toContain('Long-context retrieval (p1)')
    expect(scoped).not.toContain('literature.paper.imported')
    // A window before all the activity contains no events at all.
    const empty = await buildProgressReport(domain, {
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-02-01T00:00:00.000Z',
    })
    expect(empty).toContain('0 event(s)')
    expect(empty).toContain('quiet window — no decision-grade events')
    expect(empty).toContain('_no activity in window_')
    // A window after the fixture activity keeps only p2's event — the
    // weekly-组会 shape: one literature/writing move in the TL;DR.
    const tight = await buildProgressReport(domain, {
      since: '2026-08-20T09:30:00.000Z',
      until: '2026-08-20T10:30:00.000Z',
    })
    expect(tight).toContain('1 event(s)')
    expect(tight).toContain('- **TL;DR:** 1 literature/writing event')
    expect(tight).toContain('literature.paper.imported')
  })

  it('reports an empty ledger cleanly', async () => {
    const domain = await domainHarness()
    const markdown = await buildProgressReport(domain, {})
    expect(markdown).toContain('all projects (0)')
    expect(markdown).toContain('quiet window — no decision-grade events')
    expect(markdown).toContain('_no activity in window_')
    expect(markdown).toContain('_no judgment changes in window_')
    expect(markdown).toContain('_no claims recorded_')
    expect(markdown).toContain('_no experiment runs recorded_')
    expect(markdown).toContain('_none in window_')
  })
})

describe('ResearchService ledger wiring (panel actor)', () => {
  it('saveExperiment appends experiments.saved with refs and a create flag', async () => {
    const { domain, service } = await serviceHarness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const created = await service.saveExperiment({
      experiment: { projectId: PROJECT.id, name: 'bhx-v2', status: 'running', metrics: { mpjpe: 88.1 } },
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('unreachable')
    const events = await listEvents(domain, { actionPrefix: 'experiments.' })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'experiments.saved',
      actor: { kind: 'user', id: 'panel' },
      refs: { projectId: PROJECT.id, experimentId: created.value.experiment.id },
      payload: { name: 'bhx-v2', status: 'running', created: true, metricCount: 1 },
    })
  })

  it('deleteExperiment marks the ledger row destructive', async () => {
    const { domain, service } = await serviceHarness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await domain.table('experiments').put(EXPERIMENT.id, EXPERIMENT)
    await expect(service.deleteExperiment({ id: EXPERIMENT.id })).resolves.toMatchObject({ ok: true })
    const events = await listEvents(domain, { actionPrefix: 'experiments.' })
    expect(events[0]).toMatchObject({
      action: 'experiments.deleted',
      refs: { experimentId: EXPERIMENT.id, projectId: PROJECT.id },
      payload: { name: 'bhx-v2', destructive: true },
    })
  })

  it('importWiki in replace mode is ledgered as destructive', async () => {
    const { domain, service } = await serviceHarness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const outcome = await service.importWiki({
      snapshot: {
        format: 'mimir-wiki',
        version: 2,
        exportedAt: '2026-08-20T00:00:00.000Z',
        tables: {
          papers: [], ideas: [], claims: [], projects: [], experiments: [], servers: [], figures: [],
        },
      },
      mode: 'replace',
      confirmReplace: true,
    })
    expect(outcome.ok).toBe(true)
    const events = await listEvents(domain, { actionPrefix: 'data.' })
    expect(events[0]).toMatchObject({
      action: 'data.wiki.imported',
      payload: { mode: 'replace', destructive: true },
    })
  })

  it('submitJob ledgeres the submit, and the settle lands as a system event', async () => {
    const { domain, service } = await serviceHarness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await domain.table('experiments').put(EXPERIMENT.id, EXPERIMENT)
    const server = await service.saveServer({
      server: { name: 'gpu01', host: '127.0.0.1', port: 19999, username: 'ops', note: '' },
    })
    if (!server.ok) throw new Error('server create failed')
    const submitted = await service.submitJob({
      serverId: server.value.server.id,
      command: 'echo settle-me',
      experimentId: EXPERIMENT.id,
    })
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) throw new Error('unreachable')
    // The submit event is durable before runJob even starts.
    const submits = (await listEvents(domain, {})).filter(event => event.action === 'compute.job.submitted')
    expect(submits).toHaveLength(1)
    expect(submits[0]).toMatchObject({
      refs: { jobId: submitted.value.job.id, serverId: server.value.server.id, experimentId: EXPERIMENT.id },
      payload: { command: 'echo settle-me' },
    })
    // Wait for the background settle (a closed port / absent ssh fails fast).
    const deadline = Date.now() + 20_000
    let settled: EventRecord | undefined
    for (;;) {
      settled = (await listEvents(domain, {})).find(event => event.action === 'compute.job.settled')
      if (settled !== undefined) break
      if (Date.now() > deadline) throw new Error('job did not settle in time')
      await new Promise(resolve => { setTimeout(resolve, 100) })
    }
    expect(settled).toMatchObject({
      actor: { kind: 'system', id: 'service' },
      refs: { jobId: submitted.value.job.id },
    })
    expect(typeof settled?.payload['durationMs']).toBe('number')
  }, 30_000)

  it('generateProgressReport scopes to a project and rejects an unknown id', async () => {
    const { domain, service } = await serviceHarness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await service.saveExperiment({
      experiment: { projectId: PROJECT.id, name: 'bhx-v2', status: 'success', metrics: {} },
    })
    const scoped = await service.generateProgressReport({ projectId: PROJECT.id })
    expect(scoped.ok).toBe(true)
    if (!scoped.ok) throw new Error('unreachable')
    expect(scoped.value.markdown).toContain('Long-context retrieval (p1)')
    expect(scoped.value.eventCount).toBeGreaterThanOrEqual(1)
    await expect(service.generateProgressReport({ projectId: 'ghost' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'project-not-found' } })
  })

  it('listEvents validates runtime input', async () => {
    const { service } = await serviceHarness()
    await expect(service.listEvents({ actorKind: 'ghost' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    await expect(service.listEvents({ order: 'sideways' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    await expect(service.listEvents({ limit: 99999 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    const ok = await service.listEvents({})
    expect(ok).toEqual({ ok: true, value: { events: [] } })
  })
})

describe('wiki_note ledger wiring (agent actor)', () => {
  /** The tool's execute needs a ToolRunContext it never reads in these paths. */
  const NO_EXEC = {} as ToolRunContext

  async function run(domain: ResearchWikiDomain, args: Record<string, unknown>) {
    const tool = createWikiNoteTool(domain)
    return await tool.execute(args, NO_EXEC) as Record<string, unknown>
  }

  it('set_claim ledgeres the transition with the claim ref', async () => {
    const domain = await domainHarness()
    await domain.table('claims').put(CLAIM.id, CLAIM)
    const outcome = await run(domain, {
      action: 'set_claim', id: CLAIM.id, status: 'invalidated', evidence: 'run e7 contradicts',
    })
    expect(outcome).toMatchObject({ ok: true, status: 'invalidated' })
    const events = await listEvents(domain, { actionPrefix: 'knowledge.claim.' })
    expect(events[0]).toMatchObject({
      action: 'knowledge.claim.set',
      actor: { kind: 'agent', id: 'wiki_note' },
      refs: { claimId: CLAIM.id },
      payload: { status: 'invalidated', evidence: 'run e7 contradicts' },
    })
  })

  it('fail_idea ledgeres the failure with the reason', async () => {
    const domain = await domainHarness()
    await domain.table('ideas').put('i1', {
      id: 'i1',
      title: 'Retrieval-free decoding',
      hypothesis: 'It works without retrieval.',
      status: 'active',
      createdAt: '2026-08-01T00:00:00.000Z',
    })
    const outcome = await run(domain, {
      action: 'fail_idea', id: 'i1', reason: 'collapses without retrieval on long splits',
    })
    expect(outcome).toMatchObject({ ok: true, status: 'failed' })
    const events = await listEvents(domain, { actionPrefix: 'knowledge.idea.' })
    expect(events[0]).toMatchObject({
      action: 'knowledge.idea.failed',
      actor: { kind: 'agent', id: 'wiki_note' },
      refs: { ideaId: 'i1' },
      payload: { reason: 'collapses without retrieval on long splits' },
    })
  })
})
