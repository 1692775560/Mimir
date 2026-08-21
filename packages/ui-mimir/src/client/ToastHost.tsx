/**
 * The corner toast stack: bottom-right of the workbench, one card per queued
 * toast with a kind-colored accent (success green / info blue / error red),
 * a slide-in entrance, an × for early dismissal, and a single sweep timer
 * armed at the next expiry (TOAST_TTL_MS). The queue rules live in
 * `toasts.ts`; this component is render + timer only.
 * @module dsh-client-ui-mimir/client/ToastHost
 */

import { useEffect } from 'react'
import { nextToastExpiry, type ResearchToast } from './toasts.ts'
import type { ResearchT } from './view-common.ts'
import css from './ResearchPanel.module.css'

/** Per-kind accent class. */
const KIND_CLASS: Record<ResearchToast['kind'], string | undefined> = {
  success: css.toastSuccess,
  info: css.toastInfo,
  error: css.toastError,
}

/**
 * @param props - the toast queue, the dismiss/sweep verbs, and copy.
 * @returns the stack, or null while the queue is empty.
 */
export function ToastHost({ toasts, dismissToast, pruneToasts, t }: {
  readonly toasts: readonly ResearchToast[]
  readonly dismissToast: (id: number) => void
  readonly pruneToasts: () => void
  readonly t: ResearchT
}) {
  // One timer per queue change, armed at the oldest toast's deadline; the
  // sweep republishes, which re-arms for the next expiry.
  useEffect(() => {
    const expiry = nextToastExpiry(toasts)
    if (expiry === null) return
    const timer = setTimeout(() => { pruneToasts() }, Math.max(0, expiry - Date.now()))
    return () => { clearTimeout(timer) }
  }, [toasts, pruneToasts])

  if (toasts.length === 0) return null
  return (
    <div className={css.toastStack} role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className={`${css.toast} ${KIND_CLASS[toast.kind] ?? ''}`}>
          <span className={css.toastMessage}>
            {t(toast.copy)}{toast.detail !== null ? `：${toast.detail}` : ''}
          </span>
          <button
            type="button"
            className={css.toastClose}
            aria-label={t('toast.dismiss')}
            onClick={() => { dismissToast(toast.id) }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
