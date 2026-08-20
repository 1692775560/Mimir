/**
 * File-level operations for the shared paper's `main.tex`: a read snapshot
 * carrying the mtime the content was read from, and an optimistic-concurrency
 * replace. The save runs the mtime check and the atomic commit inside the
 * cross-process writer lock (`withFileLock`), so an agent writing through the
 * file tools and a human saving from the panel can never interleave a
 * check-then-write. Pure path in, structured outcome out — no wire types.
 * @module dsh-mimir/src/paper-source
 */

import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'

/** Paper directory used when neither the request nor the project names one. */
export const DEFAULT_PAPER_DIR = 'paper'

/**
 * Resolve the paper directory for one call: an explicit request directory
 * wins over the project record's `paperDir`, which wins over the default.
 * The chosen candidate must be a relative path that stays inside the
 * workspace — an absolute path or a `..` escape resolves to undefined, which
 * callers report as `invalid-dir` rather than falling back silently.
 * @param workspaceDir - absolute research workspace root.
 * @param requestDir - directory the caller explicitly asked for, if any.
 * @param projectPaperDir - the project record's `paperDir`, if any.
 * @returns the absolute paper directory, or undefined for a violating path.
 */
export function resolvePaperDir(
  workspaceDir: string,
  requestDir?: string,
  projectPaperDir?: string,
): string | undefined {
  const candidate = requestDir ?? projectPaperDir ?? DEFAULT_PAPER_DIR
  if (candidate.trim().length === 0 || isAbsolute(candidate)) return undefined
  const root = resolve(workspaceDir)
  const resolved = resolve(root, candidate)
  return resolved === root || resolved.startsWith(root + sep) ? resolved : undefined
}

/** Content of `main.tex` plus the mtime it was read from. */
export interface PaperSourceSnapshot {
  readonly content: string
  readonly mtimeMs: number
}

/** Structured outcome of one optimistic-concurrency save. */
export type SavePaperOutcome =
  | { readonly kind: 'saved'; readonly mtimeMs: number }
  | { readonly kind: 'missing' }
  | { readonly kind: 'conflict'; readonly currentMtimeMs: number }

/** Whether one fs failure names a missing entry (as opposed to a real I/O error). */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === 'ENOENT'
}

/** stat one path, mapping absence to undefined. */
async function statOrUndefined(path: string): Promise<{ mtimeMs: number; mode: number } | undefined> {
  try {
    const stats = await stat(path)
    return { mtimeMs: stats.mtimeMs, mode: stats.mode }
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

/**
 * Read `main.tex` with the mtime its content belongs to.
 * @param texPath - absolute path of the paper's `main.tex`.
 * @returns the snapshot, or undefined when the paper has not been scaffolded.
 */
export async function readPaperSource(texPath: string): Promise<PaperSourceSnapshot | undefined> {
  try {
    const content = await readFile(texPath, 'utf8')
    const stats = await stat(texPath)
    return { content, mtimeMs: stats.mtimeMs }
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

/**
 * Replace `main.tex` only when its current mtime still equals the mtime the
 * caller's draft is based on. A mismatch means another writer (the agent's
 * file tools, a `/paper-*` command) landed a change the caller never saw; the
 * draft is preserved client-side and the conflict is reported instead of
 * overwriting. The commit preserves the file's existing permission bits.
 * @param texPath - absolute path of the paper's `main.tex`.
 * @param content - complete next file content.
 * @param baseMtimeMs - mtime the draft was last read from or saved as.
 * @returns `saved` with the committed mtime, `missing` when the file is gone,
 * or `conflict` with the mtime that displaced the caller's base.
 */
export async function savePaperSourceFile(
  texPath: string,
  content: string,
  baseMtimeMs: number,
): Promise<SavePaperOutcome> {
  // The writer lock requires the parent directory to exist; a missing file
  // must report `missing`, not a lock-setup failure.
  if (await statOrUndefined(texPath) === undefined) return { kind: 'missing' }
  return await withFileLock(texPath, async (): Promise<SavePaperOutcome> => {
    const current = await statOrUndefined(texPath)
    if (current === undefined) return { kind: 'missing' }
    if (current.mtimeMs !== baseMtimeMs) {
      return { kind: 'conflict', currentMtimeMs: current.mtimeMs }
    }
    await writeFileAtomic(texPath, content, { mode: current.mode & 0o777 })
    const committed = await statOrUndefined(texPath)
    // A lock-free third party deleting the file between the rename and this
    // stat is an I/O race the wire union cannot name; fail loud instead of
    // reporting the stale base mtime as the commit's.
    if (committed === undefined) {
      throw new Error(`research: '${texPath}' disappeared during an atomic save`)
    }
    return { kind: 'saved', mtimeMs: committed.mtimeMs }
  })
}
