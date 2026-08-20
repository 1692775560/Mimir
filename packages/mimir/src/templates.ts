/**
 * Artifact templates as runtime data. This module is the single source the
 * commands scaffold from; the `templates/` directory at the package root
 * carries the same bytes for human reference and is NOT read at runtime
 * (published packages ship `lib/` only).
 * @module dsh-mimir/src/templates
 */

/** Minimal compilable paper skeleton: article class, abstract, sections, one citation. */
export const PAPER_MAIN_TEX = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\title{<Paper Title>}
\author{<Authors>}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
<One-paragraph abstract: problem, approach, key result.>
\end{abstract}

\section{Introduction}
<Motivation and contributions. Cite related work like this~\cite{example2024}.>

\section{Method}
<Formal statement of the approach.>

\section{Experiments}
<Setup, baselines, and results.>

\section{Conclusion}
<Findings and limitations.>

\bibliographystyle{plain}
\bibliography{references}
\end{document}
`

/** One example entry so the skeleton compiles with a citation out of the box. */
export const PAPER_REFERENCES_BIB = String.raw`@article{example2024,
  author  = {Doe, Jane and Roe, John},
  title   = {An Example Reference},
  journal = {Journal of Examples},
  year    = {2024},
}
`

/** IDEA_REPORT.md skeleton written by /research-idea. */
export const IDEA_REPORT_MD = `# Idea Report: <title>

## Problem
<What problem does this direction address and why does it matter?>

## Related Work
<Summary of the closest papers found via arxiv_search, with arXiv ids.>

## Hypothesis
<The single falsifiable hypothesis.>

## Differentiation
<How this differs from the closest prior work.>

## Failed Ideas Considered
<Which wiki-recorded failed ideas this direction must not repeat, and why it does not.>

## Risks
<What could invalidate the hypothesis.>
`

/** EXPERIMENT_PLAN.md skeleton written by /research-plan. */
export const EXPERIMENT_PLAN_MD = `# Experiment Plan: <title>

## Hypothesis Under Test
<Copied verbatim from IDEA_REPORT.md.>

## Claims
<Numbered list of claims; each becomes a pending wiki claim via wiki_note.>

## Setup
<Datasets, baselines, metrics, compute budget.>

## Experiments
<Numbered experiments; each names the claim(s) it supports or invalidates.>

## Success Criteria
<Per-claim pass/fail thresholds decided before running.>

## Timeline
<Ordered steps with rough effort estimates.>
`
