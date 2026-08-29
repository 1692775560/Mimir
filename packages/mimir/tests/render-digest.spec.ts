/**
 * Proof for the MMS renderer (S8d): the assembled report model laid out as
 * the Mimir Markdown Subset. The rendered string is the export path (wiki /
 * Obsidian / GitHub), so these tests check the structure, the locale switch,
 * the project-only furniture, and the security rule that MMS never emits
 * inline style, <script>, or <iframe>.
 * @module dsh-mimir/tests/render-digest
 */

import { describe, expect, it } from 'vitest'
import { renderDigest } from '../src/render-digest.ts'
import type { CbeDigestReport, CbeDigestTier } from '../src/report-tier.ts'

const AT = '2026-06-15T00:00:00.000Z'

function report(over: Partial<CbeDigestReport> = {}): CbeDigestReport {
  return {
    tier: 'weekly',
    asOf: AT,
    window: { since: '2026-06-08T00:00:00.000Z', until: '2026-06-15T00:00:00.000Z' },
    retrieval: {
      source: 'events 表', since: '2026-06-08T00:00:00.000Z', until: '2026-06-15T00:00:00.000Z',
      eventsHit: 5, eventsTotal: 10, derivationVersion: 3, silences: Object.freeze([]),
    },
    overview: Object.freeze([
      { key: 'events', label: { zh: '窗口事件', en: 'events' }, value: '5' },
    ]),
    perspectives: Object.freeze([
      {
        perspective: 'mainline',
        label: { zh: '主线推进', en: 'Mainline progress' },
        capsules: Object.freeze([
          {
            id: 'mainline:L1', perspective: 'mainline', at: AT, labelRef: 'L1',
            evidence: Object.freeze([]), theme: null, metric: 0.3, kind: 'open',
          },
        ]),
      },
    ]),
    eurekaTable: Object.freeze([]),
    mermaid: null,
    ...over,
  }
}

describe('renderDigest (MMS)', () => {
  it('renders the zh weekly title and the retrieval declaration banner', () => {
    const md = renderDigest(report(), 'zh')
    expect(md).toContain('# 周报')
    expect(md).toContain('检索声明')
    expect(md).toContain('命中 5 / 10')
    expect(md).toContain('本报告为描述，不含建议。')
  })

  it('renders the overview stats as a portable key/value table', () => {
    const md = renderDigest(report(), 'zh')
    expect(md).toContain('| 指标 | 值 |')
    expect(md).toContain('| 窗口事件 | 5 |')
  })

  it('wraps each perspective in a foldable <details> block', () => {
    const md = renderDigest(report(), 'zh')
    expect(md).toContain('<details open><summary>主线推进')
  })

  it('emits the eureka table + mermaid only at the project tier', () => {
    const weekly = renderDigest(report({ tier: 'weekly' }), 'zh')
    expect(weekly).not.toContain('```mermaid')

    const project = renderDigest(report({
      tier: 'project',
      eurekaTable: Object.freeze([
        {
          index: 1, at: AT, title: '里程碑', leadEntropyRate: 2.1, controlEntropyRate: 1.0,
          leadMeanSurprisal: 2.5, controlMeanSurprisal: 1.2,
        },
      ]),
      mermaid: 'gitGraph\n  commit id: "root"',
    }), 'zh')
    expect(project).toContain('```mermaid')
    expect(project).toContain('gitGraph')
    expect(project).toContain('Eureka 里程碑')
    expect(project).toContain('| 1 |')
  })

  it('ends with the researcher’s own-words task slot', () => {
    const md = renderDigest(report(), 'zh')
    expect(md).toContain('我自己的话')
    expect(md).toContain('- [ ]')
  })

  it('keeps MMS free of inline style, script, and iframe', () => {
    const md = renderDigest(report({
      tier: 'project',
      eurekaTable: Object.freeze([
        {
          index: 1, at: AT, title: 'x', leadEntropyRate: null, controlEntropyRate: null,
          leadMeanSurprisal: null, controlMeanSurprisal: null,
        },
      ]),
      mermaid: 'gitGraph\n  commit id: "root"',
    }), 'zh')
    expect(md).not.toContain('style=')
    expect(md).not.toContain('<script')
    expect(md).not.toContain('<iframe')
  })

  it('renders the english project summary and retrieval banner', () => {
    const md = renderDigest(report({ tier: 'project', eurekaTable: Object.freeze([]), mermaid: 'gitGraph' }), 'en')
    expect(md).toContain('# Project summary')
    expect(md).toContain('Retrieval')
    expect(md).toContain('This report describes; it offers no advice.')
  })
})
