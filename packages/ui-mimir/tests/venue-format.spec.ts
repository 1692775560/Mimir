/**
 * Unit tests for the venue-format handoff prompt: the assembled text must
 * point the agent at the brief, forbid content changes, and end with a
 * compile step. Pure functions, no host.
 */

import { describe, expect, it } from 'vitest'
import { buildVenueFormatPrompt } from '../src/client/venue-format.ts'

const REQUEST = {
  projectTitle: 'DAMP Quantization',
  venueName: 'CVPR (IEEE/CVF)',
  paperDir: 'damp-paper',
} as const

describe('buildVenueFormatPrompt', () => {
  it('points the agent at the brief inside the paper directory', () => {
    const prompt = buildVenueFormatPrompt(REQUEST)
    expect(prompt).toContain('damp-paper/template/TEMPLATE.md')
    expect(prompt).toContain('damp-paper/main.tex')
  })

  it('names the project and the venue', () => {
    const prompt = buildVenueFormatPrompt(REQUEST)
    expect(prompt).toContain('"DAMP Quantization"')
    expect(prompt).toContain('"CVPR (IEEE/CVF)"')
  })

  it('forbids scientific-content changes and requires a compile', () => {
    const prompt = buildVenueFormatPrompt(REQUEST)
    expect(prompt).toContain('Do NOT change the scientific content')
    expect(prompt).toContain('latex_compile')
  })
})
