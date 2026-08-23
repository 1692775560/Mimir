/**
 * Research-suite record, verdict, and web-panel wire types. Types only — the
 * zod schemas that validate these records at the durable boundary live in
 * `./store.ts`.
 * @module dsh-mimir/types
 */

import type { LatexIssue } from './latex-log.ts'
import type { OutlineNode } from './outline.ts'
import type { LatexEngineKind } from './tools/latex.ts'
import type { ArxivEntry } from './tools/arxiv.ts'
export type { OutlineNode, SectionMove, SectionOutlineTitles, SubsectionMove } from './outline.ts'
export type { ArxivEntry } from './tools/arxiv.ts'
export type { BibEntry } from './bibtex.ts'
import type { BibEntry } from './bibtex.ts'

/** One independent-review verdict. */
export type Verdict = 'PASS' | 'WARN' | 'FAIL'

/** One arXiv paper remembered by the research wiki. */
export interface PaperRecord {
  /** Bare arXiv id (version suffix allowed, e.g. `2103.00020v2`). */
  readonly arxivId: string
  readonly title: string
  readonly authors: string[]
  readonly summary: string
  readonly url: string
  /** Free-form working notes the agent attaches while reading. */
  readonly notes: string
  /** Organization tags, edited from the workbench. */
  tags: string[]
  /** Wiki projects this paper is linked to. */
  projectIds: string[]
  /**
   * Fetched PDF's path relative to the workspace root; absent until the
   * workbench fetches the PDF (records predating the field read as absent).
   */
  readonly pdfPath?: string | undefined
  /** ISO-8601 timestamp of the record's first write. */
  readonly addedAt: string
}

/**
 * One research idea. Failed ideas stay listed forever: the failed-ideas
 * memory is what stops the ideation loop from re-proposing dead ends.
 */
export interface IdeaRecord {
  readonly id: string
  readonly title: string
  readonly hypothesis: string
  readonly status: 'active' | 'failed' | 'adopted'
  /** Why the idea failed; present on records whose status is `failed`. */
  readonly failureReason?: string | undefined
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string
}

/** One tracked claim and the evidence for or against it. */
export interface ClaimRecord {
  readonly id: string
  readonly text: string
  readonly status: 'supported' | 'invalidated' | 'pending'
  /** Free-form evidence pointer (file, experiment, citation). */
  readonly evidence: string
}

/** Lifecycle stage of one research project. */
export type ProjectStage = 'idea' | 'plan' | 'experiment' | 'writing' | 'done'

/** One research project tracked across the idea→paper pipeline. */
export interface ProjectRecord {
  readonly id: string
  readonly title: string
  readonly stage: ProjectStage
  /**
   * Paper directory relative to the workspace root (default `paper`). Lets
   * each project point at its own LaTeX tree under the same workspace.
   */
  readonly paperDir?: string | undefined
  /** Artifact paths relative to the configured workspace directory. */
  readonly artifacts: string[]
  /** Number of completed independent-review rounds. */
  readonly reviewRounds: number
  /** ISO-8601 timestamp of the last write. */
  readonly updatedAt: string
}

/** Lifecycle of one experiment run. */
export type ExperimentStatus = 'running' | 'success' | 'failed'

/** One experiment tracked against a project. */
export interface ExperimentRecord {
  readonly id: string
  /** Owning wiki project id. */
  readonly projectId: string
  readonly name: string
  readonly status: ExperimentStatus
  /** Scalar metrics keyed by name (accuracy, loss, wall-clock minutes…). */
  readonly metrics: Record<string, number | string>
  /** Log file path relative to the workspace root, when the run wrote one. */
  readonly logPath?: string | undefined
  /** Remembered server the run executed on, when linked. */
  readonly serverId?: string | undefined
  /** ISO-8601 timestamp of the last write. */
  readonly updatedAt: string
}

/** Lifecycle of one remote job submitted over ssh. */
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

/** One remote command submitted to a remembered server over ssh. */
export interface JobRecord {
  readonly id: string
  /** Remembered server the command runs on. */
  readonly serverId: string
  /** The remote command line, executed by the server's login shell. */
  readonly command: string
  readonly status: JobStatus
  /** Experiment record the job is linked to, when given at submit time. */
  readonly experimentId?: string | undefined
  /** Remote exit code; null until the job settles (and on a spawn/timeout failure). */
  readonly exitCode: number | null
  /** The last chunk of the job's stdout (empty until the job settles). */
  readonly stdoutTail: string
  /** The last chunk of the job's stderr (empty until the job settles). */
  readonly stderrTail: string
  /** ISO-8601 timestamp of the record's first write. */
  readonly createdAt: string
  /** ISO-8601 timestamp of the status flip to `running`. */
  readonly startedAt?: string | undefined
  /** ISO-8601 timestamp of the terminal settle. */
  readonly finishedAt?: string | undefined
}

