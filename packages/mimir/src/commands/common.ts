/**
 * Shared command helpers: workspace scaffolding, project resolution, and the
 * follow-up channel every `/research-*` command uses to hand work to the
 * model.
 * @module dsh-mimir/src/commands/common
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ResearchWikiDomain } from '../store.ts'
import type { LatexToolOptions } from '../tools/latex.ts'
import type { ReviewerOptions } from '../reviewer.ts'
import type { ProjectRecord } from '../types.ts'

/** Everything a research command needs from the plugin's apply scope. */
export interface ResearchCommandDeps {
  /** Absolute research workspace root. */
  readonly workspaceDir: string
  /** Open research-wiki domain handle. */
  readonly domain: ResearchWikiDomain
  /** Resolved reviewer deployment knobs. */
  readonly reviewer: ReviewerOptions
  /** Resolved LaTeX deployment knobs. */
  readonly latex: LatexToolOptions
}

/**
 * Create the workspace directory when absent.
 * @param deps - Command dependencies.
 * @returns resolution after the directory exists.
 */
export async function ensureWorkspace(deps: ResearchCommandDeps): Promise<void> {
  await mkdir(deps.workspaceDir, { recursive: true })
}

/**
 * Write a scaffold file without overwriting existing work.
 * @param path - Absolute target path.
 * @param content - Template content for a fresh file.
 * @returns whether the file was newly written.
 */
export async function writeIfAbsent(path: string, content: string): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: 'wx' })
    return true
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EEXIST') return false
    throw error
  }
}

/**
 * Resolve the project one command targets: an explicit id, or the most
 * recently updated project when omitted.
 * @param domain - Open research-wiki domain.
 * @param id - Explicit project id, or undefined for the latest project.
 * @returns the project record, or undefined when none matches.
 */
export function resolveProject(domain: ResearchWikiDomain, id: string | undefined): ProjectRecord | undefined {
  if (id !== undefined) return domain.table('projects').get(id)
  let latest: ProjectRecord | undefined
  for (const [, record] of domain.table('projects').entries()) {
    if (latest === undefined || record.updatedAt > latest.updatedAt) latest = record
  }
  return latest
}

/**
 * Create and register a new project at the `idea` stage.
 * @param domain - Open research-wiki domain.
 * @param title - Human direction/title for the project.
 * @param artifacts - Initial artifact paths relative to the workspace root.
 * @returns the stored project record.
 */
export async function createProject(domain: ResearchWikiDomain, title: string, artifacts: string[]): Promise<ProjectRecord> {
  const record: ProjectRecord = {
    id: randomUUID(),
    title,
    stage: 'idea',
    artifacts,
    reviewRounds: 0,
    updatedAt: new Date().toISOString(),
  }
  await domain.table('projects').put(record.id, record)
  return record
}

/**
 * Hand the model a structured work instruction as a user-source follow-up.
 * @param agent - The command's agent.
 * @param text - Complete instruction text.
 */
export function followupInstruction(agent: Agent, text: string): void {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
}
