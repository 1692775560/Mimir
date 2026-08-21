/** Agent tool for promoting a generated image into a project's paper tree. */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { ResearchWikiDomain } from '../store.ts'
import { isFigureFile } from '../artifacts.ts'
import { resolvePaperDir } from '../paper-source.ts'

interface FigureSaveArgs {
  readonly path: string
  readonly project_id: string
  readonly caption?: string
  readonly experiment_id?: string
}

export function createFigureSaveTool(workspaceDir: string, domain: ResearchWikiDomain): ToolDefinition {
  return defineTool({
    name: 'figure_save',
    description: 'Save a generated image into a Mimir project. Use this immediately after creating a paper-worthy figure. The file is copied to <paperDir>/figures, recorded with its caption and optional experiment link, and returned with a LaTeX includegraphics snippet.',
    parameters: {
      path: { type: 'string', required: true, description: 'Generated image path, absolute or relative to the current process directory.' },
      project_id: { type: 'string', required: true, description: 'Owning Mimir project id.' },
      caption: { type: 'string', description: 'Human-readable figure caption.' },
      experiment_id: { type: 'string', description: 'Optional experiment record id that produced the figure.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    execute: async (raw): Promise<JsonValue> => {
      const args = raw as unknown as FigureSaveArgs
      const project = domain.table('projects').get(args.project_id)
      if (project === undefined) throw new Error(`figure_save: no project with id '${args.project_id}'`)
      if (args.experiment_id !== undefined) {
        const experiment = domain.table('experiments').get(args.experiment_id)
        if (experiment === undefined || experiment.projectId !== args.project_id) {
          throw new Error(`figure_save: experiment '${args.experiment_id}' does not belong to project '${args.project_id}'`)
        }
      }
      const sourcePath = isAbsolute(args.path) ? resolve(args.path) : resolve(process.cwd(), args.path)
      const source = await stat(sourcePath)
      if (!source.isFile() || !isFigureFile(basename(sourcePath))) throw new Error('figure_save: path must name a supported image file')
      const paperDir = resolvePaperDir(workspaceDir, undefined, project.paperDir)
      if (paperDir === undefined) throw new Error('figure_save: project paperDir is invalid')
      const figuresDir = join(paperDir, 'figures')
      await mkdir(figuresDir, { recursive: true })
      const name = basename(sourcePath)
      const relPath = `figures/${name}`
      const destinationPath = join(figuresDir, name)
      if (sourcePath !== destinationPath) await copyFile(sourcePath, destinationPath)
      const id = `${args.project_id}:${relPath}`
      const record = {
        id,
        projectId: args.project_id,
        relPath,
        caption: args.caption?.trim() ?? '',
        sourcePath,
        ...(args.experiment_id === undefined ? {} : { experimentId: args.experiment_id }),
        createdAt: new Date().toISOString(),
      }
      await domain.table('figures').put(id, record)
      const artifactPath = `${project.paperDir ?? 'paper'}/${relPath}`
      await domain.table('projects').update(project.id, current => ({
        ...current,
        artifacts: [...new Set([...current.artifacts, artifactPath])],
        updatedAt: new Date().toISOString(),
      }))
      const label = name.slice(0, -extname(name).length).replace(/[^a-zA-Z0-9:-]+/g, '-')
      return { ok: true, relPath, record: record as unknown as JsonValue, latex: `\\includegraphics[width=0.8\\linewidth]{${relPath}}`, label: `fig:${label}` }
    },
  })
}
