/**
 * Unit tests for the "score relevance with AI" prompt builder: the prompt
 * names the target project, every paper's id and abstract, and the exact
 * `wiki_note set_paper` call shape the panel's refresh depends on.
 */

import { describe, expect, it } from 'vitest'
import type { PaperRecord } from 'dsh-mimir/types'
import { buildPaperScorePrompt } from '../src/client/paper-score.ts'

const PAPER: PaperRecord = {
  arxivId: '2103.00020v2',
  title: 'EgoSync & Friends',
  authors: ['Doe, Jane'],
  summary: 'A study of egocentric meshes.',
  url: 'https://arxiv.org/abs/2103.00020v2',
  notes: '',
  tags: [],
  projectIds: [],
  addedAt: '2026-08-20T00:00:00.000Z',
}

describe('buildPaperScorePrompt', () => {
  it('names the project, the papers, and the set_paper persistence contract', () => {
    const prompt = buildPaperScorePrompt({
      papers: [PAPER, { ...PAPER, arxivId: '2201.00001', title: 'Second' }],
      projectId: 'p1',
      projectTitle: 'EgoSync: Whole-Body Mesh',
    })
    expect(prompt).toContain('EgoSync: Whole-Body Mesh (id: p1)')
    expect(prompt).toContain('arXiv id: 2103.00020v2')
    expect(prompt).toContain('A study of egocentric meshes.')
    expect(prompt).toContain('arXiv id: 2201.00001')
    expect(prompt).toContain('action=set_paper')
    expect(prompt).toContain('project_id=p1')
    expect(prompt).toContain('relevance_score=<0-10>')
  })
})
