/**
 * Unit tests for the "organize this figure with AI" prompt builder: the prompt
 * names the figure, its siblings, and the exact `figure_organize` call shape
 * the panel's rescan depends on.
 */

import { describe, expect, it } from 'vitest'
import type { FigureEntry } from 'dsh-mimir/types'
import { buildFigureOrganizePrompt } from '../src/client/figure-ai.ts'

const ENTRY: FigureEntry = {
  name: 'screenshot-2026.png',
  relPath: 'figures/screenshot-2026.png',
  sizeBytes: 100,
  mtimeMs: 1,
}

describe('buildFigureOrganizePrompt', () => {
  it('names the file, the project, and the figure_organize call', () => {
    const prompt = buildFigureOrganizePrompt({
      entry: ENTRY,
      siblings: ['png'],
      projectId: 'p1',
      projectTitle: 'EgoSync',
      dir: undefined,
    })
    expect(prompt).toContain('figures/screenshot-2026.png')
    expect(prompt).toContain('EgoSync (id: p1)')
    expect(prompt).toContain('(none)')
    expect(prompt).toContain('project_id=p1')
    expect(prompt).toContain('path=figures/screenshot-2026.png')
    expect(prompt).not.toContain('stay paired')
  })

  it('lists format siblings and asks to keep them paired', () => {
    const prompt = buildFigureOrganizePrompt({
      entry: { ...ENTRY, caption: 'Old caption' },
      siblings: ['pdf', 'png'],
      projectId: 'p1',
      projectTitle: 'EgoSync',
      dir: 'ego-paper',
    })
    expect(prompt).toContain('figures/screenshot-2026.pdf')
    expect(prompt).toContain('stay paired')
    expect(prompt).toContain('Old caption')
    expect(prompt).toContain('paper directory: ego-paper')
  })
})
