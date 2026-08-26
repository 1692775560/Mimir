/**
 * `/research-plan [project id | instructions]`: scaffolds EXPERIMENT_PLAN.md
 * from the recorded idea and hands the model the planning instruction
 * (non-id argument text rides along as plan direction); every planned claim
 * is registered as a pending wiki claim so later experiments have something
 * to support or invalidate.
 * @module dsh-mimir/src/commands/plan
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { EXPERIMENT_PLAN_MD } from '../templates.ts'
import { ensureWorkspace, followupInstruction, resolveProjectArg, writeIfAbsent } from './common.ts'
import type { ResearchCommandDeps } from './common.ts'

const USAGE = 'Usage: /research-plan [project id | instructions]'

/** Build the planning instruction handed to the model. */
function planInstruction(deps: ResearchCommandDeps, projectTitle: string, guidance: string | undefined): string {
  return [
    `You are writing the experiment plan for research project "${projectTitle}".`,
    ...guidance === undefined ? [] : [`The user adds this direction for the plan: ${guidance}`],
    'Do these steps in order:',
    `1. Read ${join(deps.workspaceDir, 'IDEA_REPORT.md')}. If it is still an unfilled skeleton or missing, say so and stop.`,
    `2. Fill every section of the skeleton at ${join(deps.workspaceDir, 'EXPERIMENT_PLAN.md')}. Each experiment must name the claim(s) it supports or invalidates, and success criteria must be decided now, before any experiment runs.`,
    '3. Register every numbered claim from the plan with wiki_note action=add_claim (they start pending).',
    '4. When experiments later run, record each one with wiki_note action=add_experiment and settle it with set_experiment (status + metrics), so the workbench experiment charts stay current; save generated plots with figure_save.',
    '5. Finish with a short summary for the user: the claims and the experiment that tests each one.',
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
    input: { hint: '[project id | instructions]' },
    async handler(invocation): Promise<CommandResult> {
      const { project, guidance } = resolveProjectArg(deps.domain, invocation.rawInput)
      if (project === undefined) {
        return {
          kind: 'error',
          text: `No research project exists yet; run /research-idea first.\n${USAGE}`,
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
      followupInstruction(invocation.agent, planInstruction(deps, project.title, guidance))
      return {
        kind: 'success',
        text: `Planning started for project ${project.id} ("${project.title}"). The plan lands in ${join(deps.workspaceDir, 'EXPERIMENT_PLAN.md')}.`
          + (guidance === undefined ? '' : ` Direction: "${guidance}".`),
      }
    },
  })
}
