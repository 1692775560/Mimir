/**
 * Behavior tests for the research panel controller: list loading and retry,
 * per-project outline loads with supersede semantics, the compile state
 * machine (running collapse, business failure, carrier failure), and the
 * source editor's autosave/auto-compile/conflict orchestration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DEBOUNCE_MS, COMPILE_DEBOUNCE_MS, ResearchController } from '../src/client/controller.ts'
import type { ResearchRemote } from '../src/client/controller.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ResearchArtifactResult,
  ResearchCheckServerResult,
  ResearchCompileResult,
  ResearchCompileStatusResult,
  ResearchDeleteFigureResult,
  ResearchDeleteServerResult,
  ResearchExperimentsResult,
  ResearchFiguresResult,
  ResearchImportPaperResult,
  ResearchListProjectsResult,
  ResearchListServersResult,
  ResearchOutlineResult,
  ResearchPaperSourceResult,
  ResearchPapersResult,
  ResearchRemovePaperResult,
  ResearchSavePaperSourceResult,
  ResearchSaveServerResult,
  ResearchSearchArxivResult,
} from 'dsh-mimir/types'

/** Wrap one business result in the carrier's success branch. */
function carried<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

/** One deferred promise for driving in-flight Remote calls. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const PROJECTS: ResearchListProjectsResult = {
  ok: true,
  value: {
    projects: [
      { id: 'p1', title: 'Paper One', stage: 'writing', reviewRounds: 2, updatedAt: '2026-08-01T00:00:00Z', artifacts: [] },
    ],
  },
}

/** Build a remote stub; unspecified calls reject, which no test path reaches. */
function stubRemote(overrides: Partial<ResearchRemote>): ResearchRemote {
  const missing = (name: string) => () => Promise.reject(new Error(`unexpected ${name} call`))
  return {
    listProjects: missing('listProjects'),
    getPaperOutline: missing('getPaperOutline'),
    compile: missing('compile'),
    getCompileStatus: missing('getCompileStatus'),
    getPaperSource: missing('getPaperSource'),
    savePaperSource: missing('savePaperSource'),
    listPapers: missing('listPapers'),
    searchArxiv: missing('searchArxiv'),
    importPaper: missing('importPaper'),
    removePaper: missing('removePaper'),
    listExperiments: missing('listExperiments'),
    readArtifact: missing('readArtifact'),
    listFigures: missing('listFigures'),
    deleteFigure: missing('deleteFigure'),
    listServers: missing('listServers'),
    saveServer: missing('saveServer'),
    deleteServer: missing('deleteServer'),
    checkServer: missing('checkServer'),
    ...overrides,
  }
}

const IDLE: ResearchCompileStatusResult = {
  ok: true,
  value: { state: 'idle', issues: [], engine: null, pdfUpdatedAt: null },
}

