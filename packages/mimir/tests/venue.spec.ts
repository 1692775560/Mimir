/**
 * Behavior tests for the venue-template Remote methods: the built-in registry
 * listing, applyVenueTemplate (built-in brief + custom kit over uploaded
 * files), and clearVenueTemplate. Real memory-backed domain, real temp
 * workspace — no mocks.
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'
import { researchWikiDomainSpec } from '../src/store.ts'
import { ResearchService } from '../src/service.ts'
import type { ProjectRecord } from '../src/types.ts'

/** Boot a service over a memory-backed domain and a fresh temp workspace. */
async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(researchWikiDomainSpec)
  const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-venue-'))
  const service = new ResearchService(ctx, {
    workspaceDir,
    domain,
    latex: { engine: 'auto', timeoutMs: 1000 },
  })
  return { ctx, domain, workspaceDir, service }
}

const PROJECT: ProjectRecord = {
  id: 'p1',
  title: 'Project',
  stage: 'writing',
  artifacts: [],
  reviewRounds: 0,
  updatedAt: '2026-08-20T00:00:00.000Z',
}

describe('listVenueTemplates', () => {
  it('lists the built-in registry with the expected series grouping', async () => {
    const { service } = await harness()
    const result = await service.listVenueTemplates()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.templates.length).toBeGreaterThanOrEqual(10)
    const ids = result.value.templates.map(template => template.id)
    expect(ids).toContain('cvpr')
    expect(ids).toContain('neurips')
    expect(ids).toContain('acl')
    expect(ids).toContain('ieee-conf')
    for (const template of result.value.templates) {
      expect(template.checklist.length).toBeGreaterThan(0)
      expect(template.url.startsWith('https://')).toBe(true)
    }
  })
})

describe('applyVenueTemplate', () => {
  it('applies a built-in venue: writes the brief and records the venue', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await mkdir(join(workspaceDir, 'paper'), { recursive: true })

    const result = await service.applyVenueTemplate({ projectId: 'p1', templateId: 'neurips' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.venue).toMatchObject({ id: 'neurips', custom: false })

    const brief = await readFile(join(workspaceDir, 'paper', 'template', 'TEMPLATE.md'), 'utf8')
    expect(brief).toContain('# Target Venue: NeurIPS')
    expect(brief).toContain('neurips.cc')
    expect(brief).toContain('## Task for the agent')

    const stored = domain.table('projects').get('p1')
    expect(stored?.venue).toMatchObject({ id: 'neurips', name: 'NeurIPS', custom: false })
  })

  it('rejects an unknown template id with invalid-input', async () => {
    const { domain, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const result = await service.applyVenueTemplate({ projectId: 'p1', templateId: 'nope' })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })

  it('rejects an unknown project with project-not-found', async () => {
    const { service } = await harness()
    const result = await service.applyVenueTemplate({ projectId: 'ghost', templateId: 'cvpr' })
    expect(result).toMatchObject({ ok: false, error: { code: 'project-not-found' } })
  })

  it('applies a custom venue over uploaded kit files, listing them in the brief', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const templateDir = join(workspaceDir, 'paper', 'template')
    await mkdir(templateDir, { recursive: true })
    await writeFile(join(templateDir, 'myconf.cls'), '% custom class')
    await writeFile(join(templateDir, 'myconf.sty'), '% custom style')

    const result = await service.applyVenueTemplate({ projectId: 'p1', customName: 'MyConf 2026' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.venue).toMatchObject({ id: 'custom', name: 'MyConf 2026', custom: true })

    const brief = await readFile(join(templateDir, 'TEMPLATE.md'), 'utf8')
    expect(brief).toContain('# Target Venue: MyConf 2026')
    expect(brief).toContain('`template/myconf.cls`')
    expect(brief).toContain('`template/myconf.sty`')
  })

  it('rejects a custom venue with no uploaded kit files', async () => {
    const { domain, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const result = await service.applyVenueTemplate({ projectId: 'p1', customName: 'MyConf 2026' })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })
})

describe('clearVenueTemplate', () => {
  it('clears the venue while keeping the rest of the record intact', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await mkdir(join(workspaceDir, 'paper'), { recursive: true })
    await service.applyVenueTemplate({ projectId: 'p1', templateId: 'acl' })
    expect(domain.table('projects').get('p1')?.venue?.id).toBe('acl')

    const result = await service.clearVenueTemplate({ projectId: 'p1' })
    expect(result.ok).toBe(true)
    const stored = domain.table('projects').get('p1')
    expect(stored?.venue).toBeUndefined()
    expect(stored?.title).toBe(PROJECT.title)
    // The brief stays on disk — clearing never deletes user files.
    const brief = await readFile(join(workspaceDir, 'paper', 'template', 'TEMPLATE.md'), 'utf8')
    expect(brief).toContain('ACL')
  })

  it('rejects an unknown project with project-not-found', async () => {
    const { service } = await harness()
    const result = await service.clearVenueTemplate({ projectId: 'ghost' })
    expect(result).toMatchObject({ ok: false, error: { code: 'project-not-found' } })
  })
})
