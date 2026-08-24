/**
 * Meeting-deck domain service: assemble a group-meeting PPTX from the wiki —
 * project progress, experiment runs, paper-directory figures, and selected
 * library papers (with their AI relevance verdicts). The slide plan is a
 * pure, unit-testable model ({@link buildDeckModel}); the pptxgenjs render
 * is a thin shell over it ({@link renderDeck}).
 *
 * Decks land in `<workspace>/meetings/<projectId>/<name>.pptx` — the
 * filesystem is the source of truth, no store table.
 * @module dsh-mimir/src/services/meeting
 */

import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type {
  ExperimentRecord,
  FigureRecord,
  MeetingInclude,
  PaperRecord,
  ProjectRecord,
  ResearchDeleteMeetingDeckResult,
  ResearchGenerateMeetingResult,
  ResearchMeetingDecksResult,
} from '../types.ts'
import { resolvePaperDir } from '../paper-source.ts'
import { listPaperFigures, type FigureFile } from '../artifacts.ts'
import { success, rejected } from './common.ts'
import type { WikiAdminDeps } from './wiki-admin.ts'

/** Directory under the workspace root holding one subfolder per project. */
export const MEETINGS_DIR_NAME = 'meetings'
/** The deck font, per the group-meeting house style. */
export const DECK_FONT = 'Microsoft YaHei'
/** Caps keeping a deck presentable: papers and figures per deck. */
export const DECK_MAX_PAPERS = 12
export const DECK_MAX_FIGURES = 12

const DEFAULT_INCLUDE: MeetingInclude = Object.freeze({
  progress: true, experiments: true, figures: true, papers: true,
})

/** One figure chosen for the deck: metadata plus the on-disk image to embed. */
export interface MeetingFigureInput {
  readonly record: FigureRecord
  /** Absolute path of the raster image to embed (png/jpg/jpeg only). */
  readonly imagePath: string
}

/** Everything {@link buildDeckModel} needs, already gathered. */
export interface DeckModelInput {
  readonly project: ProjectRecord
  readonly title: string
  readonly date: string
  readonly presenter?: string | undefined
  /** Total library papers associated with the project (the slide's count, uncapped). */
  readonly paperCount: number
  readonly papers: readonly PaperRecord[]
  readonly experiments: readonly ExperimentRecord[]
  readonly figures: readonly MeetingFigureInput[]
  readonly include: MeetingInclude
}

/** One text bullet on a content slide. */
export interface DeckBullet {
  readonly text: string
  /** Emphasis lines render bold/accented (section headers within a slide). */
  readonly emph?: boolean
}

/** The pure slide plan: what each slide shows, before any pptxgenjs call. */
export type DeckSlide =
  | { readonly kind: 'title'; readonly title: string; readonly subtitle: string }
  | { readonly kind: 'agenda'; readonly sections: readonly string[] }
  | { readonly kind: 'bullets'; readonly heading: string; readonly bullets: readonly DeckBullet[] }
  | { readonly kind: 'figure'; readonly heading: string; readonly imagePath: string; readonly caption: string }
  | { readonly kind: 'closing' }

/** Format an ISO date (or raw string) as YYYY-MM-DD for the deck. */
function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

/** One-line metric summary of an experiment record. */
function metricsLineOf(record: ExperimentRecord): string {
  const entries = Object.entries(record.metrics)
  if (entries.length === 0) return ''
  return entries.slice(0, 4).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
}

/** Stage → Chinese label used on the progress slide. */
const STAGE_LABELS: Record<ProjectRecord['stage'], string> = {
  idea: '想法', plan: '方案', experiment: '实验', writing: '写作', done: '完成',
}

/**
 * Build the pure slide plan. Slide order: title → agenda → progress →
 * experiments → figures → papers → closing. Papers arrive pre-selected and
 * pre-sorted; figures likewise.
 * @param input - the gathered deck data.
 * @returns the ordered slide plan.
 */
