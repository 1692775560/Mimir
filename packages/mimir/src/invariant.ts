/**
 * Package-owned invariant companion for `dsh-mimir`.
 * @module dsh-mimir/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-mimir'

/** Cordis companion plugin name. */
export const name = 'mimir-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the wiki's record shapes are validated by the storage-domain
 * zod schemas at the durable boundary, the reviewer loop's verdict shape is validated
 * against the subagent output schema per round, and command/tool behavior is covered
 * by package tests; the package owns no additional cross-event relationship.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
