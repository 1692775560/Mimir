/**
 * Unit tests for the SVG conversion module and the `convertFigure` Remote
 * method: product naming, the PATH probe, the probe-order/fall-through rules
 * (with injected probe/run seams, so CI needs no real converter), plus a
 * real-converter smoke test that runs only when the machine actually carries
 * one. The service tests boot the memory-backed harness with stubbed
 * conversion deps.
 */

import { mkdtemp, mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'
import { researchWikiDomainSpec } from '../src/store.ts'
import { ResearchService } from '../src/service.ts'
import {
  convertSvgFigure, svgConverterNames, svgProductName, whichOnPath, SVG_CONVERTERS,
} from '../src/svg-convert.ts'
import type { SvgConversionDeps, SvgConverterKind } from '../src/svg-convert.ts'
import type { ProjectRecord } from '../src/types.ts'

/** A tiny valid SVG fixture. */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'

/** Probe stub: the listed commands "exist" at a fake path, everything else misses. */
function probeWith(...commands: string[]): (command: string) => Promise<string | null> {
  return (command) => Promise.resolve(commands.includes(command) ? `/fake/bin/${command}` : null)
}

describe('svgProductName', () => {
  it('names the vector pipeline product .pdf and the qlmanage fallback .png', () => {
    expect(svgProductName('foo.svg', 'rsvg-convert')).toBe('foo.pdf')
    expect(svgProductName('foo.svg', 'inkscape')).toBe('foo.pdf')
    expect(svgProductName('foo.svg', 'magick')).toBe('foo.pdf')
    expect(svgProductName('foo.svg', 'qlmanage')).toBe('foo.png')
    expect(svgProductName('FOO.SVG', 'rsvg-convert')).toBe('FOO.pdf')
  })
})

describe('whichOnPath', () => {
  it('finds an executable in one PATH entry and misses absent ones', async () => {
    const bin = await mkdtemp(join(tmpdir(), 'mimir-which-'))
    await writeFile(join(bin, 'rsvg-convert'), '#!/bin/sh\n', { mode: 0o755 })
    await writeFile(join(bin, 'not-executable'), '#!/bin/sh\n', { mode: 0o644 })
    await expect(whichOnPath('rsvg-convert', bin)).resolves.toBe(join(bin, 'rsvg-convert'))
    await expect(whichOnPath('inkscape', bin)).resolves.toBeNull()
    await expect(whichOnPath('not-executable', bin)).resolves.toBeNull()
    await expect(whichOnPath('rsvg-convert', '')).resolves.toBeNull()
  })

  it('scans PATH entries in order', async () => {
    const first = await mkdtemp(join(tmpdir(), 'mimir-which-a-'))
    const second = await mkdtemp(join(tmpdir(), 'mimir-which-b-'))
    await writeFile(join(second, 'magick'), '#!/bin/sh\n', { mode: 0o755 })
    await expect(whichOnPath('magick', [first, second].join(delimiter))).resolves.toBe(join(second, 'magick'))
  })
})

describe('convertSvgFigure', () => {
  /** Scaffold a temp dir holding one SVG; returns its path. */
  async function svgFixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mimir-svg-'))
    const svgPath = join(dir, 'plot.svg')
    await writeFile(svgPath, SVG)
    return svgPath
  }

  /** Run stub that "converts" by writing the product the args point at. */
  function writingRun(productOf: (args: readonly string[]) => string): SvgConversionDeps['run'] {
    return async (_executable, args) => {
      await writeFile(productOf(args), '%PDF-fake')
      return { ok: true, message: '' }
    }
  }

  it('converts with the first converter on PATH, writing the pdf product next to the source', async () => {
    const svgPath = await svgFixture()
    const outcome = await convertSvgFigure(svgPath, {
      probe: probeWith('rsvg-convert', 'inkscape'),
      run: writingRun(args => String(args[args.indexOf('-o') + 1])),
    })
    expect(outcome).toEqual({ ok: true, productPath: join(dirname(svgPath), 'plot.pdf'), converter: 'rsvg-convert' })
    expect(await readFile(join(dirname(svgPath), 'plot.pdf'), 'utf8')).toBe('%PDF-fake')
  })

  it('falls through to the next converter when one fails', async () => {
    const svgPath = await svgFixture()
    const ran: string[] = []
    const outcome = await convertSvgFigure(svgPath, {
      probe: probeWith('rsvg-convert', 'inkscape'),
      run: async (executable, args) => {
        ran.push(executable)
        if (executable.endsWith('rsvg-convert')) return { ok: false, message: 'boom' }
        const product = String(args.find(arg => arg.startsWith('--export-filename='))).slice('--export-filename='.length)
        await writeFile(product, '%PDF-fake')
        return { ok: true, message: '' }
      },
    })
    expect(outcome).toMatchObject({ ok: true, converter: 'inkscape' })
    expect(ran).toEqual(['/fake/bin/rsvg-convert', '/fake/bin/inkscape'])
  })

  it('treats a zero-exit run that produced nothing as a failure and falls through', async () => {
    const svgPath = await svgFixture()
    const outcome = await convertSvgFigure(svgPath, {
      probe: probeWith('rsvg-convert', 'magick'),
      run: async (executable, args) => {
        if (executable.endsWith('magick')) {
          await writeFile(String(args[1]), '%PDF-fake')
        }
        return { ok: true, message: '' }
      },
    })
    expect(outcome).toMatchObject({ ok: true, converter: 'magick' })
  })

  it('renames the qlmanage thumbnail to the plain .png product on darwin', async () => {
    const svgPath = await svgFixture()
    const outcome = await convertSvgFigure(svgPath, {
      platform: 'darwin',
      probe: probeWith('qlmanage'),
      run: writingRun(args => join(String(args[args.indexOf('-o') + 1]), 'plot.svg.png')),
    })
    const dir = dirname(svgPath)
    expect(outcome).toEqual({ ok: true, productPath: join(dir, 'plot.png'), converter: 'qlmanage' })
    expect(await readFile(join(dir, 'plot.png'), 'utf8')).toBe('%PDF-fake')
  })

  it('skips qlmanage off darwin and reports no-converter when nothing is installed', async () => {
    const svgPath = await svgFixture()
    const outcome = await convertSvgFigure(svgPath, { platform: 'linux', probe: probeWith('qlmanage') })
    expect(outcome).toEqual({ ok: false, code: 'no-converter' })
    expect(svgConverterNames('linux')).not.toContain('qlmanage')
    expect(svgConverterNames('darwin')).toContain('qlmanage')
  })

  it('reports convert-failed with the stderr tail when every found converter fails', async () => {
    const svgPath = await svgFixture()
    const outcome = await convertSvgFigure(svgPath, {
      probe: probeWith('rsvg-convert'),
      run: () => Promise.resolve({ ok: false, message: 'invalid SVG' }),
    })
    expect(outcome).toEqual({ ok: false, code: 'convert-failed', converter: 'rsvg-convert', message: 'invalid SVG' })
  })

  it('really converts the fixture when the machine carries a converter', async (context) => {
    const available: SvgConverterKind[] = []
    for (const spec of SVG_CONVERTERS) {
      if (spec.platform !== undefined && spec.platform !== process.platform) continue
      if (await whichOnPath(spec.command) !== null) available.push(spec.kind)
    }
    if (available.length === 0) {
      context.skip()
      return
    }
    const svgPath = await svgFixture()
    const outcome = await convertSvgFigure(svgPath)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(available).toContain(outcome.converter)
    expect((await stat(outcome.productPath)).size).toBeGreaterThan(0)
  })
})

