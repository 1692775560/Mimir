/**
 * Workspace artifact reads and paper-figure discovery for the research
 * workbench: a whitelisted markdown-artifact read (no path segments, so no
 * traversal is expressible) and a one-level image scan of a project's paper
 * directory plus its `figures/` subdirectory. Pure paths in, structured
 * outcomes out — no wire types.
 * @module dsh-mimir/src/artifacts
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { isNotFound } from './paper-source.ts'

/** Markdown artifacts the workbench's overview/experiment views may read. */
export const ARTIFACT_NAMES = [
  'IDEA_REPORT.md',
  'EXPERIMENT_PLAN.md',
  'EXPERIMENT_LOG.md',
  'NARRATIVE_REPORT.md',
] as const

/** One whitelisted artifact name. */
export type ArtifactName = typeof ARTIFACT_NAMES[number]

/** Whether one string names a readable artifact (the whitelist check). */
export function isArtifactName(name: string): name is ArtifactName {
  return (ARTIFACT_NAMES as readonly string[]).includes(name)
}

/** Image extensions the figures view and figure route serve. */
export const FIGURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.pdf'] as const

/** The compile artifact is a PDF but never a figure; the scan skips it. */
const COMPILED_PAPER = 'main.pdf'

/** Whether one file name carries a servable figure extension. */
export function isFigureFile(name: string): boolean {
  if (name === COMPILED_PAPER) return false
  return (FIGURE_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

/** One figure file discovered under a paper directory. */
export interface FigureFile {
  readonly name: string
  /** Path relative to the paper directory (`foo.png` or `figures/bar.svg`). */
  readonly relPath: string
  readonly sizeBytes: number
  readonly mtimeMs: number
}

/**
 * Read one whitelisted markdown artifact from the workspace root.
 * @param workspaceDir - absolute research workspace root.
 * @param name - a member of {@link ARTIFACT_NAMES} (checked by the caller).
 * @returns content and mtime, or undefined when the artifact does not exist.
 */
export async function readWorkspaceArtifact(
  workspaceDir: string,
  name: ArtifactName,
): Promise<{ content: string; mtimeMs: number } | undefined> {
  const path = join(workspaceDir, name)
  try {
    const content = await readFile(path, 'utf8')
    return { content, mtimeMs: (await stat(path)).mtimeMs }
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

/**
 * List the image files of one paper directory: its top level plus the first
 * level of its `figures/` subdirectory, filtered to the servable extensions.
 * A missing `figures/` subdirectory is ordinary (no scan entry); a missing
 * paper directory yields an empty list — the caller decides whether that is
 * `paper-not-found`.
 * @param paperDir - absolute paper directory (already workspace-confined).
 * @returns figure entries, top-level files first, each group name-sorted.
 */
export async function listPaperFigures(paperDir: string): Promise<FigureFile[]> {
  const scan = async (dir: string, relPrefix: string): Promise<FigureFile[]> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }
    const figures: FigureFile[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !isFigureFile(entry.name)) continue
      const stats = await stat(join(dir, entry.name))
      figures.push({
        name: entry.name,
        relPath: relPrefix + entry.name,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
      })
    }
    return figures.sort((left, right) => left.name.localeCompare(right.name))
  }
  return [...await scan(paperDir, ''), ...await scan(join(paperDir, 'figures'), 'figures/')]
}
