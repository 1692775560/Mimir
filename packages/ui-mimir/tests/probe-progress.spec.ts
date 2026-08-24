/**
 * Behavior tests for the server probe stage inference behind the servers
 * view's staged progress line: the elapsed-time → stage derivation and the
 * locale key maps for the in-flight stages and the settled failure stages.
 */

import { describe, expect, it } from 'vitest'
import {
  PROBE_FAILURE_KEYS, PROBE_STAGE_KEYS, PROBE_SSH_WINDOW_MS, PROBE_TCP_WINDOW_MS, probeStageOf,
} from '../src/client/view-common.ts'
import { zh } from '../src/client/locales.ts'

describe('probeStageOf', () => {
  it('shows the TCP stage inside the TCP budget (0–4s)', () => {
    expect(probeStageOf(0)).toBe('tcp')
    expect(probeStageOf(PROBE_TCP_WINDOW_MS - 1)).toBe('tcp')
  })

  it('shows the SSH stage between the TCP and SSH budgets (4–9s)', () => {
    expect(probeStageOf(PROBE_TCP_WINDOW_MS)).toBe('ssh')
    expect(probeStageOf(PROBE_SSH_WINDOW_MS - 1)).toBe('ssh')
  })

  it('shows the GPU stage past the SSH budget (9s+), however long it runs', () => {
    expect(probeStageOf(PROBE_SSH_WINDOW_MS)).toBe('gpu')
    expect(probeStageOf(60_000)).toBe('gpu')
  })
})

describe('probe stage locale keys', () => {
  it('covers every stage in both the progress and the failure key maps', () => {
    expect(Object.keys(PROBE_STAGE_KEYS).sort()).toEqual(['gpu', 'ssh', 'tcp'])
    expect(Object.keys(PROBE_FAILURE_KEYS).sort()).toEqual(['gpu', 'ssh', 'tcp'])
  })

  it('points at keys that exist in the dictionaries', () => {
    for (const key of Object.values(PROBE_STAGE_KEYS)) expect(zh[key]).toBeTruthy()
    for (const key of Object.values(PROBE_FAILURE_KEYS)) expect(zh[key]).toBeTruthy()
  })
})
