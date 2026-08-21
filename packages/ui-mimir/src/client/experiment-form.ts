/**
 * The experiments view's inline create/edit form helpers: the metrics
 * key/value row editor's pure rules. Rows are the form's editable
 * representation (both fields stay text); `metricsFromRows` folds them back
 * into the record's `Record<string, number | string>` — empty keys drop, and
 * a value that fully parses as a finite number is stored as a number.
 * DOM-free so every rule is unit-testable.
 * @module dsh-client-ui-mimir/client/experiment-form
 */

/** One editable metrics row: key and value stay raw text while editing. */
export interface MetricRow {
  readonly key: string
  readonly value: string
}

/**
 * Expand a record's metrics into editable rows (values stringified).
 * @param metrics - the stored metrics map.
 * @returns one row per entry, in insertion order.
 */
export function metricRowsFromMetrics(metrics: Record<string, number | string>): MetricRow[] {
  return Object.entries(metrics).map(([key, value]) => ({ key, value: String(value) }))
}

/**
 * Fold the editor's rows into a metrics map: rows whose key trims to empty
 * drop; values are trimmed, and a trimmed value that parses fully as a
 * finite number (`Number`) is stored as a number, otherwise as the trimmed
 * string. Later rows with the same trimmed key win.
 * @param rows - the editor's rows.
 * @returns the metrics map for the upsert payload.
 */
export function metricsFromRows(rows: readonly MetricRow[]): Record<string, number | string> {
  const metrics: Record<string, number | string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key === '') continue
    const value = row.value.trim()
    const numeric = value === '' ? Number.NaN : Number(value)
    metrics[key] = Number.isFinite(numeric) ? numeric : value
  }
  return metrics
}
