/**
 * Browser-local object layer behind the research panel: one controller per
 * client runtime backs both the project list and the selected project's
 * outline and compile status. Every read goes through the generated `research`
 * Remote; the generated face wraps each call in {@link RemoteResult}, so a
 * carrier failure arrives as the `ok: false` branch rather than a rejection.
 * Failures surface as `{ code, message }` pairs — the component maps the codes
 * it knows to localized copy and falls back to the Host-supplied message.
 * @module dsh-client-ui-mimir/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ResearchKey } from './locales.ts'
import { figureBlockOf, findFigureReferenceLine, insertFigureBlock, isSvgFigure } from './figure-insert.ts'
import { pruneExpiredToasts, pushToast, type ResearchToast, type ResearchToastKind } from './toasts.ts'
import type {
  ArxivEntry,
  BibEntry,
  ExperimentRecord,
  ExperimentInput,
  FigureEntry,
  JobRecord,
  OutlineNode,
  PaperRecord,
  ResearchArtifactResult,
  ResearchBackupStatusView,
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
  ResearchFetchPaperPdfResult,
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
  ResearchRemovePaperResult,
  ResearchSaveBibliographyResult,
  ResearchSaveExperimentResult,
  ResearchSavePaperSourceResult,
  ResearchSaveServerResult,
  ResearchSearchArxivResult,
  ResearchSubmitJobResult,
  ResearchUpdateExperimentResult,
  ResearchUpdatePaperResult,
  ResearchWikiSnapshot,
  SectionMove,
  SectionOutlineTitles,
  ServerInput,
  ServerRecord,
  ServerStatusView,
  SubsectionMove,
} from 'dsh-mimir/types'

/**
 * The thirty-three Remote calls this controller needs, exactly as the
 * generated `research` namespace types them.
 */
export interface ResearchRemote {
  listProjects: () => Promise<RemoteResult<ResearchListProjectsResult>>
  getPaperOutline: (request: { projectId: string; dir?: string | undefined }) => Promise<RemoteResult<ResearchOutlineResult>>
  compile: (request: { projectId?: string; dir?: string | undefined }, signal?: AbortSignal) => Promise<RemoteResult<ResearchCompileResult>>
  getCompileStatus: (request: { projectId?: string }) => Promise<RemoteResult<ResearchCompileStatusResult>>
  getPaperSource: (request: { projectId: string; dir?: string | undefined }) => Promise<RemoteResult<ResearchPaperSourceResult>>
  savePaperSource: (request: {
    projectId: string
    content: string
    baseMtimeMs: number
    dir?: string | undefined
  }) => Promise<RemoteResult<ResearchSavePaperSourceResult>>
  listPapers: () => Promise<RemoteResult<ResearchPapersResult>>
  searchArxiv: (request: { query: string; maxResults?: number }) => Promise<RemoteResult<ResearchSearchArxivResult>>
  importPaper: (request: { entry: ArxivEntry }) => Promise<RemoteResult<ResearchImportPaperResult>>
  removePaper: (request: { arxivId: string }) => Promise<RemoteResult<ResearchRemovePaperResult>>
  updatePaper: (request: {
    arxivId: string
    tags?: string[] | undefined
    projectIds?: string[] | undefined
    notes?: string | undefined
  }) => Promise<RemoteResult<ResearchUpdatePaperResult>>
  fetchPaperPdf: (request: { arxivId: string }) => Promise<RemoteResult<ResearchFetchPaperPdfResult>>
  listExperiments: (request: { projectId?: string }) => Promise<RemoteResult<ResearchExperimentsResult>>
  deleteExperiment: (request: { id: string }) => Promise<RemoteResult<ResearchDeleteExperimentResult>>
  updateExperiment: (request: {
    id: string
    serverId?: string | null | undefined
  }) => Promise<RemoteResult<ResearchUpdateExperimentResult>>
  saveExperiment: (request: { experiment: ExperimentInput }) => Promise<RemoteResult<ResearchSaveExperimentResult>>
  readArtifact: (request: { projectId: string; name: string }) => Promise<RemoteResult<ResearchArtifactResult>>
  listFigures: (request: { projectId: string; dir?: string | undefined }) => Promise<RemoteResult<ResearchFiguresResult>>
  deleteFigure: (request: { projectId: string; relPath: string; dir?: string | undefined }) => Promise<RemoteResult<ResearchDeleteFigureResult>>
  listServers: () => Promise<RemoteResult<ResearchListServersResult>>
  saveServer: (request: { server: ServerInput }) => Promise<RemoteResult<ResearchSaveServerResult>>
  deleteServer: (request: { id: string }) => Promise<RemoteResult<ResearchDeleteServerResult>>
  checkServer: (request: { id: string }) => Promise<RemoteResult<ResearchCheckServerResult>>
  submitJob: (request: {
    serverId: string
    command: string
    experimentId?: string | undefined
  }) => Promise<RemoteResult<ResearchSubmitJobResult>>
  listJobs: (request: { serverId?: string }) => Promise<RemoteResult<ResearchListJobsResult>>
  deleteJob: (request: { id: string }) => Promise<RemoteResult<ResearchDeleteJobResult>>
  getBibliography: (request: { projectId: string; dir?: string | undefined }) => Promise<RemoteResult<ResearchBibliographyResult>>
  saveBibliography: (request: {
    projectId: string
    entries: BibEntry[]
    baseMtimeMs: number | null
    dir?: string | undefined
  }) => Promise<RemoteResult<ResearchSaveBibliographyResult>>
  importPapersToBib: (request: {
    projectId: string
    arxivIds: string[]
    dir?: string | undefined
  }) => Promise<RemoteResult<ResearchImportBibResult>>
  reorderPaperSections: (request: {
    projectId: string
    moves: SectionMove[]
    baseOutline: string[]
    dir?: string | undefined
  }) => Promise<RemoteResult<ResearchSavePaperSourceResult>>
  reorderPaperSubsections: (request: {
    projectId: string
    moves: SubsectionMove[]
    baseOutline: SectionOutlineTitles[]
    dir?: string | undefined
  }) => Promise<RemoteResult<ResearchSavePaperSourceResult>>
  exportWiki: () => Promise<RemoteResult<ResearchExportWikiResult>>
  importWiki: (request: {
    snapshot: ResearchWikiSnapshot
    mode: ResearchImportWikiMode
    confirmReplace?: boolean
  }) => Promise<RemoteResult<ResearchImportWikiResult>>
  listBackups: () => Promise<RemoteResult<ResearchListBackupsResult>>
}

/** Quiet period after the last keystroke before the draft autosaves. */
export const AUTOSAVE_DEBOUNCE_MS = 800
/** Quiet period after a successful save before the auto-compile fires. */
export const COMPILE_DEBOUNCE_MS = 1500

/** Load lifecycle of one fetched view. */
export type ResearchLoadStatus = 'cold' | 'loading' | 'ready' | 'error'

/** One settled failure: a known code for localized copy plus the raw message. */
export interface ResearchFailureView {
  readonly code: string
  readonly message: string
}

/** The selected project's outline load. */
export interface ResearchOutlineView {
  readonly projectId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly nodes: readonly OutlineNode[]
  readonly failure: ResearchFailureView | null
}

/** Compile status annotated with the project it belongs to. */
export interface ResearchCompileView extends ResearchCompileStatusView {
  readonly projectId: string | null
}

/** Autosave lifecycle of the editor draft. */
export type ResearchSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'save-error'

/** The selected project's source-editor view. */
export interface ResearchSourceView {
  readonly projectId: string
  readonly status: 'loading' | 'ready' | 'error'
  /** The draft: the file's content, with local edits not yet saved. */
  readonly content: string
  /** mtime the current draft is based on; null until the first load settles. */
  readonly mtimeMs: number | null
  readonly saveState: ResearchSaveState
  readonly failure: ResearchFailureView | null
}

