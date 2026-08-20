/**
 * The research panel's slot-facing contracts. Both target seats are declared
 * by other packages (`sidebar.footer.action` by ui-sidebar, `shell.overlay` by
 * ui-layout), so no SlotMap merge lives here — this module only composes the
 * four props shares for the two entries and types the panel's inject face.
 * Live data arrives through the `research` hook (the framework binds it into
 * `useResearch`); panel open-state and selection arrive through the shared
 * store declared at register.
 * @module dsh-client-ui-mimir/client/slots
 */

import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-layout SlotMap merge (the 'shell.overlay' entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the ui-sidebar SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'research' seat).
import type {} from './locales.ts'
import type { ArxivEntry, ServerInput } from 'dsh-mimir/types'
import type { ResearchFailureView, ResearchView } from './controller.ts'
import type { createResearchPanelStore } from './store.ts'

/** Store handle type shared by both registrations. */
export type ResearchPanelStore = ReturnType<typeof createResearchPanelStore>

/** Injected business face of the research panel entry. */
export interface ResearchPanelInjected {
  hooks: {
    /** The panel's data view: projects, selected outline, compile status. */
    research: HostObservable<ResearchView>
  }
  /** Load the project list once, on first open. */
  ensure: () => void
  /**
   * Select one project: writes the store selection AND fetches its outline
   * and compile status, so the row click is the single entry point.
   * @param projectId - wiki project id.
   */
  selectProject: (projectId: string) => void
  /**
   * Compile the paper for one project; while a run is in flight the request
   * is queued and fired when it settles.
   * @param projectId - wiki project id.
   */
  compile: (projectId: string) => void
  /**
   * Apply one editor change to the draft; autosaves after a short debounce.
   * @param content - the textarea's full next value.
   */
  editSource: (content: string) => void
  /** Discard the draft and re-read the file (the conflict recovery path). */
  reloadSource: () => void
  /** Load the literature list once, on the papers view's first open. */
  ensurePapers: () => void
  /**
   * Search arXiv from the papers view; the outcome lands in the view's
   * `arxivSearch` slice.
   * @param query - the free-text query; an empty one never leaves the client.
   */
  searchArxiv: (query: string) => void
  /**
   * Import one arXiv entry into the wiki, then refresh the literature list.
   * @param entry - the parsed arXiv entry of one search result card.
   * @returns null on success, the settled failure otherwise.
   */
  importPaper: (entry: ArxivEntry) => Promise<ResearchFailureView | null>
  /**
   * Remove one remembered paper, then refresh the literature list.
   * @param arxivId - the bare arXiv id.
   * @returns null on success, the settled failure otherwise.
   */
  removePaper: (arxivId: string) => Promise<ResearchFailureView | null>
  /**
   * Load one whitelisted markdown artifact (the experiment-log viewer).
   * @param projectId - wiki project id.
   * @param name - a whitelisted artifact name.
   */
  loadArtifact: (projectId: string, name: string) => void
  /**
   * Scan one project's paper directory for figures.
   * @param projectId - wiki project id.
   * @param force - bypass the fresh-view skip (the refresh button).
   */
  loadFigures: (projectId: string, force?: boolean) => void
  /**
   * Upload image files into one project's paper directory through the
   * `/research/figure-upload` route, one POST per file, then force a rescan.
   * @param projectId - wiki project id.
   * @param dir - the project's paper directory override, when any.
   * @param files - the picked files.
   * @param onProgress - called after each settled upload with (done, total).
   * @returns resolution after every file settled; per-file HTTP failures throw.
   */
  uploadFigures: (
    projectId: string,
    dir: string | undefined,
    files: readonly File[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>
  /**
   * Delete one figure of one project and force a rescan.
   * @param projectId - wiki project id.
   * @param relPath - figure path relative to the paper directory.
   * @returns null on success, the settled failure otherwise.
   */
  deleteFigure: (projectId: string, relPath: string) => Promise<ResearchFailureView | null>
  /**
   * Delete one experiment record, dropping its row from the loaded slice.
   * @param id - experiment record id.
   * @returns null on success, the settled failure otherwise.
   */
  deleteExperiment: (id: string) => Promise<ResearchFailureView | null>
  /**
   * Partially update one paper's tags, project links, and notes.
   * @param arxivId - the bare arXiv id.
   * @param patch - the fields to replace; omitted fields stay untouched.
   * @returns null on success, the settled failure otherwise.
   */
  updatePaper: (
    arxivId: string,
    patch: { tags?: string[]; projectIds?: string[]; notes?: string },
  ) => Promise<ResearchFailureView | null>
  /** Load the server list once, on the servers view's first open. */
  ensureServers: () => void
  /**
   * Create or update one server, then refresh the list.
   * @param server - the upsert payload; `id` present updates, absent creates.
   * @returns null on success, the settled failure otherwise.
   */
  saveServer: (server: ServerInput) => Promise<ResearchFailureView | null>
  /**
   * Delete one server and its probe state, then refresh the list.
   * @param id - server record id.
   * @returns null on success, the settled failure otherwise.
   */
  deleteServer: (id: string) => Promise<ResearchFailureView | null>
  /**
   * Probe one server (TCP reachability plus the best-effort GPU readout).
   * @param id - server record id.
   */
  checkServer: (id: string) => Promise<void>
  /** Probe every listed server that is not already being probed. */
  checkAllServers: () => void
}

/** Full props of the sidebar-footer research toggle. */
export type ResearchToggleProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsStore<ResearchPanelStore>
  & PropsLocale<'research'>

/** Full props of the research panel overlay entry. */
export type ResearchPanelProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ResearchPanelStore>
  & InjectFace<ResearchPanelInjected>
  & PropsLocale<'research'>
