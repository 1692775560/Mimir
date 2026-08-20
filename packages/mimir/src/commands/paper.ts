/**
 * `/paper-write [projectId]` and `/paper-compile [dir]`: scaffold the paper
 * skeleton into `<workspace>/paper/`, hand the drafting instruction to the
 * model, and expose a direct compile-report command over the same engine the
 * `latex_compile` tool uses.
 * @module dsh-mimir/src/commands/paper
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { compileLatex, renderLatexResult } from '../tools/latex.ts'
import { PAPER_MAIN_TEX, PAPER_REFERENCES_BIB } from '../templates.ts'
import { ensureWorkspace, followupInstruction, resolveProject, writeIfAbsent } from './common.ts'
import type { ResearchCommandDeps } from './common.ts'

const WRITE_USAGE = 'Usage: /paper-write [project id]'

/** Build the drafting instruction handed to the model. */
function writeInstruction(deps: ResearchCommandDeps, paperDir: string, projectTitle: string): string {
  return [
    `You are drafting the paper for research project "${projectTitle}".`,
    `1. Read ${join(deps.workspaceDir, 'IDEA_REPORT.md')} and ${join(deps.workspaceDir, 'EXPERIMENT_PLAN.md')}, and list the wiki's claims (wiki_note action=list, table=claims) and papers (table=papers).`,
    `2. Fill ${join(paperDir, 'main.tex')}: replace every <placeholder> with real content grounded in those sources. Keep the article-class skeleton; do not introduce packages beyond what it already loads.`,
    `3. Put real references into ${join(paperDir, 'references.bib')} from the wiki's papers, and cite them from the text.`,
    `4. Run latex_compile with project_dir=${paperDir} and fix every error it reports until success is true. Fix undefined-citation warnings too; other warnings may be reported to the user instead.`,
    '5. Finish with a short summary: title, section list, and compile status.',
  ].join('\n')
}

/**
 * Register the `/paper-write` and `/paper-compile` commands.
 * @param ctx - Plugin context carrying the commands registry.
 * @param deps - Shared command dependencies.
 */
export function registerPaperCommands(ctx: Context, deps: ResearchCommandDeps): void {
  ctx.commands.register({
    name: 'paper-write',
    description: 'scaffold and draft the LaTeX paper for a research project, compiling until clean',
    input: { hint: '[project id]' },
    async handler(invocation): Promise<CommandResult> {
      const id = invocation.rawInput.trim()
      const project = resolveProject(deps.domain, id.length === 0 ? undefined : id)
      if (project === undefined) {
        return {
          kind: 'error',
          text: id.length === 0
            ? `No research project exists yet; run /research-idea first.\n${WRITE_USAGE}`
            : `No research project with id '${id}'.\n${WRITE_USAGE}`,
        }
      }
      await ensureWorkspace(deps)
      const paperDir = join(deps.workspaceDir, 'paper')
      await mkdir(paperDir, { recursive: true })
      await writeIfAbsent(join(paperDir, 'main.tex'), PAPER_MAIN_TEX)
      await writeIfAbsent(join(paperDir, 'references.bib'), PAPER_REFERENCES_BIB)
      await deps.domain.table('projects').update(project.id, current => ({
        ...current,
        stage: 'writing' as const,
        artifacts: [...new Set([...current.artifacts, 'paper/main.tex', 'paper/references.bib'])],
        updatedAt: new Date().toISOString(),
      }))
      followupInstruction(invocation.agent, writeInstruction(deps, paperDir, project.title))
      return {
        kind: 'success',
        text: `Paper drafting started for project ${project.id}. The skeleton lives in ${paperDir}; the agent will compile and fix it until clean.`,
      }
    },
  })

  ctx.commands.register({
    name: 'paper-compile',
    description: 'compile the paper once and report parsed errors and warnings',
    input: { hint: '[project dir]' },
    async handler(invocation): Promise<CommandResult> {
      const input = invocation.rawInput.trim()
      const projectDir = input.length === 0 ? join(deps.workspaceDir, 'paper') : input
      const result = await compileLatex(projectDir, deps.latex, invocation.signal)
      return { kind: result.success ? 'success' : 'error', text: renderLatexResult(result) }
    },
  })
}