/**
 * A pending editor jump the paper view applies once its draft shows the
 * target line (the figures view's insert-into-paper outcome). The monotonic
 * `seq` re-fires the paper view's effect when two jumps land on the same line.
 */
export interface ResearchPaperJump {
  readonly projectId: string
  /** 1-based target line in the current draft. */
  readonly line: number
  readonly seq: number
}

/** The literature view: every remembered paper. */
export interface ResearchPapersView {
  readonly status: ResearchLoadStatus
  readonly list: readonly PaperRecord[]
  readonly failure: ResearchFailureView | null
}

/** The arXiv search panel: the last query's outcome (null before any search). */
export interface ResearchArxivSearchView {
  readonly query: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly list: readonly ArxivEntry[]
  readonly failure: ResearchFailureView | null
}

/** One per-project fetched view (experiments, artifact, figures). */
export interface ResearchProjectSlice<T> {
  readonly projectId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly list: T
  readonly failure: ResearchFailureView | null
}

/** The markdown artifact viewer's load. */
export interface ResearchArtifactView {
  readonly projectId: string
  readonly name: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly content: string
  readonly mtimeMs: number | null
  readonly failure: ResearchFailureView | null
}

/** The servers view: every remembered compute server. */
export interface ResearchServersView {
  readonly status: ResearchLoadStatus
  readonly list: readonly ServerRecord[]
  readonly failure: ResearchFailureView | null
}

/** The remote-jobs view: every submitted job, most recently submitted first. */
export interface ResearchJobsView {
  readonly status: ResearchLoadStatus
  readonly list: readonly JobRecord[]
  readonly failure: ResearchFailureView | null
}

/** Settled counts of one `importPapersToBib` run (appended vs already-present keys). */
export interface ResearchImportCounts {
  readonly added: readonly string[]
  readonly skipped: readonly string[]
}

/** The selected project's `references.bib` view, edited entry-wise through the panel. */
export interface ResearchBibView {
  readonly projectId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly entries: readonly BibEntry[]
  /** Optimistic-concurrency base for entry deletes; null while the file is absent. */
  readonly mtimeMs: number | null
  readonly saveState: ResearchSaveState
  readonly failure: ResearchFailureView | null
  /** The last import's counts, surfaced as the panel's confirmation line. */
  readonly lastImport: ResearchImportCounts | null
}

/** One server's probe lifecycle: in flight, or the last settled view. */
export type ServerCheckState = ServerStatusView | 'checking'

/** Immutable view published to the panel. */
export interface ResearchView {
  readonly projects: readonly ResearchProjectView[]
  readonly projectsStatus: ResearchLoadStatus
  readonly projectsFailure: ResearchFailureView | null
  readonly outline: ResearchOutlineView | null
  readonly compile: ResearchCompileView
  readonly source: ResearchSourceView | null
  readonly papers: ResearchPapersView
  /** The papers view's arXiv search outcome; null before the first search. */
  readonly arxivSearch: ResearchArxivSearchView | null
  readonly experiments: ResearchProjectSlice<readonly ExperimentRecord[]> | null
  readonly artifact: ResearchArtifactView | null
  readonly figures: ResearchProjectSlice<readonly FigureEntry[]> | null
  readonly servers: ResearchServersView
  /** Per-server probe state, keyed by server id; absent means never probed. */
  readonly serverChecks: Readonly<Record<string, ServerCheckState>>
  /** Submitted remote jobs (the servers view's jobs section). */
  readonly jobs: ResearchJobsView
  /** The selected project's bibliography; null until the bib panel first opens. */
  readonly bib: ResearchBibView | null
  /** The corner toast queue (oldest first); the host component sweeps expiries. */
  readonly toasts: readonly ResearchToast[]
  /** Scheduled-backup status for the overview; null until loaded (or on failure). */
  readonly backup: ResearchBackupStatusView | null
  /** The pending paper-editor jump of a figure insert; null once consumed. */
  readonly paperJump: ResearchPaperJump | null
}

const INITIAL_VIEW: ResearchView = Object.freeze({
  projects: Object.freeze([]),
  projectsStatus: 'cold',
  projectsFailure: null,
  outline: null,
  compile: Object.freeze({ projectId: null, state: 'idle', issues: Object.freeze([]), engine: null, pdfUpdatedAt: null }),
  source: null,
  papers: Object.freeze({ status: 'cold', list: Object.freeze([]), failure: null }),
  arxivSearch: null,
  experiments: null,
  artifact: null,
  figures: null,
  servers: Object.freeze({ status: 'cold', list: Object.freeze([]), failure: null }),
  serverChecks: Object.freeze({}),
  jobs: Object.freeze({ status: 'cold', list: Object.freeze([]), failure: null }),
  bib: null,
  toasts: Object.freeze([]),
  backup: null,
  paperJump: null,
})

/** Translate one settled Remote envelope or business branch into a failure view. */
function failureOf(code: string, message: string): ResearchFailureView {
  return Object.freeze({ code, message })
}

/** Failure view of one host business failure; only some variants carry a message. */
function businessFailure(error: ResearchFailure): ResearchFailureView {
  return failureOf(error.code, 'message' in error ? error.message : error.code)
}

/** Failure view of a thrown transport error. */
function transportFailure(error: unknown): ResearchFailureView {
  return failureOf('transport', error instanceof Error ? error.message : 'research remote call failed')
}

/**
 * The panel's object layer. The paper directory is shared across projects, so
 * compile status is tracked per addressed project id but describes the same
 * physical compile; the Host owns the authoritative record.
 */
export class ResearchController implements HostObservable<ResearchView> {
  private view = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private loadPromise: Promise<void> | null = null
  private backupPromise: Promise<void> | null = null
  private papersPromise: Promise<void> | null = null
  private serversPromise: Promise<void> | null = null
  private jobsPromise: Promise<void> | null = null
  private outlineGeneration = 0
  private artifactGeneration = 0
  private figuresGeneration = 0
  private arxivGeneration = 0
  private bibGeneration = 0
  private figuresInFlight = false
  private compileAbort: AbortController | null = null
  private compileQueued: string | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private compileTimer: ReturnType<typeof setTimeout> | null = null
  private saveInFlight = false
  private saveAgain = false
  private disposed = false
  private toastSeq = 0
  private paperJumpSeq = 0

  /**
   * @param remote - the research Remote namespace.
   */
  constructor(private readonly remote: ResearchRemote) {}

  /** Return the cached immutable view. */
  getSnapshot = (): ResearchView => this.view

  /** Subscribe to view replacement. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Load the project list once; a failed load stays retryable. */
  ensure(): void {
    if (this.view.projectsStatus === 'ready' || this.loadPromise !== null) return
    this.loadPromise = this.loadProjects().finally(() => { this.loadPromise = null })
    this.backupPromise ??= this.loadBackup().finally(() => { this.backupPromise = null })
  }

  /** Re-read the project list (the retry entry and the reconnect resync). */
  resync(): void {
    if (this.view.projectsStatus === 'cold') return
    this.loadPromise ??= this.loadProjects().finally(() => { this.loadPromise = null })
    this.backupPromise ??= this.loadBackup().finally(() => { this.backupPromise = null })
  }

  /**
   * Fetch the scheduled-backup status for the overview's data section.
   * Informational only: any failure leaves the slice null, hiding the line
   * instead of surfacing an error.
   */
  private async loadBackup(): Promise<void> {
    try {
      const carried = await this.remote.listBackups()
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await.
      if (this.disposed) return
      if (!carried.ok || !carried.value.ok) return
      this.publish({ backup: carried.value.value.backup })
    } catch {
      // Quiet by design: the line simply stays hidden.
    }
  }

  /**
   * Push one toast into the corner stack: same copy+detail dedupes to a
   * refresh, the queue caps at {@link TOAST_LIMIT} (oldest drops first).
   * Only user-initiated, slow, or asynchronous completions call this — never
   * high-frequency editor state like the autosave pill.
   * @param kind - toast severity.
   * @param copy - locale copy key (the controller stays locale-free).
   * @param detail - optional verbatim suffix (counts, the failure message).
   */
  notify(kind: ResearchToastKind, copy: ResearchKey, detail: string | null = null): void {
    if (this.disposed) return
    this.toastSeq += 1
    const { list } = pushToast(this.view.toasts, kind, copy, detail, Date.now(), this.toastSeq)
    this.publish({ toasts: list })
  }

