/**
 * Behavior tests for the `figure_save` tool and the figures metadata plumbing:
 * the tool copies a generated image into the project's paper `figures/`
 * directory, writes the wiki `figures` row (caption, linked experiment,
 * origin path), and registers the file in the project's artifact list;
 * `listFigures` merges that metadata into the file scan and `deleteFigure`
 * drops the row with the file. Memory-backed domain, real temp directories,
 * no mocks.
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'
import { researchWikiDomainSpec } from '../src/store.ts'
import { createFigureOrganizeTool, createFigureSaveTool } from '../src/tools/figure.ts'
import { ResearchService } from '../src/service.ts'
import type { SvgConversionDeps } from '../src/svg-convert.ts'
import type { ProjectRecord } from '../src/types.ts'

/** Boot a memory-backed domain plus a fresh temp workspace, service, and tool. */
async function harness(svg?: SvgConversionDeps) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(researchWikiDomainSpec)
  const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-figure-save-'))
  const project: ProjectRecord = {
    id: 'p1', title: 'P', stage: 'experiment', paperDir: 'paper', artifacts: [],
    reviewRounds: 0, updatedAt: new Date().toISOString(),
  }
  await domain.table('projects').put(project.id, project)
  const service = new ResearchService(ctx, {
    workspaceDir,
    domain,
    latex: { engine: 'auto', timeoutMs: 1000 },
  })
  return { domain, workspaceDir, service, tool: createFigureSaveTool(workspaceDir, domain, svg ?? {}) }
}

/** The tool's execute needs a ToolRunContext it never reads in these paths. */
const NO_EXEC = {} as ToolRunContext

const PIXELS = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])

