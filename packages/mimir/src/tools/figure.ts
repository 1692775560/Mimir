/**
 * The `figure_save` tool: copy one generated image (a plot, chart, or diagram
 * the agent produced anywhere on disk) into the addressed project's paper
 * `figures/` directory so it shows up in the workbench's figures view, record
 * its metadata (caption, linked experiment, origin path) in the wiki's
 * `figures` table, and register the file in the project's artifact list.
 * Returns the paper-relative path plus a ready-to-paste LaTeX figure block.
 * @module dsh-mimir/src/tools/figure
 */

import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { isFigureFile } from '../artifacts.ts'
import { isNotFound, resolvePaperDir } from '../paper-source.ts'
import type { ResearchWikiDomain } from '../store.ts'

interface FigureSaveArgs {
  readonly project_id?: string
  readonly path?: string
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

/** A filesystem stat that reads as undefined on a missing path only. */
async function statOrUndefined(path: string) {
  return await stat(path).catch((error: unknown) => {
    if (isNotFound(error)) return undefined
    throw error
  })
}

/** The LaTeX figure block the tool returns for immediate insertion. */
function latexBlock(relPath: string, caption: string): { latex: string; label: string } {
  const label = basename(relPath, extname(relPath)).replace(/[^a-zA-Z0-9:-]+/g, '-')
  return {
    latex: `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${relPath}}\n  \\caption{${caption}}\n  \\label{fig:${label}}\n\\end{figure}`,
    label: `fig:${label}`,
  }
}

/**
 * Build the `figure_save` tool over one opened research-wiki domain.
 * @param workspaceDir - The resolved research workspace root.
 * @param domain - The plugin-owned open domain handle.
 * @returns the registry-ready tool definition.
 */
export function createFigureSaveTool(workspaceDir: string, domain: ResearchWikiDomain): ToolDefinition {
  return defineTool({
    name: 'figure_save',
    description: 'Save a figure you generated (plot/chart/diagram image) into a research project\'s paper figures/ directory so it appears in the workbench figures view and can be included in the paper. Use this immediately after creating or discovering a paper-worthy image instead of leaving the file in a scratch path. Returns the paper-relative path and a ready-to-paste LaTeX figure block.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path of the generated image; absolute, or relative to the current process directory or the research workspace.' },
      project_id: { type: 'string', required: true, description: 'Owning wiki project id (see wiki_note action=list, table=projects).' },
      name: { type: 'string', description: 'Destination file name inside figures/ (defaults to the source basename).' },
      caption: { type: 'string', description: 'Caption for the workbench and the returned LaTeX block.' },
      experiment_id: { type: 'string', description: 'Id of the experiment record (of the same project) that produced the figure (optional).' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderOutcome(value as Record<string, JsonValue | undefined>) }],
    },
    execute: async (args: FigureSaveArgs): Promise<JsonValue> => {
      const projectId = requireField(args.project_id, 'project_id')
      const project = domain.table('projects').get(projectId)
      if (project === undefined) throw new Error(`figure_save: no project with id '${projectId}'`)
      if (args.experiment_id !== undefined) {
        const experiment = domain.table('experiments').get(args.experiment_id)
        if (experiment === undefined || experiment.projectId !== projectId) {
          throw new Error(`figure_save: experiment '${args.experiment_id}' does not belong to project '${projectId}'`)
        }
      }
      const paperDir = resolvePaperDir(workspaceDir, undefined, project.paperDir)
      if (paperDir === undefined) {
        throw new Error(`figure_save: project '${projectId}' has an invalid paper directory`)
      }
      const rawPath = requireField(args.path, 'path')
      // Relative paths resolve against the process directory first (where the
      // agent usually just wrote the file), then against the workspace root.
      const source = isAbsolute(rawPath)
        ? rawPath
        : await statOrUndefined(resolve(process.cwd(), rawPath)) !== undefined
          ? resolve(process.cwd(), rawPath)
          : resolve(workspaceDir, rawPath)
      const sourceStats = await statOrUndefined(source)
      if (sourceStats === undefined || !sourceStats.isFile()) {
        throw new Error(`figure_save: source file not found: ${rawPath}`)
      }
      const name = args.name ?? basename(source)
      if (name === '' || name !== basename(name) || !isFigureFile(name)) {
        throw new Error(`figure_save: name must be a plain figure file name (.png/.jpg/.jpeg/.svg/.pdf), got '${name}'`)
      }
      const figuresDir = join(paperDir, 'figures')
      await mkdir(figuresDir, { recursive: true })
      const destination = join(figuresDir, name)
      if (source !== destination) await copyFile(source, destination)
      const relPath = `figures/${name}`
      const id = `${projectId}:${relPath}`
      const existing = domain.table('figures').get(id)
      const caption = args.caption?.trim() ?? existing?.caption ?? ''
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
      // The artifact list is what the overview shows as the project's output.
      const artifactPath = `${project.paperDir ?? 'paper'}/${relPath}`
      await domain.table('projects').update(project.id, current => ({
        ...current,
        artifacts: [...new Set([...current.artifacts, artifactPath])],
        updatedAt: new Date().toISOString(),
      }))
      const { latex, label } = latexBlock(relPath, caption)
      return { ok: true, id, relPath, caption, latex, label } as unknown as JsonValue
    },
  })
}

/** Render one save outcome as model-facing text. */
function renderOutcome(value: Record<string, JsonValue | undefined>): string {
  if (value['ok'] !== true) return JSON.stringify(value)
  return `Figure saved to ${String(value['relPath'])} (workbench figures view updated).\nLaTeX:\n${String(value['latex'])}`
}
