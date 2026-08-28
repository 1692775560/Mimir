/**
 * CBE parameter registry (constitution I3): every tunable constant that
 * shapes a derivation is born registered — value, track, literature anchor,
 * open issue, and last review date. Governance is self-executing, not
 * voluntary: the CI audit test (`tests/registry.spec.ts`) fails the build
 * when an exported scalar constant of the CBE modules is missing here (or
 * drifts from its registered value), and when a registry key goes stale.
 *
 * Tracks:
 *  - `anchored`     — pinned to an external standard or an engineering
 *                     invariant; changing it is a protocol change.
 *  - `calibratable` — will be fit from the user's own ledger at E1 mass via
 *                     the pre-registered parameter court (literature prior
 *                     stays champion until the data duel decides).
 *  - `provisional` — a declared placeholder: hand-set, carrying its retirement
 *                     plan in `issue`; tuning it by hand is forbidden.
 *
 * Vocabulary exports (`*_ACTION` names, the action sets) are L0 language,
 * not parameters, and are exempt from the registry by name.
 * @module dsh-mimir/src/registry
 */

/** How a parameter is governed. */
export type CbeParameterTrack = 'anchored' | 'calibratable' | 'provisional'

/** One registered parameter. */
export interface CbeParameterEntry {
  /** The governed value — the audit test asserts it equals the export. */
  readonly value: number | string
  readonly track: CbeParameterTrack
  /** The literature anchor or engineering rationale that pins it. */
  readonly anchor: string
  /** The open question / retirement plan — what would change it. */
  readonly issue: string
  /** ISO-8601 date of the last review. */
  readonly lastReviewed: string
}

