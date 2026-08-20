/**
 * Research-suite record, verdict, and web-panel wire types. Types only — the
 * zod schemas that validate these records at the durable boundary live in
 * `./store.ts`.
 * @module dsh-mimir/types
 */

import type { LatexIssue } from './latex-log.ts'
import type { OutlineNode } from './outline.ts'
import type { LatexEngineKind } from './tools/latex.ts'
export type { OutlineNode } from './outline.ts'

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
  /** ISO-8601 timestamp of the last write. */
  readonly updatedAt: string
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
  | { readonly code: 'invalid-dir'; readonly dir: string }
  | { readonly code: 'artifact-not-found'; readonly name: string }
  | { readonly code: 'invalid-artifact'; readonly name: string }
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

/** `listExperiments` result: experiment runs, filtered by project when given. */
export type ResearchExperimentsResult = ResearchResult<{ readonly experiments: readonly ExperimentRecord[] }>

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
}

/** `listFigures` result: image files of the project's paper directory. */
export type ResearchFiguresResult = ResearchResult<{ readonly figures: readonly FigureEntry[] }>
