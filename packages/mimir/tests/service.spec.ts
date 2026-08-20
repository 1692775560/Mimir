/**
 * Behavior tests for the ResearchService Remote methods added with the
 * figures/servers workbench: deleteFigure path confinement, the server CRUD
 * upsert rules, and the two-stage checkServer probe (TCP, then best-effort
 * ssh GPU readout). Real memory-backed domain, real temp workspace, real
 * loopback sockets — no mocks.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
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
  const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-service-'))
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

/** Scaffold the default paper directory with one figure in `figures/`. */
async function scaffoldPaper(workspaceDir: string): Promise<void> {
  const figuresDir = join(workspaceDir, 'paper', 'figures')
  await mkdir(figuresDir, { recursive: true })
  await writeFile(join(figuresDir, 'plot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
}

const SERVER_INPUT = { name: 'gpu01', host: '127.0.0.1', port: 22, username: 'ops', note: 'rack 3' }

describe('ResearchService.deleteFigure', () => {
  it('deletes one figure and reports its relative path', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await scaffoldPaper(workspaceDir)
    const outcome = await service.deleteFigure({ projectId: 'p1', relPath: 'figures/plot.png' })
    expect(outcome).toEqual({ ok: true, value: { relPath: 'figures/plot.png' } })
    const listed = await service.listFigures({ projectId: 'p1' })
    expect(listed).toEqual({ ok: true, value: { figures: [] } })
  })

  it('rejects traversal and non-figure paths without touching the disk', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await scaffoldPaper(workspaceDir)
    await writeFile(join(workspaceDir, 'paper', 'main.tex'), '\\documentclass{article}')
    await expect(service.deleteFigure({ projectId: 'p1', relPath: '../outside.png' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-path' } })
    await expect(service.deleteFigure({ projectId: 'p1', relPath: 'main.tex' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-path' } })
    await expect(service.deleteFigure({ projectId: 'p1', relPath: 'main.pdf' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-path' } })
    // main.tex survived the rejections.
    const source = await service.getPaperSource({ projectId: 'p1' })
    expect(source.ok).toBe(true)
  })

  it('reports figure-not-found for an absent file and project-not-found for an unknown id', async () => {
    const { domain, workspaceDir, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await scaffoldPaper(workspaceDir)
    await expect(service.deleteFigure({ projectId: 'p1', relPath: 'figures/missing.png' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'figure-not-found', relPath: 'figures/missing.png' } })
    await expect(service.deleteFigure({ projectId: 'missing', relPath: 'figures/plot.png' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'project-not-found', projectId: 'missing' } })
  })
})

describe('ResearchService server CRUD', () => {
  it('creates a server with a generated id and lists it back', async () => {
    const { service } = await harness()
    const created = await service.saveServer({ server: SERVER_INPUT })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.server).toMatchObject(SERVER_INPUT)
    expect(created.value.server.id).toMatch(/^srv-/)
    expect(created.value.server.createdAt).toBe(created.value.server.updatedAt)
    const listed = await service.listServers()
    expect(listed).toEqual({ ok: true, value: { servers: [created.value.server] } })
  })

  it('updates keep createdAt and refresh updatedAt', async () => {
    const { service } = await harness()
    const created = await service.saveServer({ server: SERVER_INPUT })
    if (!created.ok) throw new Error('create failed')
    const updated = await service.saveServer({
      server: { ...SERVER_INPUT, id: created.value.server.id, note: 'rack 4' },
    })
    if (!updated.ok) throw new Error('update failed')
    expect(updated.value.server.id).toBe(created.value.server.id)
    expect(updated.value.server.note).toBe('rack 4')
    expect(updated.value.server.createdAt).toBe(created.value.server.createdAt)
    expect(Date.parse(updated.value.server.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.value.server.updatedAt),
    )
  })

  it('rejects invalid input and unknown update ids as business failures', async () => {
    const { service } = await harness()
    for (const server of [
      { ...SERVER_INPUT, name: ' ' },
      { ...SERVER_INPUT, host: '' },
      { ...SERVER_INPUT, port: 0 },
      { ...SERVER_INPUT, port: 65536 },
      { ...SERVER_INPUT, port: 22.5 },
    ]) {
      await expect(service.saveServer({ server })).resolves.toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      })
    }
    await expect(service.saveServer({ server: { ...SERVER_INPUT, id: 'srv-missing' } }))
      .resolves.toMatchObject({ ok: false, error: { code: 'server-not-found', id: 'srv-missing' } })
  })

  it('deletes a server and reports server-not-found on a repeat', async () => {
    const { service } = await harness()
    const created = await service.saveServer({ server: SERVER_INPUT })
    if (!created.ok) throw new Error('create failed')
    const id = created.value.server.id
    await expect(service.deleteServer({ id })).resolves.toEqual({ ok: true, value: { id } })
    await expect(service.deleteServer({ id }))
      .resolves.toMatchObject({ ok: false, error: { code: 'server-not-found', id } })
    await expect(service.listServers()).resolves.toEqual({ ok: true, value: { servers: [] } })
  })
})

describe('ResearchService.checkServer', () => {
  it('settles an unreachable address as offline with the socket message', async () => {
    const { service } = await harness()
    const created = await service.saveServer({
      server: { ...SERVER_INPUT, host: '127.0.0.1', port: 19999 },
    })
    if (!created.ok) throw new Error('create failed')
    const checked = await service.checkServer({ id: created.value.server.id })
    if (!checked.ok) throw new Error('check rejected')
    expect(checked.value.state).toBe('offline')
    expect(checked.value.latencyMs).toBeNull()
    expect(checked.value.gpus).toEqual([])
    expect(checked.value.message).toBeTruthy()
    expect(Date.parse(checked.value.checkedAt)).not.toBeNaN()
  })

  it('reports server-not-found for an unknown id', async () => {
    const { service } = await harness()
    await expect(service.checkServer({ id: 'srv-missing' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'server-not-found', id: 'srv-missing' } })
  })

  it('settles a listening address as online with latency, TCP-only without a username', async () => {
    const listener = createServer()
    await new Promise<void>((resolveListen) => { listener.listen(0, '127.0.0.1', resolveListen) })
    try {
      const port = (listener.address() as AddressInfo).port
      const { service } = await harness()
      const created = await service.saveServer({
        server: { ...SERVER_INPUT, host: '127.0.0.1', port, username: '' },
      })
      if (!created.ok) throw new Error('create failed')
      const checked = await service.checkServer({ id: created.value.server.id })
      if (!checked.ok) throw new Error('check rejected')
      expect(checked.value.state).toBe('online')
      expect(checked.value.latencyMs).toBeGreaterThanOrEqual(0)
      expect(checked.value.gpus).toEqual([])
      expect(checked.value.message).toBeNull()
    } finally {
      await new Promise<void>((resolveClose) => { listener.close(() => { resolveClose() }) })
    }
  })

  it('keeps a reachable server online when the ssh GPU readout fails', async () => {
    const listener = createServer((socket) => { socket.destroy() })
    await new Promise<void>((resolveListen) => { listener.listen(0, '127.0.0.1', resolveListen) })
    try {
      const port = (listener.address() as AddressInfo).port
      const { service } = await harness()
      // A username is set, so the probe attempts ssh against a socket that is
      // not an sshd: the readout fails but the server stays online.
      const created = await service.saveServer({
        server: { ...SERVER_INPUT, host: '127.0.0.1', port },
      })
      if (!created.ok) throw new Error('create failed')
      const checked = await service.checkServer({ id: created.value.server.id })
      if (!checked.ok) throw new Error('check rejected')
      expect(checked.value.state).toBe('online')
      expect(checked.value.gpus).toEqual([])
      expect(checked.value.message).toContain('gpu probe failed')
    } finally {
      await new Promise<void>((resolveClose) => { listener.close(() => { resolveClose() }) })
    }
  }, 20_000)
})
