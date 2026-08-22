/**
 * Behavior tests for the `figure_save` tool and the figures metadata plumbing:
 * the tool copies a generated image into the project's paper `figures/`
 * directory and writes the wiki `figures` row (caption, linked experiment,
 * origin path); `listFigures` merges that metadata into the file scan and
 * `deleteFigure` drops the row with the file. Memory-backed domain, real temp
 * directories, no mocks.
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
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
import { createFigureSaveTool } from '../src/tools/figure.ts'
import { ResearchService } from '../src/service.ts'
import type { ProjectRecord } from '../src/types.ts'

/** Boot a memory-backed domain plus a fresh temp workspace and service. */
async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(researchWikiDomainSpec)
  const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-figure-'))
  const service = new ResearchService(ctx, {
    workspaceDir,
    domain,
    latex: { engine: 'auto', timeoutMs: 1000 },
  })
  return { domain, workspaceDir, service }
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

const PIXELS = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])

/** Execute one figure_save call against one domain + workspace. */
async function run(domain: ResearchWikiDomain, workspaceDir: string, args: Record<string, unknown>) {
  const tool = createFigureSaveTool(domain, workspaceDir)
  return await tool.execute(args, NO_EXEC) as Record<string, unknown>
}

describe('figure_save', () => {
  it('copies the image into figures/ and records caption + experiment', async () => {
    const { domain, workspaceDir } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await domain.table('experiments').put('e1', {
      id: 'e1', projectId: 'p1', name: 'run one', status: 'success', metrics: {}, updatedAt: '2026-08-20T00:00:00.000Z',
    })
    const scratch = join(workspaceDir, 'scratch', 'curve.png')
    await mkdir(join(workspaceDir, 'scratch'), { recursive: true })
    await writeFile(scratch, PIXELS)
    const outcome = await run(domain, workspaceDir, {
      project_id: 'p1', source_path: 'scratch/curve.png', caption: 'Training curve', experiment_id: 'e1',
    })
    expect(outcome['ok']).toBe(true)
    expect(outcome['relPath']).toBe('figures/curve.png')
    expect(String(outcome['latex'])).toContain('\\includegraphics[width=0.8\\linewidth]{figures/curve.png}')
    expect(String(outcome['latex'])).toContain('\\caption{Training curve}')
    // The file really landed under the paper directory.
    expect(await readFile(join(workspaceDir, 'paper', 'figures', 'curve.png'))).toEqual(PIXELS)
    expect(domain.table('figures').get('p1:figures/curve.png')).toMatchObject({
      projectId: 'p1',
      relPath: 'figures/curve.png',
      caption: 'Training curve',
      experimentId: 'e1',
    })
  })

  it('renames on request and keeps createdAt/experimentId on a re-save', async () => {
    const { domain, workspaceDir } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await domain.table('experiments').put('e1', {
      id: 'e1', projectId: 'p1', name: 'run one', status: 'success', metrics: {}, updatedAt: '2026-08-20T00:00:00.000Z',
    })
    const scratch = join(workspaceDir, 'out.png')
    await writeFile(scratch, PIXELS)
    const first = await run(domain, workspaceDir, {
      project_id: 'p1', source_path: scratch, name: 'loss.png', caption: 'v1', experiment_id: 'e1',
    })
    expect(first['relPath']).toBe('figures/loss.png')
    const createdAt = domain.table('figures').get('p1:figures/loss.png')?.createdAt
    // Re-save without experiment_id: the link and the original createdAt survive.
    const second = await run(domain, workspaceDir, {
      project_id: 'p1', source_path: scratch, name: 'loss.png', caption: 'v2',
    })
    expect(second['caption']).toBe('v2')
    const record = domain.table('figures').get('p1:figures/loss.png')
    expect(record).toMatchObject({ caption: 'v2', experimentId: 'e1', createdAt })
  })

  it('rejects unknown projects, missing sources, bad names, and unknown experiments', async () => {
    const { domain, workspaceDir } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const scratch = join(workspaceDir, 'out.png')
    await writeFile(scratch, PIXELS)
    await expect(run(domain, workspaceDir, { project_id: 'missing', source_path: scratch }))
      .rejects.toThrow("no project with id 'missing'")
    await expect(run(domain, workspaceDir, { project_id: 'p1', source_path: 'nope.png' }))
      .rejects.toThrow('source file not found')
    await expect(run(domain, workspaceDir, { project_id: 'p1', source_path: scratch, name: '../evil.png' }))
      .rejects.toThrow('plain figure file name')
    await expect(run(domain, workspaceDir, { project_id: 'p1', source_path: scratch, name: 'notes.txt' }))
      .rejects.toThrow('plain figure file name')
    await expect(run(domain, workspaceDir, { project_id: 'p1', source_path: scratch, experiment_id: 'nope' }))
      .rejects.toThrow("no experiment with id 'nope'")
    // Nothing was written by the rejected calls.
    expect([...domain.table('figures').entries()]).toEqual([])
  })
})

describe('figures metadata in the workbench service', () => {
  it('listFigures merges the saved caption and experiment into the scan', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await run(domain, workspaceDir, { project_id: 'p1', source_path: await seedScratch(workspaceDir), caption: 'Ablation bars' })
    const outcome = await service.listFigures({ projectId: 'p1' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error('unreachable')
    expect(outcome.value.figures).toHaveLength(1)
    expect(outcome.value.figures[0]).toMatchObject({
      relPath: 'figures/curve.png',
      caption: 'Ablation bars',
    })
  })

  it('deleteFigure drops the metadata row with the file', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await run(domain, workspaceDir, { project_id: 'p1', source_path: await seedScratch(workspaceDir), caption: 'curve' })
    const outcome = await service.deleteFigure({ projectId: 'p1', relPath: 'figures/curve.png' })
    expect(outcome).toEqual({ ok: true, value: { relPath: 'figures/curve.png' } })
    expect(domain.table('figures').get('p1:figures/curve.png')).toBeUndefined()
    const listed = await service.listFigures({ projectId: 'p1' })
    expect(listed).toEqual({ ok: true, value: { figures: [] } })
  })
})

/** Write one scratch PNG into the workspace and return its relative path. */
async function seedScratch(workspaceDir: string): Promise<string> {
  const scratch = join(workspaceDir, 'curve.png')
  await writeFile(scratch, PIXELS)
  return 'curve.png'
}
