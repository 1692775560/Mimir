/**
 * The research workbench: a wide fixed overlay with a left rail (the five
 * view tabs plus the project picker at the bottom) and a content area that
 * renders the active view — the project overview card, the Overleaf-style
 * paper editor, the literature library, the experiment records with the
 * experiment log, and the paper-figure grid. All data arrives through the
 * four props shares — the shared store carries open/selection/active-tab, the
 * `useResearch` hook carries the remote view, and the inject face carries the
 * verbs. The component owns no subscription machinery.
 * @module dsh-client-ui-mimir/client/ResearchPanel
 */

import { useEffect } from 'react'
import type { ResearchTab } from './store.ts'
import type { ResearchKey } from './locales.ts'
import type { ResearchPanelProps } from './slots.ts'
import { OverviewView } from './OverviewView.tsx'
import { PaperView } from './PaperView.tsx'
import { PapersView } from './PapersView.tsx'
import { ExperimentsView } from './ExperimentsView.tsx'
import { FiguresView } from './FiguresView.tsx'
import css from './ResearchPanel.module.css'

/** The five view tabs in rail order. */
const TABS: readonly ResearchTab[] = ['overview', 'paper', 'papers', 'experiments', 'figures']

/** Locale key of one tab label. */
const TAB_KEYS: Record<ResearchTab, ResearchKey> = {
  overview: 'tab.overview',
  paper: 'tab.paper',
  papers: 'tab.papers',
  experiments: 'tab.experiments',
  figures: 'tab.figures',
}

/** The artifact shown by the experiments view's log section. */
const EXPERIMENT_LOG_ARTIFACT = 'EXPERIMENT_LOG.md'

/**
 * The frame-level research workbench entry.
 * @param props - the shared panel store, the injected research face, and copy.
 * @returns the workbench while open, or null while closed.
 */
export function ResearchPanel({
  useStore, actions, useResearch,
  ensure, selectProject, compile, editSource, reloadSource,
  ensurePapers, loadArtifact, loadFigures, t,
}: ResearchPanelProps) {
  const open = useStore(state => state.open)
  const selectedProjectId = useStore(state => state.selectedProjectId)
  const activeTab = useStore(state => state.activeTab)
  const projects = useResearch(view => view.projects)
  const projectsStatus = useResearch(view => view.projectsStatus)
  const outline = useResearch(view => view.outline)
  const compileView = useResearch(view => view.compile)
  const source = useResearch(view => view.source)
  const papers = useResearch(view => view.papers)
  const experiments = useResearch(view => view.experiments)
  const artifact = useResearch(view => view.artifact)
  const figures = useResearch(view => view.figures)

  // Every read is deferred to the first open rather than fired on mount: the
  // toggle mounts with the sidebar whether or not the panel is ever used.
  useEffect(() => {
    if (open) ensure()
  }, [open, ensure])
  // Never leave the workbench blank: once the list settles, select the first
  // project so the overview has content on first open.
  useEffect(() => {
    if (open && projectsStatus === 'ready' && selectedProjectId === null && projects.length > 0) {
      selectProject(projects[0]?.id ?? '')
    }
  }, [open, projectsStatus, selectedProjectId, projects, selectProject])
  useEffect(() => {
    if (open && activeTab === 'papers') ensurePapers()
  }, [open, activeTab, ensurePapers])
  useEffect(() => {
    if (open && activeTab === 'experiments' && selectedProjectId !== null) {
      loadArtifact(selectedProjectId, EXPERIMENT_LOG_ARTIFACT)
    }
  }, [open, activeTab, selectedProjectId, loadArtifact])
  useEffect(() => {
    if (open && activeTab === 'figures' && selectedProjectId !== null) {
      loadFigures(selectedProjectId)
    }
  }, [open, activeTab, selectedProjectId, loadFigures])

  if (!open) return null

  const selectedProject = selectedProjectId === null
    ? undefined
    : projects.find(project => project.id === selectedProjectId)

  return (
    <div className={css.workbench} role="dialog" aria-label={t('panel.title')}>
      {/* Fixed full-viewport dimmer; painted behind the window's own content
          (negative z-index inside the workbench stacking context). */}
      <div className={css.backdrop} aria-hidden />
      <aside className={css.side}>
        <div className={css.sideHead}>
          <span className={css.title}>{t('panel.title')}</span>
          <button type="button" className={css.close} onClick={() => { actions.setOpen(false) }}>
            {t('panel.close')}
          </button>
        </div>
        <nav className={css.nav}>
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              className={css.navItem}
              data-active={tab === activeTab || undefined}
              onClick={() => { actions.setTab(tab) }}
            >
              {t(TAB_KEYS[tab])}
            </button>
          ))}
        </nav>
        <div className={css.sideProjects}>
          <h3 className={css.sectionTitle}>{t('projects.title')}</h3>
          {(projectsStatus === 'cold' || projectsStatus === 'loading') && (
            <p className={css.hint}>{t('projects.loading')}</p>
          )}
          {projectsStatus === 'error' && (
            <p className={css.failure} role="status">
              {t('error.projects')}
              <button type="button" className={css.retry} onClick={ensure}>
                {t('projects.retry')}
              </button>
            </p>
          )}
          {projectsStatus === 'ready' && projects.length === 0 && (
            <p className={css.hint}>{t('projects.empty')}</p>
          )}
          {projectsStatus === 'ready' && projects.length > 0 && (
            <div className={css.projectList}>
              {projects.map(project => (
                <button
                  key={project.id}
                  type="button"
                  className={css.projectRow}
                  data-selected={project.id === selectedProjectId || undefined}
                  onClick={() => { selectProject(project.id) }}
                >
                  <span className={css.projectTitle}>{project.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
      <main className={css.content}>
        {activeTab === 'overview' && <OverviewView project={selectedProject} t={t} />}
        {activeTab === 'paper' && (
          <PaperView
            outline={outline}
            compileView={compileView}
            source={source}
            projectId={selectedProjectId}
            dir={selectedProject?.paperDir}
            editSource={editSource}
            reloadSource={reloadSource}
            compile={compile}
            t={t}
          />
        )}
        {activeTab === 'papers' && <PapersView papers={papers} ensurePapers={ensurePapers} t={t} />}
        {activeTab === 'experiments' && (
          <ExperimentsView
            experiments={experiments}
            artifact={artifact}
            projectId={selectedProjectId}
            t={t}
          />
        )}
        {activeTab === 'figures' && (
          <FiguresView
            figures={figures}
            projectId={selectedProjectId}
            dir={selectedProject?.paperDir}
            loadFigures={loadFigures}
            t={t}
          />
        )}
      </main>
    </div>
  )
}
