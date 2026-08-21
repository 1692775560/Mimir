/**
 * The paper view: the Overleaf-style editing surface — a clickable outline
 * rail, the `main.tex` editor with a synced line-number gutter, a dependency-
 * free LaTeX syntax-highlight overlay (transparent-text textarea over a
 * token-rendered pre, degrading to plain past HIGHLIGHT_MAX_LENGTH), the
 * autosave status pill, the compile row with the severity-colored issue list
 * (click jumps the editor to the line), the iframe PDF preview, and the
 * bibliography panel that replaces the preview while open. The three panes
 * are resizable through drag handles (the widths persist to localStorage) and
 * the editor/preview panes can each take the full content area; below the
 * narrow breakpoint they degrade to a one-pane tab layout and the outline
 * rail hides.
 * @module dsh-client-ui-mimir/client/PaperView
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { BibEntry, OutlineNode, SectionMove } from 'dsh-mimir/types'
import type {
  ResearchBibView, ResearchCompileView, ResearchFailureView, ResearchImportCounts,
  ResearchOutlineView, ResearchPapersView, ResearchSourceView,
} from './controller.ts'
import { HIGHLIGHT_MAX_LENGTH, tokenizeLatex } from './latex-highlight.ts'
import {
  editorShareFromDrag, loadPaperLayout, PAPER_LAYOUT_DEFAULT, PAPER_LAYOUT_STORAGE_KEY,
  PAPER_NARROW_BREAKPOINT, paperSoloPane, railWidthFromDrag, serializePaperLayout,
  type PaperLayout, type PaperSoloPane,
} from './paper-layout.ts'
import type { PaperFullscreen } from './store.ts'
import { failureCopy, lineRangeOf, SAVE_KEYS, sectionMoveFromDrop } from './view-common.ts'
import type { ResearchT } from './view-common.ts'
import { BibPanel } from './BibPanel.tsx'
import css from './ResearchPanel.module.css'

/** Editor line height in px; keep in sync with `.editor` in the module CSS. */
const EDITOR_LINE_HEIGHT = 19

/** How long the jumped-to gutter row stays flashed. */
const GUTTER_FLASH_MS = 1200

/** 16×16 pane-fullscreen icons: diagonal arrows out (enter) / in (exit). */
const EXPAND_ICON: ReactNode = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </svg>
)
const COMPRESS_ICON: ReactNode = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 9.5h-4v4M9.5 13.5 13 10M2.5 6.5h4v-4M6.5 2.5 3 6" />
  </svg>
)

/** Track one media query; re-renders when the match flips (e.g. a resize). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = (): void => { setMatches(media.matches) }
    onChange()
    media.addEventListener('change', onChange)
    return () => { media.removeEventListener('change', onChange) }
  }, [query])
  return matches
}

/** 10×14 grip icon: two columns of three dots (the drag affordance). */
const GRIP_ICON: ReactNode = (
  <svg viewBox="0 0 10 14" fill="currentColor" aria-hidden>
    <circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" />
    <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
    <circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" />
  </svg>
)

/**
 * One outline subtree, recursing through children; click jumps the editor.
 * When `reorder` is given (only at the top level), each row gains a drag
 * grip and the list shows an insertion indicator under the pointer; a drop
 * reports the dragged title and the insertion index in the CURRENT order.
 */