/** The registry itself: keyed by exported constant name. */
export const PARAMETER_REGISTRY: Readonly<Record<string, CbeParameterEntry>> = Object.freeze({
  /* ── cognitive-map.ts ─────────────────────────────────────────────── */
  CBE_HALF_LIFE_DAYS: {
    value: 7,
    track: 'calibratable',
    anchor: 'Wixted & Carpenter 2016 (power-form forgetting); Rubin & Wenzel 1996 (power/log beat exponential). The exponential half-life is the v1 pragmatic form; the shape duel is run per user at E1 mass.',
    issue: 'I3 parameter court: exp-vs-power AIC duel at ≥100 user events; until then the literature default stands.',
    lastReviewed: '2026-08-27',
  },
  CBE_SESSION_GAP_MINUTES: {
    value: 30,
    track: 'provisional',
    anchor: 'Sessionization convention from usage analytics; no cognitive-science pin.',
    issue: 'Validate against the user’s own burst structure at G1; retire if the burst detector (R2) supplies the cut.',
    lastReviewed: '2026-08-27',
  },
  CBE_DOMINANT_DRIFT: {
    value: 4,
    track: 'provisional',
    anchor: 'None — a magic number, which is exactly why it is registered.',
    issue: 'Scheduled for retirement by the GUT/MVT stay-or-abandon card (R6/R7): copy/trigger only, no optimization claim (Charnov 1976; Codding & Bird 2016). Do not hand-tune — replace.',
    lastReviewed: '2026-08-27',
  },
  CBE_STALLED_DRIFT: {
    value: -2,
    track: 'provisional',
    anchor: 'Hand-set v1 symmetry with CBE_DOMINANT_DRIFT.',
    issue: 'G1 descriptive fit; retire together with CBE_DOMINANT_DRIFT.',
    lastReviewed: '2026-08-27',
  },
  CBE_EXPLORE_EVENTS: {
    value: 4,
    track: 'provisional',
    anchor: 'Hand-set v1 explore floor.',
    issue: 'G1: replace with burst-phase statistics (Barabási 2005 burst classes) once enough windows exist.',
    lastReviewed: '2026-08-27',
  },
  CBE_RETURN_SESSIONS: {
    value: 2,
    track: 'provisional',
    anchor: 'Hand-set v1: two returning sessions mark a persistent side road.',
    issue: 'G1 descriptive fit against the user’s own return intervals.',
    lastReviewed: '2026-08-27',
  },
  CBE_FOCUS_DISPERSION: {
    value: 1,
    track: 'provisional',
    anchor: 'Hand-set v1 dispersion floor for the converging state.',
    issue: 'G1; interacts with the engine’s learned dispersion (cbe-engine) once E1 unlocks.',
    lastReviewed: '2026-08-27',
  },
  CBE_LINE_EVIDENCE_CAP: {
    value: 20,
    track: 'anchored',
    anchor: 'Engineering display cap (evidence pointers per card), not a model parameter.',
    issue: 'None planned; bumping is a UI change only.',
    lastReviewed: '2026-08-27',
  },
  CBE_QUESTION_CAP: {
    value: 5,
    track: 'anchored',
    anchor: 'UX cap: at most five boundary questions per brief (one hand’s worth of decisions).',
    issue: 'None planned.',
    lastReviewed: '2026-08-27',
  },
  CBE_DERIVATION_VERSION: {
    value: 2,
    track: 'anchored',
    anchor: 'I5: the brief carries its derivation version and the UI shows a re-calibration notice when it changes. v2 = I2 tier gate + I4 question meta-events.',
    issue: 'Bump on ANY derivation-affecting change of a registered parameter; never silently.',
    lastReviewed: '2026-08-27',
  },
  CBE_TIER_SILENT_LINE_EVENTS: {
    value: 5,
    track: 'provisional',
    anchor: 'I2 constitution default: below five line events a line stays wordless.',
    issue: 'Provisional until G1; mirrors the GUT baseline minimum so the two floors move together.',
    lastReviewed: '2026-08-27',
  },
  CBE_TIER_E1_LINE_EVENTS: {
    value: 20,
    track: 'provisional',
    anchor: 'I2 constitution default: twenty line events before comparative language.',
    issue: 'Provisional until G1 calibration.',
    lastReviewed: '2026-08-27',
  },
  CBE_TIER_E1_USER_EVENTS: {
    value: 100,
    track: 'provisional',
    anchor: 'I2 constitution default: one hundred window events before comparative language.',
    issue: 'Provisional until G1 calibration; also the exp-vs-power duel threshold (see CBE_HALF_LIFE_DAYS).',
    lastReviewed: '2026-08-27',
  },
  LINE_WEIGHTS: {
    value: 'signed table over the 24 decision-grade actions (hand priors)',
    track: 'provisional',
    anchor: 'Hand priors, v1; the engine (cbe-engine.ts) treats them exactly as priors — cold start ≡ today’s map.',
    issue: 'At E1 the learned table (κ-shrunk) challenges the priors; priors stay champion until G1 passes (Singh & Sutton 1996 share-form credit assignment).',
    lastReviewed: '2026-08-27',
  },

  /* ── ledger.ts (engineering invariants, registered for completeness) ── */
  EVENT_PAYLOAD_MAX_CHARS: {
    value: 2048,
    track: 'anchored',
    anchor: 'Security-style invariant of the append-only ledger (bounded event payloads).',
    issue: 'None planned; a change is a protocol change.',
    lastReviewed: '2026-08-27',
  },
  JOURNAL_TEXT_MAX_CHARS: {
    value: 1024,
    track: 'anchored',
    anchor: 'L2 stays one handwritten line — the journal cap mirrors this server-side constant client-side.',
    issue: 'None planned.',
    lastReviewed: '2026-08-27',
  },
  LIST_EVENTS_DEFAULT_LIMIT: {
    value: 200,
    track: 'anchored',
    anchor: 'Query default of the ledger read path.',
    issue: 'None planned.',
    lastReviewed: '2026-08-27',
  },
  LIST_EVENTS_MAX_LIMIT: {
    value: 1000,
    track: 'anchored',
    anchor: 'Query hard cap of the ledger read path (memory bound).',
    issue: 'None planned.',
    lastReviewed: '2026-08-27',
  },

  /* ── worktree.ts (S2) ─────────────────────────────────────────────── */
  IDEA_CLOSE_REASON_MAX_CHARS: {
    value: 48,
    track: 'anchored',
    anchor: 'Mirrors the brief’s 48-char claim excerpt: one line a human actually reads.',
    issue: 'None planned; the client mirrors it as WORKTREE_REASON_MAX_CHARS.',
    lastReviewed: '2026-08-27',
  },

  /* ── cbe-engine.ts (S3, batch 4) ──────────────────────────────────── */
  CBE_ENGINE_ALPHA: {
    value: 0.3,
    track: 'calibratable',
    anchor: 'Singh & Sutton 1996 share-form credit assignment; RLDDM’s dual-α is the precedent for outcome-asymmetric steps (here a single α over sign-only outcomes).',
    issue: 'G0 sensitivity sweep first; fit on the real ledger only after ~20 terminals at G1.',
    lastReviewed: '2026-08-27',
  },
  CBE_ENGINE_KAPPA: {
    value: 6,
    track: 'calibratable',
    anchor: 'Bayesian shrinkage: prior pseudo-mass — roughly four full-share terminals of data begin to outweigh the priors, keeping cold start ≡ today’s map.',
    issue: 'G1 calibration; κ must preserve the sparse-terminals ⇒ ≈-prior guarantee.',
    lastReviewed: '2026-08-27',
  },
  CBE_ENGINE_N_FLIP: {
    value: 3,
    track: 'provisional',
    anchor: 'Sign-lock quorum: three full shares of contrary evidence may flip a prior’s sign; one terminal may not.',
    issue: 'G0 sweep; retire the lock if G1 shows it never binds on real ledgers.',
    lastReviewed: '2026-08-27',
  },
  CBE_ENGINE_FOLD_WINDOW_DAYS: {
    value: 180,
    track: 'provisional',
    anchor: 'Half a year of eligibility — long enough to span a research chapter, short enough that stale traces fade.',
    issue: 'G1: compare 90/180/365 by descriptive fit, never by outcome reward.',
    lastReviewed: '2026-08-27',
  },

  /* ── foraging.ts (S4, batch 5) ────────────────────────────────────── */
  CBE_GUT_BASELINE_MIN_DEPARTURES: {
    value: 5,
    track: 'provisional',
    anchor: 'I2’s no-words floor applied to departures: five documented closes before the personal baseline may speak.',
    issue: 'Provisional until G1; the GUT number itself stays E0 (a date difference) regardless.',
    lastReviewed: '2026-08-27',
  },
})