/** Metadata of one figure file saved into a project's paper directory. */
export interface FigureRecord {
  /** Composite key: `<projectId>:<relPath>` — one metadata row per figure file. */
  readonly id: string
  /** Owning wiki project id. */
  readonly projectId: string
  /** Path relative to the project's paper directory (`figures/foo.png`). */
  readonly relPath: string
  /** Free-form caption the saving agent attached. */
  readonly caption: string
  /** Experiment record the figure belongs to, when linked. */
  readonly experimentId?: string | undefined
  /** Where the figure was copied from, when the save recorded it. */
  readonly sourcePath?: string | undefined
  /** ISO-8601 timestamp of the record's first write. */
  readonly createdAt: string
}

/** One issue raised by an independent review round. */
export interface ReviewIssue {
  readonly severity: 'major' | 'minor'
  /** File and line region the issue refers to. */
  readonly location: string
  readonly problem: string
  readonly suggestion: string
}

/** The structured outcome of one independent review round. */
export interface ReviewRound {
  readonly verdict: Verdict
  readonly issues: ReviewIssue[]
  readonly summary: string
}

/* ── Web research panel wire payloads (the `research` Remote namespace) ───── */

/** One project row as the research panel lists it. */
export interface ResearchProjectView {
  readonly id: string
  readonly title: string
  readonly stage: ProjectStage
  /** Paper directory relative to the workspace root; absent means `paper`. */
  readonly paperDir?: string | undefined
  /** Number of completed independent-review rounds. */
  readonly reviewRounds: number
  /** Artifact paths relative to the workspace root (for the overview view). */
  readonly artifacts: readonly string[]
  readonly updatedAt: string
}

/** Compile lifecycle of the shared paper directory, per addressed project. */
export type ResearchCompileState = 'idle' | 'running' | 'ok' | 'error'

/** The research panel's view of one project's last compile. */
export interface ResearchCompileStatusView {
  readonly state: ResearchCompileState
  /** Errors and warnings of the last completed compile, in log order. */
  readonly issues: readonly LatexIssue[]
  /** Engine of the last completed compile; null until the first one settles. */
  readonly engine: LatexEngineKind | null
  /** mtime (ms) of the produced `main.pdf`; null until a successful compile. */
  readonly pdfUpdatedAt: number | null
}

/** Business failure of one `research` Remote call. */
export type ResearchFailure =
  | { readonly code: 'project-not-found'; readonly projectId: string }
  | { readonly code: 'paper-not-found' }
  | { readonly code: 'bib-not-found' }
  | { readonly code: 'invalid-dir'; readonly dir: string }
  | { readonly code: 'invalid-path'; readonly path: string }
  | { readonly code: 'figure-not-found'; readonly relPath: string }
  | { readonly code: 'artifact-not-found'; readonly name: string }
  | { readonly code: 'invalid-artifact'; readonly name: string }
  | { readonly code: 'server-not-found'; readonly id: string }
  | { readonly code: 'job-not-found'; readonly id: string }
  | { readonly code: 'experiment-not-found'; readonly id: string }
  | { readonly code: 'section-not-found'; readonly title: string }
  | { readonly code: 'subsection-not-found'; readonly sectionTitle: string; readonly title: string }
  | { readonly code: 'invalid-input'; readonly message: string }
  | { readonly code: 'conflict'; readonly currentMtimeMs: number }
  | { readonly code: 'operation-failed'; readonly message: string }

/** Success branch of one `research` Remote call. */
export interface ResearchSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Business-failure branch of one `research` Remote call. */
export interface ResearchRejected<E extends ResearchFailure> {
  readonly ok: false
  readonly error: E
}

/** Closed result union of one `research` Remote call. */
export type ResearchResult<T> = ResearchSuccess<T> | ResearchRejected<ResearchFailure>

/** `listProjects` result: every wiki project, most recently updated first. */
export type ResearchListProjectsResult = ResearchResult<{ readonly projects: readonly ResearchProjectView[] }>

/** `getPaperOutline` result: the section tree of `<workspace>/paper/main.tex`. */
export type ResearchOutlineResult = ResearchResult<{
  readonly projectId: string
  readonly nodes: readonly OutlineNode[]
}>

/** `compile` result: the settled compile status of the addressed project. */
export type ResearchCompileResult = ResearchResult<ResearchCompileStatusView>

/** `getCompileStatus` result: the last known compile status (idle before the first run). */
export type ResearchCompileStatusResult = ResearchResult<ResearchCompileStatusView>

/** `getPaperSource` result: `main.tex` content plus the mtime it was read from. */
export type ResearchPaperSourceResult = ResearchResult<{
  readonly content: string
  readonly mtimeMs: number
}>

