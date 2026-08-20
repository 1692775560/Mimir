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
import type { ResearchView } from './controller.ts'
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
