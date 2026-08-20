/**
 * Vendored from deepseek-harness packages/client/modules/src/client/manifest.ts
 * (only the helper the bundle preset needs).
 */

/**
 * Validate an optional string-array field read from a `dsh.client` declaration.
 * @param subject - diagnostic prefix naming the package.
 * @param field - field name as it appears in the diagnostic.
 * @param value - the raw field value.
 * @returns the validated array, or undefined when the field is absent.
 * @throws {Error} when the value is present but is not an array of strings.
 */
export function optionalStringArray(subject: string, field: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`client-modules: ${subject} ${field} must be a string array`)
  }
  return value as string[]
}
