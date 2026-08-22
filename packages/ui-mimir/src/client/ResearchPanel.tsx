/**
 * The research workbench: a wide fixed overlay with a left rail (the six
 * view tabs plus the project picker at the bottom) and a content area that
 * renders the active view — the project overview card, the Overleaf-style
 * paper editor, the literature library, the experiment records with the
 * experiment log, the paper-figure grid, and the compute-server board. All
 * data arrives through the four props shares — the shared store carries
 * open/selection/active-tab, the `useResearch` hook carries the remote view,
 * and the inject face carries the verbs. The component owns no subscription
 * machinery.
 * @module dsh-client-ui-mimir/client/ResearchPanel
 */

import { useEffect, useRef, type ReactNode } from 'react'
import type { ResearchTab } from './store.ts'
import type { ResearchKey } from './locales.ts'
import { arrowTab, trapFocusIndex } from './focus.ts'
import { shortcutFor, TABS } from './shortcuts.ts'
import type { ResearchPanelProps } from './slots.ts'
import { OverviewView } from './OverviewView.tsx'
import { PaperView } from './PaperView.tsx'
import { PapersView } from './PapersView.tsx'
import { ExperimentsView } from './ExperimentsView.tsx'
import { FiguresView } from './FiguresView.tsx'
import { ServersView } from './ServersView.tsx'
import { ToastHost } from './ToastHost.tsx'
import css from './ResearchPanel.module.css'

/** Locale key of one tab label. */
const TAB_KEYS: Record<ResearchTab, ResearchKey> = {
  overview: 'tab.overview',
  paper: 'tab.paper',
  papers: 'tab.papers',
  experiments: 'tab.experiments',
  figures: 'tab.figures',
  servers: 'tab.servers',
}

/** One 16×16 stroke icon per tab, painted in the nav item's currentColor. */
const TAB_ICONS: Record<ResearchTab, ReactNode> = {
  overview: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  paper: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 1.5h5l3 3v10H4z" />
      <path d="M9 1.5v3h3" />
      <path d="M6 8.5h4M6 11h4" />
    </svg>
  ),
  papers: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2h6a1 1 0 0 1 1 1v11l-4-2.6L4 14V3a1 1 0 0 1 1-1z" />
    </svg>
  ),
  experiments: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 1.5h3" />
      <path d="M7 1.5v4L3.6 12a1.5 1.5 0 0 0 1.3 2.2h6.2a1.5 1.5 0 0 0 1.3-2.2L9 5.5v-4" />
      <path d="M5 10.5h6" />
    </svg>
  ),
  figures: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="5.5" cy="6.5" r="1" />
      <path d="M2 11.5 5.5 8l2.5 2.5L10.5 8 14 11.5" />
    </svg>
  ),
  servers: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="11" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="11" height="4.5" rx="1" />
      <path d="M5 4.75h.01M5 11.25h.01" />
    </svg>
  ),
}

/** The artifact shown by the experiments view's log section. */
const EXPERIMENT_LOG_ARTIFACT = 'EXPERIMENT_LOG.md'

/** 14×14 header glyphs for the theme and language switches. */
const MOON_ICON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 10A6 6 0 0 1 6 2.5a5 5 0 1 0 7.5 7.5z" />
  </svg>
)
const SUN_ICON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
  </svg>
)

/**
 * Whether one keydown target is a text-entry surface; such keydowns are never
 * workbench shortcuts.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** The focusable elements the dialog's Tab trap cycles through. */
const FOCUSABLE_SELECTOR = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * The frame-level research workbench entry.
 * @param props - the shared panel store, the injected research face, and copy.
 * @returns the workbench while open, or null while closed.
 */