describe('ResearchService.convertFigure', () => {
  const PROJECT: ProjectRecord = {
    id: 'p1',
    title: 'Project',
    stage: 'writing',
    artifacts: [],
    reviewRounds: 0,
    updatedAt: '2026-08-20T00:00:00.000Z',
  }

  /** Boot the service harness with stubbed SVG conversion deps. */
  async function harness(svg?: SvgConversionDeps) {
    const ctx = new Context()
    await ctx.plugin(Storage)
    const backend = new MemoryStorageBackend(new MemoryMediaPool())
    ctx.storage.backend.register('memory', backend)
    ctx.provide(storageBackendServiceKey('memory'), backend)
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    const domain = await facility.open(researchWikiDomainSpec)
    const workspaceDir = await mkdtemp(join(tmpdir(), 'mimir-convert-'))
    const service = new ResearchService(ctx, {
      workspaceDir,
      domain,
      latex: { engine: 'auto', timeoutMs: 1000 },
      ...(svg === undefined ? {} : { svg }),
    })
    await domain.table('projects').put(PROJECT.id, PROJECT)
    const figuresDir = join(workspaceDir, 'paper', 'figures')
    await mkdir(figuresDir, { recursive: true })
    await writeFile(join(figuresDir, 'plot.svg'), SVG)
    return { workspaceDir, service }
  }

  /** Deps whose stubbed rsvg-convert writes the product the args name. */
  const STUB_CONVERT: SvgConversionDeps = {
    probe: probeWith('rsvg-convert'),
    run: async (_executable, args) => {
      await writeFile(String(args[args.indexOf('-o') + 1]), '%PDF-fake')
      return { ok: true, message: '' }
    },
  }

  it('converts an SVG figure and reports the product path and converter', async () => {
    const { workspaceDir, service } = await harness(STUB_CONVERT)
    const outcome = await service.convertFigure({ projectId: 'p1', relPath: 'figures/plot.svg' })
    expect(outcome).toEqual({ ok: true, value: { relPath: 'figures/plot.pdf', converter: 'rsvg-convert' } })
    expect(await readFile(join(workspaceDir, 'paper', 'figures', 'plot.pdf'), 'utf8')).toBe('%PDF-fake')
  })

  it('reuses a fresh product instead of re-converting', async () => {
    const { workspaceDir, service } = await harness(STUB_CONVERT)
    const product = join(workspaceDir, 'paper', 'figures', 'plot.pdf')
    await writeFile(product, '%PDF-existing')
    // The SVG predates the product by construction here (written in harness
    // setup before this line), so the product counts as fresh.
    const outcome = await service.convertFigure({ projectId: 'p1', relPath: 'figures/plot.svg' })
    expect(outcome).toEqual({ ok: true, value: { relPath: 'figures/plot.pdf', converter: 'cached' } })
    expect(await readFile(product, 'utf8')).toBe('%PDF-existing')
  })

  it('re-converts when the SVG is newer than the product', async () => {
    const { workspaceDir, service } = await harness(STUB_CONVERT)
    const product = join(workspaceDir, 'paper', 'figures', 'plot.pdf')
    await writeFile(product, '%PDF-stale')
    const past = new Date(Date.now() - 60_000)
    await utimes(product, past, past)
    const outcome = await service.convertFigure({ projectId: 'p1', relPath: 'figures/plot.svg' })
    expect(outcome).toEqual({ ok: true, value: { relPath: 'figures/plot.pdf', converter: 'rsvg-convert' } })
    expect(await readFile(product, 'utf8')).toBe('%PDF-fake')
  })

  it('rejects a machine with no converter with guidance naming the probed tools', async () => {
    const { service } = await harness({ probe: () => Promise.resolve(null) })
    const outcome = await service.convertFigure({ projectId: 'p1', relPath: 'figures/plot.svg' })
    if (outcome.ok || outcome.error.code !== 'operation-failed') throw new Error('expected operation-failed')
    expect(outcome.error.message).toContain('No SVG converter found')
    expect(outcome.error.message).toContain('rsvg-convert')
  })

  it('rejects non-SVG paths, traversal, missing figures, and unknown projects', async () => {
    const { service } = await harness(STUB_CONVERT)
    await expect(service.convertFigure({ projectId: 'p1', relPath: 'figures/plot.png' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-path' } })
    await expect(service.convertFigure({ projectId: 'p1', relPath: '../outside.svg' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-path' } })
    await expect(service.convertFigure({ projectId: 'p1', relPath: 'figures/missing.svg' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'figure-not-found' } })
    await expect(service.convertFigure({ projectId: 'missing', relPath: 'figures/plot.svg' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'project-not-found' } })
  })
})
