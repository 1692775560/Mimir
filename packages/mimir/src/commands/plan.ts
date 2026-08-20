/**
 * `/research-plan [projectId]`: scaffolds EXPERIMENT_PLAN.md from the recorded
 * idea and hands the model the planning instruction; every planned claim is
 * registered as a pending wiki claim so later experiments have something to
 * support or invalidate.
 * @module dsh-mimir/src/commands/plan
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { EXPERIMENT_PLAN_MD } from '../templates.ts'
import { ensureWorkspace, followupInstruction, resolveProject, writeIfAbsent } from './common.ts'
import type { ResearchCommandDeps } from './common.ts'

const USAGE = 'Usage: /research-plan [project id]'

/** Build the planning instruction handed to the model. */
function planInstruction(deps: ResearchCommandDeps, projectTitle: string): string {
  return [
    `You are writing the experiment plan for research project "${projectTitle}".`,
    'Do these steps in order:',
    `1. Read ${join(deps.workspaceDir, 'IDEA_REPORT.md')}. If it is still an unfilled skeleton or missing, say so and stop.`,
    `2. Fill every section of the skeleton at ${join(deps.workspaceDir, 'EXPERIMENT_PLAN.md')}. Each experiment must name the claim(s) it supports or invalidates, and success criteria must be decided now, before any experiment runs.`,
    '3. Register every numbered claim from the plan with wiki_note action=add_claim (they start pending).',
    '4. Finish with a short summary for the user: the claims and the experiment that tests each one.',
  ].join('\n')
}

/**
 * Register the `/research-plan` command.
 * @param ctx - Plugin context carrying the commands registry.
 * @param deps - Shared command dependencies.
 */
export function registerPlanCommand(ctx: Context, deps: ResearchCommandDeps): void {
  ctx.commands.register({
    name: 'research-plan',
    description: 'turn the current idea report into an experiment plan with registered claims',
    input: { hint: '[project id]' },
    async handler(invocation): Promise<CommandResult> {
      const id = invocation.rawInput.trim()
      const project = resolveProject(deps.domain, id.length === 0 ? undefined : id)
      if (project === undefined) {
        return {
          kind: 'error',
          text: id.length === 0
            ? `No research project exists yet; run /research-idea first.\n${USAGE}`
            : `No research project with id '${id}'.\n${USAGE}`,
        }
      }
      await ensureWorkspace(deps)
      await writeIfAbsent(join(deps.workspaceDir, 'EXPERIMENT_PLAN.md'), EXPERIMENT_PLAN_MD)
      await deps.domain.table('projects').update(project.id, current => ({
        ...current,
        stage: 'plan' as const,
        artifacts: current.artifacts.includes('EXPERIMENT_PLAN.md')
          ? current.artifacts
          : [...current.artifacts, 'EXPERIMENT_PLAN.md'],
        updatedAt: new Date().toISOString(),
      }))
      followupInstruction(invocation.agent, planInstruction(deps, project.title))
      return {
        kind: 'success',
        text: `Planning started for project ${project.id} ("${project.title}"). The plan lands in ${join(deps.workspaceDir, 'EXPERIMENT_PLAN.md')}.`,
      }
    },
  })
}
