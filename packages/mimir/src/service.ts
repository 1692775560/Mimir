/**
 * The `research` Remote namespace: the host half of the web research panel.
 * Reads the wiki's projects table, parses the section outline of each
 * project's paper `main.tex`, and runs the LaTeX compile through the same
 * engine path as the `latex_compile` tool, and drives remote jobs submitted
 * to remembered servers over batch-mode ssh (the panel polls `listJobs` for
 * the queued→running→succeeded/failed flips; a linked experiment record
 * follows the terminal state). The paper directory resolves per
 * call — an explicit request `dir`, else the project record's `paperDir`,
 * else `paper` — always confined inside the workspace. Compile status is
 * process memory keyed by project id, so a panel reopened after a compile
 * sees the last outcome without re-running it.
 * @module dsh-mimir/src/service
 */

import { execFile } from 'node:child_process'
import { readdir, readFile, stat, unlink } from 'node:fs/promises'
import { connect } from 'node:net'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { parseTexOutline, reorderSections } from './outline.ts'
import { isArtifactName, isFigureFile, listPaperFigures, readWorkspaceArtifact } from './artifacts.ts'
import { isNotFound, readPaperSource, resolvePaperDir, savePaperSourceFile, saveTextFileOptimistic } from './paper-source.ts'
import { bibKeyOf, entryFromPaper, parseBibtex, serializeBibtex } from './bibtex.ts'
import {
  buildWikiSnapshot, snapshotEnvelopeError, tableRowsError, WIKI_TABLE_KEY, WIKI_TABLE_NAMES,
} from './wiki-snapshot.ts'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { isBackupFileName } from './backup.ts'
import { compileLatex } from './tools/latex.ts'
import type { LatexToolOptions } from './tools/latex.ts'
import { fetchArxivSearch } from './tools/arxiv.ts'
import type { ResearchWikiDomain } from './store.ts'
import type {
  ArxivEntry,
  BibEntry,
  ExperimentRecord,
  ExperimentStatus,
  ExperimentInput,
  JobRecord,
  PaperRecord,
  ResearchArtifactResult,
  ResearchBibliographyResult,
  ResearchCheckServerResult,
  ResearchCompileResult,
  ResearchCompileStatusResult,
  ResearchCompileStatusView,
  ResearchDeleteExperimentResult,
  ResearchDeleteFigureResult,
  ResearchDeleteJobResult,
  ResearchDeleteServerResult,
  ResearchExperimentsResult,
  ResearchExportWikiResult,
  ResearchFailure,
  ResearchFiguresResult,
  ResearchImportBibResult,
  ResearchImportPaperResult,
  ResearchImportWikiMode,
  ResearchImportWikiResult,
  ResearchListBackupsResult,
  ResearchListJobsResult,
  ResearchListProjectsResult,
  ResearchListServersResult,
  ResearchOutlineResult,
  ResearchPaperSourceResult,
  ResearchPapersResult,
  ResearchProjectView,
  ResearchRejected,
  ResearchRemovePaperResult,
  ResearchSaveBibliographyResult,
  ResearchSaveExperimentResult,
  ResearchSavePaperSourceResult,
  ResearchSaveServerResult,
  ResearchSearchArxivResult,
  ResearchSubmitJobResult,
  ResearchSuccess,
  ResearchUpdateExperimentResult,
  ResearchUpdatePaperResult,
  ResearchWikiSnapshot,
  ResearchWikiTableName,
  SectionMove,
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
  /**
   * Resolved scheduled-backup knobs (`dir` already absolute); absent in
   * tests and direct constructions — `listBackups` then reports disabled.
   */
  readonly backup?: {
    readonly enabled: boolean
    readonly intervalMinutes: number
    readonly keep: number
    readonly dir: string
  }
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
/** Timeout of one arXiv API request made on the panel's behalf. */
const ARXIV_FETCH_TIMEOUT_MS = 15_000
/** Default result cap of one panel-driven arXiv search. */
const ARXIV_SEARCH_DEFAULT_MAX_RESULTS = 10
/** Hard result cap of one panel-driven arXiv search. */
const ARXIV_SEARCH_MAX_RESULTS = 50
/** Timeout of the best-effort ssh `nvidia-smi` readout. */
const GPU_PROBE_TIMEOUT_MS = 8000
/** Connect timeout handed to the ssh client itself. */
const GPU_PROBE_SSH_CONNECT_TIMEOUT_S = 5
/** The remote command whose CSV output feeds the GPU table. */
const NVIDIA_SMI_QUERY = 'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits'

/** Hard cap of one submitted command line (the durable record stores it verbatim). */
const JOB_COMMAND_MAX_CHARS = 4000
/** Kill timeout of one remote job's ssh session. */
const SSH_JOB_TIMEOUT_MS = 30 * 60_000
/** execFile buffer cap of one job's combined stdout/stderr. */
const SSH_JOB_MAX_BUFFER_BYTES = 4 * 1024 * 1024
/** Characters kept of one settled job's stdout/stderr tails. */
const JOB_OUTPUT_TAIL_CHARS = 8192

/** Keep the trailing window of one job output stream. */
function tailOf(text: string): string {
  return text.length <= JOB_OUTPUT_TAIL_CHARS ? text : text.slice(text.length - JOB_OUTPUT_TAIL_CHARS)
}

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

/** Legal experiment statuses, for the runtime guard (remote callers bypass the type). */
const EXPERIMENT_STATUSES: readonly string[] = ['running', 'success', 'failed']

/** First invalid-input message for one experiment upsert payload, or null when valid. */
function validateExperimentInput(input: ExperimentInput): string | null {
  if (input.name.trim().length === 0) return 'name must be non-empty'
  // Widened to string so the runtime guard is not linted away.
  const rawStatus: string = input.status
  if (!EXPERIMENT_STATUSES.includes(rawStatus)) return `unknown status: ${rawStatus}`
  if (typeof input.metrics !== 'object' || input.metrics === null || Array.isArray(input.metrics)) {
    return 'metrics must be an object keyed by metric name'
  }
  for (const [key, value] of Object.entries(input.metrics)) {
    if (key.trim().length === 0) return 'metrics keys must be non-empty'
    if (typeof value !== 'number' && typeof value !== 'string') return `metrics.${key} must be a number or a string`
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
  private readonly backup: ResearchServiceConfig['backup']
  private readonly compileStatus = new Map<string, ResearchCompileStatusView>()
  /** Monotonic suffix of generated job ids (same-millisecond submits stay distinct). */
  private jobSeq = 0

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
    this.backup = config.backup
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
   * Search arXiv on the panel's behalf. The query must be non-empty
   * (`invalid-input` otherwise); the request carries a hard 15s timeout and
   * transport/HTTP failures settle as `operation-failed` with the underlying
   * message.
   * @param request - the free-text query and an optional result cap
   * (default 10, hard cap 50).
   * @returns the parsed entries, newest API order preserved.
   */
  @Remote('searchArxiv')
  async searchArxiv(request: { query: string; maxResults?: number }): Promise<ResearchSearchArxivResult> {
    const query = request.query.trim()
    if (query === '') return rejected({ code: 'invalid-input', message: 'query must be non-empty' })
    const maxResults = request.maxResults ?? ARXIV_SEARCH_DEFAULT_MAX_RESULTS
    if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > ARXIV_SEARCH_MAX_RESULTS) {
      return rejected({ code: 'invalid-input', message: `maxResults must be an integer between 1 and ${ARXIV_SEARCH_MAX_RESULTS}` })
    }
    try {
      const results = await fetchArxivSearch(query, maxResults, AbortSignal.timeout(ARXIV_FETCH_TIMEOUT_MS))
      return success({ results: Object.freeze(results) })
    } catch (error) {
      return rejected({
        code: 'operation-failed',
        message: error instanceof Error ? error.message : 'arXiv search failed',
      })
    }
  }

  /**
   * Remember one arXiv entry in the wiki's papers table. The write is an
   * idempotent upsert keyed by the bare arXiv id: a re-import refreshes the
   * metadata but preserves the existing record's notes and first-write
   * timestamp.
   * @param request - the parsed entry (an empty id or title is `invalid-input`).
   * @returns whether the paper was newly imported (false on a refresh).
   */
  @Remote('importPaper')
  async importPaper(request: { entry: ArxivEntry }): Promise<ResearchImportPaperResult> {
    const entry = request.entry
    const arxivId = entry.id.trim()
    if (arxivId === '' || entry.title.trim() === '') {
      return rejected({ code: 'invalid-input', message: 'entry id and title must be non-empty' })
    }
    const table = this.domain.table('papers')
    const existing = table.get(arxivId)
    const record: PaperRecord = {
      arxivId,
      title: entry.title,
      authors: [...entry.authors],
      summary: entry.summary,
      url: entry.url === '' ? `https://arxiv.org/abs/${arxivId}` : entry.url,
      notes: existing?.notes ?? '',
      // A re-import refreshes the arXiv metadata but never wipes the
      // workbench-curated organization fields.
      tags: [...(existing?.tags ?? [])],
      projectIds: [...(existing?.projectIds ?? [])],
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    }
    await table.put(arxivId, record)
    return success({ imported: existing === undefined })
  }

  /**
   * Remove one remembered paper; an unknown arXiv id is `paper-not-found`.
   * @param request - the bare arXiv id.
   * @returns the removed id.
   */
  @Remote('removePaper')
  async removePaper(request: { arxivId: string }): Promise<ResearchRemovePaperResult> {
    const table = this.domain.table('papers')
    if (table.get(request.arxivId) === undefined) {
      return rejected({ code: 'paper-not-found' })
    }
    await table.delete(request.arxivId)
    return success({ arxivId: request.arxivId })
  }

  /**
   * Partially update one remembered paper's organization fields: only the
   * present fields (`tags`, `projectIds`, `notes`) change. Tags are trimmed,
   * emptied out, and deduped; every linked project id must exist in the wiki
   * (`invalid-input` otherwise). An unknown arXiv id is `paper-not-found`.
   * @param request - the bare arXiv id plus the fields to replace.
   * @returns the stored record after the update.
   */
  @Remote('updatePaper')
  async updatePaper(request: {
    arxivId: string
    tags?: string[] | undefined
    projectIds?: string[] | undefined
    notes?: string | undefined
  }): Promise<ResearchUpdatePaperResult> {
    const table = this.domain.table('papers')
    const existing = table.get(request.arxivId)
    if (existing === undefined) return rejected({ code: 'paper-not-found' })
    if (request.projectIds !== undefined) {
      for (const projectId of request.projectIds) {
        if (this.domain.table('projects').get(projectId) === undefined) {
          return rejected({ code: 'invalid-input', message: `unknown project: ${projectId}` })
        }
      }
    }
    const next: PaperRecord = {
      ...existing,
      tags: request.tags === undefined
        ? existing.tags
        : [...new Set(request.tags.map(tag => tag.trim()).filter(tag => tag !== ''))],
      projectIds: request.projectIds ?? existing.projectIds,
      notes: request.notes ?? existing.notes,
    }
    await table.put(request.arxivId, next)
    return success({ paper: next })
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
   * Delete one experiment record; an unknown id is `experiment-not-found`.
   * @param request - the record id.
   * @returns the deleted id.
   */
  @Remote('deleteExperiment')
  async deleteExperiment(request: { id: string }): Promise<ResearchDeleteExperimentResult> {
    const table = this.domain.table('experiments')
    if (table.get(request.id) === undefined) {
      return rejected({ code: 'experiment-not-found', id: request.id })
    }
    await table.delete(request.id)
    return success({ id: request.id })
  }

  /**
   * Upsert one experiment record (the panel's inline create/edit form).
   * `projectId` must name a wiki project (`project-not-found`); the name
   * must be non-empty, the status one of running/success/failed, and a
   * given `serverId` must name a remembered server (`invalid-input`). An
   * omitted `id` creates with a fresh `exp-` id; a given `id` must exist
   * (`experiment-not-found`) and replaces the mutable fields. An omitted
   * `logPath`/`serverId` is ABSENT from the record (never an
   * undefined-valued key — the gateway's JSON-safety pass rejects those),
   * and on update preserves the stored value (the form does not edit
   * logPath; clearing a server link goes through `updateExperiment`'s
   * null). Either way `updatedAt` refreshes — ExperimentRecord carries no
   * createdAt.
   * @param request - the full-field payload.
   * @returns the stored record after the upsert.
   */
  @Remote('saveExperiment')
  async saveExperiment(request: { experiment: ExperimentInput }): Promise<ResearchSaveExperimentResult> {
    const input = request.experiment
    if (this.domain.table('projects').get(input.projectId) === undefined) {
      return rejected({ code: 'project-not-found', projectId: input.projectId })
    }
    const invalid = validateExperimentInput(input)
    if (invalid !== null) return rejected({ code: 'invalid-input', message: invalid })
    if (input.serverId !== undefined
      && this.domain.table('servers').get(input.serverId) === undefined) {
      return rejected({ code: 'invalid-input', message: `unknown server: ${input.serverId}` })
    }
    const table = this.domain.table('experiments')
    const now = new Date().toISOString()
    if (input.id !== undefined) {
      const existing = table.get(input.id)
      if (existing === undefined) return rejected({ code: 'experiment-not-found', id: input.id })
      const next: ExperimentRecord = {
        ...existing,
        projectId: input.projectId,
        name: input.name,
        status: input.status,
        metrics: input.metrics,
        ...(input.logPath === undefined ? {} : { logPath: input.logPath }),
        ...(input.serverId === undefined ? {} : { serverId: input.serverId }),
        updatedAt: now,
      }
      await table.put(input.id, next)
      return success({ experiment: next })
    }
    const created: ExperimentRecord = {
      id: `exp-${Date.now().toString(36)}`,
      projectId: input.projectId,
      name: input.name,
      status: input.status,
      metrics: input.metrics,
      ...(input.logPath === undefined ? {} : { logPath: input.logPath }),
      ...(input.serverId === undefined ? {} : { serverId: input.serverId }),
      updatedAt: now,
    }
    await table.put(created.id, created)
    return success({ experiment: created })
  }

  /**
   * Update one experiment record. Only the server link is mutable this round:
   * a string `serverId` must name a remembered server (`invalid-input`
   * otherwise), null clears the link, and an omitted field is a no-op. An
   * unknown experiment id is `experiment-not-found`.
   * @param request - the record id plus the fields to replace.
   * @returns the stored record after the update.
   */
  @Remote('updateExperiment')
  async updateExperiment(request: {
    id: string
    serverId?: string | null | undefined
  }): Promise<ResearchUpdateExperimentResult> {
    const table = this.domain.table('experiments')
    const existing = table.get(request.id)
    if (existing === undefined) {
      return rejected({ code: 'experiment-not-found', id: request.id })
    }
    if (request.serverId !== undefined && request.serverId !== null
      && this.domain.table('servers').get(request.serverId) === undefined) {
      return rejected({ code: 'invalid-input', message: `unknown server: ${request.serverId}` })
    }
    let next: ExperimentRecord = existing
    if (request.serverId === null) {
      const { serverId: _dropped, ...rest } = existing
      next = rest
    } else if (request.serverId !== undefined) {
      next = { ...existing, serverId: request.serverId }
    }
    await table.put(request.id, next)
    return success({ experiment: next })
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
   * Reorder the top-level `\section` blocks of the addressed project's paper
   * `main.tex`. `baseOutline` is the top-level section title sequence the
   * client's drag gesture was based on; when the file's current sequence
   * differs (the agent edited the document mid-gesture) the call rejects with
   * `conflict` and writes nothing. The reorder and the commit ride the same
   * optimistic-concurrency path as `savePaperSource` (the snapshot's mtime is
   * the save base), and everything outside the moved blocks survives
   * byte-for-byte.
   * @param request - the selected project, the ordered moves, the outline the
   * client saw, and an optional explicit paper directory (relative to the
   * workspace) overriding the record's `paperDir`.
   * @returns the committed mtime, `project-not-found`, `paper-not-found`,
   * `invalid-dir`, `section-not-found` for an unknown move title,
   * `invalid-input` for an out-of-range target, or `conflict`.
   */
  @Remote('reorderPaperSections')
  async reorderPaperSections(request: {
    projectId: string
    moves: SectionMove[]
    baseOutline: string[]
    dir?: string | undefined
  }): Promise<ResearchSavePaperSourceResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    const texPath = join(dir, 'main.tex')
    const snapshot = await readPaperSource(texPath)
    if (snapshot === undefined) return rejected({ code: 'paper-not-found' })
    const sections = parseTexOutline(snapshot.content)
      .filter(node => node.level === 1)
      .map(node => node.title)
    if (sections.length !== request.baseOutline.length
      || sections.some((title, index) => title !== request.baseOutline[index])) {
      return rejected({ code: 'conflict', currentMtimeMs: snapshot.mtimeMs })
    }
    if (request.moves.length === 0) return success({ mtimeMs: snapshot.mtimeMs })
    const reordered = reorderSections(snapshot.content, request.moves)
    if (reordered.kind === 'section-not-found') {
      return rejected({ code: 'section-not-found', title: reordered.title })
    }
    if (reordered.kind === 'invalid-move') {
      return rejected({ code: 'invalid-input', message: `section target index ${reordered.targetIndex} out of range` })
    }
    const outcome = await saveTextFileOptimistic(texPath, reordered.tex, snapshot.mtimeMs)
    if (outcome.kind === 'missing') return rejected({ code: 'paper-not-found' })
    if (outcome.kind === 'conflict') {
      return rejected({ code: 'conflict', currentMtimeMs: outcome.currentMtimeMs })
    }
    return success({ mtimeMs: outcome.mtimeMs })
  }

  /**
   * Read the addressed project's `references.bib` as parsed entries. An
   * absent file is a SUCCESS with an empty list and a null mtime — the panel
   * treats "no bibliography yet" as a normal state, not an error.
   * @param request - the selected project, plus an optional explicit paper
   * directory (relative to the workspace) overriding the record's `paperDir`.
   * @returns entries in file order plus the mtime the parse belongs to (the
   * optimistic-concurrency base for `saveBibliography`; null when absent), or
   * `project-not-found`/`invalid-dir` for a bad address.
   */
  @Remote('getBibliography')
  async getBibliography(request: { projectId: string; dir?: string | undefined }): Promise<ResearchBibliographyResult> {
    const record = this.domain.table('projects').get(request.projectId)
    if (record === undefined) {
      return rejected({ code: 'project-not-found', projectId: request.projectId })
    }
    const dir = resolvePaperDir(this.workspaceDir, request.dir, record.paperDir)
    if (dir === undefined) return rejected({ code: 'invalid-dir', dir: request.dir ?? record.paperDir ?? '' })
    const snapshot = await readPaperSource(join(dir, 'references.bib'))
    if (snapshot === undefined) return success({ entries: Object.freeze([]), mtimeMs: null })
    return success({ entries: Object.freeze(parseBibtex(snapshot.content)), mtimeMs: snapshot.mtimeMs })
  }

  /**
   * Replace the addressed project's `references.bib` under optimistic
   * concurrency, creating it when it does not exist yet: a null
   * `baseMtimeMs` states "I read an absent file" and only a create commits;
   * otherwise the file's mtime must still equal the base. The paper directory
   * itself must exist (`paper-not-found` otherwise) — a bibliography without
   * a scaffolded paper is never created.
   * @param request - the selected project, the complete next entry list, the
   * mtime the caller's draft is based on (null for create-only), and an
   * optional explicit paper directory.
   * @returns the committed mtime, `project-not-found`, `paper-not-found`,
   * `invalid-dir`, `bib-not-found` when the file was expected but is gone, or
   * `conflict` carrying the mtime that displaced the base.
   */
  @Remote('saveBibliography')
  async saveBibliography(request: {
    projectId: string
    entries: BibEntry[]
    baseMtimeMs: number | null
    dir?: string | undefined
  }): Promise<ResearchSaveBibliographyResult> {
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
    const outcome = await saveTextFileOptimistic(
      join(dir, 'references.bib'), serializeBibtex(request.entries), request.baseMtimeMs,
    )
    if (outcome.kind === 'missing') return rejected({ code: 'bib-not-found' })
    if (outcome.kind === 'conflict') {
      return rejected({ code: 'conflict', currentMtimeMs: outcome.currentMtimeMs })
    }
    return success({ mtimeMs: outcome.mtimeMs })
  }

  /**
   * Append `@misc` entries for the given remembered papers to the addressed
   * project's `references.bib`, skipping citation keys already present. Every
   * arXiv id must name a wiki paper (`paper-not-found` on the first unknown
   * one — nothing is written then). The read-merge-write runs inside the
   * writer lock, so a concurrent panel save or agent write cannot be lost.
   * @param request - the selected project, the arXiv ids to append, and an
   * optional explicit paper directory.
   * @returns the appended and the already-present citation keys, or
   * `project-not-found`/`paper-not-found`/`invalid-dir`.
   */
  @Remote('importPapersToBib')
  async importPapersToBib(request: {
    projectId: string
    arxivIds: string[]
    dir?: string | undefined
  }): Promise<ResearchImportBibResult> {
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
    const papers = this.domain.table('papers')
    const sources = new Map<string, PaperRecord>()
    for (const arxivId of request.arxivIds) {
      const paper = papers.get(arxivId)
      if (paper === undefined) return rejected({ code: 'paper-not-found' })
      sources.set(arxivId, paper)
    }
    const bibPath = join(dir, 'references.bib')
    return await withFileLock(bibPath, async (): Promise<ResearchImportBibResult> => {
      const snapshot = await readPaperSource(bibPath)
      const entries = parseBibtex(snapshot?.content ?? '')
      const present = new Set(entries.map(entry => entry.key))
      const added: string[] = []
      const skipped: string[] = []
      for (const [arxivId, paper] of sources) {
        const key = bibKeyOf(arxivId)
        if (present.has(key)) { skipped.push(key); continue }
        entries.push(entryFromPaper(paper))
        present.add(key)
        added.push(key)
      }
      if (added.length > 0) {
        await writeFileAtomic(bibPath, serializeBibtex(entries), { mode: 0o666 })
      }
      return success({ added: Object.freeze(added), skipped: Object.freeze(skipped) })
    })
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
   * an unknown update id is `server-not-found`. A present `tags` list is
   * trimmed, emptied out, and deduped before it replaces the record's tags;
   * an omitted list keeps them.
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
    // Tags are trimmed, emptied out, and deduped (the updatePaper cleaning).
    const tags = input.tags === undefined
      ? undefined
      : [...new Set(input.tags.map(tag => tag.trim()).filter(tag => tag !== ''))]
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
        tags: tags ?? existing.tags,
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
      tags: tags ?? [],
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

  /**
   * Submit one remote command to a remembered server. The record lands
   * `queued` and the run starts in the background: this call returns once
   * the record is durable, and the panel polls `listJobs` for the status
   * flips (`running`, then `succeeded`/`failed`). The command must be
   * non-empty and at most {@link JOB_COMMAND_MAX_CHARS} characters
   * (`invalid-input`), and the server must name an ssh login user (a
   * TCP-only record cannot run jobs). A given `experimentId` must name an
   * experiment record (`experiment-not-found`): a linked experiment flips
   * to `running` with the server link on submit, then to
   * `success`/`failed` when the job settles.
   * @param request - the target server, the command line, and the optional
   * experiment link.
   * @returns the queued record.
   */
  @Remote('submitJob')
  async submitJob(request: {
    serverId: string
    command: string
    experimentId?: string | undefined
  }): Promise<ResearchSubmitJobResult> {
    const server = this.domain.table('servers').get(request.serverId)
    if (server === undefined) {
      return rejected({ code: 'server-not-found', id: request.serverId })
    }
    const command = request.command.trim()
    if (command === '') return rejected({ code: 'invalid-input', message: 'command must be non-empty' })
    if (command.length > JOB_COMMAND_MAX_CHARS) {
      return rejected({ code: 'invalid-input', message: `command must be at most ${String(JOB_COMMAND_MAX_CHARS)} characters` })
    }
    if (server.username === '') {
      return rejected({ code: 'invalid-input', message: `server ${server.name} has no ssh login user` })
    }
    if (request.experimentId !== undefined
      && this.domain.table('experiments').get(request.experimentId) === undefined) {
      return rejected({ code: 'experiment-not-found', id: request.experimentId })
    }
    this.jobSeq += 1
    const job: JobRecord = {
      id: `job-${Date.now().toString(36)}-${String(this.jobSeq)}`,
      serverId: server.id,
      command,
      status: 'queued',
      experimentId: request.experimentId,
      exitCode: null,
      stdoutTail: '',
      stderrTail: '',
      createdAt: new Date().toISOString(),
    }
    await this.domain.table('jobs').put(job.id, job)
    if (request.experimentId !== undefined) {
      await this.markExperiment(request.experimentId, 'running', server.id)
    }
    // Fire-and-forget: runJob never rejects; the panel follows the
    // transitions through listJobs.
    void this.runJob(job.id)
    return success({ job })
  }

  /**
   * List submitted remote jobs, most recently submitted first, optionally
   * filtered to one server (an unknown id is `server-not-found`). This is
   * the panel's polling read.
   * @param request - the optional server filter.
   * @returns the job rows.
   */
  @Remote('listJobs')
  listJobs(request: { serverId?: string }): Promise<ResearchListJobsResult> {
    if (request.serverId !== undefined
      && this.domain.table('servers').get(request.serverId) === undefined) {
      return Promise.resolve(rejected({ code: 'server-not-found', id: request.serverId }))
    }
    const jobs = [...this.domain.table('jobs').entries()]
      .map(([, record]) => record)
      .filter(record => request.serverId === undefined || record.serverId === request.serverId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return Promise.resolve(success({ jobs: Object.freeze(jobs) }))
  }

  /**
   * Delete one job record; an unknown id is `job-not-found`. Deleting a
   * queued/running job removes only the record: the remote command still
   * finishes, but its outcome is written nowhere.
   * @param request - the record id.
   * @returns the deleted id.
   */
  @Remote('deleteJob')
  async deleteJob(request: { id: string }): Promise<ResearchDeleteJobResult> {
    const table = this.domain.table('jobs')
    if (table.get(request.id) === undefined) {
      return rejected({ code: 'job-not-found', id: request.id })
    }
    await table.delete(request.id)
    return success({ id: request.id })
  }

  /**
   * Drive one queued job to its terminal state over a batch-mode ssh call:
   * flip the record `running`, wait on the remote command (killed after
   * {@link SSH_JOB_TIMEOUT_MS}), then settle `succeeded` (exit 0) or
   * `failed` with the output tails. Never rejects — the record is the
   * panel's only channel.
   * @param id - the job record id.
   */
  private async runJob(id: string): Promise<void> {
    const table = this.domain.table('jobs')
    const queued = table.get(id)
    if (queued === undefined) return
    const server = this.domain.table('servers').get(queued.serverId)
    if (server === undefined) {
      await table.put(id, {
        ...queued,
        status: 'failed',
        stderrTail: 'server record deleted before the job started',
        finishedAt: new Date().toISOString(),
      })
      return
    }
    const running: JobRecord = { ...queued, status: 'running', startedAt: new Date().toISOString() }
    await table.put(id, running)
    let settled: JobRecord
    try {
      const { stdout, stderr } = await execFileAsync('ssh', [
        '-o', 'BatchMode=yes',
        '-o', `ConnectTimeout=${String(GPU_PROBE_SSH_CONNECT_TIMEOUT_S)}`,
        '-p', String(server.port),
        `${server.username}@${server.host}`,
        running.command,
      ], { timeout: SSH_JOB_TIMEOUT_MS, maxBuffer: SSH_JOB_MAX_BUFFER_BYTES })
      settled = {
        ...running, status: 'succeeded', exitCode: 0,
        stdoutTail: tailOf(stdout), stderrTail: tailOf(stderr),
        finishedAt: new Date().toISOString(),
      }
    } catch (error) {
      // execFile failures carry the child's exit code and captured output;
      // the ssh client propagates the remote command's exit code as its
      // own, so a numeric code IS the remote exit code. A non-numeric code
      // means the session itself failed (connect refused, spawn error, or
      // the timeout kill) — then the message stands in for stderr.
      const carrier = error as { code?: unknown; stdout?: unknown; stderr?: unknown }
      const exitCode = typeof carrier.code === 'number' ? carrier.code : null
      const stdout = typeof carrier.stdout === 'string' ? carrier.stdout : ''
      const stderr = typeof carrier.stderr === 'string' && carrier.stderr.trim() !== ''
        ? carrier.stderr
        : error instanceof Error ? error.message : 'ssh job failed'
      settled = {
        ...running, status: 'failed', exitCode,
        stdoutTail: tailOf(stdout), stderrTail: tailOf(stderr),
        finishedAt: new Date().toISOString(),
      }
    }
    // A delete during the run already dropped the record: the remote
    // command still finished, but nothing is written back.
    if (table.get(id) === undefined) return
    await table.put(id, settled)
    if (settled.experimentId !== undefined) {
      await this.markExperiment(settled.experimentId, settled.status === 'succeeded' ? 'success' : 'failed')
    }
  }

  /**
   * Flip one linked experiment's status, linking the server on submit; a
   * deleted experiment is skipped.
   * @param experimentId - the experiment record id.
   * @param status - the next lifecycle status.
   * @param serverId - the executing server, set on the submit flip only.
   */
  private async markExperiment(experimentId: string, status: ExperimentStatus, serverId?: string): Promise<void> {
    const table = this.domain.table('experiments')
    const existing = table.get(experimentId)
    if (existing === undefined) return
    await table.put(experimentId, {
      ...existing,
      status,
      serverId: serverId ?? existing.serverId,
      updatedAt: new Date().toISOString(),
    })
  }

  /**
   * Export the whole wiki as one snapshot: every record of all six tables
   * under the format envelope (backup/migration).
   * @returns the snapshot; the table arrays carry each record with its
   * primary-key field (`arxivId`/`id`).
   */
  @Remote('exportWiki')
  exportWiki(): Promise<ResearchExportWikiResult> {
    return Promise.resolve(success({ snapshot: buildWikiSnapshot(this.domain) }))
  }

  /**
   * Import one wiki snapshot. Every row is validated against its table's
   * schema BEFORE any write, so a bad snapshot changes nothing. `merge`
   * upserts only absent primary keys — existing records are never
   * overwritten, just counted as skipped (conservative first). `replace`
   * wipes all six tables first, so it additionally requires
   * `confirmReplace: true` (`invalid-input` otherwise).
   * @param request - the parsed snapshot JSON, the mode, and the replace
   * confirmation flag.
   * @returns per-table imported/skipped row counts.
   */
  @Remote('importWiki')
  async importWiki(request: {
    snapshot: ResearchWikiSnapshot
    mode: ResearchImportWikiMode
    confirmReplace?: boolean
  }): Promise<ResearchImportWikiResult> {
    // Widened to string so the runtime guard is not linted away: remote
    // callers bypass the ResearchImportWikiMode type.
    const rawMode: string = request.mode
    if (rawMode !== 'merge' && rawMode !== 'replace') {
      return rejected({ code: 'invalid-input', message: `unknown import mode: ${rawMode}` })
    }
    if (request.mode === 'replace' && request.confirmReplace !== true) {
      return rejected({ code: 'invalid-input', message: 'replace mode requires confirmReplace: true' })
    }
    const envelopeError = snapshotEnvelopeError(request.snapshot)
    if (envelopeError !== null) return rejected({ code: 'invalid-input', message: envelopeError })
    const snapshot = request.snapshot
    for (const name of WIKI_TABLE_NAMES) {
      const rowError = tableRowsError(name, snapshot.tables[name])
      if (rowError !== null) return rejected({ code: 'invalid-input', message: rowError })
    }
    const zeroCounts = (): Record<ResearchWikiTableName, number> => ({
      papers: 0, ideas: 0, claims: 0, projects: 0, experiments: 0, servers: 0,
    })
    const imported = zeroCounts()
    const skipped = zeroCounts()
    for (const name of WIKI_TABLE_NAMES) {
      const table = this.domain.table(name) as {
        get: (key: string) => unknown
        put: (key: string, value: unknown) => Promise<void>
        delete: (key: string) => Promise<boolean>
        entries: () => IterableIterator<[string, unknown]>
      }
      const keyField = WIKI_TABLE_KEY[name]
      if (request.mode === 'replace') {
        for (const [key] of [...table.entries()]) await table.delete(key)
      }
      for (const row of snapshot.tables[name]) {
        const key = (row as unknown as Record<string, unknown>)[keyField] as string
        if (request.mode === 'merge' && table.get(key) !== undefined) {
          skipped[name] += 1
          continue
        }
        await table.put(key, row)
        imported[name] += 1
      }
    }
    return success({ imported, skipped })
  }

  /**
   * The scheduled-backup status line for the overview's data section: the
   * resolved knobs plus how many backups are on disk (and the newest one's
   * name). A missing/unreadable directory reads as zero backups; a service
   * built without backup knobs reports `enabled: false`.
   * @returns the backup status view.
   */
  @Remote('listBackups')
  async listBackups(): Promise<ResearchListBackupsResult> {
    if (this.backup === undefined || !this.backup.enabled) {
      return success({
        backup: { enabled: false, intervalMinutes: 0, keep: 0, count: 0, latestName: null },
      })
    }
    const names = (await readdir(this.backup.dir).catch(() => [] as string[]))
      .filter(isBackupFileName)
      .sort()
    return success({
      backup: {
        enabled: true,
        intervalMinutes: this.backup.intervalMinutes,
        keep: this.backup.keep,
        count: names.length,
        latestName: names.at(-1) ?? null,
      },
    })
  }
}

export default ResearchService