export function buildDeckModel(input: DeckModelInput): readonly DeckSlide[] {
  const slides: DeckSlide[] = []
  const { project, include } = input

  const subtitleParts = [input.date]
  if (input.presenter !== undefined && input.presenter !== '') subtitleParts.push(`汇报人：${input.presenter}`)
  if (project.venue !== undefined) subtitleParts.push(`目标会议：${project.venue.name}`)
  slides.push({ kind: 'title', title: input.title, subtitle: subtitleParts.join('  ·  ') })

  const sections: string[] = []
  if (include.progress) sections.push('项目进展')
  if (include.experiments && input.experiments.length > 0) sections.push('实验结果')
  if (include.figures && input.figures.length > 0) sections.push('图表')
  if (include.papers && input.papers.length > 0) sections.push('文献分享')
  sections.push('下一步计划')
  slides.push({ kind: 'agenda', sections })

  if (include.progress) {
    const bullets: DeckBullet[] = [
      { text: `当前阶段：${STAGE_LABELS[project.stage]}`, emph: true },
      { text: `文献库 ${String(input.paperCount)} 篇 · 实验 ${String(input.experiments.length)} 次 · 图表 ${String(input.figures.length)} 张` },
      ...(project.venue === undefined ? [] : [{ text: `目标会议：${project.venue.name}` }]),
      { text: `最近更新：${dateOnly(project.updatedAt)}` },
    ]
    slides.push({ kind: 'bullets', heading: '项目进展', bullets })
  }

  if (include.experiments && input.experiments.length > 0) {
    const bullets: DeckBullet[] = input.experiments.slice(0, 8).map(record => ({
      text: `${record.name}（${record.status === 'success' ? '成功' : record.status === 'running' ? '运行中' : '失败'}）`
        + (metricsLineOf(record) === '' ? '' : ` — ${metricsLineOf(record)}`),
    }))
    if (input.experiments.length > 8) {
      bullets.push({ text: `…以及另外 ${String(input.experiments.length - 8)} 次实验` })
    }
    slides.push({ kind: 'bullets', heading: '实验结果', bullets })
  }

  if (include.figures) {
    for (const figure of input.figures) {
      slides.push({
        kind: 'figure',
        heading: figure.record.relPath.replace(/^figures\//, '').replace(/\.[^.]+$/, ''),
        imagePath: figure.imagePath,
        caption: figure.record.caption,
      })
    }
  }

  if (include.papers) {
    for (const paper of input.papers) {
      const verdict = paper.relevance?.[project.id]
      const bullets: DeckBullet[] = []
      if (paper.authors.length > 0) {
        bullets.push({ text: paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '') })
      }
      if (verdict !== undefined) {
        bullets.push({ text: `相关度 ${String(verdict.score)}/10 — ${verdict.reason}`, emph: true })
      }
      if (paper.notes !== '') bullets.push({ text: `笔记：${paper.notes}` })
      if (paper.tags.length > 0) bullets.push({ text: `标签：${paper.tags.join(' / ')}` })
      slides.push({
        kind: 'bullets',
        heading: paper.title,
        bullets: bullets.length > 0 ? bullets : [{ text: paper.summary.slice(0, 200) }],
      })
    }
  }

  slides.push({ kind: 'closing' })
  return Object.freeze(slides)
}

/* ── pptxgenjs render shell ─────────────────────────────────────────────── */

/* pptxgenjs 4's bundled d.ts (`export as namespace` + `export default`) does
 * not yield a constructable type under nodenext, so renderDeck casts the
 * dynamic import once onto this narrow structural surface — exactly the
 * members the render shell below uses. */

/** Loose option bag — pptxgenjs accepts far more keys than we pass. */
type PptxOptions = Record<string, unknown>

/** One text run inside a rich-text paragraph. */
interface PptxTextRun {
  readonly text: string
  readonly options?: PptxOptions
}