/** `savePaperSource` result: the committed mtime (a conflict rejects with its mtime). */
export type ResearchSavePaperSourceResult = ResearchResult<{ readonly mtimeMs: number }>

/** `listPapers` result: every remembered paper, most recently added first. */
export type ResearchPapersResult = ResearchResult<{ readonly papers: readonly PaperRecord[] }>

/** `searchArxiv` result: the parsed arXiv entries matching the query. */
export type ResearchSearchArxivResult = ResearchResult<{ readonly results: readonly ArxivEntry[] }>

/** `searchWeb` result: one SearXNG web result row. */
export interface WebSearchEntry {
  /** Result page title. */
  readonly title: string
  /** Result URL, verbatim from the engine. */
  readonly url: string
  /** Snippet text the engine returned (may be empty). */
  readonly content: string
  /** Engine that produced this result (e.g. `arxiv`, `brave`). */
  readonly engine: string
  /** SearXNG category of the result (e.g. `science`, `general`). */
  readonly category: string
  /** ISO-8601 published date when the engine supplied one, else empty. */
  readonly publishedDate: string
}

/** `searchWeb` result: the parsed SearXNG results matching the query. */
export type ResearchSearchWebResult = ResearchResult<{ readonly results: readonly WebSearchEntry[] }>

/** `importPaper` result: false when the paper was already remembered. */
export type ResearchImportPaperResult = ResearchResult<{ readonly imported: boolean }>

/** `removePaper` result: the removed paper's arXiv id. */
export type ResearchRemovePaperResult = ResearchResult<{ readonly arxivId: string }>

/** `updatePaper` result: the stored record after the partial update. */
export type ResearchUpdatePaperResult = ResearchResult<{ readonly paper: PaperRecord }>

/** `fetchPaperPdf` result: the stored record with its `pdfPath` set. */
export type ResearchFetchPaperPdfResult = ResearchResult<{ readonly paper: PaperRecord }>

/** `listExperiments` result: experiment runs, filtered by project when given. */
export type ResearchExperimentsResult = ResearchResult<{ readonly experiments: readonly ExperimentRecord[] }>

/** `deleteExperiment` result: the deleted record's id. */
export type ResearchDeleteExperimentResult = ResearchResult<{ readonly id: string }>

/** `updateExperiment` result: the record after the update. */
export type ResearchUpdateExperimentResult = ResearchResult<{ readonly experiment: ExperimentRecord }>

/** `saveExperiment` input: the full-field upsert payload; an omitted `id` creates. */
export interface ExperimentInput {
  readonly id?: string | undefined
  readonly projectId: string
  readonly name: string
  readonly status: ExperimentStatus
  /** Scalar metrics keyed by name (numbers or strings). */
  readonly metrics: Record<string, number | string>
  readonly logPath?: string | undefined
  readonly serverId?: string | undefined
}

/** `saveExperiment` result: the stored record after the upsert. */
export type ResearchSaveExperimentResult = ResearchResult<{ readonly experiment: ExperimentRecord }>

/** `readArtifact` result: the markdown artifact's full text. */
export type ResearchArtifactResult = ResearchResult<{
  readonly name: string
  readonly content: string
  readonly mtimeMs: number
}>

/** One figure file discovered under a project's paper directory. */
export interface FigureEntry {
  /** Bare file name. */
  readonly name: string
  /** Path relative to the paper directory (`foo.png` or `figures/bar.svg`). */
  readonly relPath: string
  readonly sizeBytes: number
  readonly mtimeMs: number
  /** Caption from the wiki's figures metadata table, when the file has one. */
  readonly caption?: string | undefined
  /** Linked experiment id from the figures metadata table, when present. */
  readonly experimentId?: string | undefined
}

/** `listFigures` result: image files of the project's paper directory. */
export type ResearchFiguresResult = ResearchResult<{ readonly figures: readonly FigureEntry[] }>

/** `deleteFigure` result: the deleted file's paper-directory-relative path. */
export type ResearchDeleteFigureResult = ResearchResult<{ readonly relPath: string }>

/** One remembered compute server (a GPU box the experiments run on). */
export interface ServerRecord {
  readonly id: string
  readonly name: string
  readonly host: string
  readonly port: number
  /** SSH login user; an empty string downgrades probes to TCP-only. */
  readonly username: string
  /** Free-form operator note. */
  readonly note: string
  /** Operator-assigned grouping labels. */
  readonly tags: readonly string[]
  /** ISO-8601 timestamp of the record's first write. */
  readonly createdAt: string
  /** ISO-8601 timestamp of the last write. */
  readonly updatedAt: string
}

/** Upsert payload of `saveServer`: `id` present updates, absent creates. */
export interface ServerInput {
  readonly id?: string | undefined
  readonly name: string
  readonly host: string
  readonly port: number
  readonly username: string
  readonly note: string
  /** Replacement tag list; omitted keeps the existing tags on update. */
  readonly tags?: string[] | undefined
}

