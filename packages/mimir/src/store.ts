/**
 * The research-wiki domain declaration: the zod schemas double as the durable
 * boundary validators, and `defineDomain` pins the domain identity. Consumers
 * open the spec through `ctx.storageDomain` (see `./index.ts`).
 * @module dsh-mimir/src/store
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { ClaimRecord, ExperimentRecord, IdeaRecord, PaperRecord, ProjectRecord, ServerRecord } from './types.ts'

/** Durable shape of one remembered paper. */
export const paperRecord = z.object({
  arxivId: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  summary: z.string(),
  url: z.string(),
  notes: z.string(),
  // Added WITHOUT a version bump: `.default([])` fills both fields when a
  // stored record predates them, so existing v2 JSON stores keep loading.
  tags: z.array(z.string()).default([]),
  projectIds: z.array(z.string()).default([]),
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
  // Added WITHOUT a version bump: `.optional()` leaves the field absent on
  // records that predate it, so existing v2 JSON stores keep loading.
  serverId: z.string().optional(),
  updatedAt: z.string(),
})

/** Durable shape of one remembered compute server. */
export const serverRecord = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  /** SSH login user; an empty string downgrades probes to TCP-only. */
  username: z.string(),
  note: z.string(),
  // Added WITHOUT a version bump: `.default([])` fills the field when a
  // stored record predates it, so existing v2 JSON stores keep loading.
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * The research wiki domain spec: six tables, no global singleton. The spec
 * object is the single source of the domain's name, version, and schemas.
 * The `servers` table was added WITHOUT a version bump: the domain loader
 * fills a table missing from a stored snapshot with an empty map, so
 * existing v2 JSON stores open with `servers` empty, while a bump would make
 * the storage-json backend reject every existing file (`version-mismatch`)
 * with no migration path.
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
    servers: domainTable<string, ServerRecord>(serverRecord),
  },
})

/** Opened research-wiki domain handle, typed by {@link researchWikiDomainSpec}. */
export type ResearchWikiDomain = Domain<typeof researchWikiDomainSpec>