describe('ResearchController', () => {
  it('starts cold and loads the project list on ensure', async () => {
    const controller = new ResearchController(stubRemote({
      listProjects: () => Promise.resolve(carried(PROJECTS)),
    }))
    expect(controller.getSnapshot().projectsStatus).toBe('cold')
    controller.ensure()
    expect(controller.getSnapshot().projectsStatus).toBe('loading')
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getSnapshot().projectsStatus).toBe('ready')
    expect(controller.getSnapshot().projects.map(p => p.id)).toEqual(['p1'])
  })

  it('keeps a failed list load retryable', async () => {
    let calls = 0
    const controller = new ResearchController(stubRemote({
      listProjects: () => {
        calls += 1
        return calls === 1
          ? Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'host down', details: {} } })
          : Promise.resolve(carried(PROJECTS))
      },
    }))
    controller.ensure()
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getSnapshot().projectsStatus).toBe('error')
    expect(controller.getSnapshot().projectsFailure?.code).toBe('unavailable')
    controller.ensure()
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getSnapshot().projectsStatus).toBe('ready')
  })

  it('loads the selected project outline and its last compile status', async () => {
    const controller = new ResearchController(stubRemote({
      getPaperOutline: ({ projectId }) => Promise.resolve(carried<ResearchOutlineResult>({
        ok: true,
        value: { projectId, nodes: [{ level: 1, title: 'Intro', line: 3, children: [] }] },
      })),
      getCompileStatus: () => Promise.resolve(carried(IDLE)),
    }))
    controller.select('p1')
    expect(controller.getSnapshot().outline?.status).toBe('loading')
    await Promise.resolve()
    await Promise.resolve()
    const view = controller.getSnapshot()
    expect(view.outline?.status).toBe('ready')
    expect(view.outline?.nodes[0]?.title).toBe('Intro')
    expect(view.compile).toMatchObject({ projectId: 'p1', state: 'idle' })
  })

  it('maps a missing paper to the paper-not-found outline failure', async () => {
    const controller = new ResearchController(stubRemote({
      getPaperOutline: () => Promise.resolve(carried<ResearchOutlineResult>({
        ok: false,
        error: { code: 'paper-not-found' },
      })),
      getCompileStatus: () => Promise.resolve(carried(IDLE)),
    }))
    controller.select('p1')
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getSnapshot().outline).toMatchObject({
      status: 'error',
      failure: { code: 'paper-not-found' },
    })
  })

  it('discards a superseded outline reply', async () => {
    const slow = deferred<RemoteResult<ResearchOutlineResult>>()
    const controller = new ResearchController(stubRemote({
      getPaperOutline: ({ projectId }) => projectId === 'p1'
        ? slow.promise
        : Promise.resolve(carried<ResearchOutlineResult>({ ok: true, value: { projectId, nodes: [] } })),
      getCompileStatus: () => Promise.resolve(carried(IDLE)),
    }))
    controller.select('p1')
    controller.select('p2')
    slow.resolve(carried({ ok: true, value: { projectId: 'p1', nodes: [{ level: 1, title: 'Stale', line: 1, children: [] }] } }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getSnapshot().outline?.projectId).toBe('p2')
  })

  it('runs a compile to its settled ok state with the pdf timestamp', async () => {
    const controller = new ResearchController(stubRemote({
      compile: () => Promise.resolve(carried<ResearchCompileResult>({
        ok: true,
        value: { state: 'ok', issues: [], engine: null, pdfUpdatedAt: 1724000000000 },
      })),
    }))
    const done = controller.compile('p1')
    expect(controller.getSnapshot().compile.state).toBe('running')
    await done
    expect(controller.getSnapshot().compile).toMatchObject({
      projectId: 'p1',
      state: 'ok',
      pdfUpdatedAt: 1724000000000,
    })
  })

  it('queues a second compile while one is running', async () => {
    const run = deferred<RemoteResult<ResearchCompileResult>>()
    let calls = 0
    const controller = new ResearchController(stubRemote({
      compile: () => { calls += 1; return run.promise },
    }))
    const first = controller.compile('p1')
    await controller.compile('p1')
    expect(calls).toBe(1)
    run.resolve(carried({ ok: true, value: { state: 'ok', issues: [], engine: null, pdfUpdatedAt: 1 } }))
    await first
    await Promise.resolve()
    await Promise.resolve()
    // The queued request fires as soon as the in-flight run settles.
    expect(calls).toBe(2)
    expect(controller.getSnapshot().compile.state).toBe('ok')
  })

  it('surfaces a missing engine as an error state with the host message', async () => {
    const controller = new ResearchController(stubRemote({
      compile: () => Promise.resolve(carried<ResearchCompileResult>({
        ok: false,
        error: { code: 'operation-failed', message: "LaTeX engine 'latexmk' was not found on PATH" },
      })),
    }))
    await controller.compile('p1')
    const view = controller.getSnapshot().compile
    expect(view.state).toBe('error')
    expect(view.issues[0]?.message).toContain('latexmk')
  })
})