function OutlineTree({ nodes, onJump, reorder, gripLabel }: {
  readonly nodes: readonly OutlineNode[]
  readonly onJump: (line: number) => void
  readonly reorder?: { onDropSection: (title: string, insertAt: number) => void } | undefined
  readonly gripLabel?: string | undefined
}) {
  // Mid-gesture drag state of the top-level list (unused in nested trees).
  const [dragTitle, setDragTitle] = useState<string | null>(null)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)
  const endDrag = (): void => {
    setDragTitle(null)
    setInsertIndex(null)
  }
  return (
    <ul className={css.outlineTree}>
      {nodes.map((node, index) => (
        <li key={`${node.line}:${node.title}`}>
          {reorder === undefined ? (
            <button type="button" className={css.outlineItem} onClick={() => { onJump(node.line) }}>
              {node.title} <span className={css.outlineLine}>L{node.line}</span>
            </button>
          ) : (
            <div
              className={css.outlineRow}
              onDragOver={(event) => {
                if (dragTitle === null) return
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                const after = event.clientY > rect.top + rect.height / 2
                setInsertIndex(after ? index + 1 : index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const title = dragTitle ?? event.dataTransfer.getData('text/plain')
                const target = insertIndex
                endDrag()
                if (title !== '' && target !== null) reorder.onDropSection(title, target)
              }}
            >
              {insertIndex === index && <div className={css.dropIndicator} aria-hidden />}
              <span
                className={css.outlineGrip}
                draggable
                title={gripLabel}
                aria-label={gripLabel}
                onDragStart={(event) => {
                  setDragTitle(node.title)
                  event.dataTransfer.setData('text/plain', node.title)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={endDrag}
              >
                {GRIP_ICON}
              </span>
              <button type="button" className={css.outlineItem} onClick={() => { onJump(node.line) }}>
                {node.title} <span className={css.outlineLine}>L{node.line}</span>
              </button>
            </div>
          )}
          {node.children.length > 0 && <OutlineTree nodes={node.children} onJump={onJump} />}
        </li>
      ))}
      {reorder !== undefined && insertIndex === nodes.length && (
        <li className={css.dropIndicator} aria-hidden />
      )}
    </ul>
  )
}

/**
 * @param props - the paper slice views, the selected project and its paperDir,
 * the inject verbs, and copy.
 * @returns the editing surface.
 */
export function PaperView({
  outline, compileView, source, projectId, dir, editSource, reloadSource, compile,
  bib, papers, ensureBibliography, reloadBibliography, deleteBibEntry, updateBibEntry, importPapersToBib,
  ensurePapers, reorderPaperSections, fullscreen, setFullscreen, t,
}: {
  readonly outline: ResearchOutlineView | null
  readonly compileView: ResearchCompileView
  readonly source: ResearchSourceView | null
  readonly projectId: string | null
  readonly dir: string | undefined
  readonly editSource: (content: string) => void
  readonly reloadSource: () => void
  readonly compile: (projectId: string) => void
  readonly bib: ResearchBibView | null
  readonly papers: ResearchPapersView
  readonly ensureBibliography: (projectId: string) => void
  readonly reloadBibliography: () => void
  readonly deleteBibEntry: (key: string) => Promise<ResearchFailureView | null>
  readonly updateBibEntry: (originalKey: string, entry: BibEntry) => Promise<ResearchFailureView | null>
  readonly importPapersToBib: (
    projectId: string,
    arxivIds: string[],
  ) => Promise<ResearchFailureView | ResearchImportCounts>
  readonly ensurePapers: () => void
  readonly reorderPaperSections: (
    projectId: string,
    moves: readonly SectionMove[],
    baseOutline: readonly string[],
  ) => Promise<ResearchFailureView | null>
  /** The pane holding fullscreen (from the shared store so Esc can exit it), or null. */
  readonly fullscreen: PaperFullscreen | null
  readonly setFullscreen: (pane: PaperFullscreen | null) => void
  readonly t: ResearchT
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorPaneRef = useRef<HTMLElement>(null)
  const previewPaneRef = useRef<HTMLElement>(null)
  // The outline rail collapses to a slim strip so the editor can widen.
  const [railCollapsed, setRailCollapsed] = useState(false)
  // Gutter row flashed after a jump (issue list or outline click).
  const [flashLine, setFlashLine] = useState<number | null>(null)
  // The bibliography panel replaces the PDF preview while open.
  const [bibOpen, setBibOpen] = useState(false)
  // The last rejected section reorder, surfaced in the rail.
  const [reorderError, setReorderError] = useState<ResearchFailureView | null>(null)
  // Pane widths; restored from localStorage, written back on every settle.
  const [layout, setLayout] = useState<PaperLayout>(() => loadPaperLayout(key => localStorage.getItem(key)))
  // Which drag handle is mid-gesture (drives the container's data-dragging).
  const [dragging, setDragging] = useState<'rail' | 'split' | null>(null)
  // Under the narrow breakpoint the editor/preview degrade to a one-pane tab
  // layout (the fullscreen CSS hides the other pane, the rail, and the
  // handles); `solo` is the pane that currently owns the content area.
  const narrow = useMediaQuery(`(max-width: ${PAPER_NARROW_BREAKPOINT}px)`)
  const [paperTab, setPaperTab] = useState<PaperSoloPane>('editor')
  const solo = paperSoloPane(narrow, paperTab, fullscreen)

  // A project switch closes the bib panel and exits fullscreen; both reload
  // for the new project on the next open.
  useEffect(() => {
    setBibOpen(false)
    setFullscreen(null)
    setReorderError(null)
  }, [projectId, setFullscreen])

  // Persist the pane widths so a reopen restores them.
  useEffect(() => {
    try {
      localStorage.setItem(PAPER_LAYOUT_STORAGE_KEY, serializePaperLayout(layout))
    } catch {
      // A full/blocked localStorage drops persistence; the layout still works.
    }
  }, [layout])

  /**
   * Start one drag on the rail handle: pointer-captured move events resize
   * the rail until pointerup/pointercancel.
   */
  const onRailHandleDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startRail = railCollapsed || layout.rail === 0 ? 0 : layout.rail
    if (startRail === 0) setRailCollapsed(false)
    setDragging('rail')
    const onMove = (move: PointerEvent): void => {
      setLayout(prev => ({ ...prev, rail: railWidthFromDrag(startRail, move.clientX - startX) }))
    }
    const onUp = (): void => {
      setDragging(null)
      handle.removeEventListener('pointermove', onMove)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp, { once: true })
    handle.addEventListener('pointercancel', onUp, { once: true })
  }

  /**
   * Start one drag on the editor/preview split handle: the measured pane
   * widths at drag start pin the px↔share conversion for the whole gesture.
   */
  const onSplitHandleDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startEditor = editorPaneRef.current?.getBoundingClientRect().width ?? 0
    const available = startEditor + (previewPaneRef.current?.getBoundingClientRect().width ?? 0)
    if (available <= 0) return
    setDragging('split')
    const onMove = (move: PointerEvent): void => {
      setLayout(prev => ({
        ...prev,
        editor: editorShareFromDrag(startEditor + move.clientX - startX, available),
      }))
    }
    const onUp = (): void => {
      setDragging(null)
      handle.removeEventListener('pointermove', onMove)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp, { once: true })
    handle.addEventListener('pointercancel', onUp, { once: true })
  }

  /** Sync the gutter and the highlight overlay to the textarea's viewport. */
  const syncEditorScroll = (): void => {
    const editor = editorRef.current
    if (editor === null) return
    if (gutterRef.current !== null) gutterRef.current.scrollTop = editor.scrollTop
    if (highlightRef.current !== null) {
      highlightRef.current.scrollTop = editor.scrollTop
      highlightRef.current.scrollLeft = editor.scrollLeft
    }
  }

  // Cancel a pending gutter flash on unmount.
  useEffect(() => () => {
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
  }, [])

  /**
   * Move the editor caret and viewport to one 1-based source line (the
   * outline's and the error list's click target), select the line's text, and
   * briefly flash its gutter row. Character offsets count newlines; the
   * scroll position estimates from the fixed line height.
   */
  const jumpToLine = (line: number): void => {
    const editor = editorRef.current
    if (editor === null) return
    const range = lineRangeOf(editor.value, line)
    if (range === null) return
    editor.focus()
    editor.setSelectionRange(range.start, range.end)
    editor.scrollTop = Math.max(0, (line - 3) * EDITOR_LINE_HEIGHT)
    syncEditorScroll()
    setFlashLine(line)
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => { setFlashLine(null) }, GUTTER_FLASH_MS)
  }

  const currentSource = source !== null && source.projectId === projectId ? source : null
  const compiling = compileView.state === 'running'
  const stateCopy = compiling
    ? t('compile.running')
    : compileView.state === 'ok'
      ? t('compile.ok')
      : compileView.state === 'error'
        ? t('compile.error')
        : t('compile.idle')
  // Show which engine produced the last settled compile ("编译成功 · tectonic").
  const compileStatusCopy = compileView.engine === null || compiling
    ? stateCopy
    : `${stateCopy} · ${compileView.engine}`
  const pdfUrl = projectId !== null
    && compileView.state === 'ok'
    && compileView.pdfUpdatedAt !== null
    && compileView.projectId === projectId
    ? `/research/pdf/${encodeURIComponent(projectId)}?v=${compileView.pdfUpdatedAt}`
      + (dir === undefined ? '' : `&dir=${encodeURIComponent(dir)}`)
    : null
  const lineCount = currentSource === null ? 1 : currentSource.content.split('\n').length
  // The highlight overlay's tokens; oversized sources degrade to plain text.
  const highlightTokens = useMemo(() => {
    const content = currentSource?.content ?? ''
    return content.length > 0 && content.length <= HIGHLIGHT_MAX_LENGTH ? tokenizeLatex(content) : null
  }, [currentSource?.content])

  // The overlay remounts when highlighting toggles; re-sync its scroll after
  // every token recompute so it never lags the textarea.
  useEffect(() => { syncEditorScroll() }, [highlightTokens])

  // The rail renders collapsed either by its own toggle or by a drag to 0.
  const railGone = railCollapsed || layout.rail === 0
  /** Expand the collapsed rail, restoring the default width after a drag-to-0. */
  const expandRail = (): void => {
    setRailCollapsed(false)
    if (layout.rail === 0) {
      setLayout(prev => ({ ...prev, rail: PAPER_LAYOUT_DEFAULT.rail }))
    }
  }

  // The outline accepts drops only while the editor is clean: a successful
  // reorder reloads the source, discarding any unsaved draft.
  const reorderable = projectId !== null
    && outline !== null
    && outline.projectId === projectId
    && outline.status === 'ready'
    && currentSource !== null
    && currentSource.status === 'ready'
    && (currentSource.saveState === 'clean' || currentSource.saveState === 'saved')

  /**
   * Apply one drop: translate it into a section move against the current
   * top-level titles and commit it; a rejection stays visible in the rail.
   */
  const onDropSection = (title: string, insertAt: number): void => {
    if (projectId === null || outline === null || !reorderable) return
    const titles = outline.nodes.map(node => node.title)
    const move = sectionMoveFromDrop(titles, title, insertAt)
    if (move === null) return
    setReorderError(null)
    void reorderPaperSections(projectId, [move], titles).then((failure) => {
      setReorderError(failure)
    })
  }

  // The narrow-width editor/preview tab bar (CSS-hidden at full width); both
  // pane heads render it so the switch is reachable from whichever pane shows.
  const paneTabs = (
    <div className={css.paperTabs} role="tablist">
      {(['editor', 'preview'] as const).map(pane => (
        <button
          key={pane}
          type="button"
          role="tab"
          aria-selected={paperTab === pane}
          className={css.paperTab}
          data-active={paperTab === pane || undefined}
          onClick={() => { setPaperTab(pane) }}
        >
          {t(pane === 'editor' ? 'editor.title' : 'preview.title')}
        </button>
      ))}
    </div>
  )

  return (
    <div
      className={css.paperLayout}
      data-fullscreen={solo ?? undefined}
      data-dragging={dragging ?? undefined}
    >
      <aside
        className={css.outlineRail}
        data-collapsed={railGone || undefined}
        style={{ flexBasis: railGone ? 44 : layout.rail }}
      >
        {railGone ? (
          <button
            type="button"
            className={css.railToggle}
            aria-label={t('outline.expand')}
            onClick={expandRail}
          >
            »
          </button>
        ) : (
          <>
            <div className={css.railHead}>
              <h3 className={css.sectionTitle}>{t('outline.title')}</h3>
              <button
                type="button"
                className={css.railToggle}
                aria-label={t('outline.collapse')}
                onClick={() => { setRailCollapsed(true) }}
              >
                «
              </button>
            </div>
            {projectId === null && <p className={css.hint}>{t('outline.hint')}</p>}
            {projectId !== null && (outline === null
              || outline.projectId !== projectId
              || outline.status === 'loading') && (
              <p className={css.hint}>{t('projects.loading')}</p>
            )}
            {projectId !== null && outline !== null
              && outline.projectId === projectId && outline.status === 'error' && (
              <p className={css.failure} role="status">
                {outline.failure?.code === 'paper-not-found'
                  ? t('outline.noPaper')
                  : `${t('error.outline')}：${failureCopy(t, outline.failure)}`}
              </p>
            )}
            {projectId !== null && outline !== null
              && outline.projectId === projectId && outline.status === 'ready'
              && (outline.nodes.length === 0
                ? <p className={css.hint}>{t('outline.empty')}</p>
                : (
                  <OutlineTree
                    nodes={outline.nodes}
                    onJump={jumpToLine}
                    reorder={reorderable ? { onDropSection } : undefined}
                    gripLabel={t('outline.drag')}
                  />
                ))}
            {reorderError !== null && (
              <p className={css.failure} role="status">
                {reorderError.code === 'conflict'
                  ? t('outline.reorderConflict')
                  : `${t('outline.reorderFailed')}：${failureCopy(t, reorderError)}`}
              </p>
            )}
          </>
        )}
      </aside>
      <div
        className={css.splitHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('pane.resize')}
        data-active={dragging === 'rail' || undefined}
        onPointerDown={onRailHandleDown}
      />
      <section
        ref={editorPaneRef}
        className={css.editorPane}
        style={solo === null ? { flexGrow: layout.editor, flexBasis: 0 } : undefined}
      >
        <div className={css.editorHead}>
          <h3 className={css.sectionTitle}>{t('editor.title')}</h3>
          {paneTabs}
          <div className={css.paneHeadActions}>
            {currentSource !== null && currentSource.status === 'ready' && (
              <span className={css.savePill} data-state={currentSource.saveState} role="status">
                {t(SAVE_KEYS[currentSource.saveState])}
              </span>
            )}
            {!narrow && (
              <button
                type="button"
                className={css.iconButton}
                title={fullscreen === 'editor' ? t('pane.exitFullscreen') : t('pane.fullscreen')}
                aria-label={fullscreen === 'editor' ? t('pane.exitFullscreen') : t('pane.fullscreen')}
                onClick={() => { setFullscreen(fullscreen === 'editor' ? null : 'editor') }}
              >
                {fullscreen === 'editor' ? COMPRESS_ICON : EXPAND_ICON}
              </button>
            )}
          </div>
        </div>
        {currentSource !== null && currentSource.saveState === 'conflict' && (
          <p className={css.conflictBanner} role="alert">
            {t('save.conflict')}
            <button type="button" className={css.retry} onClick={reloadSource}>
              {t('save.reload')}
            </button>
          </p>
        )}
        {currentSource !== null && currentSource.status === 'error' && (
          <p className={css.failure} role="status">
            {currentSource.failure?.code === 'paper-not-found'
              ? t('outline.noPaper')
              : failureCopy(t, currentSource.failure)}
          </p>
        )}
        <div className={css.editorWrap}>
          <div ref={gutterRef} className={css.gutter} aria-hidden>
            {Array.from({ length: lineCount }, (_, index) => (
              <div key={index} data-flash={index + 1 === flashLine || undefined}>{index + 1}</div>
            ))}
          </div>
          <div className={css.editorStack}>
            {highlightTokens !== null && (
              <pre ref={highlightRef} className={css.editorHighlight} aria-hidden>
                {highlightTokens.map((token, index) => token.type === 'plain'
                  ? token.text
                  : <span key={index} data-tok={token.type}>{token.text}</span>)}
                {/* A trailing newline keeps the pre as tall as the textarea
                    when the source ends with one. */}
                {'\n'}
              </pre>
            )}
            <textarea
              ref={editorRef}
              className={css.editor}
              data-highlighted={highlightTokens !== null || undefined}
              spellCheck={false}
              value={currentSource?.content ?? ''}
              disabled={projectId === null || currentSource === null
                || currentSource.status !== 'ready' || currentSource.saveState === 'conflict'}
              onChange={(event) => { editSource(event.target.value) }}
              onScroll={syncEditorScroll}
            />
          </div>
        </div>
      </section>
      <div
        className={css.splitHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('pane.resize')}
        data-active={dragging === 'split' || undefined}
        onPointerDown={onSplitHandleDown}
      />
      <section
        ref={previewPaneRef}
        className={css.previewPane}
        style={solo === null ? { flexGrow: 1 - layout.editor, flexBasis: 0 } : undefined}
      >
        <div className={css.compileRow}>
          {paneTabs}
          <button
            type="button"
            className={css.compileButton}
            disabled={projectId === null || compiling}
            onClick={() => { if (projectId !== null) compile(projectId) }}
          >
            {compiling ? t('compile.running') : t('compile.run')}
          </button>
          <span className={css.compileStatus} data-state={compileView.state} role="status">
            {compileStatusCopy}
          </span>
          <button
            type="button"
            className={css.bibToggle}
            disabled={projectId === null}
            data-active={bibOpen || undefined}
            onClick={() => { setBibOpen(prev => !prev) }}
          >
            {bibOpen ? t('bib.close') : t('bib.open')}
          </button>
          {!narrow && (
            <button
              type="button"
              className={css.iconButton}
              title={fullscreen === 'preview' ? t('pane.exitFullscreen') : t('pane.fullscreen')}
              aria-label={fullscreen === 'preview' ? t('pane.exitFullscreen') : t('pane.fullscreen')}
              onClick={() => { setFullscreen(fullscreen === 'preview' ? null : 'preview') }}
            >
              {fullscreen === 'preview' ? COMPRESS_ICON : EXPAND_ICON}
            </button>
          )}
        </div>
        {compileView.issues.length > 0 && (
          <ul className={css.issueList} aria-label={t('issues.title')}>
            {compileView.issues.map((issue, index) => (
              <li key={`${index}:${issue.message}`}>
                <button
                  type="button"
                  className={css.issue}
                  data-severity={issue.severity}
                  disabled={issue.line === undefined}
                  title={issue.line === undefined ? undefined : t('issues.jump')}
                  onClick={() => { if (issue.line !== undefined) jumpToLine(issue.line) }}
                >
                  <span className={css.issueDot} aria-hidden />
                  <span className={css.issueBody}>
                    {issue.line !== undefined && (
                      <span className={css.issueLine}>L{issue.line}</span>
                    )}
                    <span className={css.issueMessage}>{issue.message}</span>
                    {issue.file !== undefined && (
                      <span className={css.issueWhere}>{issue.file}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {bibOpen && projectId !== null
          ? (
            <BibPanel
              bib={bib}
              papers={papers}
              projectId={projectId}
              ensureBibliography={ensureBibliography}
              reloadBibliography={reloadBibliography}
              deleteBibEntry={deleteBibEntry}
              updateBibEntry={updateBibEntry}
              importPapersToBib={importPapersToBib}
              ensurePapers={ensurePapers}
              onClose={() => { setBibOpen(false) }}
              t={t}
            />
          )
          : pdfUrl === null
            ? (
              <div className={css.previewEmpty}>
                <span className={css.emptyGlyph} aria-hidden>📄</span>
                <span>{t('preview.empty')}</span>
              </div>
            )
            : <iframe className={css.previewFrame} title={t('preview.title')} src={pdfUrl} />}
      </section>
    </div>
  )
}
