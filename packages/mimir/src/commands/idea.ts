/**
 * `/research-idea <direction>`: scaffolds the workspace, registers a new
 * project, and hands the model a structured literature-survey instruction.
 * The wiki's failed ideas are checked by the model before it proposes work —
 * that memory is the suite's anti-repetition mechanism.
 * @module dsh-mimir/src/commands/idea
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { IDEA_REPORT_MD } from '../templates.ts'
import { createProject, ensureWorkspace, followupInstruction, writeIfAbsent } from './common.ts'
import type { ResearchCommandDeps } from './common.ts'

const USAGE = 'Usage: /research-idea <research direction>'

/** Build the ideation instruction handed to the model. */
function ideaInstruction(deps: ResearchCommandDeps, direction: string): string {
  return [
    `You are starting a research ideation task. Direction: ${direction}`,
    `Workspace root: ${deps.workspaceDir} — all artifacts live under it.`,
    'Do these steps in order:',
    "1. Check the wiki's idea memory first: wiki_note with action=list, table=ideas. If a FAILED idea already covers this direction, do not resurrect it unchanged; state the overlap in your report and pivot to what is actually new.",
    '2. Survey the literature with arxiv_search using 2-4 focused queries. Record every paper that matters with wiki_note action=add_paper.',
    `3. Write the idea report to ${join(deps.workspaceDir, 'IDEA_REPORT.md')}, filling every section of the skeleton already written there. Ground Related Work in the recorded papers (cite arXiv ids) and fill "Failed Ideas Considered" from step 1.`,
    '4. Record the idea with wiki_note action=add_idea (it starts active).',
    '5. Finish with a short summary for the user: the hypothesis, the closest prior work, and why this is not a repeat of a failed idea.',
  ].join('\n')
}

/**
 * Register the `/research-idea` command.
 * @param ctx - Plugin context carrying the commands registry.
 * @param deps - Shared command dependencies.
 */
export function registerIdeaCommand(ctx: Context, deps: ResearchCommandDeps): void {
  ctx.commands.register({
    name: 'research-idea',
    description: 'start a literature-grounded research ideation pass over one direction',
    input: { hint: '<research direction>' },
    async handler(invocation): Promise<CommandResult> {
      const direction = invocation.rawInput.trim()
      if (direction.length === 0) return { kind: 'error', text: `A research direction is required.\n${USAGE}` }
      await ensureWorkspace(deps)
      await writeIfAbsent(join(deps.workspaceDir, 'IDEA_REPORT.md'), IDEA_REPORT_MD)
      const project = await createProject(deps.domain, direction, ['IDEA_REPORT.md'])
      followupInstruction(invocation.agent, ideaInstruction(deps, direction))
      return {
        kind: 'success',
        text: `Research ideation started for "${direction}" (project ${project.id}). The agent is surveying the literature now; its report lands in ${join(deps.workspaceDir, 'IDEA_REPORT.md')}.`,
      }
    },
  })
}