describe('ResearchController source editing', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** A settled source-read reply. */
  const sourceOk = (content: string, mtimeMs: number): ResearchPaperSourceResult => ({
    ok: true,
    value: { content, mtimeMs },
  })

  /** Stubs for the reads every select() fires, so a test only wires what it asserts. */
  const selectReads = {
    getPaperOutline: ({ projectId }: { projectId: string }) => Promise.resolve(
      carried<ResearchOutlineResult>({ ok: true, value: { projectId, nodes: [] } }),
    ),
    getCompileStatus: () => Promise.resolve(carried(IDLE)),
  }

  it('loads the paper source for the selected project', async () => {
    const controller = new ResearchController(stubRemote({
      ...selectReads,
      getPaperSource: () => Promise.resolve(carried(sourceOk('\\documentclass{article}', 1000))),
    }))
    controller.select('p1')
    expect(controller.getSnapshot().source?.status).toBe('loading')
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getSnapshot().source).toMatchObject({
      projectId: 'p1',
      status: 'ready',
      content: '\\documentclass{article}',
      mtimeMs: 1000,
      saveState: 'clean',
    })
  })

  it('autosaves after the debounce, updates the mtime, and schedules the compile', async () => {
    const saved: Array<{ projectId: string; content: string; baseMtimeMs: number }> = []
    let compiles = 0
    const controller = new ResearchController(stubRemote({
      ...selectReads,
      getPaperSource: () => Promise.resolve(carried(sourceOk('v1', 1000))),
      savePaperSource: (request) => {
        saved.push(request)
        return Promise.resolve(carried<ResearchSavePaperSourceResult>({ ok: true, value: { mtimeMs: 2000 } }))
      },
      compile: () => {
        compiles += 1
        return Promise.resolve(carried<ResearchCompileResult>({
          ok: true, value: { state: 'ok', issues: [], engine: null, pdfUpdatedAt: 5 },
        }))
      },
    }))
    controller.select('p1')
    await vi.advanceTimersByTimeAsync(0)
    controller.edit('v1 edited')
    expect(controller.getSnapshot().source?.saveState).toBe('dirty')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1)
    expect(saved).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(saved).toEqual([{ projectId: 'p1', content: 'v1 edited', baseMtimeMs: 1000 }])
    expect(controller.getSnapshot().source).toMatchObject({ saveState: 'saved', mtimeMs: 2000 })
    expect(compiles).toBe(0)
    await vi.advanceTimersByTimeAsync(COMPILE_DEBOUNCE_MS)
    expect(compiles).toBe(1)
    expect(controller.getSnapshot().compile.state).toBe('ok')
  })

  it('keeps the draft on conflict, ignores edits, and reloads the agent version', async () => {
    let reads = 0
    const controller = new ResearchController(stubRemote({
      ...selectReads,
      getPaperSource: () => {
        reads += 1
        return Promise.resolve(carried(sourceOk(reads === 1 ? 'mine' : 'agent v2', reads * 1000)))
      },
      savePaperSource: () => Promise.resolve(carried<ResearchSavePaperSourceResult>({
        ok: false,
        error: { code: 'conflict', currentMtimeMs: 2000 },
      })),
    }))
    controller.select('p1')
    await vi.advanceTimersByTimeAsync(0)
    controller.edit('my draft')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    expect(controller.getSnapshot().source).toMatchObject({ saveState: 'conflict', content: 'my draft' })
    // A conflicted draft is frozen until the reload resolves it.
    controller.edit('ignored')
    expect(controller.getSnapshot().source?.content).toBe('my draft')
    controller.reloadSource()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.getSnapshot().source).toMatchObject({
      status: 'ready', content: 'agent v2', mtimeMs: 2000, saveState: 'clean',
    })
  })

  it('forwards the selected project paperDir to every paper call', async () => {
    const seen: unknown[] = []
    const controller = new ResearchController(stubRemote({
      listProjects: () => Promise.resolve(carried<ResearchListProjectsResult>({
        ok: true,
        value: {
          projects: [{
            id: 'p1', title: 'Paper One', stage: 'writing',
            paperDir: 'ego-wholebody-paper', reviewRounds: 0, updatedAt: '2026-08-01T00:00:00Z', artifacts: [],
          }],
        },
      })),
      getPaperOutline: (request) => {
        seen.push(['outline', request])
        return Promise.resolve(carried<ResearchOutlineResult>({
          ok: true, value: { projectId: request.projectId, nodes: [] },
        }))
      },
      getCompileStatus: () => Promise.resolve(carried(IDLE)),
      getPaperSource: (request) => {
        seen.push(['source', request])
        return Promise.resolve(carried(sourceOk('v1', 1000)))
      },
      savePaperSource: (request) => {
        seen.push(['save', request])
        return Promise.resolve(carried<ResearchSavePaperSourceResult>({ ok: true, value: { mtimeMs: 2000 } }))
      },
      compile: (request) => {
        seen.push(['compile', request])
        return Promise.resolve(carried<ResearchCompileResult>({
          ok: true, value: { state: 'ok', issues: [], engine: null, pdfUpdatedAt: 3 },
        }))
      },
    }))
    controller.ensure()
    await vi.advanceTimersByTimeAsync(0)
    controller.select('p1')
    await vi.advanceTimersByTimeAsync(0)
    controller.edit('v2')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + COMPILE_DEBOUNCE_MS)
    expect(seen).toEqual([
      ['outline', { projectId: 'p1', dir: 'ego-wholebody-paper' }],
      ['source', { projectId: 'p1', dir: 'ego-wholebody-paper' }],
      ['save', { projectId: 'p1', content: 'v2', baseMtimeMs: 1000, dir: 'ego-wholebody-paper' }],
      ['compile', { projectId: 'p1', dir: 'ego-wholebody-paper' }],
    ])
  })

  it('queues the autosave compile behind an in-flight compile', async () => {
    const run = deferred<RemoteResult<ResearchCompileResult>>()
    let compiles = 0
    const controller = new ResearchController(stubRemote({
      ...selectReads,
      getPaperSource: () => Promise.resolve(carried(sourceOk('v1', 1000))),
      savePaperSource: request => Promise.resolve(carried<ResearchSavePaperSourceResult>({
        ok: true, value: { mtimeMs: request.baseMtimeMs + 1 },
      })),
      compile: () => { compiles += 1; return run.promise },
    }))
    controller.select('p1')
    await vi.advanceTimersByTimeAsync(0)
    const first = controller.compile('p1')
    controller.edit('v2')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + COMPILE_DEBOUNCE_MS)
    // The save landed but its compile queued behind the in-flight run.
    expect(compiles).toBe(1)
    run.resolve(carried({ ok: true, value: { state: 'ok', issues: [], engine: null, pdfUpdatedAt: 9 } }))
    await first
    await vi.advanceTimersByTimeAsync(0)
    expect(compiles).toBe(2)
    expect(controller.getSnapshot().compile.state).toBe('ok')
  })
})

