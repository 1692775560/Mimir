/**
 * Behavior tests for the ResearchService Remote methods added with the
 * figures/servers workbench: deleteFigure path confinement, the server CRUD
 * upsert rules, and the two-stage checkServer probe (TCP, then best-effort
 * ssh GPU readout) — plus the literature-workbench round: searchArxiv input
 * validation and stubbed-fetch outcomes, importPaper upsert idempotence, and
 * removePaper — plus the experiments-workbench round: deleteExperiment. Real
 * memory-backed domain, real temp workspace, real loopback
 * sockets — no mocks (the arXiv API itself is stubbed at `fetch`).
 */

import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'
import { researchWikiDomainSpec } from '../src/store.ts'
import { ResearchService } from '../src/service.ts'
import { parseArxivFeed } from '../src/tools/arxiv.ts'
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

const ARXIV_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2103.00020v2</id>
    <title>EgoSync &amp; Friends: A Study</title>
    <author><name>Doe, Jane</name></author>
    <author><name>Roe, John</name></author>
    <summary>  Multi
   line &lt;abstract&gt; body. </summary>
    <published>2021-03-01T00:00:00Z</published>
  </entry>
</feed>`

const ARXIV_ENTRY = {
  id: '2103.00020v2',
  title: 'EgoSync & Friends: A Study',
  authors: ['Doe, Jane', 'Roe, John'],
  summary: 'Multi line <abstract> body.',
  published: '2021-03-01T00:00:00Z',
  url: 'https://arxiv.org/abs/2103.00020v2',
}

afterEach(() => { vi.unstubAllGlobals() })

describe('parseArxivFeed', () => {
  it('parses entries, unescapes entities, and derives abs urls', () => {
    expect(parseArxivFeed(ARXIV_FEED)).toEqual([ARXIV_ENTRY])
    expect(parseArxivFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([])
  })
})

describe('ResearchService.searchArxiv', () => {
  it('rejects an empty query and a bad maxResults as invalid-input', async () => {
    const { service } = await harness()
    await expect(service.searchArxiv({ query: '   ' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    await expect(service.searchArxiv({ query: 'mesh', maxResults: 0 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    await expect(service.searchArxiv({ query: 'mesh', maxResults: 51 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    await expect(service.searchArxiv({ query: 'mesh', maxResults: 2.5 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })

  it('returns parsed results from a stubbed arXiv feed', async () => {
    let requestedUrl = ''
    vi.stubGlobal('fetch', async (url: string) => {
      requestedUrl = url
      return new Response(ARXIV_FEED, { status: 200 })
    })
    const { service } = await harness()
    const outcome = await service.searchArxiv({ query: 'egocentric whole body', maxResults: 5 })
    expect(outcome).toEqual({ ok: true, value: { results: [ARXIV_ENTRY] } })
    expect(requestedUrl).toContain('search_query=all:egocentric%20whole%20body')
    expect(requestedUrl).toContain('max_results=5')
  })

  it('settles transport and HTTP failures as operation-failed', async () => {
    const { service } = await harness()
    vi.stubGlobal('fetch', async () => new Response('busy', { status: 500 }))
    await expect(service.searchArxiv({ query: 'mesh' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'operation-failed', message: expect.stringContaining('HTTP 500') } })
    vi.stubGlobal('fetch', async () => { throw new Error('socket hangup') })
    await expect(service.searchArxiv({ query: 'mesh' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'operation-failed', message: 'socket hangup' } })
  })
})

describe('ResearchService.importPaper / removePaper', () => {
  it('imports once and treats a re-import as a refresh preserving notes and addedAt', async () => {
    const { domain, service } = await harness()
    const existing = {
      arxivId: ARXIV_ENTRY.id,
      title: 'Old Title',
      authors: ['Doe, Jane'],
      summary: 'old',
      url: 'https://arxiv.org/abs/2103.00020v2',
      notes: 'keep me',
      addedAt: '2026-01-01T00:00:00.000Z',
    }
    await domain.table('papers').put(existing.arxivId, existing)
    const refresh = await service.importPaper({ entry: ARXIV_ENTRY })
    expect(refresh).toEqual({ ok: true, value: { imported: false } })
    expect(domain.table('papers').get(ARXIV_ENTRY.id)).toMatchObject({
      title: ARXIV_ENTRY.title,
      notes: 'keep me',
      addedAt: '2026-01-01T00:00:00.000Z',
    })
    const fresh = await service.importPaper({ entry: { ...ARXIV_ENTRY, id: '2608.00001v1' } })
    expect(fresh).toEqual({ ok: true, value: { imported: true } })
    const listed = await service.listPapers()
    expect(listed.ok && listed.value.papers.length).toBe(2)
  })

  it('rejects an entry with an empty id or title as invalid-input', async () => {
    const { service } = await harness()
    await expect(service.importPaper({ entry: { ...ARXIV_ENTRY, id: '  ' } }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    await expect(service.importPaper({ entry: { ...ARXIV_ENTRY, title: '' } }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })

  it('removes a remembered paper and reports paper-not-found on a repeat', async () => {
    const { service } = await harness()
    await service.importPaper({ entry: ARXIV_ENTRY })
    await expect(service.removePaper({ arxivId: ARXIV_ENTRY.id }))
      .resolves.toEqual({ ok: true, value: { arxivId: ARXIV_ENTRY.id } })
    const listed = await service.listPapers()
    expect(listed).toEqual({ ok: true, value: { papers: [] } })
    await expect(service.removePaper({ arxivId: ARXIV_ENTRY.id }))
      .resolves.toMatchObject({ ok: false, error: { code: 'paper-not-found' } })
  })
})

describe('ResearchService.deleteExperiment', () => {
  it('deletes one experiment and reports experiment-not-found on a repeat', async () => {
    const { domain, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await domain.table('experiments').put('e1', {
      id: 'e1',
      projectId: PROJECT.id,
      name: 'bhx-base',
      status: 'success',
      metrics: { mpjpe: 92.4 },
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    await expect(service.deleteExperiment({ id: 'e1' })).resolves.toEqual({ ok: true, value: { id: 'e1' } })
    await expect(service.listExperiments({ projectId: PROJECT.id }))
      .resolves.toEqual({ ok: true, value: { experiments: [] } })
    await expect(service.deleteExperiment({ id: 'e1' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'experiment-not-found', id: 'e1' } })
  })

  it('does not touch other projects\u2019 experiments', async () => {
    const { domain, service } = await harness()
    await domain.table('experiments').put('e1', {
      id: 'e1',
      projectId: 'other',
      name: 'keep-me',
      status: 'running',
      metrics: {},
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    await expect(service.deleteExperiment({ id: 'missing' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'experiment-not-found', id: 'missing' } })
    const listed = await service.listExperiments({})
    expect(listed).toMatchObject({ ok: true, value: { experiments: [{ id: 'e1' }] } })
  })
})

describe('ResearchService.updatePaper', () => {
  /** Seed one paper with organization fields already set. */
  async function seedPaper(domain: Awaited<ReturnType<typeof harness>>['domain']) {
    await domain.table('papers').put(ARXIV_ENTRY.id, {
      arxivId: ARXIV_ENTRY.id,
      title: ARXIV_ENTRY.title,
      authors: [...ARXIV_ENTRY.authors],
      summary: ARXIV_ENTRY.summary,
      url: ARXIV_ENTRY.url,
      notes: 'existing notes',
      tags: ['baseline'],
      projectIds: [],
      addedAt: '2026-08-01T00:00:00.000Z',
    })
  }

  it('replaces only the provided fields and cleans tags up', async () => {
    const { domain, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await seedPaper(domain)
    const outcome = await service.updatePaper({
      arxivId: ARXIV_ENTRY.id,
      tags: [' mesh-recovery ', 'baseline', '', 'mesh-recovery'],
      projectIds: [PROJECT.id],
    })
    expect(outcome).toMatchObject({
      ok: true,
      value: { paper: { tags: ['mesh-recovery', 'baseline'], projectIds: ['p1'], notes: 'existing notes' } },
    })
    expect(domain.table('papers').get(ARXIV_ENTRY.id)?.tags).toEqual(['mesh-recovery', 'baseline'])
    // Notes untouched by a partial update that omits them.
    const notesOnly = await service.updatePaper({ arxivId: ARXIV_ENTRY.id, notes: 'new notes' })
    expect(notesOnly).toMatchObject({ ok: true, value: { paper: { notes: 'new notes', tags: ['mesh-recovery', 'baseline'] } } })
  })

  it('reports paper-not-found for an unknown arXiv id', async () => {
    const { service } = await harness()
    await expect(service.updatePaper({ arxivId: 'nope', tags: ['x'] }))
      .resolves.toMatchObject({ ok: false, error: { code: 'paper-not-found' } })
  })

  it('rejects links to unknown projects without touching the record', async () => {
    const { domain, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await seedPaper(domain)
    await expect(service.updatePaper({ arxivId: ARXIV_ENTRY.id, projectIds: [PROJECT.id, 'ghost'] }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-input', message: 'unknown project: ghost' } })
    expect(domain.table('papers').get(ARXIV_ENTRY.id)?.projectIds).toEqual([])
  })

  it('re-import refreshes metadata but preserves tags, projectIds, and notes', async () => {
    const { domain, service } = await harness()
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await service.importPaper({ entry: ARXIV_ENTRY })
    await service.updatePaper({ arxivId: ARXIV_ENTRY.id, tags: ['egocentric'], projectIds: [PROJECT.id], notes: 'read it' })
    const again = await service.importPaper({ entry: { ...ARXIV_ENTRY, title: 'New Title' } })
    expect(again).toEqual({ ok: true, value: { imported: false } })
    const stored = domain.table('papers').get(ARXIV_ENTRY.id)
    expect(stored).toMatchObject({ title: 'New Title', tags: ['egocentric'], projectIds: ['p1'], notes: 'read it' })
  })
})

describe('ResearchService bibliography remotes', () => {
  /** Seed two remembered papers and the scaffolded paper directory. */
  async function seedBibFixture(domain: Awaited<ReturnType<typeof harness>>['domain'], workspaceDir: string) {
    await domain.table('projects').put(PROJECT.id, PROJECT)
    await mkdir(join(workspaceDir, 'paper'), { recursive: true })
    await domain.table('papers').put(ARXIV_ENTRY.id, {
      arxivId: ARXIV_ENTRY.id,
      title: ARXIV_ENTRY.title,
      authors: [...ARXIV_ENTRY.authors],
      summary: ARXIV_ENTRY.summary,
      url: ARXIV_ENTRY.url,
      notes: 'baseline notes',
      tags: [],
      projectIds: [],
      addedAt: '2026-08-01T00:00:00.000Z',
    })
    await domain.table('papers').put('1812.01187v1', {
      arxivId: '1812.01187v1',
      title: 'EgoHMR',
      authors: ['Zhang, Wei'],
      summary: '…',
      url: '',
      notes: '',
      tags: [],
      projectIds: [],
      addedAt: '2026-08-02T00:00:00.000Z',
    })
  }

  const BIB_TEXT = '@article{vaswani2017,\n  title = {Attention Is All You Need},\n  year = {2017},\n}\n'

  it('getBibliography reads an absent file as a successful empty list with a null mtime', async () => {
    const { domain, workspaceDir, service } = await harness()
    await seedBibFixture(domain, workspaceDir)
    const outcome = await service.getBibliography({ projectId: 'p1' })
    expect(outcome).toEqual({ ok: true, value: { entries: [], mtimeMs: null } })
    await expect(service.getBibliography({ projectId: 'ghost' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'project-not-found' } })
  })

  it('getBibliography parses an existing file and carries its mtime', async () => {
    const { domain, workspaceDir, service } = await harness()
    await seedBibFixture(domain, workspaceDir)
    await writeFile(join(workspaceDir, 'paper', 'references.bib'), BIB_TEXT)
    const outcome = await service.getBibliography({ projectId: 'p1' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.value.entries).toEqual([
      { key: 'vaswani2017', type: 'article', fields: { title: 'Attention Is All You Need', year: '2017' } },
    ])
    expect(outcome.value.mtimeMs).toBe((await stat(join(workspaceDir, 'paper', 'references.bib'))).mtimeMs)
  })

  it('saveBibliography creates an absent file only with a null base, else conflicts', async () => {
    const { domain, workspaceDir, service } = await harness()
    await seedBibFixture(domain, workspaceDir)
    const bibPath = join(workspaceDir, 'paper', 'references.bib')
    const created = await service.saveBibliography({
      projectId: 'p1',
      entries: [{ key: 'a', type: 'misc', fields: { title: 'T' } }],
      baseMtimeMs: null,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const text = await readFile(bibPath, 'utf8')
    expect(text).toBe('@misc{a,\n  title = {T},\n}\n')
    // A second create-only save now conflicts (the file exists).
    await expect(service.saveBibliography({ projectId: 'p1', entries: [], baseMtimeMs: null }))
      .resolves.toMatchObject({ ok: false, error: { code: 'conflict' } })
    // Saving on the committed base works; a stale base conflicts.
    const saved = await service.saveBibliography({ projectId: 'p1', entries: [], baseMtimeMs: created.value.mtimeMs })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(await readFile(bibPath, 'utf8')).toBe('')
    await expect(service.saveBibliography({ projectId: 'p1', entries: [], baseMtimeMs: created.value.mtimeMs }))
      .resolves.toMatchObject({ ok: false, error: { code: 'conflict', currentMtimeMs: saved.value.mtimeMs } })
  })

  it('saveBibliography reports bib-not-found when a based-on file is gone', async () => {
    const { domain, workspaceDir, service } = await harness()
    await seedBibFixture(domain, workspaceDir)
    await expect(service.saveBibliography({ projectId: 'p1', entries: [], baseMtimeMs: 12345 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'bib-not-found' } })
    // And the paper directory itself must exist.
    const { domain: domain2, service: service2 } = await harness()
    await domain2.table('projects').put(PROJECT.id, PROJECT)
    await expect(service2.saveBibliography({ projectId: 'p1', entries: [], baseMtimeMs: null }))
      .resolves.toMatchObject({ ok: false, error: { code: 'paper-not-found' } })
  })

  it('importPapersToBib appends new keys, skips existing ones, and round-trips the file', async () => {
    const { domain, workspaceDir, service } = await harness()
    await seedBibFixture(domain, workspaceDir)
    const first = await service.importPapersToBib({ projectId: 'p1', arxivIds: [ARXIV_ENTRY.id, '1812.01187v1'] })
    expect(first).toEqual({ ok: true, value: { added: ['210300020v2', '181201187v1'], skipped: [] } })
    const text = await readFile(join(workspaceDir, 'paper', 'references.bib'), 'utf8')
    expect(text).toContain('@misc{210300020v2,')
    expect(text).toContain('eprint = {2103.00020v2}')
    expect(text).toContain('note = {baseline notes}')
    // url falls back to the arXiv abs page when the record carries none.
    expect(text).toContain('url = {https://arxiv.org/abs/1812.01187v1}')
    // A repeat import skips both; a mix adds only the new one.
    const again = await service.importPapersToBib({ projectId: 'p1', arxivIds: [ARXIV_ENTRY.id] })
    expect(again).toEqual({ ok: true, value: { added: [], skipped: ['210300020v2'] } })
    const listed = await service.getBibliography({ projectId: 'p1' })
    expect(listed.ok && listed.value.entries.map(entry => entry.key)).toEqual(['210300020v2', '181201187v1'])
  })

  it('importPapersToBib rejects an unknown arXiv id without writing anything', async () => {
    const { domain, workspaceDir, service } = await harness()
    await seedBibFixture(domain, workspaceDir)
    await expect(service.importPapersToBib({ projectId: 'p1', arxivIds: [ARXIV_ENTRY.id, 'ghost'] }))
      .resolves.toMatchObject({ ok: false, error: { code: 'paper-not-found' } })
    await expect(service.getBibliography({ projectId: 'p1' }))
      .resolves.toEqual({ ok: true, value: { entries: [], mtimeMs: null } })
  })
})