/** One GPU row parsed from a remote `nvidia-smi` probe. */
export interface ServerGpuView {
  readonly name: string
  /** GPU utilization in percent. */
  readonly utilizationPct: number
  readonly memoryUsedMb: number
  readonly memoryTotalMb: number
}

/** The settled outcome of one `checkServer` probe. */
export interface ServerStatusView {
  /** `online` once the TCP probe connects; the GPU readout is best-effort on top. */
  readonly state: 'online' | 'offline'
  /** TCP connect latency in ms; null when the probe never connected. */
  readonly latencyMs: number | null
  readonly gpus: readonly ServerGpuView[]
  /** ISO-8601 timestamp of the probe. */
  readonly checkedAt: string
  /** Failure detail (offline reason or the skipped/failed GPU probe); null when clean. */
  readonly message: string | null
}

/** `listServers` result: every remembered server, most recently updated first. */
export type ResearchListServersResult = ResearchResult<{ readonly servers: readonly ServerRecord[] }>

/** `saveServer` result: the upserted record (with its generated id on create). */
export type ResearchSaveServerResult = ResearchResult<{ readonly server: ServerRecord }>

/** `deleteServer` result: the deleted record's id. */
export type ResearchDeleteServerResult = ResearchResult<{ readonly id: string }>

/** `checkServer` result: the settled probe view. */
export type ResearchCheckServerResult = ResearchResult<ServerStatusView>

/** `submitJob` result: the queued record (the background run settles it later). */
export type ResearchSubmitJobResult = ResearchResult<{ readonly job: JobRecord }>

/** `listJobs` result: job records, most recently submitted first. */
export type ResearchListJobsResult = ResearchResult<{ readonly jobs: readonly JobRecord[] }>

/** `deleteJob` result: the deleted record's id. */
export type ResearchDeleteJobResult = ResearchResult<{ readonly id: string }>

/** `getBibliography` result: the parsed `references.bib` entries plus the file mtime (null when absent). */
export type ResearchBibliographyResult = ResearchResult<{
  readonly entries: readonly BibEntry[]
  readonly mtimeMs: number | null
}>

/** `saveBibliography` result: the committed mtime (a conflict rejects with its mtime). */
export type ResearchSaveBibliographyResult = ResearchResult<{ readonly mtimeMs: number }>

/** `importPapersToBib` result: appended and already-present citation keys. */
export type ResearchImportBibResult = ResearchResult<{
  readonly added: readonly string[]
  readonly skipped: readonly string[]
}>

/** The seven research-wiki tables, in domain order (the runtime-only `jobs` table is excluded). */
export type ResearchWikiTableName = 'papers' | 'ideas' | 'claims' | 'projects' | 'experiments' | 'servers' | 'figures'

/** One wiki export snapshot's table payload. */
export interface ResearchWikiSnapshotTables {
  readonly papers: readonly PaperRecord[]
  readonly ideas: readonly IdeaRecord[]
  readonly claims: readonly ClaimRecord[]
  readonly projects: readonly ProjectRecord[]
  readonly experiments: readonly ExperimentRecord[]
  readonly servers: readonly ServerRecord[]
  readonly figures: readonly FigureRecord[]
}

/**
 * One wiki backup snapshot: every record of all seven tables under a format
 * envelope (`format`/`version` guard against importing foreign JSON).
 */
export interface ResearchWikiSnapshot {
  readonly format: 'mimir-wiki'
  readonly version: 2
  readonly exportedAt: string
  readonly tables: ResearchWikiSnapshotTables
}

/** `exportWiki` result: the full snapshot. */
export type ResearchExportWikiResult = ResearchResult<{ readonly snapshot: ResearchWikiSnapshot }>

/** `importWiki` mode: merge upserts only absent keys; replace wipes first. */
export type ResearchImportWikiMode = 'merge' | 'replace'

/** `importWiki` result: per-table imported/skipped row counts. */
export type ResearchImportWikiResult = ResearchResult<{
  readonly imported: Record<ResearchWikiTableName, number>
  readonly skipped: Record<ResearchWikiTableName, number>
}>

/**
 * `listBackups` view: the scheduled-backup knobs plus what is on disk.
 * `enabled: false` means the timer is configured off (or the service was
 * built without backup knobs); the numeric fields then carry zeros.
 */
export interface ResearchBackupStatusView {
  readonly enabled: boolean
  readonly intervalMinutes: number
  readonly keep: number
  /** Backup files currently under the backup directory. */
  readonly count: number
  /** Newest backup's filename; null while none exists. */
  readonly latestName: string | null
}

/** `listBackups` result: the backup status line for the overview. */
export type ResearchListBackupsResult = ResearchResult<{ readonly backup: ResearchBackupStatusView }>
