/**
 * The paper view: the Overleaf-style editing surface — a clickable outline
 * rail, the `main.tex` editor with a synced line-number gutter, a dependency-
 * free LaTeX syntax-highlight overlay (transparent-text textarea over a
 * token-rendered pre, degrading to plain past HIGHLIGHT_MAX_LENGTH), the
 * autosave status pill, the compile row with the severity-colored issue list
 * (click jumps the editor to the line), the iframe PDF preview, and the
 * bibliography panel that replaces the preview while open.
 * @module dsh-client-ui-mimir/client/PaperView
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { OutlineNode } from 'dsh-mimir/types'
import type {
  ResearchBibView, ResearchCompileView, ResearchFailureView, ResearchImportCounts,
  ResearchOutlineView, ResearchPapersView, ResearchSourceView,
} from './controller.ts'
import { HIGHLIGHT_MAX_LENGTH, tokenizeLatex } from './latex-highlight.ts'
import { failureCopy, lineRangeOf, SAVE_KEYS } from './view-common.ts'
import type { ResearchT } from './view-common.ts'
import { BibPanel } from './BibPanel.tsx'
import css from './ResearchPanel.module.css'

/** Editor line height in px; keep in sync with `.editor` in the module CSS. */
const EDITOR_LINE_HEIGHT = 19

/** How long the jumped-to gutter row stays flashed. */
const GUTTER_FLASH_MS = 1200

/** One outline subtree, recursing through children; click jumps the editor. */
function OutlineTree({ nodes, onJump }: {
  readonly nodes: readonly OutlineNode[]
  readonly onJump: (line: number) => void
}) {
  return (
    <ul className={css.outlineTree}>
      {nodes.map(node => (
        <li key={`${node.line}:${node.title}`}>
          <button type="button" className={css.outlineItem} onClick={() => { onJump(node.line) }}>
            {node.title} <span className={css.outlineLine}>L{node.line}</span>
          </button>
          {node.children.length > 0 && <OutlineTree nodes={node.children} onJump={onJump} />}
        </li>
      ))}
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
  bib, papers, ensureBibliography, reloadBibliography, deleteBibEntry, importPapersToBib,
  ensurePapers, t,
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
  readonly importPapersToBib: (
    projectId: string,
    arxivIds: string[],
  ) => Promise<ResearchFailureView | ResearchImportCounts>
  readonly ensurePapers: () => void
  readonly t: ResearchT
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The outline rail collapses to a slim strip so the editor can widen.
  const [railCollapsed, setRailCollapsed] = useState(false)
  // Gutter row flashed after a jump (issue list or outline click).
  const [flashLine, setFlashLine] = useState<number | null>(null)
  // The bibliography panel replaces the PDF preview while open.
  const [bibOpen, setBibOpen] = useState(false)

  // A project switch closes the bib panel; it reloads for the new project on
  // the next open.
  useEffect(() => { setBibOpen(false) }, [projectId])

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

  return (
    <div className={css.paperLayout}>
      <aside className={css.outlineRail} data-collapsed={railCollapsed || undefined}>
        {railCollapsed ? (
          <button
            type="button"
            className={css.railToggle}
            aria-label={t('outline.expand')}
            onClick={() => { setRailCollapsed(false) }}
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
                : <OutlineTree nodes={outline.nodes} onJump={jumpToLine} />)}
          </>
        )}
      </aside>
      <section className={css.editorPane}>
        <div className={css.editorHead}>
          <h3 className={css.sectionTitle}>{t('editor.title')}</h3>
          {currentSource !== null && currentSource.status === 'ready' && (
            <span className={css.savePill} data-state={currentSource.saveState} role="status">
              {t(SAVE_KEYS[currentSource.saveState])}
            </span>
          )}
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
      <section className={css.previewPane}>
        <div className={css.compileRow}>
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
