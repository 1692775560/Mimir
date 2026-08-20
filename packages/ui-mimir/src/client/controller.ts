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
import type {
  ExperimentRecord,
  FigureEntry,
  OutlineNode,
  PaperRecord,
  ResearchArtifactResult,
  ResearchCompileResult,
  ResearchCompileStatusResult,
  ResearchCompileStatusView,
  ResearchExperimentsResult,
  ResearchFailure,
  ResearchFiguresResult,
  ResearchListProjectsResult,
  ResearchOutlineResult,
  ResearchPaperSourceResult,
  ResearchPapersResult,
  ResearchProjectView,
  ResearchSavePaperSourceResult,
} from 'dsh-mimir/types'

/**
 * The ten Remote calls this controller needs, exactly as the generated
 * `research` namespace types them.
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
  listExperiments: (request: { projectId?: string }) => Promise<RemoteResult<ResearchExperimentsResult>>
  readArtifact: (request: { projectId: string; name: string }) => Promise<RemoteResult<ResearchArtifactResult>>
  listFigures: (request: { projectId: string; dir?: string | undefined }) => Promise<RemoteResult<ResearchFiguresResult>>
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

/** The literature view: every remembered paper. */
export interface ResearchPapersView {
  readonly status: ResearchLoadStatus
  readonly list: readonly PaperRecord[]
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

/** Immutable view published to the panel. */
export interface ResearchView {
  readonly projects: readonly ResearchProjectView[]
  readonly projectsStatus: ResearchLoadStatus
  readonly projectsFailure: ResearchFailureView | null
  readonly outline: ResearchOutlineView | null
  readonly compile: ResearchCompileView
  readonly source: ResearchSourceView | null
  readonly papers: ResearchPapersView
  readonly experiments: ResearchProjectSlice<readonly ExperimentRecord[]> | null
  readonly artifact: ResearchArtifactView | null
  readonly figures: ResearchProjectSlice<readonly FigureEntry[]> | null
}

const INITIAL_VIEW: ResearchView = Object.freeze({
  projects: Object.freeze([]),
  projectsStatus: 'cold',
  projectsFailure: null,
  outline: null,
  compile: Object.freeze({ projectId: null, state: 'idle', issues: Object.freeze([]), engine: null, pdfUpdatedAt: null }),
  source: null,
  papers: Object.freeze({ status: 'cold', list: Object.freeze([]), failure: null }),
  experiments: null,
  artifact: null,
  figures: null,
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
  private papersPromise: Promise<void> | null = null
  private outlineGeneration = 0
  private artifactGeneration = 0
  private figuresGeneration = 0
  private figuresInFlight = false
  private compileAbort: AbortController | null = null
  private compileQueued: string | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private compileTimer: ReturnType<typeof setTimeout> | null = null
  private saveInFlight = false
  private saveAgain = false
  private disposed = false

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
  }

  /** Re-read the project list (the retry entry and the reconnect resync). */
  resync(): void {
    if (this.view.projectsStatus === 'cold') return
    this.loadPromise ??= this.loadProjects().finally(() => { this.loadPromise = null })
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
