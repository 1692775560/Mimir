/**
 * Behavior tests for the `wiki_note` tool's project/experiment write actions:
 * schema-guarded validation (unknown ids, bad status enums), the paperDir
 * pointer, and the experiment record lifecycle.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'
import { researchWikiDomainSpec } from '../src/store.ts'
import type { ResearchWikiDomain } from '../src/store.ts'
import { createWikiNoteTool } from '../src/tools/wiki.ts'
import type { ProjectRecord } from '../src/types.ts'

/** Boot a context with the storage hub, one memory backend, and a domain facility over it. */
async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  return facility.open(researchWikiDomainSpec)
}

const PROJECT: ProjectRecord = {
  id: 'p1',
  title: 'Project',
  stage: 'experiment',
  artifacts: [],
  reviewRounds: 0,
  updatedAt: '2026-08-20T00:00:00.000Z',
}

/** The tool's execute needs a ToolRunContext it never reads in these paths. */
const NO_EXEC = {} as ToolRunContext

/** Execute one wiki_note action against one domain. */
async function run(domain: ResearchWikiDomain, args: Record<string, unknown>) {
  const tool = createWikiNoteTool(domain)
  return await tool.execute(args, NO_EXEC) as Record<string, unknown>
}

describe('wiki_note project/experiment actions', () => {
  it('set_project points a project at its paper directory', async () => {
    const domain = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const outcome = await run(domain, { action: 'set_project', id: 'p1', paper_dir: 'ego-wholebody-paper' })
    expect(outcome).toMatchObject({ ok: true, table: 'projects', id: 'p1' })
    expect(domain.table('projects').get('p1')?.paperDir).toBe('ego-wholebody-paper')
    await expect(run(domain, { action: 'set_project', id: 'missing', paper_dir: 'x' }))
      .rejects.toThrow("no project with id 'missing'")
  })

  it('add_experiment requires an existing project and validates the status', async () => {
    const domain = await harness()
    await expect(run(domain, { action: 'add_experiment', project_id: 'p1', name: 'baseline' }))
      .rejects.toThrow("no project with id 'p1'")
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await expect(run(domain, { action: 'add_experiment', project_id: 'p1', name: 'baseline', status: 'bogus' }))
      .rejects.toThrow('running|success|failed')
    const outcome = await run(domain, {
      action: 'add_experiment',
      project_id: 'p1',
      name: 'baseline',
      metrics: { accuracy: 0.91, note: 'seed 42' },
      log_path: 'logs/baseline.log',
    }) as { ok: true; id: string }
    const stored = domain.table('experiments').get(outcome.id)
    expect(stored).toMatchObject({
      projectId: 'p1',
      name: 'baseline',
      status: 'running',
      metrics: { accuracy: 0.91, note: 'seed 42' },
      logPath: 'logs/baseline.log',
    })
  })

  it('set_experiment updates only the provided fields', async () => {
    const domain = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const added = await run(domain, { action: 'add_experiment', project_id: 'p1', name: 'baseline' }) as { id: string }
    await run(domain, { action: 'set_experiment', id: added.id, status: 'success', metrics: { accuracy: 0.93 } })
    expect(domain.table('experiments').get(added.id)).toMatchObject({
      name: 'baseline',
      status: 'success',
      metrics: { accuracy: 0.93 },
    })
    await expect(run(domain, { action: 'set_experiment', id: 'missing', status: 'failed' }))
      .rejects.toThrow("no experiment with id 'missing'")
  })
})
