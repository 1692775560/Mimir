/**
 * Package-owned invariant companion for `dsh-client-ui-mimir`.
 * @module dsh-client-ui-mimir/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-client-ui-mimir'

/** Cordis companion plugin name. */
export const name = 'client-ui-mimir-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin owns two slot registrations sharing one
 * store handle plus one panel controller, all released by the same effect
 * disposers. The registration disposers withdraw both entries and the
 * controller is dropped with the owning fiber, so no second authority exists
 * to check at runtime.
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
