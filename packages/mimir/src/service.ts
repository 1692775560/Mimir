/**
 * The `research` Remote namespace: the host half of the web research panel.
 * Reads the wiki's projects table, parses the section outline of each
 * project's paper `main.tex`, and runs the LaTeX compile through the same
 * engine path as the `latex_compile` tool. The paper directory resolves per
 * call — an explicit request `dir`, else the project record's `paperDir`,
 * else `paper` — always confined inside the workspace. Compile status is
 * process memory keyed by project id, so a panel reopened after a compile
 * sees the last outcome without re-running it.
 * @module dsh-mimir/src/service
 */

import { execFile } from 'node:child_process'
import { readFile, stat, unlink } from 'node:fs/promises'
import { connect } from 'node:net'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { parseTexOutline } from './outline.ts'
import { isArtifactName, isFigureFile, listPaperFigures, readWorkspaceArtifact } from './artifacts.ts'
import { isNotFound, readPaperSource, resolvePaperDir, savePaperSourceFile } from './paper-source.ts'
import { compileLatex } from './tools/latex.ts'
import type { LatexToolOptions } from './tools/latex.ts'
import type { ResearchWikiDomain } from './store.ts'
import type {
  ResearchArtifactResult,
  ResearchCheckServerResult,
  ResearchCompileResult,
  ResearchCompileStatusResult,
  ResearchCompileStatusView,
  ResearchDeleteFigureResult,
  ResearchDeleteServerResult,
  ResearchExperimentsResult,
  ResearchFailure,
  ResearchFiguresResult,
  ResearchListProjectsResult,
  ResearchListServersResult,
  ResearchOutlineResult,
  ResearchPaperSourceResult,
  ResearchPapersResult,
  ResearchProjectView,
  ResearchRejected,
  ResearchSavePaperSourceResult,
  ResearchSaveServerResult,
  ResearchSuccess,
  ServerGpuView,
  ServerInput,
  ServerRecord,
  ServerStatusView,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The research panel's host service (the `research` Remote namespace). */
    research: ResearchService
  }
}

/** Everything the service needs from the plugin's apply scope. */
export interface ResearchServiceConfig {
  /** Absolute research workspace root (already resolved by the plugin). */
  readonly workspaceDir: string
  /** Open research-wiki domain handle owned by the plugin. */
  readonly domain: ResearchWikiDomain
  /** Resolved LaTeX deployment knobs. */
  readonly latex: LatexToolOptions
}

/** Status-map key for a compile addressed to no specific project. */
const DEFAULT_KEY = ''

/** The pre-first-compile view every project starts from. */
const IDLE_STATUS: ResearchCompileStatusView = Object.freeze({
  state: 'idle',
  issues: Object.freeze([]),
  engine: null,
  pdfUpdatedAt: null,
})

/** Build a frozen success branch. */
function success<T>(value: T): ResearchSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E extends ResearchFailure>(error: E): ResearchRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Project one wiki record into the panel's row shape. */
function projectView(record: {
  id: string
  title: string
  stage: ResearchProjectView['stage']
  paperDir?: string | undefined
  reviewRounds: number
  artifacts: readonly string[]
  updatedAt: string
}): ResearchProjectView {
  return Object.freeze({
    id: record.id,
    title: record.title,
    stage: record.stage,
    paperDir: record.paperDir,
    reviewRounds: record.reviewRounds,
    artifacts: Object.freeze([...record.artifacts]),
    updatedAt: record.updatedAt,
  })
}

/** mtime (ms) of the compiled PDF, or null when no successful run produced one. */
async function pdfMtime(pdfPath: string): Promise<number | null> {
  try {
    return (await stat(pdfPath)).mtimeMs
  } catch (error) {
    // Only absence is expected here (no successful compile yet); anything else
    // still degrades to "no preview" rather than failing the compile reply.
    if (!isNotFound(error)) throw error
    return null
  }
}

/** TCP reachability probe timeout; part of the checkServer probe contract. */
const TCP_PROBE_TIMEOUT_MS = 4000
/** Timeout of the best-effort ssh `nvidia-smi` readout. */
const GPU_PROBE_TIMEOUT_MS = 8000
/** Connect timeout handed to the ssh client itself. */
const GPU_PROBE_SSH_CONNECT_TIMEOUT_S = 5
/** The remote command whose CSV output feeds the GPU table. */
const NVIDIA_SMI_QUERY = 'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits'

/** Outcome of one TCP reachability probe. */
type TcpProbeOutcome =
  | { readonly ok: true; readonly latencyMs: number }
  | { readonly ok: false; readonly message: string }

