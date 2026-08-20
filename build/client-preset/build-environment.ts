/**
 * Vendored from deepseek-harness scripts/client-build-environment.ts (only the
 * bundler-define helper the client preset needs).
 */

/** Prefix reserved for build-time values that may be embedded in browser artifacts. */
const CLIENT_BUILD_ENV_PREFIX = 'DSH_CLIENT_'

/** Defined `DSH_CLIENT_*` values of one environment, in deterministic key order. */
function clientBuildEnvironment(environment: NodeJS.ProcessEnv): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(environment)
    .filter(([name, value]) => name.startsWith(CLIENT_BUILD_ENV_PREFIX) && value !== undefined)
    .sort(([left, right]) => left.localeCompare(right))) as Record<string, string>
}

/**
 * Create bundler substitutions for public client build environment variables.
 * The empty `process.env` fallback makes an unset static property read
 * evaluate to `undefined` without providing a browser `process` global.
 * @param environment - environment inherited by the build process.
 * @returns deterministic tsdown `define` expressions.
 */
export function clientBuildEnvironmentDefines(
  environment: NodeJS.ProcessEnv,
): Record<string, string> {
  const defines: Record<string, string> = { 'process.env': '{}' }
  for (const [name, value] of Object.entries(clientBuildEnvironment(environment))) {
    defines[`process.env.${name}`] = JSON.stringify(value)
  }
  return defines
}
