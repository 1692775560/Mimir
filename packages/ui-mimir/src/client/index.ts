/**
 * Research panel plugin, browser half: a sidebar-footer toggle and the
 * frame-level overlay it opens. One ResearchController per client runtime
 * backs the panel; one store handle is shared by both registrations so the
 * toggle and the panel read the same open/selection state. Both target seats
 * are declared by other packages (ui-sidebar, ui-layout), so both
 * registrations go through `slots.inject` and wait on the declaration.
 * @module dsh-client-ui-mimir/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the Client assembly's ctx.remote merge. NOTE: the published
// @deepseek-ai/dsh-api-remotes does not mount the research namespace; the
// augmentation below supplies its types (see README "Known limitations").
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: mounts the generated `research` Remote namespace types onto the
// client Remote map (TypertRemoteNamespaceMap), so ctx.remote.research types.
import type {} from 'dsh-mimir/remote'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ResearchController } from './controller.ts'
import { ResearchPanel } from './ResearchPanel.tsx'
import { ResearchToggle } from './ResearchToggle.tsx'
import type { ResearchPanelInjected } from './slots.ts'
import { createResearchPanelStore } from './store.ts'
import { en, zh } from './locales.ts'

export type {
  ResearchArtifactView, ResearchCompileView, ResearchFailureView, ResearchLoadStatus,
  ResearchOutlineView, ResearchPapersView, ResearchProjectSlice, ResearchRemote,
  ResearchSaveState, ResearchSourceView, ResearchView,
} from './controller.ts'
export type {
  ResearchPanelInjected, ResearchPanelProps, ResearchPanelStore, ResearchToggleProps,
} from './slots.ts'
export type { ResearchPanelState, ResearchTab } from './store.ts'
export { createResearchPanelStore } from './store.ts'
export type { ResearchKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'research'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'remote', 'remote.research', 'locale']

/**
 * Upload one figure file through the host's upload route. The route answers
 * JSON on success; anything else throws with the response's own text.
 * @param projectId - wiki project id.
 * @param dir - the project's paper directory override, when any.
 * @param file - the picked file.
 * @returns resolution after the file is stored.
 */
async function uploadOneFigure(projectId: string, dir: string | undefined, file: File): Promise<void> {
  const query = `?project=${encodeURIComponent(projectId)}&name=${encodeURIComponent(file.name)}`
    + (dir === undefined ? '' : `&dir=${encodeURIComponent(dir)}`)
  const response = await fetch(`/research/figure-upload${query}`, { method: 'POST', body: file })
  if (!response.ok) {
    const detail = (await response.text()).trim()
    throw new Error(detail === '' ? `upload failed (${String(response.status)})` : detail)
  }
}

/**
 * Client plugin body: the research toggle, the panel overlay, and the shared
 * object layer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mimir: dictionaries')

  const panel = createResearchPanelStore()
  const controller = new ResearchController(ctx.remote.research)

  // A reconnect can only invalidate what was already read; a cold panel stays
  // cold until the first open asks for it.
  ctx.on('connection/reset', () => { controller.resync() })
  ctx.effect(() => () => { controller.dispose() }, 'ui-mimir: controller')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'research',
    order: 10,
    store: panel,
    locale: NS,
  }, ResearchToggle))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'research',
    order: 10,
    store: panel,
    locale: NS,
    inject: (actions): ResearchPanelInjected => ({
      hooks: { research: controller },
      ensure: () => { controller.ensure() },
      // The row click is the single selection entry: it writes the shared
      // store and fetches the outline + compile status in one gesture.
      selectProject: (projectId) => {
        actions.select(projectId)
        controller.select(projectId)
      },
      compile: (projectId) => { void controller.compile(projectId) },
      editSource: (content) => { controller.edit(content) },
      reloadSource: () => { controller.reloadSource() },
      ensurePapers: () => { controller.ensurePapers() },
      searchArxiv: (query) => { controller.searchArxiv(query) },
      importPaper: (entry) => controller.importPaper(entry),
      removePaper: (arxivId) => controller.removePaper(arxivId),
      loadArtifact: (projectId, name) => { controller.loadArtifact(projectId, name) },
      loadFigures: (projectId, force) => { controller.loadFigures(projectId, force) },
      uploadFigures: async (projectId, dir, files, onProgress) => {
        let done = 0
        for (const file of files) {
          await uploadOneFigure(projectId, dir, file)
          done += 1
          onProgress?.(done, files.length)
        }
        controller.loadFigures(projectId, true)
      },
      deleteFigure: (projectId, relPath) => controller.deleteFigure(projectId, relPath),
      deleteExperiment: (id) => controller.deleteExperiment(id),
      ensureServers: () => { controller.ensureServers() },
      saveServer: (server) => controller.saveServer(server),
      deleteServer: (id) => controller.deleteServer(id),
      checkServer: (id) => controller.checkServer(id),
      checkAllServers: () => { controller.checkAllServers() },
    }),
  }, ResearchPanel))
}