describe('figure_save', () => {
  it('copies a generated figure and records caption metadata', async () => {
    const { domain, workspaceDir, tool } = await harness()
    const sourceDir = await mkdtemp(join(tmpdir(), 'mimir-generated-'))
    const source = join(sourceDir, 'loss.png')
    await writeFile(source, PIXELS)
    const value = await tool.execute({ path: source, project_id: 'p1', caption: 'Training loss' }, NO_EXEC) as Record<string, unknown>
    expect(value).toMatchObject({ ok: true, relPath: 'figures/loss.png' })
    expect(String(value['latex'])).toContain('\\includegraphics[width=0.8\\linewidth]{figures/loss.png}')
    expect(String(value['latex'])).toContain('\\caption{Training loss}')
    expect(await readFile(join(workspaceDir, 'paper', 'figures', 'loss.png'))).toEqual(await readFile(source))
    expect(domain.table('figures').get('p1:figures/loss.png')).toMatchObject({ caption: 'Training loss', projectId: 'p1' })
    expect(domain.table('projects').get('p1')?.artifacts).toContain('paper/figures/loss.png')
  })

  it('rejects unsupported files and cross-project experiment links', async () => {
    const { domain, workspaceDir, tool } = await harness()
    await mkdir(join(workspaceDir, 'generated'), { recursive: true })
    const text = join(workspaceDir, 'generated', 'notes.txt')
    await writeFile(text, 'nope')
    await expect(tool.execute({ path: text, project_id: 'p1' }, NO_EXEC)).rejects.toThrow('plain figure file name')
    await domain.table('projects').put('p2', { id: 'p2', title: 'P2', stage: 'experiment', artifacts: [], reviewRounds: 0, updatedAt: new Date().toISOString() })
    await domain.table('experiments').put('e2', { id: 'e2', projectId: 'p2', name: 'x', status: 'success', metrics: {}, updatedAt: new Date().toISOString() })
    const image = join(workspaceDir, 'generated', 'plot.svg')
    await writeFile(image, '<svg/>')
    await expect(tool.execute({ path: image, project_id: 'p1', experiment_id: 'e2' }, NO_EXEC)).rejects.toThrow('does not belong')
  })

  it('resolves workspace-relative source paths and renames on request', async () => {
    const { domain, workspaceDir, tool } = await harness()
    await mkdir(join(workspaceDir, 'scratch'), { recursive: true })
    await writeFile(join(workspaceDir, 'scratch', 'curve.png'), PIXELS)
    const value = await tool.execute({ path: 'scratch/curve.png', project_id: 'p1', name: 'loss.png' }, NO_EXEC) as Record<string, unknown>
    expect(value['relPath']).toBe('figures/loss.png')
    expect(await readFile(join(workspaceDir, 'paper', 'figures', 'loss.png'))).toEqual(PIXELS)
    expect(domain.table('figures').get('p1:figures/loss.png')).toMatchObject({ relPath: 'figures/loss.png' })
  })

  it('keeps createdAt and the experiment link on a re-save', async () => {
    const { domain, workspaceDir, tool } = await harness()
    await domain.table('experiments').put('e1', { id: 'e1', projectId: 'p1', name: 'run one', status: 'success', metrics: {}, updatedAt: new Date().toISOString() })
    const scratch = join(workspaceDir, 'out.png')
    await writeFile(scratch, PIXELS)
    await tool.execute({ path: scratch, project_id: 'p1', caption: 'v1', experiment_id: 'e1' }, NO_EXEC)
    const createdAt = domain.table('figures').get('p1:figures/out.png')?.createdAt
    // Re-save without experiment_id: the link and the original createdAt survive.
    const second = await tool.execute({ path: scratch, project_id: 'p1', caption: 'v2' }, NO_EXEC) as Record<string, unknown>
    expect(second['caption']).toBe('v2')
    expect(domain.table('figures').get('p1:figures/out.png')).toMatchObject({ caption: 'v2', experimentId: 'e1', createdAt })
  })

  it('rejects unknown projects and missing sources without writing anything', async () => {
    const { domain, workspaceDir, tool } = await harness()
    const scratch = join(workspaceDir, 'out.png')
    await writeFile(scratch, PIXELS)
    await expect(tool.execute({ path: scratch, project_id: 'missing' }, NO_EXEC))
      .rejects.toThrow("no project with id 'missing'")
    await expect(tool.execute({ path: 'nope.png', project_id: 'p1' }, NO_EXEC))
      .rejects.toThrow('source file not found')
    expect([...domain.table('figures').entries()]).toEqual([])
  })

  it('auto-converts an SVG save and points the LaTeX block at the product', async () => {
    const { domain, workspaceDir, tool } = await harness({
      probe: (command) => Promise.resolve(command === 'rsvg-convert' ? '/fake/bin/rsvg-convert' : null),
      run: async (_executable, args) => {
        await writeFile(String(args[args.indexOf('-o') + 1]), '%PDF-fake')
        return { ok: true, message: '' }
      },
    })
    const source = join(workspaceDir, 'plot.svg')
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const value = await tool.execute({ path: source, project_id: 'p1', caption: 'Architecture' }, NO_EXEC) as Record<string, unknown>
    expect(value['relPath']).toBe('figures/plot.svg')
    expect(value['converted']).toEqual({ relPath: 'figures/plot.pdf', converter: 'rsvg-convert' })
    expect(String(value['latex'])).toContain('\\includegraphics[width=0.8\\linewidth]{figures/plot.pdf}')
    expect(String(value['latex'])).toContain('\\caption{Architecture}')
    expect(await readFile(join(workspaceDir, 'paper', 'figures', 'plot.pdf'), 'utf8')).toBe('%PDF-fake')
    // The metadata row still tracks the SVG (the managed file).
    expect(domain.table('figures').get('p1:figures/plot.svg')).toMatchObject({ caption: 'Architecture' })
  })

  it('keeps the .svg block with a warning when no converter is available', async () => {
    const { workspaceDir, tool } = await harness({ probe: () => Promise.resolve(null) })
    const source = join(workspaceDir, 'plot.svg')
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const value = await tool.execute({ path: source, project_id: 'p1' }, NO_EXEC) as Record<string, unknown>
    expect(value['relPath']).toBe('figures/plot.svg')
    expect(value['converted']).toBeUndefined()
    expect(String(value['warning'])).toContain('No SVG converter found')
    expect(String(value['latex'])).toContain('{figures/plot.svg}')
  })
})