describe('ResearchController workbench views', () => {
  /** Settle all queued microtasks of the void-fired loads. */
  const settle = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  it('loads the literature list once on ensurePapers', async () => {
    let calls = 0
    const controller = new ResearchController(stubRemote({
      listPapers: () => {
        calls += 1
        return Promise.resolve(carried<ResearchPapersResult>({
          ok: true,
          value: {
            papers: [{
              arxivId: '2103.00020v2', title: 'A Paper', authors: ['Ann'],
              summary: 'S', url: 'https://arxiv.org/abs/2103.00020', notes: '',
              addedAt: '2026-08-01T00:00:00Z',
            }],
          },
        }))
      },
    }))
    expect(controller.getSnapshot().papers.status).toBe('cold')
    controller.ensurePapers()
    expect(controller.getSnapshot().papers.status).toBe('loading')
    await settle()
    expect(controller.getSnapshot().papers).toMatchObject({ status: 'ready' })
    expect(controller.getSnapshot().papers.list[0]?.arxivId).toBe('2103.00020v2')
    // A second call is a no-op on the ready view.
    controller.ensurePapers()
    expect(calls).toBe(1)
  })

  it('loads the selected project experiments through select', async () => {
    const controller = new ResearchController(stubRemote({
      getPaperOutline: ({ projectId }) => Promise.resolve(carried<ResearchOutlineResult>({
        ok: true, value: { projectId, nodes: [] },
      })),
      getCompileStatus: () => Promise.resolve(carried(IDLE)),
      getPaperSource: () => Promise.resolve(carried({ ok: true, value: { content: '', mtimeMs: 1 } })),
      listExperiments: () => Promise.resolve(carried<ResearchExperimentsResult>({
        ok: true,
        value: {
          experiments: [{
            id: 'e1', projectId: 'p1', name: 'baseline', status: 'success',
            metrics: { acc: 0.9 }, updatedAt: '2026-08-02T00:00:00Z',
          }],
        },
      })),
    }))
    controller.select('p1')
    await settle()
    expect(controller.getSnapshot().experiments).toMatchObject({
      projectId: 'p1', status: 'ready',
    })
    expect(controller.getSnapshot().experiments?.list[0]?.name).toBe('baseline')
  })

  it('skips a refetch of a ready artifact and keeps the not-found failure', async () => {
    let calls = 0
    let missing = false
    const controller = new ResearchController(stubRemote({
      readArtifact: () => {
        calls += 1
        return missing
          ? Promise.resolve(carried<ResearchArtifactResult>({
            ok: false, error: { code: 'artifact-not-found', name: 'EXPERIMENT_LOG.md' },
          }))
          : Promise.resolve(carried<ResearchArtifactResult>({
            ok: true, value: { name: 'EXPERIMENT_LOG.md', content: '# Log', mtimeMs: 7 },
          }))
      },
    }))
    controller.loadArtifact('p1', 'EXPERIMENT_LOG.md')
    await settle()
    expect(controller.getSnapshot().artifact).toMatchObject({ status: 'ready', content: '# Log' })
    // Ready same project+name: no new request without force.
    controller.loadArtifact('p1', 'EXPERIMENT_LOG.md')
    expect(calls).toBe(1)
    // A missing artifact surfaces as the dedicated business failure.
    missing = true
    controller.loadArtifact('p1', 'EXPERIMENT_LOG.md', true)
    await settle()
    expect(controller.getSnapshot().artifact).toMatchObject({
      status: 'error', failure: { code: 'artifact-not-found' },
    })
    expect(calls).toBe(2)
  })

  it('skips a fresh figures view and rescans on force', async () => {
    let calls = 0
    const controller = new ResearchController(stubRemote({
      listFigures: () => {
        calls += 1
        return Promise.resolve(carried<ResearchFiguresResult>({
          ok: true,
          value: {
            figures: [{ name: 'f1.png', relPath: 'f1.png', sizeBytes: 100, mtimeMs: 1 }],
          },
        }))
      },
    }))
    controller.loadFigures('p1')
    await settle()
    expect(controller.getSnapshot().figures).toMatchObject({ projectId: 'p1', status: 'ready' })
    expect(controller.getSnapshot().figures?.list).toHaveLength(1)
    controller.loadFigures('p1')
    expect(calls).toBe(1)
    controller.loadFigures('p1', true)
    await settle()
    expect(calls).toBe(2)
  })
})

