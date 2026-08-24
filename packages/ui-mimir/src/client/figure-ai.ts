/**
 * The "organize this figure with AI" prompt builder: turns one figure card
 * into one self-contained user message for the current session's agent. Pure
 * string assembly — the send itself lives in the plugin apply (sessions
 * binding, same channel as the compile-fix flow), the button in the figures
 * view. The agent inspects the image (or infers from the paper context around
 * its \\includegraphics), then persists a descriptive name and caption through
 * the `figure_organize` tool, so the panel's next listFigures refresh shows
 * them.
 * @module dsh-client-ui-mimir/client/figure-ai
 */

import type { FigureEntry } from 'dsh-mimir/types'

/** Fallback paper directory, mirroring the host's DEFAULT_PAPER_DIR. */
const DEFAULT_PAPER_DIR = 'paper'

/** Everything the prompt needs that the figure entry alone does not carry. */
export interface FigureOrganizeRequest {
  /** The card's primary entry (a PNG/SVG pair shares one stem and caption). */
  readonly entry: FigureEntry
  /** Sibling format extensions of the same stem (e.g. `['png', 'svg']`). */
  readonly siblings: readonly string[]
  /** The owning project, for the tool call. */
  readonly projectId: string
  /** The project's title, for context. */
  readonly projectTitle: string
  /** The project's paper directory relative to the workspace root, when overridden. */
  readonly dir: string | undefined
}

/**
 * Assemble the user message sent to the current session's agent for one
 * "organize with AI" click. English regardless of the UI locale: the reader is
 * the agent, not the user. The message names the file, its current caption,
 * and its format siblings; asks the agent to look at the image (or the paper
 * context referencing it), then calls `figure_organize` — the tool renames the
 * file (rewriting .tex references) and sets the caption, and the panel
 * repaints from the wiki, so the tool call IS the result delivery. Every
 * same-stem sibling is renamed along so the pair stays paired.
 * @param request - the card's entry, its siblings, and the owning project.
 * @returns the prompt text, ready to send verbatim.
 */
export function buildFigureOrganizePrompt(request: FigureOrganizeRequest): string {
  const dir = request.dir ?? DEFAULT_PAPER_DIR
  const stem = request.entry.relPath.replace(/\.[^.]+$/, '')
  const lines: string[] = [
    'Help me organize one figure of my paper: give it a descriptive name and a caption.',
    '',
    `Project: ${request.projectTitle} (id: ${request.projectId})`,
    `Figure: ${request.entry.relPath} (paper directory: ${dir}, relative to the workspace root)`,
    `Current caption: ${request.entry.caption === undefined || request.entry.caption === '' ? '(none)' : request.entry.caption}`,
  ]
  if (request.siblings.length > 1) {
    lines.push(`The same figure also exists as: ${request.siblings.map(ext => `${stem}.${ext}`).join(', ')} — these are format siblings of ONE figure, keep them paired.`)
  }
  lines.push(
    '',
    'Steps:',
    '- Look at the image if your tools can read it; otherwise find its \\includegraphics in the paper\'s .tex files and infer its role from the surrounding text.',
    '- Write a one-sentence caption describing what the figure shows (suitable for the paper).',
    '- If the current file name is opaque (a screenshot name, a timestamp, "image", "untitled"…), propose a short descriptive kebab-case name with the SAME extension; a clear current name stays.',
    `- Persist with the figure_organize tool: project_id=${request.projectId}, path=${request.entry.relPath}, caption=<the sentence>, new_name=<the proposal, omit when unchanged>.`,
  )
  if (request.siblings.length > 1) {
    lines.push(`- Repeat the same rename (same new stem, each sibling's own extension) for every sibling listed above so the formats stay paired.`)
  }
  lines.push('Do not edit the paper source; the figure_organize calls are the whole deliverable.')
  return lines.join('\n')
}