/** The slide surface the render shell draws on. */
interface PptxSlideSurface {
  addText(text: string | readonly PptxTextRun[], options: PptxOptions): void
  addShape(name: 'rect' | 'line', options: PptxOptions): void
  addImage(options: PptxOptions): void
}

/** The deck surface the render shell drives. */
interface PptxDeck {
  layout: string
  defineLayout(layout: { readonly name: string; readonly width: number; readonly height: number }): void
  addSlide(): PptxSlideSurface
  writeFile(options: { readonly fileName: string }): Promise<void>
}

/** Constructor signature of the pptxgenjs default export. */
type PptxDeckCtor = new () => PptxDeck

/** 16:9 canvas metrics (inches). */
const PAGE = { width: 10, height: 5.625 } as const
const ACCENT = '4F7CFF'
const INK = '17233D'
const MUTED = '5B6472'

/**
 * Render one slide plan to a pptx file via pptxgenjs.
 * @param slides - the plan from {@link buildDeckModel}.
 * @param outPath - absolute target path (parent must exist).
 * @returns resolution after the file is written.
 */
export async function renderDeck(slides: readonly DeckSlide[], outPath: string): Promise<void> {
  const { default: PptxGenJS } = (await import('pptxgenjs')) as unknown as { default: PptxDeckCtor }
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'W16x9', width: PAGE.width, height: PAGE.height })
  pptx.layout = 'W16x9'

  for (const slide of slides) {
    const page = pptx.addSlide()
    if (slide.kind === 'title') {
      page.addText(slide.title, {
        x: 0.6, y: 1.8, w: PAGE.width - 1.2, h: 1.2, fontFace: DECK_FONT,
        fontSize: 30, bold: true, color: INK, align: 'center',
      })
      page.addText(slide.subtitle, {
        x: 0.6, y: 3.1, w: PAGE.width - 1.2, h: 0.5, fontFace: DECK_FONT,
        fontSize: 14, color: MUTED, align: 'center',
      })
      page.addShape('rect', { x: 0, y: 0, w: PAGE.width, h: 0.12, fill: { color: ACCENT } })
      continue
    }
    if (slide.kind === 'agenda') {
      page.addText('目录', { x: 0.6, y: 0.4, w: 8.8, h: 0.6, fontFace: DECK_FONT, fontSize: 22, bold: true, color: INK })
      page.addText(
        slide.sections.map((section, index) => `${String(index + 1)}.  ${section}`).join('\n'),
        { x: 1.0, y: 1.3, w: 8, h: 3.8, fontFace: DECK_FONT, fontSize: 18, color: INK, lineSpacing: 34 },
      )
      continue
    }
    if (slide.kind === 'bullets') {
      page.addText(slide.heading, {
        x: 0.6, y: 0.35, w: PAGE.width - 1.2, h: 0.7, fontFace: DECK_FONT,
        fontSize: 20, bold: true, color: INK,
      })
      page.addShape('line', { x: 0.6, y: 1.05, w: PAGE.width - 1.2, h: 0, line: { color: ACCENT, width: 1.5 } })
      page.addText(
        slide.bullets.map(bullet => ({
          text: bullet.text,
          options: { bullet: { code: '2022' }, bold: bullet.emph === true, color: bullet.emph === true ? ACCENT : INK, breakLine: true },
        })),
        { x: 0.8, y: 1.3, w: PAGE.width - 1.6, h: 3.9, fontFace: DECK_FONT, fontSize: 14, lineSpacing: 24, valign: 'top' },
      )
      continue
    }
    if (slide.kind === 'figure') {
      page.addText(slide.heading, {
        x: 0.6, y: 0.3, w: PAGE.width - 1.2, h: 0.5, fontFace: DECK_FONT, fontSize: 18, bold: true, color: INK,
      })
      // Left image, right caption — the house layout; wide images stay within
      // the left 60% so the caption column never overlaps.
      page.addImage({ path: slide.imagePath, x: 0.6, y: 1.0, w: 5.6, h: 4.0, sizing: { type: 'contain', w: 5.6, h: 4.0 } })
      if (slide.caption !== '') {
        page.addText(slide.caption, {
          x: 6.4, y: 1.0, w: 3.0, h: 4.0, fontFace: DECK_FONT, fontSize: 13, color: INK, valign: 'top', lineSpacing: 20,
        })
      }
      continue
    }
    // closing
    page.addText('下一步计划', { x: 0.6, y: 0.4, w: 8.8, h: 0.6, fontFace: DECK_FONT, fontSize: 22, bold: true, color: INK })
    page.addText('（现场讨论填充）', { x: 1.0, y: 1.5, w: 8, h: 0.6, fontFace: DECK_FONT, fontSize: 16, color: MUTED })
  }

  await pptx.writeFile({ fileName: outPath })
}

