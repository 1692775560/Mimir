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

/** One command argument resolved into its target project plus leftover text. */
export interface ProjectArgResolution {
  /** The targeted project, or undefined when no project exists at all. */
  readonly project: ProjectRecord | undefined
  /** Free-form text that was not an existing project id; guidance for the model instruction. */
  readonly guidance: string | undefined
}

/**
 * Resolve a command's raw argument tolerantly: text exactly naming an
 * existing project id selects that project; anything else (a natural-language
 * request, a typo) targets the most recently updated project and rides along
 * as guidance instead of failing the command outright.
 * @param domain - Open research-wiki domain.
 * @param raw - The invocation's raw input.
 * @returns the target project and any non-id guidance text.
 */
export function resolveProjectArg(domain: ResearchWikiDomain, raw: string): ProjectArgResolution {
  const input = raw.trim()
  if (input.length > 0) {
    const exact = domain.table('projects').get(input)
    if (exact !== undefined) return { project: exact, guidance: undefined }
  }
  return {
    project: resolveProject(domain, undefined),
    guidance: input.length > 0 ? input : undefined,
  }
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
