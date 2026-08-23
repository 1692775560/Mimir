/**
 * The line-level diff behind the paper view's snapshot comparison: a simple
 * LCS diff of two texts (common prefix/suffix trimmed first), plus the
 * display compaction that folds long unchanged runs into gap markers so the
 * panel never mounts one row per unchanged line. Pure functions, no JSX.
 * @module dsh-client-ui-mimir/client/snapshot-diff
 */

/** One row of the line diff between a snapshot and the current source. */
export type SnapshotDiffRow =
  | { readonly type: 'same'; readonly oldLine: number; readonly newLine: number; readonly text: string }
  | { readonly type: 'del'; readonly oldLine: number; readonly text: string }
  | { readonly type: 'add'; readonly newLine: number; readonly text: string }

/**
 * The DP-cell budget of the exact LCS pass. A pair of texts whose middle
 * (after prefix/suffix trim) exceeds it falls back to treating the whole
 * middle as replaced — the diff stays correct, just coarser.
 */
const LCS_CELL_BUDGET = 4_000_000

/** Emit the rows of one middle region, del-block first, then add-block. */
function replacedRows(
  rows: SnapshotDiffRow[],
  before: readonly string[],
  beforeStart: number,
  beforeEnd: number,
  after: readonly string[],
  afterStart: number,
  afterEnd: number,
): void {
  for (let index = beforeStart; index < beforeEnd; index += 1) {
    rows.push({ type: 'del', oldLine: index + 1, text: before[index] ?? '' })
  }
  for (let index = afterStart; index < afterEnd; index += 1) {
    rows.push({ type: 'add', newLine: index + 1, text: after[index] ?? '' })
  }
}

/**
 * Diff two texts line by line: `before` (the snapshot) against `after` (the
 * current source). Rows carry 1-based line numbers of the side they belong
 * to. Identical texts yield only `same` rows.
 */
export function diffLines(before: string, after: string): SnapshotDiffRow[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  // Trim the common prefix and suffix; the LCS only runs on the middle.
  let prefix = 0
  const maxPrefix = Math.min(beforeLines.length, afterLines.length)
  while (prefix < maxPrefix && beforeLines[prefix] === afterLines[prefix]) prefix += 1
  let beforeEnd = beforeLines.length
  let afterEnd = afterLines.length
  while (beforeEnd > prefix && afterEnd > prefix
    && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
    beforeEnd -= 1
    afterEnd -= 1
  }

  const rows: SnapshotDiffRow[] = []
  for (let index = 0; index < prefix; index += 1) {
    rows.push({ type: 'same', oldLine: index + 1, newLine: index + 1, text: beforeLines[index] ?? '' })
  }

  const middleBefore = beforeEnd - prefix
  const middleAfter = afterEnd - prefix
  if (middleBefore * middleAfter > LCS_CELL_BUDGET) {
    // Oversized middle: report it as one replacement instead of a quadratic DP.
    replacedRows(rows, beforeLines, prefix, beforeEnd, afterLines, prefix, afterEnd)
  } else if (middleBefore > 0 && middleAfter > 0) {
    // LCS lengths over the middle, row-major; cell (i, j) covers the first i
    // lines of the before-middle and the first j of the after-middle.
    const width = middleAfter + 1
    const lengths = new Uint32Array((middleBefore + 1) * width)
    for (let i = 1; i <= middleBefore; i += 1) {
      for (let j = 1; j <= middleAfter; j += 1) {
        lengths[i * width + j] = beforeLines[prefix + i - 1] === afterLines[prefix + j - 1]
          ? (lengths[(i - 1) * width + j - 1] ?? 0) + 1
          : Math.max(lengths[(i - 1) * width + j] ?? 0, lengths[i * width + j - 1] ?? 0)
      }
    }
    // Backtrack from the far corner; the walk yields rows in reverse.
    const middle: SnapshotDiffRow[] = []
    let i = middleBefore
    let j = middleAfter
    while (i > 0 && j > 0) {
      if (beforeLines[prefix + i - 1] === afterLines[prefix + j - 1]) {
        middle.push({
          type: 'same',
          oldLine: prefix + i,
          newLine: prefix + j,
          text: beforeLines[prefix + i - 1] ?? '',
        })
        i -= 1
        j -= 1
      } else if ((lengths[i * width + j - 1] ?? 0) >= (lengths[(i - 1) * width + j] ?? 0)) {
        middle.push({ type: 'add', newLine: prefix + j, text: afterLines[prefix + j - 1] ?? '' })
        j -= 1
      } else {
        middle.push({ type: 'del', oldLine: prefix + i, text: beforeLines[prefix + i - 1] ?? '' })
        i -= 1
      }
    }
    while (i > 0) {
      middle.push({ type: 'del', oldLine: prefix + i, text: beforeLines[prefix + i - 1] ?? '' })
      i -= 1
    }
    while (j > 0) {
      middle.push({ type: 'add', newLine: prefix + j, text: afterLines[prefix + j - 1] ?? '' })
      j -= 1
    }
    middle.reverse()
    rows.push(...middle)
  } else {
    // One middle side is empty: pure insertion or pure deletion.
    replacedRows(rows, beforeLines, prefix, beforeEnd, afterLines, prefix, afterEnd)
  }

  for (let index = 0; index < beforeLines.length - beforeEnd; index += 1) {
    rows.push({
      type: 'same',
      oldLine: beforeEnd + index + 1,
      newLine: afterEnd + index + 1,
      text: beforeLines[beforeEnd + index] ?? '',
    })
  }
  return rows
}

/**
 * One display row of the compacted diff: either a real diff row or a gap
 * marker folding `count` unchanged lines.
 */
export type SnapshotDiffDisplayRow =
  | SnapshotDiffRow
  | { readonly type: 'gap'; readonly count: number }

/** Unchanged lines kept around a change hunk when folding. */
const DIFF_CONTEXT_LINES = 3

/**
 * Fold long `same` runs into gap markers, keeping {@link DIFF_CONTEXT_LINES}
 * context lines on each side of every change. Runs of at most twice the
 * context stay expanded — folding them would save nothing.
 */
export function collapseDiffRows(rows: readonly SnapshotDiffRow[]): SnapshotDiffDisplayRow[] {
  const display: SnapshotDiffDisplayRow[] = []
  let index = 0
  while (index < rows.length) {
    const row = rows[index]
    if (row === undefined) break
    if (row.type !== 'same') {
      display.push(row)
      index += 1
      continue
    }
    let runEnd = index
    while (runEnd < rows.length && rows[runEnd]?.type === 'same') runEnd += 1
    const run = rows.slice(index, runEnd)
    if (run.length <= DIFF_CONTEXT_LINES * 2) {
      display.push(...run)
    } else {
      display.push(...run.slice(0, DIFF_CONTEXT_LINES))
      display.push({ type: 'gap', count: run.length - DIFF_CONTEXT_LINES * 2 })
      display.push(...run.slice(run.length - DIFF_CONTEXT_LINES))
    }
    index = runEnd
  }
  return display
}