/**
 * Connect to `host:port` once, measuring the handshake latency. The probe
 * never throws: every failure mode (refused, unreachable, timed out) settles
 * as the `ok: false` branch carrying the socket's own message.
 * @param host - server host name or address.
 * @param port - server TCP port.
 * @returns the connected latency, or the failure message.
 */
function probeTcp(host: string, port: number): Promise<TcpProbeOutcome> {
  return new Promise<TcpProbeOutcome>((settle) => {
    const startedAt = Date.now()
    let done = false
    const socket = connect({ host, port })
    const finish = (outcome: TcpProbeOutcome): void => {
      if (done) return
      done = true
      socket.destroy()
      settle(outcome)
    }
    socket.once('connect', () => { finish({ ok: true, latencyMs: Date.now() - startedAt }) })
    socket.once('error', (error) => { finish({ ok: false, message: error.message }) })
    socket.setTimeout(TCP_PROBE_TIMEOUT_MS, () => {
      finish({ ok: false, message: `tcp connect timed out after ${String(TCP_PROBE_TIMEOUT_MS)}ms` })
    })
  })
}

const execFileAsync = promisify(execFile)

/** Outcome of the best-effort GPU readout over ssh. */
type GpuProbeOutcome =
  | { readonly ok: true; readonly gpus: readonly ServerGpuView[] }
  | { readonly ok: false; readonly message: string }

/**
 * Read one server's GPU table over a batch-mode ssh call. Best-effort: an ssh
 * or `nvidia-smi` failure is the `ok: false` branch, never a rejection, so the
 * caller can still report the server itself as reachable.
 * @param record - the server to probe (host, port, and login user).
 * @returns the parsed GPU rows, or the failure message.
 */