describe('ResearchController servers and figure deletion', () => {
  /** Settle all queued microtasks of the void-fired loads. */
  const settle = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  const SERVER = {
    id: 'srv-1', name: 'gpu01', host: '10.0.0.8', port: 22,
    username: 'ops', note: '', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
  }

  it('loads the server list once on ensureServers', async () => {
    let calls = 0
    const controller = new ResearchController(stubRemote({
      listServers: () => {
        calls += 1
        return Promise.resolve(carried<ResearchListServersResult>({ ok: true, value: { servers: [SERVER] } }))
      },
    }))
    expect(controller.getSnapshot().servers.status).toBe('cold')
    controller.ensureServers()
    expect(controller.getSnapshot().servers.status).toBe('loading')
    await settle()
    expect(controller.getSnapshot().servers).toMatchObject({ status: 'ready' })
    expect(controller.getSnapshot().servers.list[0]?.name).toBe('gpu01')
    controller.ensureServers()
    expect(calls).toBe(1)
  })

  it('refreshes the list after a save and returns the business failure on invalid input', async () => {
    let lists = 0
    const controller = new ResearchController(stubRemote({
      saveServer: ({ server }) => Promise.resolve(carried<ResearchSaveServerResult>(
        server.name === ''
          ? { ok: false, error: { code: 'invalid-input', message: 'name must be non-empty' } }
          : { ok: true, value: { server: { ...SERVER, name: server.name } } },
      )),
      listServers: () => {
        lists += 1
        return Promise.resolve(carried<ResearchListServersResult>({ ok: true, value: { servers: [SERVER] } }))
      },
    }))
    const failure = await controller.saveServer({ ...SERVER, id: undefined, name: '' })
    expect(failure).toMatchObject({ code: 'invalid-input' })
    expect(lists).toBe(0)
    const ok = await controller.saveServer({ ...SERVER, id: undefined })
    expect(ok).toBeNull()
    expect(lists).toBe(1)
    expect(controller.getSnapshot().servers.status).toBe('ready')
  })

  it('publishes checking then the settled probe view, and deleteServer drops the slot', async () => {
    const probe = deferred<RemoteResult<ResearchCheckServerResult>>()
    const controller = new ResearchController(stubRemote({
      listServers: () => Promise.resolve(carried<ResearchListServersResult>({ ok: true, value: { servers: [SERVER] } })),
      checkServer: () => probe.promise,
      deleteServer: () => Promise.resolve(carried<ResearchDeleteServerResult>({ ok: true, value: { id: SERVER.id } })),
    }))
    const checking = controller.checkServer(SERVER.id)
    expect(controller.getSnapshot().serverChecks[SERVER.id]).toBe('checking')
    probe.resolve(carried<ResearchCheckServerResult>({
      ok: true,
      value: {
        state: 'offline', latencyMs: null, gpus: [],
        checkedAt: '2026-08-02T00:00:00Z', message: 'connect ECONNREFUSED',
      },
    }))
    await checking
    expect(controller.getSnapshot().serverChecks[SERVER.id]).toMatchObject({ state: 'offline' })
    const failure = await controller.deleteServer(SERVER.id)
    expect(failure).toBeNull()
    expect(controller.getSnapshot().serverChecks[SERVER.id]).toBeUndefined()
  })

  it('resiliently folds a carrier failure into an offline probe view', async () => {
    const controller = new ResearchController(stubRemote({
      checkServer: () => Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'host down', details: {} } }),
    }))
    await controller.checkServer(SERVER.id)
    expect(controller.getSnapshot().serverChecks[SERVER.id]).toMatchObject({
      state: 'offline', message: 'host down',
    })
  })

  it('deleteFigure forwards the paperDir and forces a rescan', async () => {
    const seen: unknown[] = []
    const controller = new ResearchController(stubRemote({
      listProjects: () => Promise.resolve(carried(PROJECTS)),
      deleteFigure: (request) => {
        seen.push(request)
        return Promise.resolve(carried<ResearchDeleteFigureResult>({ ok: true, value: { relPath: request.relPath } }))
      },
      listFigures: () => Promise.resolve(carried<ResearchFiguresResult>({ ok: true, value: { figures: [] } })),
    }))
    controller.ensure()
    await settle()
    const failure = await controller.deleteFigure('p1', 'figures/f1.png')
    expect(failure).toBeNull()
    expect(seen).toEqual([{ projectId: 'p1', relPath: 'figures/f1.png', dir: undefined }])
    await settle()
    expect(controller.getSnapshot().figures).toMatchObject({ projectId: 'p1', status: 'ready' })
  })
})

