/**
 * The "score relevance with AI" prompt builder: turns the literature selection
 * plus the selected project into one self-contained user message for the
 * current session's agent. Pure string assembly — the send itself lives in the
 * plugin apply (sessions binding, same channel as the related-work flow), the
 * buttons in the papers view. The agent judges each paper against the project
 * direction and persists every verdict through the `wiki_note` tool's
 * `set_paper` action, so the panel's next listPapers refresh shows the scores.
 * @module dsh-client-ui-mimir/client/paper-score
 */

import type { PaperRecord } from 'dsh-mimir/types'

/** Everything the prompt needs that the paper records alone do not carry. */
export interface PaperScoreRequest {
  /** The papers to score (one card's button passes a singleton). */
  readonly papers: readonly PaperRecord[]
  /** The project the relevance is judged against. */
  readonly projectId: string
  /** The project's title, quoted as the direction's headline. */
  readonly projectTitle: string
}

/**
 * Assemble the user message sent to the current session's agent for one
 * "score relevance" click. English regardless of the UI locale: the reader is
 * the agent, not the user. The message quotes the project direction (title
 * plus the workspace's idea/narrative artifacts when present), lists every
 * paper with its id, title, and abstract, and asks for a 0–10 score plus a
 * one-paragraph reason per paper, persisted through
 * `wiki_note action=set_paper` — the panel repaints from the wiki, so the
 * tool call IS the result delivery.
 * @param request - the papers to score and the project to score against.
 * @returns the prompt text, ready to send verbatim.
 */
export function buildPaperScorePrompt(request: PaperScoreRequest): string {
  const lines: string[] = [
    'Score how relevant each paper below is to my research project, then record every verdict in the research wiki.',
    '',
    `Project: ${request.projectTitle} (id: ${request.projectId})`,
    'The workspace may contain IDEA_REPORT.md / NARRATIVE_REPORT.md describing the project direction; read them first when they exist.',
    '',
    `Papers to score (${request.papers.length}):`,
  ]
  request.papers.forEach((paper, index) => {
    lines.push(
      '',
      `[${index + 1}] arXiv id: ${paper.arxivId}`,
      `    Title: ${paper.title}`,
      `    Abstract: ${paper.summary}`,
    )
  })
  lines.push(
    '',
    'For EACH paper, in order:',
    '- Judge relevance to the project direction on a 0-10 scale (0 = unrelated, 10 = central to the project).',
    '- Write a one-paragraph reason: what the paper contributes and why it matters (or not) for THIS project.',
    `- Persist the verdict with the wiki_note tool: action=set_paper, arxiv_id=<the paper's id>, project_id=${request.projectId}, relevance_score=<0-10>, relevance_reason=<the paragraph>.`,
    'Do not edit any files; the wiki_note calls are the whole deliverable.',
  )
  return lines.join('\n')
}
