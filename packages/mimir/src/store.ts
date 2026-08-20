/**
 * The research-wiki domain declaration: the zod schemas double as the durable
 * boundary validators, and `defineDomain` pins the domain identity. Consumers
 * open the spec through `ctx.storageDomain` (see `./index.ts`).
 * @module dsh-mimir/src/store
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { ClaimRecord, ExperimentRecord, IdeaRecord, PaperRecord, ProjectRecord } from './types.ts'

/** Durable shape of one remembered paper. */
export const paperRecord = z.object({
  arxivId: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  summary: z.string(),
  url: z.string(),
  notes: z.string(),
  addedAt: z.string(),
})

/** Durable shape of one idea, including the never-deleted failed ideas. */
export const ideaRecord = z.object({
  id: z.string(),
  title: z.string(),
  hypothesis: z.string(),
  status: z.enum(['active', 'failed', 'adopted']),
  failureReason: z.string().optional(),
  createdAt: z.string(),
})

/** Durable shape of one tracked claim. */
export const claimRecord = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(['supported', 'invalidated', 'pending']),
  evidence: z.string(),
})

/** Durable shape of one project pipeline record. */
export const projectRecord = z.object({
  id: z.string(),
  title: z.string(),
  stage: z.enum(['idea', 'plan', 'experiment', 'writing', 'done']),
  paperDir: z.string().optional(),
  artifacts: z.array(z.string()),
  reviewRounds: z.number().int().nonnegative(),
  updatedAt: z.string(),
})

/** Durable shape of one experiment run record. */
export const experimentRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  status: z.enum(['running', 'success', 'failed']),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])),
  logPath: z.string().optional(),
  updatedAt: z.string(),
})

/**
 * The research wiki domain spec: five tables, no global singleton. The spec
 * object is the single source of the domain's name, version, and schemas.
 */
export const researchWikiDomainSpec = defineDomain({
  name: 'research_wiki',
  version: 2,
  tables: {
    papers: domainTable<string, PaperRecord>(paperRecord),
    ideas: domainTable<string, IdeaRecord>(ideaRecord),
    claims: domainTable<string, ClaimRecord>(claimRecord),
    projects: domainTable<string, ProjectRecord>(projectRecord),
    experiments: domainTable<string, ExperimentRecord>(experimentRecord),
  },
})

/** Opened research-wiki domain handle, typed by {@link researchWikiDomainSpec}. */
export type ResearchWikiDomain = Domain<typeof researchWikiDomainSpec>