/* ── gathering + Remote-facing verbs ────────────────────────────────────── */

/** The generate request's shape. */
export interface GenerateMeetingRequest {
  readonly projectId: string
  readonly title?: string | undefined
  readonly presenter?: string | undefined
  readonly date?: string | undefined
  /** Selected library papers; absent = the project's associated papers, relevance-sorted. */
  readonly paperIds?: readonly string[] | undefined
  /** Selected figure relPaths; absent = every figure with a raster sibling. */
  readonly figureRelPaths?: readonly string[] | undefined
  readonly include?: Partial<MeetingInclude> | undefined
}

/** Raster extensions a deck can embed (pptxgenjs has no svg-by-path). */
const DECK_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

/** Filesystem-safe slug of a display name, falling back to the project id. */
function slugOf(title: string, fallback: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug === '' ? fallback.slice(0, 8) : slug
}

/**
 * Generate one project's meeting deck. Gathers the selected (or default)
 * papers/experiments/figures, plans the slides, renders the pptx into
 * `meetings/<projectId>/`, and returns the file name plus the slide count.
 * An unknown project is `project-not-found`.
 * @param deps - workspace root and open domain.
 * @param request - the deck options.
 * @returns the produced file.
 */
export async function generateMeetingDeck(
  deps: WikiAdminDeps & { readonly workspaceDir: string },
  request: GenerateMeetingRequest,
): Promise<ResearchGenerateMeetingResult> {
  const project = deps.domain.table('projects').get(request.projectId)
  if (project === undefined) return rejected({ code: 'project-not-found', projectId: request.projectId })
  const include: MeetingInclude = { ...DEFAULT_INCLUDE, ...(request.include ?? {}) }

  const allPapers = [...deps.domain.table('papers').entries()].map(([, record]) => record)
  const associated = allPapers.filter(paper => paper.projectIds.includes(project.id))
  const papers = (request.paperIds === undefined
    ? associated
      .sort((left, right) => (right.relevance?.[project.id]?.score ?? -1) - (left.relevance?.[project.id]?.score ?? -1))
    : request.paperIds
      .map(id => allPapers.find(paper => paper.arxivId === id))
      .filter((paper): paper is PaperRecord => paper !== undefined)
  ).slice(0, DECK_MAX_PAPERS)

  const experiments = [...deps.domain.table('experiments').entries()]
    .map(([, record]) => record)
    .filter(record => record.projectId === project.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  const dir = resolvePaperDir(deps.workspaceDir, undefined, project.paperDir)
  const figures: MeetingFigureInput[] = []
  if (dir !== undefined) {
    // Scan the paper directory (not just the metadata table): figures dropped
    // in through the upload route have no table row, and a deck that silently
    // drops them reads as broken. Captions merge from the table when a row
    // exists (any sibling of the stem may carry it).
    const meta = deps.domain.table('figures')
    const scanned = (await listPaperFigures(dir))
      .filter(entry => request.figureRelPaths === undefined || request.figureRelPaths.includes(entry.relPath))
    // Group by stem: embed the raster sibling, skip svg-only files.
    const byStem = new Map<string, FigureFile[]>()
    for (const entry of scanned) {
      const stem = entry.relPath.replace(/\.[^.]+$/, '')
      const group = byStem.get(stem) ?? []
      group.push(entry)
      byStem.set(stem, group)
    }
    for (const group of byStem.values()) {
      const raster = group.find(entry => DECK_IMAGE_EXTENSIONS.has(extname(entry.relPath).toLowerCase()))
      if (raster === undefined) continue
      const caption = group
        .map(entry => meta.get(`${project.id}:${entry.relPath}`)?.caption ?? '')
        .find(text => text !== '') ?? ''
      figures.push({
        record: Object.freeze({
          id: `${project.id}:${raster.relPath}`,
          projectId: project.id,
          relPath: raster.relPath,
          caption,
          createdAt: new Date(raster.mtimeMs).toISOString(),
        }),
        imagePath: join(dir, raster.relPath),
      })
      if (figures.length >= DECK_MAX_FIGURES) break
    }
  }

  const date = request.date?.trim() || dateOnly(new Date().toISOString())
  const title = request.title?.trim() || `${project.title} · 组会汇报`
  const slides = buildDeckModel({
    project, title, date, presenter: request.presenter, paperCount: associated.length, papers, experiments, figures, include,
  })

  const meetingsDir = join(deps.workspaceDir, MEETINGS_DIR_NAME, project.id)
  await mkdir(meetingsDir, { recursive: true })
  const file = `${slugOf(title, project.id)}-${date.replace(/[^0-9]/g, '')}.pptx`
  await renderDeck(slides, join(meetingsDir, file))
  return success({ file, slides: slides.length })
}

/**
 * List one project's generated decks, newest first.
 * An unknown project is `project-not-found`; a missing directory is an
 * empty list (nothing generated yet).
 */
export async function listMeetingDecks(
  deps: WikiAdminDeps & { readonly workspaceDir: string },
  request: { readonly projectId: string },
): Promise<ResearchMeetingDecksResult> {
  const project = deps.domain.table('projects').get(request.projectId)
  if (project === undefined) return rejected({ code: 'project-not-found', projectId: request.projectId })
  const meetingsDir = join(deps.workspaceDir, MEETINGS_DIR_NAME, project.id)
  let names: string[]
  try {
    names = (await readdir(meetingsDir)).filter(name => extname(name).toLowerCase() === '.pptx')
  } catch {
    names = []
  }
  const decks = []
  for (const name of names) {
    const stats = await stat(join(meetingsDir, name))
    decks.push(Object.freeze({ file: name, sizeBytes: stats.size, updatedAt: stats.mtime.toISOString() }))
  }
  decks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return success({ decks: Object.freeze(decks) })
}

/**
 * Delete one generated deck. The file name is reduced to its basename and
 * must be a .pptx, so no traversal is expressible.
 */
export async function deleteMeetingDeck(
  deps: WikiAdminDeps & { readonly workspaceDir: string },
  request: { readonly projectId: string; readonly file: string },
): Promise<ResearchDeleteMeetingDeckResult> {
  const project = deps.domain.table('projects').get(request.projectId)
  if (project === undefined) return rejected({ code: 'project-not-found', projectId: request.projectId })
  const file = basename(request.file)
  if (file === '' || extname(file).toLowerCase() !== '.pptx') {
    return rejected({ code: 'invalid-input', message: 'file must name a .pptx deck' })
  }
  try {
    await unlink(join(deps.workspaceDir, MEETINGS_DIR_NAME, project.id, file))
  } catch {
    return rejected({ code: 'invalid-path', path: file })
  }
  return success({ file })
}

/** Used by the download route: resolve one deck's absolute path, confined to the meetings dir. */
export function meetingDeckPath(
  workspaceDir: string,
  projectId: string,
  file: string,
): string | undefined {
  const name = basename(file)
  if (name === '' || extname(name).toLowerCase() !== '.pptx') return undefined
  return join(workspaceDir, MEETINGS_DIR_NAME, projectId, name)
}
