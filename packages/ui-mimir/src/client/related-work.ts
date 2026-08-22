/**
 * The "draft related work" prompt builder: turns the filtered literature
 * selection into one self-contained user message for the current session's
 * agent. Pure string assembly — the send itself lives in the plugin apply
 * (sessions binding, same channel as the compile-fix flow), the button in the
 * papers view. The prompt names every paper with its citation key (the same
 * key the bibliography append writes), so the agent can \cite without
 * guessing, and asks for the LaTeX section plus a latex_compile verify loop.
 * @module dsh-client-ui-mimir/client/related-work
 */

import type { PaperRecord } from 'dsh-mimir/types'

/** Fallback paper directory, mirroring the host's DEFAULT_PAPER_DIR. */
const DEFAULT_PAPER_DIR = 'paper'

/** Everything the prompt needs that the paper records alone do not carry. */
export interface RelatedWorkRequest {
  /** The papers the draft must cover (the view's current filtered selection). */
  readonly papers: readonly PaperRecord[]
  /** The target project's title, for the prompt's context line. */
  readonly projectTitle: string
  /** The project's paper directory relative to the workspace root, when overridden. */
  readonly dir: string | undefined
}

/**
 * BibTeX-legal citation key of one arXiv id: dots and `v` separators out.
 * Mirrors the host's `bibKeyOf` so the prompt names the exact key the
 * bibliography append would write.
 * @param arxivId - the bare arXiv id (version suffix allowed).
 * @returns the citation key.
 */
export function citationKeyOf(arxivId: string): string {
  return arxivId.replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Assemble the user message sent to the current session's agent for one
 * "draft related work" click. English regardless of the UI locale: the reader
 * is the agent, not the user. The message lists every selected paper with its
 * citation key, title, authors, abstract, and working notes (notes only when
 * present), then asks for a themed `\section{Related Work}` inserted into the
 * paper, `\cite` coverage of exactly the listed keys, missing bib entries
 * backfilled, and a `latex_compile` verify loop.
 * @param request - the selected papers, the project title, and the paper directory.
 * @returns the prompt text, ready to send verbatim.
 */
export function buildRelatedWorkPrompt(request: RelatedWorkRequest): string {
  const dir = request.dir ?? DEFAULT_PAPER_DIR
  const lines: string[] = [
    'Draft the "Related Work" section of the paper below, then insert it into the paper.',
    '',
    `Project: ${request.projectTitle}`,
    `Paper directory: ${dir} (relative to the workspace root)`,
    '',
    `Source material — ${request.papers.length} paper(s) from the research library, each with its citation key, title, authors, abstract, and working notes:`,
  ]
  request.papers.forEach((paper, index) => {
    lines.push(
      '',
      `[${index + 1}] citation key: ${citationKeyOf(paper.arxivId)}`,
      `    Title: ${paper.title}`,
      `    Authors: ${paper.authors.join(', ')}`,
      `    Abstract: ${paper.summary}`,
    )
    if (paper.notes.trim() !== '') lines.push(`    Notes: ${paper.notes}`)
    lines.push(`    URL: ${paper.url === '' ? `https://arxiv.org/abs/${paper.arxivId}` : paper.url}`)
  })
  lines.push(
    '',
    'Requirements:',
    '- Write the section in LaTeX as \\section{Related Work}: group the papers into coherent themes and compare them; do not write one disconnected paragraph per paper.',
    '- Cite every listed paper at least once with \\cite{<citation key>}; never invent keys that are not listed above.',
    '- Read the paper directory\'s main .tex first, insert the section where it fits the document\'s structure (typically after the introduction), and keep the surrounding content untouched.',
    `- Make sure every cited key exists in the paper directory's references.bib; add a @misc entry (title, author, eprint, archivePrefix = arXiv, url) for any key that is missing.`,
    `- Re-run the latex_compile tool with project_dir "${dir}" and keep fixing until it reports success.`,
  )
  return lines.join('\n')
}