describe('ResearchController arXiv search and paper import', () => {
  /** Settle all queued microtasks of the void-fired loads. */
  const settle = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  const ENTRY = {
    id: '2103.00020v2',
    title: 'EgoSync & Friends: A Study',
    authors: ['Doe, Jane'],
    summary: 'body',
    published: '2021-03-01T00:00:00Z',
    url: 'https://arxiv.org/abs/2103.00020v2',
  }
  const PAPER = {
    arxivId: ENTRY.id, title: ENTRY.title, authors: ENTRY.authors,
    summary: ENTRY.summary, url: ENTRY.url, notes: '', addedAt: '2026-08-01T00:00:00Z',
  }

  it('publishes loading then the ready search outcome; an empty query never leaves the client', async () => {
    const seen: string[] = []
    const controller = new ResearchController(stubRemote({
      searchArxiv: ({ query }) => {
        seen.push(query)
        return Promise.resolve(carried<ResearchSearchArxivResult>({ ok: true, value: { results: [ENTRY] } }))
      },
    }))
    expect(controller.getSnapshot().arxivSearch).toBeNull()
    controller.searchArxiv('   ')
    expect(seen).toEqual([])
    controller.searchArxiv(' egocentric ')
    expect(controller.getSnapshot().arxivSearch).toMatchObject({ query: 'egocentric', status: 'loading' })
    await settle()
    expect(controller.getSnapshot().arxivSearch).toMatchObject({ query: 'egocentric', status: 'ready' })
    expect(controller.getSnapshot().arxivSearch?.list[0]?.id).toBe(ENTRY.id)
    expect(seen).toEqual(['egocentric'])
  })

  it('discards a superseded search and folds failures into the error slice', async () => {
    const slow = deferred<RemoteResult<ResearchSearchArxivResult>>()
    const controller = new ResearchController(stubRemote({
      searchArxiv: ({ query }) => query === 'slow'
        ? slow.promise
        : Promise.resolve(carried<ResearchSearchArxivResult>({
            ok: false, error: { code: 'operation-failed', message: 'HTTP 500' },
          })),
    }))
    controller.searchArxiv('slow')
    controller.searchArxiv('fast')
    await settle()
    expect(controller.getSnapshot().arxivSearch).toMatchObject({ query: 'fast', status: 'error' })
    expect(controller.getSnapshot().arxivSearch?.failure).toMatchObject({ code: 'operation-failed', message: 'HTTP 500' })
    // The superseded slow reply never overwrites the newer outcome.
    slow.resolve(carried<ResearchSearchArxivResult>({ ok: true, value: { results: [ENTRY] } }))
    await settle()
    expect(controller.getSnapshot().arxivSearch).toMatchObject({ query: 'fast', status: 'error' })
  })

  it('refreshes the literature list after a successful import and returns failures otherwise', async () => {
    let lists = 0
    const controller = new ResearchController(stubRemote({
      importPaper: ({ entry }) => Promise.resolve(carried<ResearchImportPaperResult>(
        entry.id === 'bad'
          ? { ok: false, error: { code: 'invalid-input', message: 'entry id and title must be non-empty' } }
          : { ok: true, value: { imported: true } },
      )),
      listPapers: () => {
        lists += 1
        return Promise.resolve(carried<ResearchPapersResult>({ ok: true, value: { papers: [PAPER] } }))
      },
    }))
    const failure = await controller.importPaper({ ...ENTRY, id: 'bad' })
    expect(failure).toMatchObject({ code: 'invalid-input' })
    expect(lists).toBe(0)
    const ok = await controller.importPaper(ENTRY)
    expect(ok).toBeNull()
    expect(lists).toBe(1)
    expect(controller.getSnapshot().papers).toMatchObject({ status: 'ready' })
    expect(controller.getSnapshot().papers.list[0]?.arxivId).toBe(ENTRY.id)
  })

  it('removePaper returns the business failure and refreshes the list on success', async () => {
    let lists = 0
    const controller = new ResearchController(stubRemote({
      removePaper: ({ arxivId }) => Promise.resolve(carried<ResearchRemovePaperResult>(
        arxivId === ENTRY.id
          ? { ok: true, value: { arxivId } }
          : { ok: false, error: { code: 'paper-not-found' } },
      )),
      listPapers: () => {
        lists += 1
        return Promise.resolve(carried<ResearchPapersResult>({ ok: true, value: { papers: [] } }))
      },
    }))
    const missing = await controller.removePaper('nope')
    expect(missing).toMatchObject({ code: 'paper-not-found' })
    expect(lists).toBe(0)
    const ok = await controller.removePaper(ENTRY.id)
    expect(ok).toBeNull()
    expect(lists).toBe(1)
  })
})