  /** Remove one toast (the × button). @param id - toast id. */
  dismissToast(id: number): void {
    this.publish({ toasts: Object.freeze(this.view.toasts.filter(toast => toast.id !== id)) })
  }

  /** Sweep expired toasts (the host component's expiry timer). */
  pruneToasts(): void {
    const kept = pruneExpiredToasts(this.view.toasts, Date.now())
    if (kept !== this.view.toasts) this.publish({ toasts: kept })
  }

  /**
   * Export the whole wiki as one snapshot (the overview data section's
   * download button).
   * @returns the snapshot, or the settled failure view.
   */
  async exportWiki(): Promise<ResearchWikiSnapshot | ResearchFailureView> {
    try {
      const carried = await this.remote.exportWiki()
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      return result.value.snapshot
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Import one parsed snapshot in the given mode, then re-fetch every loaded
   * slice so the panel reflects the new wiki without a reopen.
   * @param snapshot - the parsed export JSON (revalidated host-side).
   * @param mode - `merge` skips existing keys; `replace` wipes first.
   * @param confirmReplace - must be true for `replace`.
   * @returns the per-table counts, or the settled failure view.
   */
  async importWiki(
    snapshot: unknown,
    mode: ResearchImportWikiMode,
    confirmReplace: boolean,
  ): Promise<{ imported: Record<string, number>; skipped: Record<string, number> } | ResearchFailureView> {
    try {
      // The boundary type is the snapshot shape; the parsed file is unknown
      // here and revalidated row-by-row host-side before any write.
      const carried = await this.remote.importWiki({ snapshot: snapshot as ResearchWikiSnapshot, mode, confirmReplace })
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      this.reloadAll()
      const imported = Object.values(result.value.imported).reduce((sum, count) => sum + count, 0)
      const skipped = Object.values(result.value.skipped).reduce((sum, count) => sum + count, 0)
      this.notify('success', 'toast.wikiImported', `${imported} / ${skipped}`)
      return result.value
    } catch (error) {
      return transportFailure(error)
    }
  }

  /** Re-fetch every loaded slice (the post-import repaint). */
  reloadAll(): void {
    if (this.view.projectsStatus !== 'cold') void this.loadProjects()
    if (this.view.papers.status !== 'cold') void this.loadPapers()
    if (this.view.servers.status !== 'cold') void this.loadServers()
    if (this.view.jobs.status !== 'cold') void this.loadJobs()
    const projectId = this.view.outline?.projectId ?? null
    if (projectId === null) return
    this.select(projectId)
    if (this.view.figures !== null) this.loadFigures(projectId, true)
    const artifact = this.view.artifact
    if (artifact !== null) this.loadArtifact(artifact.projectId, artifact.name, true)
    if (this.view.bib !== null) this.reloadBibliography()
  }

  /** Load the literature list once, on the papers view's first open. */
  ensurePapers(): void {
    if (this.view.papers.status === 'ready' || this.papersPromise !== null) return
    this.papersPromise = this.loadPapers().finally(() => { this.papersPromise = null })
  }

  /**
   * Load one whitelisted markdown artifact for the artifact viewer. Skips a
   * refetch of an already-ready same project+name unless forced.
   * @param projectId - wiki project id.
   * @param name - a whitelisted artifact name (e.g. `EXPERIMENT_LOG.md`).
   * @param force - bypass the fresh-view skip.
   */
  loadArtifact(projectId: string, name: string, force = false): void {
    const current = this.view.artifact
    if (!force && current !== null && current.projectId === projectId
      && current.name === name && current.status === 'ready') return
    this.artifactGeneration += 1
    const generation = this.artifactGeneration
    this.publish({
      artifact: Object.freeze({ projectId, name, status: 'loading', content: '', mtimeMs: null, failure: null }),
    })
    void (async (): Promise<void> => {
      const publishArtifact = (view: ResearchArtifactView): void => {
        if (this.disposed || generation !== this.artifactGeneration) return
        this.publish({ artifact: Object.freeze(view) })
      }
      try {
        const carried = await this.remote.readArtifact({ projectId, name })
        if (!carried.ok) {
          publishArtifact({
            projectId, name, status: 'error', content: '', mtimeMs: null,
            failure: failureOf(carried.error.code, carried.error.message),
          })
          return
        }
        const result = carried.value
        if (!result.ok) {
          publishArtifact({
            projectId, name, status: 'error', content: '', mtimeMs: null,
            failure: businessFailure(result.error),
          })
          return
        }
        publishArtifact({
          projectId, name, status: 'ready', content: result.value.content,
          mtimeMs: result.value.mtimeMs, failure: null,
        })
      } catch (error) {
        publishArtifact({
          projectId, name, status: 'error', content: '', mtimeMs: null,
          failure: transportFailure(error),
        })
      }
    })()
  }

  /**
   * Scan one project's paper directory for figures. Skips a rescan of an
   * already-ready same project unless forced (the refresh button forces).
   * @param projectId - wiki project id.
   * @param force - bypass the fresh-view skip.
   */
  loadFigures(projectId: string, force = false): void {
    const current = this.view.figures
    if (this.figuresInFlight) return
    if (!force && current !== null && current.projectId === projectId && current.status === 'ready') return
    this.figuresGeneration += 1
    const generation = this.figuresGeneration
    this.figuresInFlight = true
    this.publish({
      figures: Object.freeze({ projectId, status: 'loading', list: Object.freeze([]), failure: null }),
    })
    void (async (): Promise<void> => {
      const publishFigures = (view: ResearchProjectSlice<readonly FigureEntry[]>): void => {
        if (this.disposed || generation !== this.figuresGeneration) return
        this.publish({ figures: Object.freeze(view) })
      }
      try {
        const carried = await this.remote.listFigures({ projectId, dir: this.dirOf(projectId) })
        if (!carried.ok) {
          publishFigures({ projectId, status: 'error', list: [], failure: failureOf(carried.error.code, carried.error.message) })
          return
        }
        const result = carried.value
        if (!result.ok) {
          publishFigures({ projectId, status: 'error', list: [], failure: businessFailure(result.error) })
          return
        }
        publishFigures({ projectId, status: 'ready', list: result.value.figures, failure: null })
      } catch (error) {
        publishFigures({ projectId, status: 'error', list: [], failure: transportFailure(error) })
      } finally {
        this.figuresInFlight = false
      }
    })()
  }

  /**
   * Delete one figure of one project and force a rescan. The failure view of
   * a rejected delete is returned so the card can surface it; a successful
   * delete republishes the figures slice.
   * @param projectId - wiki project id.
   * @param relPath - figure path relative to the paper directory.
   * @returns null on success, the settled failure otherwise.
   */
  async deleteFigure(projectId: string, relPath: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.deleteFigure({ projectId, relPath, dir: this.dirOf(projectId) })
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      this.figuresInFlight = false
      this.loadFigures(projectId, true)
      this.notify('success', 'toast.deleted')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Insert one figure's standard LaTeX block into the selected project's
   * `main.tex` (the figures view's "insert into paper" button). The figure
   * file already lives in the paper directory — the figures view lists exactly
   * those files — so the insert only edits the source: the block lands right
   * before `\end{document}` and rides the normal draft/autosave path, so an
   * unsaved draft survives and the optimistic-concurrency save still guards
   * the write. A figure the draft already references is never inserted twice:
   * the existing `\includegraphics` line becomes the jump target instead. SVG
   * figures reject up front (LaTeX cannot embed them and the paper scaffold
   * carries no SVG convention). Either way the paper view jumps to the block.
   * @param projectId - wiki project id.
   * @param entry - the figure card's entry.
   * @returns the 1-based target line for the paper view to jump to, or null
   * when the insert failed (a toast already carries the reason).
   */
  async insertFigureIntoPaper(projectId: string, entry: FigureEntry): Promise<number | null> {
    if (isSvgFigure(entry.name)) {
      this.notify('error', 'toast.figureSvg', entry.name)
      return null
    }
    const source = await this.ensureSourceReady(projectId)
    if (source === null || this.disposed) return null
    if (source.saveState === 'conflict') {
      this.notify('error', 'toast.figureInsertConflict')
      return null
    }
    const existing = findFigureReferenceLine(source.content, entry.relPath)
    if (existing !== null) {
      this.jumpPaper(projectId, existing)
      this.notify('info', 'toast.figureAlreadyInserted', entry.name)
      return existing
    }
    const block = figureBlockOf(entry.relPath, entry.caption ?? '')
    const inserted = insertFigureBlock(source.content, block)
    this.edit(inserted.content)
    this.jumpPaper(projectId, inserted.line)
    this.notify('success', 'toast.figureInserted', entry.name)
    return inserted.line
  }

  /** Clear the consumed paper-editor jump ticket (the paper view's callback). */
  consumePaperJump(): void {
    if (this.view.paperJump !== null) this.publish({ paperJump: null })
  }

  /** Publish the paper view's next jump target. */
  private jumpPaper(projectId: string, line: number): void {
    this.paperJumpSeq += 1
    this.publish({ paperJump: Object.freeze({ projectId, line, seq: this.paperJumpSeq }) })
  }

  /**
   * Guarantee a ready source draft for one project, loading it from the Host
   * when the current slice is absent, stale, or another project's. A failed
   * load publishes the error slice, toasts the insert failure, and reads as
   * null.
   * @param projectId - wiki project id.
   * @returns the ready source view, or null.
   */
  private async ensureSourceReady(projectId: string): Promise<ResearchSourceView | null> {
    const current = this.view.source
    if (current !== null && current.projectId === projectId && current.status === 'ready') return current
    this.outlineGeneration += 1
    const generation = this.outlineGeneration
    this.publish({
      source: Object.freeze({ projectId, status: 'loading', content: '', mtimeMs: null, saveState: 'clean', failure: null }),
    })
    const fail = (failure: ResearchFailureView): null => {
      if (this.disposed || generation !== this.outlineGeneration) return null
      this.publish({
        source: Object.freeze({ projectId, status: 'error', content: '', mtimeMs: null, saveState: 'clean', failure }),
      })
      this.notify('error', 'toast.figureInsertFailed', failure.message)
      return null
    }
    try {
      const carried = await this.remote.getPaperSource({ projectId, dir: this.dirOf(projectId) })
      if (this.disposed || generation !== this.outlineGeneration) return null
      if (!carried.ok) return fail(failureOf(carried.error.code, carried.error.message))
      const result = carried.value
      if (!result.ok) return fail(businessFailure(result.error))
      const view: ResearchSourceView = Object.freeze({
        projectId, status: 'ready', content: result.value.content,
        mtimeMs: result.value.mtimeMs, saveState: 'clean', failure: null,
      })
      this.publish({ source: view })
      return view
    } catch (error) {
      return fail(transportFailure(error))
    }
  }


  /**
   * Reorder the top-level sections of one project's `main.tex`. The failure
   * view of a rejected reorder is returned so the outline rail can surface it;
   * both a success and a conflict re-read the outline and the source from the
   * Host, because the file on disk is newer than either view.
   * @param projectId - wiki project id.
   * @param moves - the drops, applied in order.
   * @param baseOutline - the top-level titles the drag started from.
   * @returns null on success, the settled failure otherwise.
   */
  async reorderPaperSections(
    projectId: string,
    moves: readonly SectionMove[],
    baseOutline: readonly string[],
  ): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.reorderPaperSections({
        projectId, moves: [...moves], baseOutline: [...baseOutline], dir: this.dirOf(projectId),
      })
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) {
        if (result.error.code === 'conflict') this.refreshPaper(projectId)
        return businessFailure(result.error)
      }
      this.refreshPaper(projectId)
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Reorder the subsections of one project's `main.tex`, inside their own
   * section or across sections. Same settlement contract as
   * {@link ResearchController.reorderPaperSections}: the failure view is
   * returned for the rail, and both a success and a conflict re-read the
   * outline and the source from the Host.
   * @param projectId - wiki project id.
   * @param moves - the drops, applied in order.
   * @param baseOutline - the section/subsection title tree the drag started from.
   * @returns null on success, the settled failure otherwise.
   */
  async reorderPaperSubsections(
    projectId: string,
    moves: readonly SubsectionMove[],
    baseOutline: readonly SectionOutlineTitles[],
  ): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.reorderPaperSubsections({
        projectId,
        moves: [...moves],
        baseOutline: baseOutline.map(section => ({ title: section.title, subsections: [...section.subsections] })),
        dir: this.dirOf(projectId),
      })
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) {
        if (result.error.code === 'conflict') this.refreshPaper(projectId)
        return businessFailure(result.error)
      }
      this.refreshPaper(projectId)
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Search arXiv for one query and publish the outcome to the papers view.
   * A newer search supersedes an in-flight one, whose late reply is discarded
   * by generation; an empty query never leaves the client.
   * @param query - the free-text query.
   */
  searchArxiv(query: string): void {
    const trimmed = query.trim()
    if (trimmed === '') return
    this.arxivGeneration += 1
    const generation = this.arxivGeneration
    this.publish({
      arxivSearch: Object.freeze({ query: trimmed, status: 'loading', list: Object.freeze([]), failure: null }),
    })
    void (async (): Promise<void> => {
      const publishSearch = (view: ResearchArxivSearchView): void => {
        if (this.disposed || generation !== this.arxivGeneration) return
        this.publish({ arxivSearch: Object.freeze(view) })
      }
      try {
        const carried = await this.remote.searchArxiv({ query: trimmed })
        if (!carried.ok) {
          publishSearch({ query: trimmed, status: 'error', list: [], failure: failureOf(carried.error.code, carried.error.message) })
          return
        }
        const result = carried.value
        if (!result.ok) {
          publishSearch({ query: trimmed, status: 'error', list: [], failure: businessFailure(result.error) })
          return
        }
        publishSearch({ query: trimmed, status: 'ready', list: result.value.results, failure: null })
      } catch (error) {
        publishSearch({ query: trimmed, status: 'error', list: [], failure: transportFailure(error) })
      }
    })()
  }

  /**
   * Import one arXiv entry into the wiki, then refresh the literature list so
   * both the library grid and the result card's imported state repaint. The
   * failure view of a rejected import is returned so the card can surface it.
   * @param entry - the parsed arXiv entry.
   * @returns null on success, the settled failure otherwise.
   */
  async importPaper(entry: ArxivEntry): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.importPaper({ entry })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      await this.loadPapers()
      this.notify('success', 'toast.paperImported')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Remove one remembered paper, then refresh the literature list so the
   * library grid and any matching search result repaint.
   * @param arxivId - the bare arXiv id.
   * @returns null on success, the settled failure otherwise.
   */
  async removePaper(arxivId: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.removePaper({ arxivId })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      await this.loadPapers()
      this.notify('success', 'toast.deleted')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Partially update one paper's organization fields (tags, project links,
   * notes), then refresh the literature list so the grid, the filter bar,
   * and any matching search result repaint.
   * @param arxivId - the bare arXiv id.
   * @param patch - the fields to replace; omitted fields stay untouched.
   * @returns null on success, the settled failure otherwise.
   */
  async updatePaper(
    arxivId: string,
    patch: { tags?: string[]; projectIds?: string[]; notes?: string },
  ): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.updatePaper({ arxivId, ...patch })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      await this.loadPapers()
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Download one remembered paper's arXiv PDF into the workspace, then refresh
   * the literature list so the card's read/fetch buttons repaint. The failure
   * view of a rejected fetch is returned so the card can surface it.
   * @param arxivId - the bare arXiv id.
   * @returns null on success, the settled failure otherwise.
   */
  async fetchPaperPdf(arxivId: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.fetchPaperPdf({ arxivId })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      await this.loadPapers()
      this.notify('success', 'toast.pdfFetched')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Load one project's `references.bib` on the bib panel's first open. A
   * ready (or in-flight) view of the same project is kept; a project switch
   * or an error view reloads.
   * @param projectId - wiki project id.
   */
  ensureBibliography(projectId: string): void {
    const current = this.view.bib
    if (current !== null && current.projectId === projectId
      && (current.status === 'ready' || current.status === 'loading')) return
    this.bibGeneration += 1
    const generation = this.bibGeneration
    const lastImport = current !== null && current.projectId === projectId ? current.lastImport : null
    this.publish({
      bib: Object.freeze({
        projectId, status: 'loading', entries: Object.freeze([]), mtimeMs: null,
        saveState: 'clean', failure: null, lastImport,
      }),
    })
    void this.loadBibliography(projectId, generation)
  }

  /** Re-read the open bibliography from the Host (the conflict recovery path). */
  reloadBibliography(): void {
    const current = this.view.bib
    if (current === null) return
    this.bibGeneration += 1
    const generation = this.bibGeneration
    this.publish({
      bib: Object.freeze({ ...current, status: 'loading', saveState: 'clean', failure: null }),
    })
    void this.loadBibliography(current.projectId, generation)
  }

  /**
   * Delete one entry from the open bibliography and commit the file under
   * optimistic concurrency. The failure view of a rejected save is returned
   * so the row can surface it; a conflict freezes the panel until reloaded.
   * @param key - the citation key to drop.
   * @returns null on success, the settled failure otherwise.
   */
  async deleteBibEntry(key: string): Promise<ResearchFailureView | null> {
    const bib = this.view.bib
    if (bib === null || bib.status !== 'ready' || bib.saveState === 'saving') {
      return failureOf('bib-not-ready', 'bibliography is not loaded')
    }
    return this.commitBibEntries(bib.entries.filter(entry => entry.key !== key), 'toast.deleted')
  }

  /**
   * Replace one entry of the open bibliography (the field editor's save) and
   * commit the file under the same optimistic concurrency as the delete. The
   * edited entry keeps its list position; a rename to another entry's key is
   * rejected client-side (`invalid-input`), as are an empty key or type and
   * an edit addressed to a key no longer listed. The failure view is returned
   * so the editor stays open with the rejection surfaced.
   * @param originalKey - the citation key the editor opened on.
   * @param entry - the edited entry (its key may differ from `originalKey`).
   * @returns null on success, the settled failure otherwise.
   */
  async updateBibEntry(originalKey: string, entry: BibEntry): Promise<ResearchFailureView | null> {
    const bib = this.view.bib
    if (bib === null || bib.status !== 'ready' || bib.saveState === 'saving') {
      return failureOf('bib-not-ready', 'bibliography is not loaded')
    }
    if (entry.key === '' || entry.type === '') {
      return failureOf('invalid-input', 'citation key and entry type must be non-empty')
    }
    if (!bib.entries.some(existing => existing.key === originalKey)) {
      return failureOf('invalid-input', `entry not found: ${originalKey}`)
    }
    if (bib.entries.some(existing => existing.key !== originalKey && existing.key === entry.key)) {
      return failureOf('invalid-input', `citation key already exists: ${entry.key}`)
    }
    return this.commitBibEntries(
      bib.entries.map(existing => (existing.key === originalKey ? entry : existing)),
      'toast.bibSaved',
    )
  }

  /**
   * Commit one next entry list of the open bibliography through
   * `saveBibliography`'s optimistic concurrency: publish `saving`, land the
   * new mtime and entries on success, freeze the panel on a conflict. Shared
   * by the entry delete and the field editor's save.
   * @param entries - the complete next entry list.
   * @param toast - the success toast's copy key.
   * @returns null on success, the settled failure otherwise.
   */
  private async commitBibEntries(
    entries: readonly BibEntry[],
    toast: 'toast.deleted' | 'toast.bibSaved',
  ): Promise<ResearchFailureView | null> {
    const bib = this.view.bib
    if (bib === null || bib.status !== 'ready') {
      return failureOf('bib-not-ready', 'bibliography is not loaded')
    }
    const generation = this.bibGeneration
    this.publish({ bib: Object.freeze({ ...bib, saveState: 'saving', failure: null }) })
    try {
      const carried = await this.remote.saveBibliography({
        projectId: bib.projectId, entries: [...entries], baseMtimeMs: bib.mtimeMs, dir: this.dirOf(bib.projectId),
      })
      if (this.disposed || generation !== this.bibGeneration) return null
      const current = this.view.bib
      if (current === null || current.projectId !== bib.projectId || current.status !== 'ready') return null
      if (!carried.ok) {
        const failure = failureOf(carried.error.code, carried.error.message)
        this.publish({ bib: Object.freeze({ ...current, saveState: 'save-error', failure }) })
        return failure
      }
      const result = carried.value
      if (!result.ok) {
        const failure = businessFailure(result.error)
        this.publish({
          bib: Object.freeze({
            ...current,
            saveState: result.error.code === 'conflict' ? 'conflict' : 'save-error',
            failure: result.error.code === 'conflict' ? null : failure,
          }),
        })
        return failure
      }
      this.publish({
        bib: Object.freeze({
          ...current, entries: Object.freeze(entries), mtimeMs: result.value.mtimeMs,
          saveState: 'saved', failure: null,
        }),
      })
      this.notify('success', toast)
      return null
    } catch (error) {
      const failure = transportFailure(error)
      if (!this.disposed && generation === this.bibGeneration) {
        const current = this.view.bib
        if (current !== null && current.projectId === bib.projectId) {
          this.publish({ bib: Object.freeze({ ...current, saveState: 'save-error', failure }) })
        }
      }
      return failure
    }
  }

  /**
   * Append library papers to one project's `references.bib`, then repaint the
   * open bib panel from the Host's authoritative file. The settled counts are
   * returned so the invoking button shows its own feedback.
   * @param projectId - wiki project id.
   * @param arxivIds - the papers to append.
   * @returns the settled counts on success, the failure view otherwise.
   */
  async importPapersToBib(
    projectId: string,
    arxivIds: string[],
  ): Promise<ResearchFailureView | ResearchImportCounts> {
    try {
      const carried = await this.remote.importPapersToBib({ projectId, arxivIds, dir: this.dirOf(projectId) })
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      const counts = Object.freeze({ added: result.value.added, skipped: result.value.skipped })
      if (this.disposed) return counts
      this.notify('success', 'toast.bibImported', `× ${counts.added}`)
      const bib = this.view.bib
      if (bib !== null && bib.projectId === projectId && bib.status !== 'loading') {
        this.publish({ bib: Object.freeze({ ...bib, lastImport: counts }) })
        this.reloadBibliography()
      }
      return counts
    } catch (error) {
      return transportFailure(error)
    }
  }

  /** Fetch one project's `references.bib`; a superseded generation never publishes. */
  private async loadBibliography(projectId: string, generation: number): Promise<void> {
    const publishBib = (view: ResearchBibView): void => {
      if (this.disposed || generation !== this.bibGeneration) return
      this.publish({ bib: Object.freeze(view) })
    }
    const lastImport = this.view.bib !== null && this.view.bib.projectId === projectId
      ? this.view.bib.lastImport
      : null
    try {
      const carried = await this.remote.getBibliography({ projectId, dir: this.dirOf(projectId) })
      if (!carried.ok) {
        publishBib({
          projectId, status: 'error', entries: [], mtimeMs: null,
          saveState: 'clean', failure: failureOf(carried.error.code, carried.error.message), lastImport,
        })
        return
      }
      const result = carried.value
      if (!result.ok) {
        publishBib({
          projectId, status: 'error', entries: [], mtimeMs: null,
          saveState: 'clean', failure: businessFailure(result.error), lastImport,
        })
        return
      }
      publishBib({
        projectId, status: 'ready', entries: result.value.entries,
        mtimeMs: result.value.mtimeMs, saveState: 'clean', failure: null, lastImport,
      })
    } catch (error) {
      publishBib({
        projectId, status: 'error', entries: [], mtimeMs: null,
        saveState: 'clean', failure: transportFailure(error), lastImport,
      })
    }
  }

  /**
   * Delete one experiment record and drop it from the loaded slice (the Host
   * already removed its record, so a local filter repaints without a refetch).
   * The failure view of a rejected delete is returned so the row surfaces it.
   * @param id - experiment record id.
   * @returns null on success, the settled failure otherwise.
   */
  async deleteExperiment(id: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.deleteExperiment({ id })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      const current = this.view.experiments
      if (current !== null) {
        this.publish({
          experiments: Object.freeze({
            ...current,
            list: Object.freeze(current.list.filter(record => record.id !== id)),
          }),
        })
      }
      this.notify('success', 'toast.deleted')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Relink one experiment to a server (null clears the link) and patch the
   * loaded experiments slice with the returned record. The failure view of a
   * rejected update is returned so the view can surface it.
   * @param id - experiment record id.
   * @param serverId - the server to link, or null to clear.
   * @returns null on success, the settled failure otherwise.
   */
  async updateExperiment(id: string, serverId: string | null): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.updateExperiment({ id, serverId })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      const current = this.view.experiments
      if (current !== null) {
        this.publish({
          experiments: Object.freeze({
            ...current,
            list: Object.freeze(current.list.map(record =>
              record.id === id ? result.value.experiment : record)),
          }),
        })
      }
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Create or update one experiment (the inline form's save), patch the
   * loaded experiments slice with the returned record (replace when the id
   * was already listed, append otherwise), and toast the success. The
   * failure view of a rejected save is returned so the form surfaces it.
   * @param experiment - the full-field upsert payload; `id` present updates.
   * @returns null on success, the settled failure otherwise.
   */
  async saveExperiment(experiment: ExperimentInput): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.saveExperiment({ experiment })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      const saved = result.value.experiment
      const current = this.view.experiments
      if (current !== null) {
        const listed = current.list.some(record => record.id === saved.id)
        this.publish({
          experiments: Object.freeze({
            ...current,
            list: Object.freeze(listed
              ? current.list.map(record => record.id === saved.id ? saved : record)
              : [...current.list, saved]),
          }),
        })
      }
      this.notify('success', 'toast.experimentSaved')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /** Load the server list once, on the servers view's first open. */
  ensureServers(): void {
    if (this.view.servers.status === 'ready' || this.serversPromise !== null) return
    this.serversPromise = this.loadServers().finally(() => { this.serversPromise = null })
  }

  /**
   * Create or update one server, then refresh the list.
   * @param server - the upsert payload; `id` present updates, absent creates.
   * @returns null on success, the settled failure otherwise.
   */
  async saveServer(server: ServerInput): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.saveServer({ server })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      await this.loadServers()
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Delete one server, drop its probe state, and refresh the list.
   * @param id - server record id.
   * @returns null on success, the settled failure otherwise.
   */
  async deleteServer(id: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.deleteServer({ id })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      const checks = { ...this.view.serverChecks }
      delete checks[id]
      this.publish({ serverChecks: Object.freeze(checks) })
      await this.loadServers()
      this.notify('success', 'toast.deleted')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Probe one server: publish `checking`, then the settled view. A probe
   * already in flight for the same server is left alone.
   * @param id - server record id.
   */
  async checkServer(id: string): Promise<void> {
    if (this.view.serverChecks[id] === 'checking') return
    this.publish({ serverChecks: Object.freeze({ ...this.view.serverChecks, [id]: 'checking' }) })
    const settled = await this.runServerCheck(id)
    if (this.disposed) return
    // A delete during the probe already dropped this id's slot.
    if (!(id in this.view.serverChecks)) return
    this.publish({ serverChecks: Object.freeze({ ...this.view.serverChecks, [id]: settled }) })
  }

  /**
   * Probe every listed server that is not already being probed, then toast
   * when the batch settles (a user-initiated, potentially slow operation).
   */
  async checkAllServers(): Promise<void> {
    const pending = this.view.servers.list
      .filter(server => this.view.serverChecks[server.id] !== 'checking')
      .map(server => this.checkServer(server.id))
    if (pending.length === 0) return
    await Promise.all(pending)
    this.notify('info', 'toast.serversChecked', `× ${pending.length}`)
  }

  /** Run one probe, translating every failure mode into a settled offline view. */
  private async runServerCheck(id: string): Promise<ServerStatusView> {
    const offline = (message: string): ServerStatusView => Object.freeze({
      state: 'offline', latencyMs: null, gpus: Object.freeze([]),
      checkedAt: new Date().toISOString(), message,
    })
    try {
      const carried = await this.remote.checkServer({ id })
      if (!carried.ok) return offline(carried.error.message)
      const result = carried.value
      if (!result.ok) return offline(businessFailure(result.error).message)
      return result.value
    } catch (error) {
      return offline(error instanceof Error ? error.message : 'server probe failed')
    }
  }

  /** Fetch the server list and publish it. */
  private async loadServers(): Promise<void> {
    this.publish({ servers: Object.freeze({ ...this.view.servers, status: 'loading', failure: null }) })
    try {
      const carried = await this.remote.listServers()
      if (this.disposed) return
      if (!carried.ok) {
        this.publish({
          servers: Object.freeze({ ...this.view.servers, status: 'error', failure: failureOf(carried.error.code, carried.error.message) }),
        })
        return
      }
      const result = carried.value
      if (!result.ok) {
        this.publish({
          servers: Object.freeze({ ...this.view.servers, status: 'error', failure: businessFailure(result.error) }),
        })
        return
      }
      this.publish({
        servers: Object.freeze({ status: 'ready', list: result.value.servers, failure: null }),
      })
    } catch (error) {
      if (this.disposed) return
      this.publish({
        servers: Object.freeze({ ...this.view.servers, status: 'error', failure: transportFailure(error) }),
      })
    }
  }

  /** Load the job list once, on the servers view's jobs section first open. */
  ensureJobs(): void {
    if (this.view.jobs.status === 'ready' || this.jobsPromise !== null) return
    this.jobsPromise = this.loadJobs().finally(() => { this.jobsPromise = null })
  }

  /**
   * Re-poll the job list (the jobs section's interval while any job is
   * active, and the post-submit repaint). A poll already in flight is left
   * alone; a ready list stays ready while the refresh runs.
   */
  refreshJobs(): void {
    if (this.jobsPromise !== null) return
    this.jobsPromise = this.loadJobs().finally(() => { this.jobsPromise = null })
  }

  /**
   * Submit one remote command to a server, then repaint the job list. The
   * failure view of a rejected submit is returned so the form can surface it.
   * @param serverId - the target server record id.
   * @param command - the remote command line.
   * @param experimentId - the experiment to link, when given.
   * @returns null on success, the settled failure otherwise.
   */
  async submitJob(serverId: string, command: string, experimentId?: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.submitJob({ serverId, command, experimentId })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      this.refreshJobs()
      this.notify('success', 'toast.jobSubmitted')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /**
   * Delete one job record, dropping it from the loaded list.
   * @param id - job record id.
   * @returns null on success, the settled failure otherwise.
   */
  async deleteJob(id: string): Promise<ResearchFailureView | null> {
    try {
      const carried = await this.remote.deleteJob({ id })
      if (this.disposed) return null
      if (!carried.ok) return failureOf(carried.error.code, carried.error.message)
      const result = carried.value
      if (!result.ok) return businessFailure(result.error)
      const current = this.view.jobs
      this.publish({
        jobs: Object.freeze({
          ...current,
          list: Object.freeze(current.list.filter(record => record.id !== id)),
        }),
      })
      this.notify('success', 'toast.deleted')
      return null
    } catch (error) {
      return transportFailure(error)
    }
  }

  /** Fetch the job list and publish it, toasting terminal flips observed between polls. */
  private async loadJobs(): Promise<void> {
    if (this.view.jobs.status === 'cold') {
      this.publish({ jobs: Object.freeze({ ...this.view.jobs, status: 'loading', failure: null }) })
    }
    try {
      const carried = await this.remote.listJobs({})
      if (this.disposed) return
      if (!carried.ok) {
        this.publish({
          jobs: Object.freeze({ ...this.view.jobs, status: 'error', failure: failureOf(carried.error.code, carried.error.message) }),
        })
        return
      }
      const result = carried.value
      if (!result.ok) {
        this.publish({
          jobs: Object.freeze({ ...this.view.jobs, status: 'error', failure: businessFailure(result.error) }),
        })
        return
      }
      this.notifyJobTransitions(this.view.jobs.list, result.value.jobs)
      this.publish({
        jobs: Object.freeze({ status: 'ready', list: result.value.jobs, failure: null }),
      })
    } catch (error) {
      if (this.disposed) return
      this.publish({
        jobs: Object.freeze({ ...this.view.jobs, status: 'error', failure: transportFailure(error) }),
      })
    }
  }

  /** Toast each job whose poll-observed status newly flipped terminal. */
  private notifyJobTransitions(prev: readonly JobRecord[], next: readonly JobRecord[]): void {
    const before = new Map(prev.map(job => [job.id, job.status]))
    for (const job of next) {
      const prior = before.get(job.id)
      if (prior === undefined || prior === job.status) continue
      const detail = job.command.length > 60 ? `${job.command.slice(0, 59)}…` : job.command
      if (job.status === 'succeeded') this.notify('success', 'toast.jobSucceeded', detail)
      else if (job.status === 'failed') this.notify('error', 'toast.jobFailed', detail)
    }
  }

  /**
   * Select one project: load its paper outline, last compile status, and
   * source. A newer selection supersedes in-flight older reads, whose late
   * replies are discarded by generation; pending autosave/auto-compile timers
   * of the previous selection are cancelled.
   * @param projectId - wiki project id.
   */
  select(projectId: string): void {
    this.outlineGeneration += 1
    const generation = this.outlineGeneration
    this.clearTimers()
    this.saveInFlight = false
    this.saveAgain = false
    this.publish({
      outline: Object.freeze({ projectId, status: 'loading', nodes: Object.freeze([]), failure: null }),
      source: Object.freeze({
        projectId, status: 'loading', content: '', mtimeMs: null, saveState: 'clean', failure: null,
      }),
      experiments: Object.freeze({ projectId, status: 'loading', list: Object.freeze([]), failure: null }),
    })
    void this.loadOutline(projectId, generation)
    void this.loadCompileStatus(projectId)
    void this.loadSource(projectId, generation)
    void this.loadExperiments(projectId, generation)
  }

  /**
   * Apply one keystroke batch to the draft and schedule the autosave. Only a
   * ready editor accepts edits; a conflicted or failed draft is frozen until
   * reloaded.
   * @param content - the textarea's full next value.
   */
  edit(content: string): void {
    const source = this.view.source
    if (source === null || source.status !== 'ready' || source.saveState === 'conflict') return
    this.publish({ source: Object.freeze({ ...source, content, saveState: 'dirty' }) })
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flushSave()
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  /**
   * Discard the draft and re-read the file from the Host. The conflict
   * recovery path: the agent's version wins and the editor snaps back to it.
   */
  reloadSource(): void {
    const source = this.view.source
    if (source === null) return
    this.outlineGeneration += 1
    const generation = this.outlineGeneration
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.saveInFlight = false
    this.saveAgain = false
    this.publish({
      source: Object.freeze({ ...source, status: 'loading', saveState: 'clean', failure: null }),
    })
    void this.loadSource(source.projectId, generation)
  }

  /**
   * Compile the paper for one project. A compile requested while another run
   * is in flight is queued and fired when the in-flight run settles, so an
   * autosave-triggered compile never interrupts the one already running.
   * @param projectId - wiki project id.
   */
  async compile(projectId: string): Promise<void> {
    if (this.disposed) return
    if (this.view.compile.state === 'running') {
      this.compileQueued = projectId
      return
    }
    const abort = new AbortController()
    this.compileAbort = abort
    this.publish({
      compile: Object.freeze({ ...this.view.compile, projectId, state: 'running' }),
    })
    try {
      const carried = await this.remote.compile({ projectId, dir: this.dirOf(projectId) }, abort.signal)
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await.
      if (this.disposed) return
      if (!carried.ok) {
        this.publishCompileError(projectId, failureOf(carried.error.code, carried.error.message))
        return
      }
      const result = carried.value
      if (!result.ok) {
        // E.g. latexmk missing on the host: no log, only the message.
        this.publishCompileError(projectId, businessFailure(result.error))
        return
      }
      this.publish({
        compile: Object.freeze({ ...result.value, projectId }),
      })
      if (result.value.state === 'ok') {
        this.notify('success', 'toast.compileOk')
      } else if (result.value.state === 'error') {
        this.notify('error', 'toast.compileFailed')
      }
    } catch (error) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await.
      if (this.disposed || abort.signal.aborted) return
      this.publishCompileError(projectId, transportFailure(error))
    } finally {
      if (this.compileAbort === abort) this.compileAbort = null
      // A save landed (or a click arrived) while this run was in flight:
      // compile the newest content now, without another debounce window.
      const queued = this.compileQueued
      this.compileQueued = null
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await.
      if (queued !== null && !this.disposed) void this.compile(queued)
    }
  }

  /** Abort an in-flight compile, cancel pending timers, and drop subscribers. */
  dispose(): void {
    this.disposed = true
    this.compileAbort?.abort()
    this.clearTimers()
    this.listeners.clear()
  }

  /** Publish a compile failure as an error state carrying the message as one synthetic issue. */
  private publishCompileError(projectId: string, failure: ResearchFailureView): void {
    this.publish({
      compile: Object.freeze({
        projectId,
        state: 'error',
        issues: Object.freeze([{ severity: 'error' as const, message: failure.message }]),
        engine: this.view.compile.engine,
        pdfUpdatedAt: this.view.compile.pdfUpdatedAt,
      }),
    })
    this.notify('error', 'toast.compileFailed', failure.message)
  }

  /** Fetch the project list and publish it. */
  private async loadProjects(): Promise<void> {
    this.publish({ projectsStatus: 'loading', projectsFailure: null })
    try {
      const carried = await this.remote.listProjects()
      if (this.disposed) return
      if (!carried.ok) {
        this.publish({ projectsStatus: 'error', projectsFailure: failureOf(carried.error.code, carried.error.message) })
        return
      }
      const result = carried.value
      if (!result.ok) {
        this.publish({ projectsStatus: 'error', projectsFailure: businessFailure(result.error) })
        return
      }
      this.publish({ projects: result.value.projects, projectsStatus: 'ready', projectsFailure: null })
    } catch (error) {
      if (this.disposed) return
      this.publish({ projectsStatus: 'error', projectsFailure: transportFailure(error) })
    }
  }

  /** Fetch the literature list and publish it. */
  private async loadPapers(): Promise<void> {
    this.publish({ papers: Object.freeze({ ...this.view.papers, status: 'loading', failure: null }) })
    try {
      const carried = await this.remote.listPapers()
      if (this.disposed) return
      if (!carried.ok) {
        this.publish({
          papers: Object.freeze({ ...this.view.papers, status: 'error', failure: failureOf(carried.error.code, carried.error.message) }),
        })
        return
      }
      const result = carried.value
      if (!result.ok) {
        this.publish({
          papers: Object.freeze({ ...this.view.papers, status: 'error', failure: businessFailure(result.error) }),
        })
        return
      }
      this.publish({
        papers: Object.freeze({ status: 'ready', list: result.value.papers, failure: null }),
      })
    } catch (error) {
      if (this.disposed) return
      this.publish({
        papers: Object.freeze({ ...this.view.papers, status: 'error', failure: transportFailure(error) }),
      })
    }
  }

  /** Fetch one project's experiment runs; a superseded generation never publishes. */
  private async loadExperiments(projectId: string, generation: number): Promise<void> {
    const publishExperiments = (view: ResearchProjectSlice<readonly ExperimentRecord[]>): void => {
      if (this.disposed || generation !== this.outlineGeneration) return
      this.publish({ experiments: Object.freeze(view) })
    }
    try {
      const carried = await this.remote.listExperiments({ projectId })
      if (!carried.ok) {
        publishExperiments({ projectId, status: 'error', list: [], failure: failureOf(carried.error.code, carried.error.message) })
        return
      }
      const result = carried.value
      if (!result.ok) {
        publishExperiments({ projectId, status: 'error', list: [], failure: businessFailure(result.error) })
        return
      }
      publishExperiments({ projectId, status: 'ready', list: result.value.experiments, failure: null })
    } catch (error) {
      publishExperiments({ projectId, status: 'error', list: [], failure: transportFailure(error) })
    }
  }

  /** The selected project's paper directory override, from the loaded list row. */
  private dirOf(projectId: string): string | undefined {
    return this.view.projects.find(project => project.id === projectId)?.paperDir
  }

  /**
   * Re-read one project's outline and source after the file changed on disk
   * (a section reorder, or the conflict that rejected one).
   */
  private refreshPaper(projectId: string): void {
    this.outlineGeneration += 1
    const generation = this.outlineGeneration
    void this.loadOutline(projectId, generation)
    void this.loadSource(projectId, generation)
  }

  /** Fetch one project's outline; a superseded generation never publishes. */
  private async loadOutline(projectId: string, generation: number): Promise<void> {
    const publishOutline = (view: ResearchOutlineView): void => {
      if (this.disposed || generation !== this.outlineGeneration) return
      this.publish({ outline: Object.freeze(view) })
    }
    try {
      const carried = await this.remote.getPaperOutline({ projectId, dir: this.dirOf(projectId) })
      if (!carried.ok) {
        publishOutline({ projectId, status: 'error', nodes: [], failure: failureOf(carried.error.code, carried.error.message) })
        return
      }
      const result = carried.value
      if (!result.ok) {
        publishOutline({ projectId, status: 'error', nodes: [], failure: businessFailure(result.error) })
        return
      }
      publishOutline({ projectId, status: 'ready', nodes: result.value.nodes, failure: null })
    } catch (error) {
      publishOutline({ projectId, status: 'error', nodes: [], failure: transportFailure(error) })
    }
  }

  /** Fetch one project's last compile status without touching an in-flight run. */
  private async loadCompileStatus(projectId: string): Promise<void> {
    try {
      const carried = await this.remote.getCompileStatus({ projectId })
      // A compile started meanwhile owns the compile view; do not overwrite it
      // with a pre-run snapshot.
      if (this.disposed || this.view.compile.state === 'running') return
      if (!carried.ok || !carried.value.ok) return
      this.publish({
        compile: Object.freeze({ ...carried.value.value, projectId }),
      })
    } catch {
      // A status probe failure leaves the previous view in place; the compile
      // button still reaches the Host, which is the authoritative path.
    }
  }

  /** Fetch one project's `main.tex`; a superseded generation never publishes. */
  private async loadSource(projectId: string, generation: number): Promise<void> {
    const publishSource = (view: ResearchSourceView): void => {
      if (this.disposed || generation !== this.outlineGeneration) return
      this.publish({ source: Object.freeze(view) })
    }
    try {
      const carried = await this.remote.getPaperSource({ projectId, dir: this.dirOf(projectId) })
      if (!carried.ok) {
        publishSource({
          projectId, status: 'error', content: '', mtimeMs: null,
          saveState: 'clean', failure: failureOf(carried.error.code, carried.error.message),
        })
        return
      }
      const result = carried.value
      if (!result.ok) {
        publishSource({
          projectId, status: 'error', content: '', mtimeMs: null,
          saveState: 'clean', failure: businessFailure(result.error),
        })
        return
      }
      publishSource({
        projectId, status: 'ready', content: result.value.content,
        mtimeMs: result.value.mtimeMs, saveState: 'clean', failure: null,
      })
    } catch (error) {
      publishSource({
        projectId, status: 'error', content: '', mtimeMs: null,
        saveState: 'clean', failure: transportFailure(error),
      })
    }
  }

  /**
   * Save the current draft under optimistic concurrency. Only one save is in
   * flight at a time; an edit landing mid-flight re-runs the save after it
   * settles. A successful save of an untouched draft schedules the auto-compile.
   */
  private async flushSave(): Promise<void> {
    if (this.saveInFlight) {
      this.saveAgain = true
      return
    }
    const source = this.view.source
    if (source === null || source.status !== 'ready' || source.mtimeMs === null) return
    if (source.saveState !== 'dirty') return
    const { projectId, content, mtimeMs } = source
    const generation = this.outlineGeneration
    this.saveInFlight = true
    this.publish({ source: Object.freeze({ ...source, saveState: 'saving' }) })
    try {
      const carried = await this.remote.savePaperSource({
        projectId, content, baseMtimeMs: mtimeMs, dir: this.dirOf(projectId),
      })
      // A reselection or reload superseded this draft; its reply is stale.
      if (this.disposed || generation !== this.outlineGeneration) return
      const current = this.view.source
      if (current === null || current.projectId !== projectId || current.status !== 'ready') return
      if (!carried.ok) {
        this.publish({
          source: Object.freeze({ ...current, saveState: 'save-error', failure: failureOf(carried.error.code, carried.error.message) }),
        })
        return
      }
      const result = carried.value
      if (!result.ok) {
        if (result.error.code === 'conflict') {
          // The agent landed a newer version: keep the draft, freeze editing,
          // and let the panel offer the reload.
          this.publish({ source: Object.freeze({ ...current, saveState: 'conflict' }) })
        } else {
          this.publish({
            source: Object.freeze({ ...current, saveState: 'save-error', failure: businessFailure(result.error) }),
          })
        }
        return
      }
      const settled = Object.freeze({ ...current, mtimeMs: result.value.mtimeMs, failure: null })
      if (current.content === content) {
        this.publish({ source: Object.freeze({ ...settled, saveState: 'saved' }) })
        this.scheduleCompile(projectId)
      } else {
        // Edited again while the save was in flight: stay dirty; the trailing
        // save below (or the next debounce) carries the newer draft.
        this.publish({ source: Object.freeze({ ...settled, saveState: 'dirty' }) })
      }
    } catch (error) {
      if (this.disposed || generation !== this.outlineGeneration) return
      const current = this.view.source
      if (current === null || current.projectId !== projectId) return
      this.publish({
        source: Object.freeze({ ...current, saveState: 'save-error', failure: transportFailure(error) }),
      })
    } finally {
      this.saveInFlight = false
      if (this.saveAgain) {
        this.saveAgain = false
        void this.flushSave()
      }
    }
  }

  /** Debounce the auto-compile that follows a successful save. */
  private scheduleCompile(projectId: string): void {
    if (this.compileTimer !== null) clearTimeout(this.compileTimer)
    this.compileTimer = setTimeout(() => {
      this.compileTimer = null
      void this.compile(projectId)
    }, COMPILE_DEBOUNCE_MS)
  }

  /** Cancel pending autosave and auto-compile timers. */
  private clearTimers(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.compileTimer !== null) {
      clearTimeout(this.compileTimer)
      this.compileTimer = null
    }
  }

  /** Replace part of the view and contain subscriber failures at the boundary. */
  private publish(patch: Partial<ResearchView>): void {
    this.view = Object.freeze({ ...this.view, ...patch })
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[ui-mimir] subscriber threw:', error)
      }
    }
  }
}
