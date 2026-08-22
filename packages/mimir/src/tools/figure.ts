/**
 * The `figure_save` tool: copy one generated image (a plot, chart, or diagram
 * the agent produced anywhere on disk) into the addressed project's paper
 * `figures/` directory so it shows up in the workbench's figures view, and
 * record its metadata (caption, linked experiment, origin path) in the wiki's
 * `figures` table. Returns the paper-relative path plus a ready-to-paste
 * LaTeX figure block.
 * @module dsh-mimir/src/tools/figure
 */

import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { isFigureFile } from '../artifacts.ts'
import { isNotFound, resolvePaperDir } from '../paper-source.ts'
import type { ResearchWikiDomain } from '../store.ts'

interface FigureSaveArgs {
  readonly project_id?: string
  readonly source_path?: string
  readonly name?: string
  readonly caption?: string
  readonly experiment_id?: string
}

/** Require one non-empty string field. */
function requireField(value: string | undefined, field: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`figure_save requires a non-empty '${field}'`)
  }
  return value
}

/** The LaTeX figure block the tool returns for immediate insertion. */
function latexBlock(relPath: string, caption: string): string {
  const label = basename(relPath).replace(/\.[^.]+$/, '')
  return `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${relPath}}\n  \\caption{${caption}}\n  \\label{fig:${label}}\n\\end{figure}`
}

/**
 * Build the `figure_save` tool over one opened research-wiki domain.
 * @param domain - The plugin-owned open domain handle.
 * @param workspaceDir - The resolved research workspace root.
 * @returns the registry-ready tool definition.
 */
export function createFigureSaveTool(domain: ResearchWikiDomain, workspaceDir: string): ToolDefinition {
  return defineTool({
    name: 'figure_save',
    description: 'Save a figure you generated (plot/chart/diagram image at any readable path) into a research project\'s paper figures/ directory so it appears in the workbench figures view and can be included in the paper. Whenever you produce an image the paper might use, call this instead of leaving the file in a scratch path. Returns the paper-relative path and a ready-to-paste LaTeX figure block.',
    parameters: {
      project_id: { type: 'string', required: true, description: 'Owning wiki project id (see wiki_note action=list, table=projects).' },
      source_path: { type: 'string', required: true, description: 'Path of the generated image; absolute, or relative to the research workspace.' },
      name: { type: 'string', description: 'Destination file name inside figures/ (defaults to the source basename).' },
      caption: { type: 'string', description: 'Caption for the workbench and the returned LaTeX block.' },
      experiment_id: { type: 'string', description: 'Experiment record id the figure belongs to (optional).' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderOutcome(value as Record<string, JsonValue | undefined>) }],
    },
    execute: async (args: FigureSaveArgs): Promise<JsonValue> => {
      const projectId = requireField(args.project_id, 'project_id')
      const project = domain.table('projects').get(projectId)
      if (project === undefined) throw new Error(`figure_save: no project with id '${projectId}'`)
      const paperDir = resolvePaperDir(workspaceDir, undefined, project.paperDir)
      if (paperDir === undefined) {
        throw new Error(`figure_save: project '${projectId}' has an invalid paper directory`)
      }
      const sourcePath = requireField(args.source_path, 'source_path')
      const source = isAbsolute(sourcePath) ? sourcePath : resolve(workspaceDir, sourcePath)
      const stats = await stat(source).catch((error: unknown) => {
        if (isNotFound(error)) return undefined
        throw error
      })
      if (stats === undefined || !stats.isFile()) {
        throw new Error(`figure_save: source file not found: ${sourcePath}`)
      }
      const name = args.name ?? basename(source)
      if (name === '' || name !== basename(name) || !isFigureFile(name)) {
        throw new Error(`figure_save: name must be a plain figure file name (.png/.jpg/.jpeg/.svg/.pdf), got '${name}'`)
      }
      if (args.experiment_id !== undefined && domain.table('experiments').get(args.experiment_id) === undefined) {
        throw new Error(`figure_save: no experiment with id '${args.experiment_id}'`)
      }
      const figuresDir = join(paperDir, 'figures')
      await mkdir(figuresDir, { recursive: true })
      await copyFile(source, join(figuresDir, name))
      const relPath = `figures/${name}`
      const id = `${projectId}:${relPath}`
      const existing = domain.table('figures').get(id)
      const caption = args.caption ?? existing?.caption ?? ''
      const record = {
        id,
        projectId,
        relPath,
        caption,
        ...(args.experiment_id === undefined
          ? (existing?.experimentId === undefined ? {} : { experimentId: existing.experimentId })
          : { experimentId: args.experiment_id }),
        sourcePath: source,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      await domain.table('figures').put(id, record)
      return {
        ok: true,
        id,
        relPath,
        caption,
        latex: latexBlock(relPath, caption),
      } as unknown as JsonValue
    },
  })
}

/** Render one save outcome as model-facing text. */
function renderOutcome(value: Record<string, JsonValue | undefined>): string {
  if (value['ok'] !== true) return JSON.stringify(value)
  return `Figure saved to ${String(value['relPath'])} (workbench figures view updated).\nLaTeX:\n${String(value['latex'])}`
}