async function probeGpus(record: ServerRecord): Promise<GpuProbeOutcome> {
  try {
    const { stdout } = await execFileAsync('ssh', [
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${String(GPU_PROBE_SSH_CONNECT_TIMEOUT_S)}`,
      '-p', String(record.port),
      `${record.username}@${record.host}`,
      NVIDIA_SMI_QUERY,
    ], { timeout: GPU_PROBE_TIMEOUT_MS })
    const gpus: ServerGpuView[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      const [name, utilizationPct, memoryUsedMb, memoryTotalMb] = trimmed.split(',').map(field => field.trim())
      gpus.push({
        name: name ?? '',
        utilizationPct: Number(utilizationPct),
        memoryUsedMb: Number(memoryUsedMb),
        memoryTotalMb: Number(memoryTotalMb),
      })
    }
    return { ok: true, gpus: Object.freeze(gpus) }
  } catch (error) {
    // execFile failures carry the child's stderr; prefer it over the generic
    // "Command failed" wrapper so the panel shows the ssh client's own words.
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr).trim()
      : ''
    return { ok: false, message: stderr !== '' ? stderr : error instanceof Error ? error.message : 'ssh probe failed' }
  }
}

/** First invalid-input message for one server upsert payload, or null when valid. */
function validateServerInput(input: ServerInput): string | null {
  if (input.name.trim().length === 0) return 'name must be non-empty'
  if (input.host.trim().length === 0) return 'host must be non-empty'
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return 'port must be an integer between 1 and 65535'
  }
  return null
}

/**
 * Host service behind the web research panel. Mounted by the plugin's apply
 * with the already-open wiki domain; it opens nothing and closes nothing.
 */
export class ResearchService extends TypertRemoteService {
  private readonly workspaceDir: string
  private readonly domain: ResearchWikiDomain
  private readonly latex: LatexToolOptions
  private readonly compileStatus = new Map<string, ResearchCompileStatusView>()

  /**
   * @param ctx - Host context the service registers on (`ctx.research`).
   * @param config - Workspace root, open wiki domain, and LaTeX knobs.
   */
  constructor(ctx: Context, config: ResearchServiceConfig) {
    super(ctx, 'research')
    if (config.workspaceDir.trim().length === 0) {
      throw new TypeError('research: workspaceDir must be a non-empty absolute path')
    }
    this.workspaceDir = config.workspaceDir
    this.domain = config.domain
    this.latex = config.latex
  }

  /**
   * List every wiki project, most recently updated first.
   * @returns the project rows for the panel's list.
   */
  @Remote('listProjects')
  listProjects(): Promise<ResearchListProjectsResult> {
    const projects = [...this.domain.table('projects').entries()]
      .map(([, record]) => projectView(record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return Promise.resolve(success({ projects: Object.freeze(projects) }))
  }

  /**
   * Parse the section outline of the addressed project's paper `main.tex`.
   * @param request - the selected project, plus an optional explicit paper
   * directory (relative to the workspace) overriding the record's `paperDir`.
   * @returns the heading tree, `project-not-found` for an unknown id,
   * `invalid-dir` for a directory escaping the workspace, or `paper-not-found`
   * before `/paper-write` has scaffolded the skeleton.
   */
  @Remote('getPaperOutline')
  async getPaperOutline(request: { projectId: string; dir?: string | undefined }): Promise<ResearchOutlineResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    let tex: string
    try {
      tex = await readFile(join(dir, 'main.tex'), 'utf8')
    } catch (error) {
      if (isNotFound(error)) return rejected({ code: 'paper-not-found' })
      throw error
    }
    return success({ projectId: request.projectId, nodes: Object.freeze(parseTexOutline(tex)) })
  }

  /**
   * List every remembered paper, most recently added first.
   * @returns the literature cards for the panel's papers view.
   */
  @Remote('listPapers')
  listPapers(): Promise<ResearchPapersResult> {
    const papers = [...this.domain.table('papers').entries()]
      .map(([, record]) => record)
      .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    return Promise.resolve(success({ papers: Object.freeze(papers) }))
  }

  /**
   * List experiment runs, filtered to one project when `projectId` is given.
   * @param request - optional project filter; an unknown id is `project-not-found`.
   * @returns the experiment rows, most recently updated first.
   */
  @Remote('listExperiments')
  listExperiments(request: { projectId?: string }): Promise<ResearchExperimentsResult> {
    if (request.projectId !== undefined
      && this.domain.table('projects').get(request.projectId) === undefined) {
      return Promise.resolve(rejected({ code: 'project-not-found', projectId: request.projectId }))
    }
    const experiments = [...this.domain.table('experiments').entries()]
      .map(([, record]) => record)
      .filter(record => request.projectId === undefined || record.projectId === request.projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return Promise.resolve(success({ experiments: Object.freeze(experiments) }))
  }

  /**
   * Read one whitelisted markdown artifact from the workspace root. The name
   * whitelist makes traversal inexpressible — anything off the list is
   * `invalid-artifact`, a listed-but-absent file is `artifact-not-found`.
   * @param request - the owning project (bookkeeping/authorization) and the
   * artifact name.
   * @returns the artifact text with its mtime, or a business failure.
   */
  @Remote('readArtifact')
  async readArtifact(request: { projectId: string; name: string }): Promise<ResearchArtifactResult> {
    if (this.domain.table('projects').get(request.projectId) === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    if (!isArtifactName(request.name)) {
      return rejected({ code: 'invalid-artifact', name: request.name })
    }
    const artifact = await readWorkspaceArtifact(this.workspaceDir, request.name)
    if (artifact === undefined) return rejected({ code: 'artifact-not-found', name: request.name })
    return success({ name: request.name, content: artifact.content, mtimeMs: artifact.mtimeMs })
  }

  /**
   * List the image files of the addressed project's paper directory (top
   * level plus the `figures/` subdirectory).
   * @param request - the selected project, plus an optional explicit paper
   * directory (relative to the workspace) overriding the record's `paperDir`.
   * @returns the figure entries, `project-not-found`, `invalid-dir`, or
   * `paper-not-found` when the paper directory does not exist.
   */
  @Remote('listFigures')
  async listFigures(request: { projectId: string; dir?: string | undefined }): Promise<ResearchFiguresResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    try {
      const stats = await stat(dir)
      if (!stats.isDirectory()) return rejected({ code: 'paper-not-found' })
    } catch (error) {
      if (isNotFound(error)) return rejected({ code: 'paper-not-found' })
      throw error
    }
    return success({ figures: Object.freeze(await listPaperFigures(dir)) })
  }

  /**
   * Read the addressed project's paper `main.tex` with the mtime its content
   * belongs to. The mtime is the optimistic-concurrency base for
   * `savePaperSource`.
   * @param request - the selected project, plus an optional explicit paper
   * directory (relative to the workspace) overriding the record's `paperDir`.
   * @returns content and mtime, `project-not-found` for an unknown id,
   * `invalid-dir` for a directory escaping the workspace, or `paper-not-found`
   * before `/paper-write` has scaffolded the skeleton.
   */
  @Remote('getPaperSource')
  async getPaperSource(request: { projectId: string; dir?: string | undefined }): Promise<ResearchPaperSourceResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    const snapshot = await readPaperSource(join(dir, 'main.tex'))
    if (snapshot === undefined) return rejected({ code: 'paper-not-found' })
    return success(snapshot)
  }

  /**
   * Replace the addressed project's paper `main.tex` under optimistic
   * concurrency: the commit only lands when the file's mtime still equals
   * `baseMtimeMs`. The mtime check and the atomic write run inside the writer
   * lock, so an agent writing through the file tools can never interleave a
   * check-then-write.
   * @param request - the selected project, the complete next content, the
   * mtime the caller's draft is based on, and an optional explicit paper
   * directory (relative to the workspace) overriding the record's `paperDir`.
   * @returns the committed mtime, `project-not-found`, `paper-not-found`,
   * `invalid-dir`, or `conflict` carrying the mtime that displaced the base.
   */
  @Remote('savePaperSource')
  async savePaperSource(request: {
    projectId: string
    content: string
    baseMtimeMs: number
    dir?: string | undefined
  }): Promise<ResearchSavePaperSourceResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    const outcome = await savePaperSourceFile(join(dir, 'main.tex'), request.content, request.baseMtimeMs)
    if (outcome.kind === 'missing') return rejected({ code: 'paper-not-found' })
    if (outcome.kind === 'conflict') {
      return rejected({ code: 'conflict', currentMtimeMs: outcome.currentMtimeMs })
    }
    return success({ mtimeMs: outcome.mtimeMs })
  }

  /**
   * Compile the addressed project's paper directory once and record the
   * outcome.
   * @param request - the addressed project (omitted compiles the unkeyed
   * slot), plus an optional explicit paper directory (relative to the
   * workspace) overriding the record's `paperDir`.
   * @param signal - caller cancellation; kills the engine process.
   * @returns the settled status (`ok` carries no business failure: a TeX-level
   * failure is `state: 'error'` with the parsed issues), or a business failure
   * for an unknown project, an escaping directory, a concurrent run, or an
   * engine that cannot start.
   */
  @Remote('compile')
  async compile(request: { projectId?: string; dir?: string | undefined }, signal: AbortSignal): Promise<ResearchCompileResult> {
    const key = request.projectId ?? DEFAULT_KEY
    const record = request.projectId === undefined
      ? undefined
      : this.domain.table('projects').get(request.projectId)
    if (request.projectId !== undefined && record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record?.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record?.paperDir ?? '' })
    const previous = this.compileStatus.get(key) ?? IDLE_STATUS
    if (previous.state === 'running') {
      return rejected({ code: 'operation-failed', message: 'a compile is already running for this project' })
    }
    this.compileStatus.set(key, { ...previous, state: 'running' })

    let outcome
    try {
      outcome = await compileLatex(dir, this.latex, signal)
    } catch (error) {
      // Missing engine (ENOENT) or missing paper directory: the run never
      // produced a log, so there are no issues to show — only the message.
      const settled: ResearchCompileStatusView = { ...previous, state: 'error' }
      this.compileStatus.set(key, settled)
      return rejected({
        code: 'operation-failed',
        message: error instanceof Error ? error.message : 'latex compile failed to run',
      })
    }

    const settled: ResearchCompileStatusView = Object.freeze({
      state: outcome.success ? 'ok' : 'error',
      issues: Object.freeze([...outcome.errors, ...outcome.warnings]),
      engine: outcome.engine,
      pdfUpdatedAt: outcome.success
        ? await pdfMtime(join(dir, 'main.pdf'))
        : previous.pdfUpdatedAt,
    })
    this.compileStatus.set(key, settled)
    return success(settled)
  }

  /**
   * Read the last known compile status without running anything.
   * @param request - the addressed project; omitted reads the unkeyed slot.
   * @returns the recorded status, `idle` before the first compile.
   */
  @Remote('getCompileStatus')
  getCompileStatus(request: { projectId?: string }): Promise<ResearchCompileStatusResult> {
    const key = request.projectId ?? DEFAULT_KEY
    if (request.projectId !== undefined
      && this.domain.table('projects').get(request.projectId) === undefined) {
      return Promise.resolve(rejected({ code: 'project-not-found', projectId: request.projectId }))
    }
    return Promise.resolve(success(this.compileStatus.get(key) ?? IDLE_STATUS))
  }

  /**
   * Delete one figure file of the addressed project's paper directory. The
   * path must stay inside the paper directory and carry a servable figure
   * extension — anything else is `invalid-path`, a listed-but-absent file is
   * `figure-not-found`.
   * @param request - the selected project, the paper-directory-relative figure
   * path, and an optional explicit paper directory (relative to the workspace)
   * overriding the record's `paperDir`.
   * @returns the deleted path, or a business failure.
   */
  @Remote('deleteFigure')
  async deleteFigure(request: { projectId: string; relPath: string; dir?: string | undefined }): Promise<ResearchDeleteFigureResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    const figurePath = resolve(dir, request.relPath)
    if (!figurePath.startsWith(dir + sep) || !isFigureFile(request.relPath)) {
      return rejected({ code: 'invalid-path', path: request.relPath })
    }
    try {
      await unlink(figurePath)
    } catch (error) {
      if (isNotFound(error)) return rejected({ code: 'figure-not-found', relPath: request.relPath })
      throw error
    }
    return success({ relPath: request.relPath })
  }

  /**
   * List every remembered compute server, most recently updated first.
   * @returns the server cards for the panel's servers view.
   */
  @Remote('listServers')
  listServers(): Promise<ResearchListServersResult> {
    const servers = [...this.domain.table('servers').entries()]
      .map(([, record]) => record)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return Promise.resolve(success({ servers: Object.freeze(servers) }))
  }

  /**
   * Upsert one compute server. An `id` in the payload selects the update form
   * (the existing record's `createdAt` survives; `updatedAt` refreshes); its
   * absence creates a record with a generated id. Name and host must be
   * non-empty and the port a valid TCP port — violations are `invalid-input`,
   * an unknown update id is `server-not-found`.
   * @param request - the server fields, with `id` marking the update form.
   * @returns the stored record.
   */
  @Remote('saveServer')
  async saveServer(request: { server: ServerInput }): Promise<ResearchSaveServerResult> {
    const input = request.server
    const invalid = validateServerInput(input)
    if (invalid !== null) return rejected({ code: 'invalid-input', message: invalid })
    const table = this.domain.table('servers')
    const now = new Date().toISOString()
    if (input.id !== undefined) {
      const existing = table.get(input.id)
      if (existing === undefined) return rejected({ code: 'server-not-found', id: input.id })
      const next: ServerRecord = {
        ...existing,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        note: input.note,
        updatedAt: now,
      }
      await table.put(input.id, next)
      return success({ server: next })
    }
    const created: ServerRecord = {
      id: `srv-${Date.now().toString(36)}`,
      name: input.name,
      host: input.host,
      port: input.port,
      username: input.username,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    }
    await table.put(created.id, created)
    return success({ server: created })
  }

  /**
   * Delete one remembered server; an unknown id is `server-not-found`.
   * @param request - the record id.
   * @returns the deleted id.
   */
  @Remote('deleteServer')
  async deleteServer(request: { id: string }): Promise<ResearchDeleteServerResult> {
    const table = this.domain.table('servers')
    if (table.get(request.id) === undefined) {
      return rejected({ code: 'server-not-found', id: request.id })
    }
    await table.delete(request.id)
    return success({ id: request.id })
  }

  /**
   * Probe one remembered server. The probe is two best-effort stages: a TCP
   * connect (failure settles the view `offline`), then — only when the TCP
   * probe connected and the record names a login user — a batch-mode ssh
   * `nvidia-smi` readout whose failure downgrades the GPU table to empty
   * without flipping the state.
   * @param request - the record id; an unknown id is `server-not-found`.
   * @returns the settled probe view.
   */
  @Remote('checkServer')
  async checkServer(request: { id: string }): Promise<ResearchCheckServerResult> {
    const record = this.domain.table('servers').get(request.id)
    if (record === undefined) {
      return rejected({ code: 'server-not-found', id: request.id })
    }
    const tcp = await probeTcp(record.host, record.port)
    if (!tcp.ok) {
      return success<ServerStatusView>({
        state: 'offline',
        latencyMs: null,
        gpus: Object.freeze([]),
        checkedAt: new Date().toISOString(),
        message: tcp.message,
      })
    }
    if (record.username === '') {
      return success<ServerStatusView>({
        state: 'online',
        latencyMs: tcp.latencyMs,
        gpus: Object.freeze([]),
        checkedAt: new Date().toISOString(),
        message: null,
      })
    }
    const gpu = await probeGpus(record)
    return success<ServerStatusView>({
      state: 'online',
      latencyMs: tcp.latencyMs,
      gpus: gpu.ok ? gpu.gpus : Object.freeze([]),
      checkedAt: new Date().toISOString(),
      message: gpu.ok ? null : `gpu probe failed: ${gpu.message}`,
    })
  }
}

export default ResearchService