export function ResearchPanel({
  useStore, actions, useResearch, useChrome,
  ensure, selectProject, compile, editSource, reloadSource, requestCompileFix,
  requestRelatedWork,
  ensurePapers, searchArxiv, importPaper, removePaper, updatePaper, fetchPaperPdf, loadArtifact, loadFigures, uploadFigures, deleteFigure,
  insertFigure, consumePaperJump, generateMetricFigure,
  deleteExperiment, updateExperiment, saveExperiment, ensureServers, saveServer, deleteServer, checkServer, checkAllServers,
  ensureJobs, refreshJobs, submitJob, deleteJob,
  ensureBibliography, reloadBibliography, deleteBibEntry, updateBibEntry, importPapersToBib, reorderPaperSections, reorderPaperSubsections,
  exportWiki, importWiki, dismissToast, pruneToasts,
  toggleTheme, toggleLocale, t,
}: ResearchPanelProps) {
  const open = useStore(state => state.open)
  const selectedProjectId = useStore(state => state.selectedProjectId)
  const activeTab = useStore(state => state.activeTab)
  const paperFullscreen = useStore(state => state.paperFullscreen)
  const dark = useChrome(chrome => chrome.dark)
  const locale = useChrome(chrome => chrome.locale)
  const projects = useResearch(view => view.projects)
  const projectsStatus = useResearch(view => view.projectsStatus)
  const outline = useResearch(view => view.outline)
  const compileView = useResearch(view => view.compile)
  const source = useResearch(view => view.source)
  const papers = useResearch(view => view.papers)
  const arxivSearch = useResearch(view => view.arxivSearch)
  const experiments = useResearch(view => view.experiments)
  const artifact = useResearch(view => view.artifact)
  const figures = useResearch(view => view.figures)
  const servers = useResearch(view => view.servers)
  const serverChecks = useResearch(view => view.serverChecks)
  const jobs = useResearch(view => view.jobs)
  const bib = useResearch(view => view.bib)
  const toasts = useResearch(view => view.toasts)
  const backup = useResearch(view => view.backup)
  const paperJump = useResearch(view => view.paperJump)
  const rootRef = useRef<HTMLDivElement>(null)

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
  // The overview's stat chips count the papers and figures slices, both lazy:
  // warm them when the overview opens so the chips show real numbers instead
  // of dashes; the activity card reads the jobs slice, equally lazy. The
  // experiments slice is already loaded by select().
  useEffect(() => {
    if (open && activeTab === 'overview') {
      ensurePapers()
      ensureJobs()
      if (selectedProjectId !== null) loadFigures(selectedProjectId)
    }
  }, [open, activeTab, selectedProjectId, ensurePapers, ensureJobs, loadFigures])
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

  // Dialog focus management: opening the panel moves focus into the rail (to
  // the active tab), and closing returns it to the element that held it
  // before (the sidebar toggle), so keyboard users never lose their place.
  // Runs only on open/close — a tab switch must not yank focus out of the
  // view the user is working in.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = rootRef.current
    const tabs = root?.querySelectorAll<HTMLElement>('[role="tab"]')
    const active = tabs?.[TABS.indexOf(activeTab)]
    ;(active ?? root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR))?.focus()
    return () => { previous?.focus() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [open])

  // Workbench keyboard shortcuts, live only while the panel is open: digits
  // pick the rail tab, Escape exits a fullscreened pane first and closes the
  // panel only when nothing is fullscreened, ⌘/Ctrl+Enter compiles in the
  // paper view. Text-entry surfaces keep their keystrokes (shortcutFor's
  // guard). Tab is trapped inside the dialog: past the last focusable it
  // wraps to the first (and Shift+Tab the reverse), and focus stranded
  // outside the panel is pulled back in.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        const root = rootRef.current
        if (root === null) return
        const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
          .filter(element => element.getClientRects().length > 0)
        const target = trapFocusIndex(
          focusables.indexOf(document.activeElement as HTMLElement),
          focusables.length,
          event.shiftKey,
        )
        if (target !== null) {
          event.preventDefault()
          focusables[target]?.focus()
        }
        return
      }
      const action = shortcutFor({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        editable: isEditableTarget(event.target),
        fullscreen: paperFullscreen !== null,
      })
      if (action === null) return
      event.preventDefault()
      if (action.type === 'tab') actions.setTab(action.tab)
      else if (action.type === 'exit-fullscreen') actions.setPaperFullscreen(null)
      else if (action.type === 'close') actions.setOpen(false)
      else if (activeTab === 'paper' && selectedProjectId !== null) compile(selectedProjectId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [open, activeTab, selectedProjectId, paperFullscreen, actions, compile])

  if (!open) return null

  const selectedProject = selectedProjectId === null
    ? undefined
    : projects.find(project => project.id === selectedProjectId)

  // The overview's stat chips read whatever the other views already fetched;
  // a view not yet loaded (or belonging to another project) shows a dash.
  const overviewStats = {
    papers: papers.status === 'ready' ? papers.list.length : null,
    experiments: experiments !== null && experiments.projectId === selectedProjectId && experiments.status === 'ready'
      ? experiments.list.length
      : null,
    figures: figures !== null && figures.projectId === selectedProjectId && figures.status === 'ready'
      ? figures.list.length
      : null,
    servers: servers.status === 'ready' ? servers.list.length : null,
  }
  const navCounts: Partial<Record<ResearchTab, number | null>> = {
    papers: overviewStats.papers,
    experiments: overviewStats.experiments,
    figures: overviewStats.figures,
    servers: overviewStats.servers,
  }

  return (
    <div ref={rootRef} className={css.workbench} role="dialog" aria-modal="true" aria-label={t('panel.title')}>
      {/* Fixed full-viewport dimmer; painted behind the window's own content
          (negative z-index inside the workbench stacking context). */}
      <div className={css.backdrop} aria-hidden />
      <aside className={css.side}>
        <div className={css.sideHead}>
          <div className={css.brand}>
            <span className={css.brandMark} aria-hidden>M</span>
            <span className={css.brandCopy}>
              <span className={css.title}>{t('panel.title')}</span>
              <span className={css.brandSubtitle}>{t('panel.subtitle')}</span>
            </span>
          </div>
          <div className={css.headActions}>
            <button
              type="button"
              className={css.iconButton}
              title={t('panel.theme')}
              aria-label={t('panel.theme')}
              aria-pressed={dark}
              onClick={toggleTheme}
            >
              {dark ? SUN_ICON : MOON_ICON}
            </button>
            <button
              type="button"
              className={css.iconButton}
              title={t('panel.language')}
              aria-label={t('panel.language')}
              onClick={toggleLocale}
            >
              {locale === 'zh' ? '中' : 'EN'}
            </button>
            <button type="button" className={css.close} title={t('panel.close')} aria-label={t('panel.close')} onClick={() => { actions.setOpen(false) }}>
              ×
            </button>
          </div>
        </div>
        {/* The six views as a tablist: 1–6 and ArrowUp/Down/Left/Right all
            switch, aria-selected carries the active tab to AT. */}
        <nav
          className={css.nav}
          role="tablist"
          aria-label={t('panel.views')}
          onKeyDown={(event) => {
            const next = arrowTab(activeTab, event.key)
            if (next === null) return
            event.preventDefault()
            actions.setTab(next)
            const tabs = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
            tabs[TABS.indexOf(next)]?.focus()
          }}
        >
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              className={css.navItem}
              data-active={tab === activeTab || undefined}
              aria-selected={tab === activeTab}
              onClick={() => { actions.setTab(tab) }}
            >
              <span className={css.navIcon} aria-hidden>{TAB_ICONS[tab]}</span>
              <span className={css.navLabel}>{t(TAB_KEYS[tab])}</span>
              {navCounts[tab] !== undefined && navCounts[tab] !== null && (
                <span className={css.navCount} aria-label={String(navCounts[tab])}>
                  {navCounts[tab]}
                </span>
              )}
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
                  title={project.title}
                  onClick={() => { selectProject(project.id) }}
                >
                  <span className={css.projectTitle}>{project.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className={css.sideFoot}>{t('shortcuts.hint')}</p>
      </aside>
      <main className={css.content} role="tabpanel" aria-label={t(TAB_KEYS[activeTab])}>
        {activeTab === 'overview' && (
          <OverviewView project={selectedProject} stats={overviewStats} backup={backup} jobs={jobs} experiments={experiments} exportWiki={exportWiki} importWiki={importWiki} t={t} />
        )}
        {activeTab === 'paper' && (
          <PaperView
            outline={outline}
            compileView={compileView}
            source={source}
            projectId={selectedProjectId}
            projectTitle={selectedProject?.title}
            dir={selectedProject?.paperDir}
            editSource={editSource}
            reloadSource={reloadSource}
            compile={compile}
            requestCompileFix={requestCompileFix}
            bib={bib}
            papers={papers}
            ensureBibliography={ensureBibliography}
            reloadBibliography={reloadBibliography}
            deleteBibEntry={deleteBibEntry}
            updateBibEntry={updateBibEntry}
            importPapersToBib={importPapersToBib}
            ensurePapers={ensurePapers}
            reorderPaperSections={reorderPaperSections}
            reorderPaperSubsections={reorderPaperSubsections}
            paperJump={paperJump}
            consumePaperJump={consumePaperJump}
            fullscreen={paperFullscreen}
            setFullscreen={actions.setPaperFullscreen}
            t={t}
          />
        )}
        {activeTab === 'papers' && (
          <PapersView
            papers={papers}
            arxivSearch={arxivSearch}
            projects={projects}
            selectedProjectId={selectedProjectId}
            ensurePapers={ensurePapers}
            searchArxiv={searchArxiv}
            importPaper={importPaper}
            updatePaper={updatePaper}
            removePaper={removePaper}
            importPapersToBib={importPapersToBib}
            fetchPaperPdf={fetchPaperPdf}
            requestRelatedWork={requestRelatedWork}
            t={t}
          />
        )}
        {activeTab === 'experiments' && (
          <ExperimentsView
            experiments={experiments}
            artifact={artifact}
            servers={servers}
            projectId={selectedProjectId}
            ensureServers={ensureServers}
            deleteExperiment={deleteExperiment}
            updateExperiment={updateExperiment}
            saveExperiment={saveExperiment}
            generateMetricFigure={(metricKey, rows) =>
              selectedProjectId === null
                ? Promise.resolve()
                : generateMetricFigure(selectedProjectId, metricKey, rows)
            }
            retry={() => { if (selectedProjectId !== null) selectProject(selectedProjectId) }}
            t={t}
          />
        )}
        {activeTab === 'figures' && (
          <FiguresView
            figures={figures}
            experiments={experiments}
            projectId={selectedProjectId}
            dir={selectedProject?.paperDir}
            loadFigures={loadFigures}
            uploadFigures={uploadFigures}
            deleteFigure={deleteFigure}
            insertFigure={(entry) => selectedProjectId === null ? Promise.resolve() : insertFigure(selectedProjectId, entry)}
            t={t}
          />
        )}
        {activeTab === 'servers' && (
          <ServersView
            servers={servers}
            checks={serverChecks}
            ensureServers={ensureServers}
            saveServer={saveServer}
            deleteServer={deleteServer}
            checkServer={checkServer}
            checkAllServers={checkAllServers}
            jobs={jobs}
            experiments={experiments}
            ensureJobs={ensureJobs}
            refreshJobs={refreshJobs}
            submitJob={submitJob}
            deleteJob={deleteJob}
            t={t}
          />
        )}
      </main>
      <ToastHost toasts={toasts} dismissToast={dismissToast} pruneToasts={pruneToasts} t={t} />
    </div>
  )
}
