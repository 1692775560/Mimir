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
import { createFigureSaveTool } from '../src/tools/figure.ts'

async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(researchWikiDomainSpec)
  const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-figure-save-'))
  await domain.table('projects').put('p1', { id: 'p1', title: 'P', stage: 'experiment', paperDir: 'paper', artifacts: [], reviewRounds: 0, updatedAt: new Date().toISOString() })
  return { domain, workspaceDir, tool: createFigureSaveTool(workspaceDir, domain) }
}

describe('figure_save', () => {
  it('copies a generated figure and records caption metadata', async () => {
    const { domain, workspaceDir, tool } = await harness()
    const sourceDir = await mkdtemp(join(tmpdir(), 'mimir-generated-'))
    const source = join(sourceDir, 'loss.png')
    await writeFile(source, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const value = await tool.execute({ path: source, project_id: 'p1', caption: 'Training loss' }, {} as ToolRunContext) as Record<string, unknown>
    expect(value).toMatchObject({ ok: true, relPath: 'figures/loss.png' })
    expect(await readFile(join(workspaceDir, 'paper', 'figures', 'loss.png'))).toEqual(await readFile(source))
    expect(domain.table('figures').get('p1:figures/loss.png')).toMatchObject({ caption: 'Training loss', projectId: 'p1' })
    expect(domain.table('projects').get('p1')?.artifacts).toContain('paper/figures/loss.png')
  })

  it('rejects unsupported files and cross-project experiment links', async () => {
    const { domain, workspaceDir, tool } = await harness()
    await mkdir(join(workspaceDir, 'generated'), { recursive: true })
    const text = join(workspaceDir, 'generated', 'notes.txt')
    await writeFile(text, 'nope')
    await expect(tool.execute({ path: text, project_id: 'p1' }, {} as ToolRunContext)).rejects.toThrow('supported image')
    await domain.table('projects').put('p2', { id: 'p2', title: 'P2', stage: 'experiment', artifacts: [], reviewRounds: 0, updatedAt: new Date().toISOString() })
    await domain.table('experiments').put('e2', { id: 'e2', projectId: 'p2', name: 'x', status: 'success', metrics: {}, updatedAt: new Date().toISOString() })
    const image = join(workspaceDir, 'generated', 'plot.svg')
    await writeFile(image, '<svg/>')
    await expect(tool.execute({ path: image, project_id: 'p1', experiment_id: 'e2' }, {} as ToolRunContext)).rejects.toThrow('does not belong')
  })
})