describe('figures metadata in the workbench service', () => {
  it('listFigures merges the saved caption and experiment into the scan', async () => {
    const { domain, workspaceDir, service, tool } = await harness()
    await writeFile(join(workspaceDir, 'curve.png'), PIXELS)
    await tool.execute({ path: 'curve.png', project_id: 'p1', caption: 'Ablation bars' }, NO_EXEC)
    const outcome = await service.listFigures({ projectId: 'p1' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error('unreachable')
    expect(outcome.value.figures).toHaveLength(1)
    expect(outcome.value.figures[0]).toMatchObject({ relPath: 'figures/curve.png', caption: 'Ablation bars' })
  })

  it('deleteFigure drops the metadata row with the file', async () => {
    const { domain, workspaceDir, service, tool } = await harness()
    await writeFile(join(workspaceDir, 'curve.png'), PIXELS)
    await tool.execute({ path: 'curve.png', project_id: 'p1', caption: 'curve' }, NO_EXEC)
    const outcome = await service.deleteFigure({ projectId: 'p1', relPath: 'figures/curve.png' })
    expect(outcome).toEqual({ ok: true, value: { relPath: 'figures/curve.png' } })
    expect(domain.table('figures').get('p1:figures/curve.png')).toBeUndefined()
    const listed = await service.listFigures({ projectId: 'p1' })
    expect(listed).toEqual({ ok: true, value: { figures: [] } })
  })
})


describe('figure_organize', () => {
  /** Boot the suite plus the organize tool. */
  async function organizeHarness() {
    const base = await harness()
    return { ...base, organize: createFigureOrganizeTool(base.workspaceDir, base.domain) }
  }

  it('renames the file and sets the caption in one call', async () => {
    const { domain, workspaceDir, organize } = await organizeHarness()
    const figuresDir = join(workspaceDir, 'paper', 'figures')
    await mkdir(figuresDir, { recursive: true })
    await writeFile(join(figuresDir, 'screenshot-1.png'), PIXELS)
    await writeFile(join(workspaceDir, 'paper', 'main.tex'), '\\includegraphics{figures/screenshot-1.png}\n')
    const outcome = await organize.execute({
      project_id: 'p1',
      path: 'figures/screenshot-1.png',
      new_name: 'teaser.png',
      caption: 'The teaser figure.',
    }, NO_EXEC) as Record<string, unknown>
    expect(outcome).toMatchObject({
      ok: true, relPath: 'figures/teaser.png', caption: 'The teaser figure.', renamedFrom: 'figures/screenshot-1.png',
    })
    expect(domain.table('figures').get('p1:figures/teaser.png')?.caption).toBe('The teaser figure.')
    await expect(readFile(join(workspaceDir, 'paper', 'main.tex'), 'utf8'))
      .resolves.toContain('figures/teaser.png')
  })

  it('updates only the caption when no new name is given', async () => {
    const { domain, workspaceDir, organize } = await organizeHarness()
    const figuresDir = join(workspaceDir, 'paper', 'figures')
    await mkdir(figuresDir, { recursive: true })
    await writeFile(join(figuresDir, 'plot.png'), PIXELS)
    const outcome = await organize.execute({
      project_id: 'p1', path: 'figures/plot.png', caption: 'Loss over steps.',
    }, NO_EXEC) as Record<string, unknown>
    expect(outcome).toMatchObject({ ok: true, relPath: 'figures/plot.png', caption: 'Loss over steps.' })
    expect(outcome['renamedFrom']).toBeUndefined()
    expect(domain.table('figures').get('p1:figures/plot.png')?.caption).toBe('Loss over steps.')
  })

  it('requires at least one change and surfaces service failures', async () => {
    const { organize } = await organizeHarness()
    await expect(organize.execute({ project_id: 'p1', path: 'figures/x.png' }, NO_EXEC))
      .rejects.toThrow('at least one of new_name or caption')
    await expect(organize.execute({ project_id: 'nope', path: 'figures/x.png', caption: 'c' }, NO_EXEC))
      .rejects.toThrow()
  })
})
