/**
 * Bundled research skills: the ARIS-style workflow playbooks shipped inside
 * the plugin itself. Each skill is a `ctx.skills.register()` runtime
 * contribution (rank 250 — project-level skills still outrank them, user-level
 * ones yield), so the suite works out of the box in any composition that
 * mounts the skill registry, and stays silent in one that does not. Bodies
 * reference only surfaces this package actually provides: the `arxiv_search`,
 * `paper_fetch`, `wiki_note`, `figure_save`, and `latex_compile` tools, the
 * `research-idea` / `research-plan` / `research-review` / `paper-write` /
 * `paper-compile` commands, the workspace artifacts (IDEA_REPORT.md,
 * EXPERIMENT_PLAN.md, EXPERIMENT_LOG.md, NARRATIVE_REPORT.md), and the web
 * workbench tabs.
 *
 * The content lives as template literals for the same reason templates.ts
 * cites: published packages ship `lib/` only, so runtime assets must ride the
 * bundle.
 * @module dsh-mimir/src/skills
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.skills Context merge; the service itself is
// consumed optionally through ctx.inject below.
import type {} from '@deepseek-ai/dsh-skill'

/** One bundled skill body plus its routing metadata. */
interface BundledSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse: string
  readonly content: string
}

const SHARED_RULES = String.raw`
## Standing rules

- Persist every durable finding with \`wiki_note\` the moment you have it —
  papers into \`papers\`, hypotheses into \`ideas\`, claims into \`claims\`,
  run outcomes into \`experiments\`. The web workbench renders these tables;
  a finding that is only in the chat is lost work.
- Failed directions are assets: close them out with
  \`wiki_note { action: 'fail_idea', ... }\` (the wiki never deletes ideas) so
  the next pass does not re-walk a dead end.
- Keep the project record honest: \`wiki_note { action: 'set_project' }\`
  with stage \`idea\` / \`plan\` / \`experiment\` / \`writing\` / \`done\` as
  the work crosses each gate.
- Prefer one verified fact over three plausible ones. Cite arXiv ids, file
  paths, and experiment ids as evidence pointers, never from memory alone.
`

export const RESEARCH_PIPELINE = String.raw`
# Research Pipeline — end-to-end orchestration

Drive one research project through the full Mimir loop. Run the stages in
order; do not skip a gate to save time — each gate exists because skipping it
once cost a paper.

## Stages

1. **Ideation** — run the \`research-idea\` command on the direction. It
   produces IDEA_REPORT.md and registers ideas in the wiki. If the user
   already has a written idea, record it with
   \`wiki_note { action: 'add_idea' }\` and move on.
2. **Novelty gate** — invoke the \`research-novelty-check\` skill on the
   leading idea. A "known" verdict is not failure: pivot the angle and
   re-check once. Two independent "known" verdicts kill the idea — record
   \`fail_idea\` and pick the next one.
3. **Literature base** — invoke the \`research-lit-review\` skill until the
   wiki holds the 8–15 papers that define the problem, the baselines, and
   the evaluation protocol you will be judged against.
4. **Plan** — run \`research-plan\`. It turns IDEA_REPORT.md into
   EXPERIMENT_PLAN.md and registers every claim as \`pending\`. If claims
   look wrong, fix the plan before any compute is spent.
5. **Experiments** — invoke \`research-experiment-plan\` to sequence the
   runs, then execute. Log every run with
   \`wiki_note { action: 'add_experiment' }\` and keep EXPERIMENT_LOG.md
   append-only current.
6. **Claim gate** — invoke \`research-result-to-claim\` before writing a
   single section. Unsupported claims get cut or get more experiments;
   they never get written as if supported.
7. **Writing** — run \`paper-write\` (or invoke \`research-paper-drafting\`
   for a slower, section-by-section pass with human checkpoints). Compile
   early and often with \`latex_compile\`.
8. **Review** — run \`research-review\`. WARN/FAIL verdicts come back as
   issues; revise and re-run until PASS or the round budget is spent, then
   surface the remaining issues to the user honestly.
9. **Done** — \`set_project\` stage \`done\`. If reviews arrive from a venue,
   invoke \`research-rebuttal\`.

## Escalation

Stop and ask the user when: the novelty gate kills every idea on the table;
the compute budget implied by EXPERIMENT_PLAN.md exceeds what the registered
servers can run; or two consecutive review rounds fail on the same issue.
` + SHARED_RULES

export const RESEARCH_LIT_REVIEW = String.raw`
# Literature Review — build the wiki's paper base

Turn a research direction into a curated, noted, citable paper set in the
wiki's \`papers\` table (rendered in the workbench's 文献 / Literature tab).

## Loop

1. **Search** with \`arxiv_search\`: start broad (the problem statement), then
   narrow (the specific method family, the benchmark, the strongest
   baseline). Rewrite the query at least twice — first-pass queries miss
   half the field.
2. **Triage** each result by title + abstract: defining works, must-beat
   baselines, and the evaluation suite. Skip anything you cannot state a
   concrete reason to keep.
3. **Persist** each keeper immediately:
   \`wiki_note { action: 'add_paper', arxiv_id, title, authors, summary, url,
   notes }\` — \`notes\` carries YOUR one-paragraph read: what it does, what
   it leaves open, why it matters to this project. An entry without notes is
   a bookmark, not a review.
4. **Fetch** the PDF with \`paper_fetch\` for any paper you will cite for a
   specific claim — the workbench's reader plus its note sidebar is the
   deep-reading surface.
5. **Zotero** — if the user has configured \`zotero.apiKey\` / \`userId\`,
   the 文献 tab can import whole collections and export the wiki back to
   .bib; suggest it when the user mentions an existing Zotero library.
6. **Subscriptions** — for a long-running project, suggest adding an arXiv
   subscription in the 文献 tab so new papers surface daily.

## Done when

The wiki holds enough papers that you can name, without searching again: the
problem's origin, the two strongest baselines, the standard benchmark, and
the one result nobody has explained. State those four to the user as the
review's summary.
` + SHARED_RULES

export const RESEARCH_NOVELTY_CHECK = String.raw`
# Novelty Check — is this idea already done?

Verdict-bearing gate: decide whether the literature already contains the
proposed contribution. Run it BEFORE writing code or spending compute.

## Method

1. **Distill** the idea to its load-bearing sentence: "we are the first to
   <do X> <for Y> <achieving Z>". If you cannot write that sentence, the
   idea is not ready for a novelty check — say so.
2. **Attack it** with \`arxiv_search\` from three directions: the mechanism
   (X), the application (Y), and the claimed result (Z). Use the search
   syntax the tool supports (field prefixes, \`AND\`/\`OR\`), and read
   abstracts of every plausible hit — title-level dismissal is how novelty
   checks fail.
3. **Widen once**: if arXiv is thin, check the adjacent venues by name in
   the query (the field knows its conferences).
4. **Judge** honestly:
   - **Known** — a prior work does X for Y. Name it with its arXiv id.
   - **Adjacent** — X exists but not for Y, or Y is addressed but not by X.
     The delta must be stated in one sentence; if that sentence is weak, the
     verdict is effectively known.
   - **Novel** — nothing within the search's reach does X for Y, and the
     closest three works each miss a named piece.
5. **Record** the verdict in the wiki: attach it to the idea's notes, or on
   "known", \`wiki_note { action: 'fail_idea', reason }\` citing the killing
   paper.

## Hard rules

- Never issue "novel" from memory of the field — only from searches run in
  this session.
- "I found nothing" with weak queries means nothing. Show the queries.
- One strong killing paper outweighs any amount of enthusiasm.
` + SHARED_RULES

export const RESEARCH_EXPERIMENT_PLAN = String.raw`
# Experiment Plan — claim-driven validation design

Turn EXPERIMENT_PLAN.md's claims into a concrete run order. Every run exists
to move one claim out of \`pending\`; a run that maps to no claim is cut.

## Design

1. **List the claims** from the wiki (\`wiki_note { action: 'list',
   table: 'claims' }\`). For each, name the single result that would support
   it and the single result that would kill it.
2. **Sequence**: main result first (the table the paper lives or dies by),
   then ablations ordered by claim coverage per GPU-hour, then robustness
   (seeds, datasets). Baselines run before or alongside, never after.
3. **Budget**: state the compute each run needs and where it runs — check
   the 服务器 / Servers tab for registered machines and their GPU probe
   results before promising a schedule. Jobs can be dispatched and tracked
   from that tab; their ids belong in the experiment records.
4. **Register** every planned run:
   \`wiki_note { action: 'add_experiment', project_id, name, metrics }\`
   with the hypothesis in the name and the target metrics explicit.
5. **Write it down**: keep EXPERIMENT_PLAN.md as the human-readable mirror
   (setup, baselines, ablation matrix, decision rules for pivoting).

## During execution

- EXPERIMENT_LOG.md is append-only: one block per run with config, seed,
  result, and verdict against the hypothesis.
- On run completion, \`wiki_note { action: 'set_experiment', status:
  'success' | 'failed', metrics, log_path }\` — never leave runs \`running\`
  once they finish; stale running rows corrupt the panel's status view.
- A failed run still updates claims: negative evidence is evidence.
` + SHARED_RULES

export const RESEARCH_RESULT_TO_CLAIM = String.raw`
# Result-to-Claim Gate — what do the experiments actually prove?

Verdict-bearing gate between experiments and writing. The question is never
"are the results good" but "which claims do these results support".

## Procedure

1. Pull the claims (\`wiki_note { action: 'list', table: 'claims' }\`) and
   the experiments (\`action: 'list', table: 'experiments'\`).
2. For each claim, lay the evidence beside it: which runs, which metrics,
   which baselines beaten (or not). Read EXPERIMENT_LOG.md, not summaries of
   summaries.
3. Judge each claim:
   - **Supported** — the named evidence directly shows it, including the
     comparison against the strongest baseline, not an easy one.
     \`wiki_note { action: 'set_claim', status: 'supported', evidence }\`
     with evidence pointing at experiment ids / log paths.
   - **Invalidated** — the evidence contradicts it. Mark
     \`status: 'invalidated'\` and say what the results suggest instead; an
     invalidated main claim usually pivots the paper's story.
   - **Pending** — evidence is missing, mixed, or under-powered (one seed,
     no significance, wrong baseline). Name the ONE run that would settle it.
4. **Report** the routing to the user: claims supported → write; claims
   pending → the exact supplementary runs; claims invalidated → pivot
   options with their costs.

## Hard rules

- No claim advances on vibes, trends, or "the number looks right".
- The paper may only assert claims marked \`supported\`; \`pending\` claims
  are written as limitations or not at all.
` + SHARED_RULES

export const RESEARCH_PAPER_DRAFTING = String.raw`
# Paper Drafting — section by section, compile as you go

Draft the LaTeX paper inside the project's paper directory. For the
one-shot scaffolding path use the \`paper-write\` command instead; this
skill is the deliberate, checkpointed path.

## Setup

1. Read the wiki first: supported claims, the experiment table, the paper
   list. The paper's skeleton is the claim list, not a generic ML template.
2. Confirm the paper directory (the workbench's 论文 / Paper tab shows it)
   and that \`main.tex\` + \`references.bib\` exist; scaffold from the
   suite's templates if not.

## Per-section loop

For each section, in paper order (abstract LAST, but keep a stub):

1. Draft against the evidence: every number in the text traces to an
   experiment record; every \\cite{} key exists in the .bib (add missing
   entries from the wiki's papers — the 文献 tab can also export the wiki to
   .bib).
2. Compile with \`latex_compile\` immediately. Fix errors before writing the
   next section — LaTeX errors compound and the log parser pinpoints them
   one at a time.
3. Checkpoint with the user after the introduction and after the
   experiments section: these two carry the story and the evidence, and a
   wrong direction there wastes the rest.

## Standards

- Claims discipline: assert only \`supported\` claims; \`pending\` evidence
  goes to limitations.
- Figures: plan them with the \`research-figure-plan\` skill; reference only
  files that exist in the paper directory's \`figures/\`.
- The workbench compiles and snapshots on success, so the user can diff and
  revert — do not hand-edit around history; compile through the tool.
` + SHARED_RULES

export const RESEARCH_CITATION_AUDIT = String.raw`
# Citation Audit — every bib entry real, every citation earned

Verdict-bearing audit before submission. Two questions: does each cited work
exist as described, and does the citing sentence actually need it?

## Procedure

1. **Inventory**: parse the paper directory's .bib (the suite's bibtex
   parser keeps it structured) and list every \\cite{} in the .tex with its
   sentence.
2. **Existence**: for each entry, verify against a live source —
   \`arxiv_search\` by title (and author surname when the title is common).
   Flag: hallucinated titles, wrong authors, wrong years, wrong venues,
   arXiv id pointing at a different paper (version drift counts).
3. **Context**: for each citation sentence, read the cited abstract and
   judge whether the sentence's claim is one the cited work supports.
   Flag: citing a paper for something it explicitly does not do, citing a
   survey as if it were the original, citing a baseline's reimplementation
   instead of the source.
4. **Coverage**: uncited entries in the .bib are either dead weight (remove)
   or a sign a related-work paragraph went missing (flag).
5. **Fix or report**: mechanical fixes (wrong year, dead entries) apply
   directly and recompile with \`latex_compile\`; judgment calls (wrong-
   context citations) go to the user as a numbered list — never silently
   rewrite the scholarship.

## Hard rules

- Verify from searches run in this session; training-memory bibliographies
  are the exact failure mode this audit exists to catch.
- Every flag cites the evidence: the search query, the found record, the
  mismatch.
` + SHARED_RULES

export const RESEARCH_REBUTTAL = String.raw`
# Rebuttal — answer the reviews you got, not the ones you wanted

Draft a grounded, venue-limited response to external reviews.

## Procedure

1. **Parse** the reviews into atomic concerns: one row per concrete
   question, criticism, or requested experiment. Merge duplicates across
   reviewers; note who raised what.
2. **Triage** each concern:
   - *Answerable from the paper/logs* — answer with section, table, or
     experiment-id pointers. Quote numbers exactly as logged.
   - *Needs new evidence* — scope the smallest experiment that answers it,
     check feasibility against the rebuttal window and the registered
     servers, and only promise what can actually be run.
   - *Misunderstanding* — correct it once, politely, with the exact quote
     from the paper that already addresses it.
3. **Draft** response-first: every answer opens with the concession or the
   correction, then the evidence. No new claims appear in a rebuttal that
   the paper's evidence cannot already carry — mark anything speculative as
   future work explicitly.
4. **Budget** to the venue's limit (characters/pages). Cut adjectives
   before cutting evidence.
5. **Track** any experiments run for the rebuttal like real ones:
   \`wiki_note { action: 'add_experiment' }\`, EXPERIMENT_LOG.md, and
   \`set_claim\` updates if they move a claim.

## Hard rules

- Never fabricate a result to satisfy a reviewer; an honest "we cannot run
  this in the window, here is the closest existing evidence" beats a
  invented number every time.
- Tone: grateful for real catches, firm on misreadings, never defensive.
` + SHARED_RULES

export const RESEARCH_FIGURE_PLAN = String.raw`
# Figure Plan — figures that carry claims, filed where they belong

Design and produce the paper's figures so each one earns its column width.

## Plan

1. For each supported claim, decide the figure or table that makes a
   reviewer believe it in five seconds: the main-result figure first, one
   mechanism/Architecture overview, then ablations.
2. Write a one-line spec per figure: what varies on each axis, which
   baselines appear, what the reader should conclude. A figure without that
   sentence is decoration — cut it.

## Produce

- Prefer reproducible sources: plot scripts reading EXPERIMENT_LOG.md data
  over hand-drawn numbers; TikZ/pgfplots or matplotlib output committed
  beside the paper.
- Save every figure through \`figure_save\` (or the 图表 / Figures tab's
  upload) so it lands in the paper directory's \`figures/\` AND in the
  wiki's figure registry with a caption and source note — figures saved any
  other way are invisible to the workbench.
- SVG sources convert through the workbench's converter (configure
  \`svg.converter\` — resvg/inkscape/rsvg/chromium — or install librsvg for
  vector PDF output).

## Verify

- \`latex_compile\` after adding figures; a missing file or a blown
  \\includegraphics width is caught by the compile, not by eye.
- Check the compiled PDF preview in the 论文 tab: every figure legible at
  column width, referenced in the text, and captioned with its takeaway.
` + SHARED_RULES

// Path A below drives the academic-Group-meeting-skills pipeline directly
// (https://github.com/mlxbc12138/academic-Group-meeting-skills) — cloned at
// first use, never vendored (the upstream repo ships no license file, so we
// reference rather than copy it). Its slide-voice rules (Microsoft YaHei,
// image-left/caption-right, Fig.X Chinese takeaway captions) also govern the
// Path-B renderer. Credit and thanks to the upstream authors.
export const RESEARCH_MEETING_DECK = String.raw`
# Meeting Deck — 组会 PPT：逐图精读 or 全项目汇报

Two decks, two engines. Pick by what the user asked for:

- **Path A — 单篇文献逐图精读**: one paper, one slide per figure, reference
  deck style. Drives the upstream academic-Group-meeting-skills script.
- **Path B — 全项目组会汇报**: progress + experiments + figures + selected
  papers, rendered deterministically by the \`meeting_deck\` tool.

Both land in \`<workspace>/meetings/<projectId>/\`, so the workbench's 组会 /
Meetings tab lists and downloads them.

## Path A — figure-by-figure deck of ONE paper

1. First use only, clone the upstream skill:
   \`git clone --depth 1 https://github.com/mlxbc12138/academic-Group-meeting-skills ~/.dsh/skills-external/academic-Group-meeting-skills\`
   The script is at
   \`~/.dsh/skills-external/academic-Group-meeting-skills/academic-Group-meeting-skills/scripts/paper_figures_to_ppt.py\`
   (call it SCRIPT below). Read
   \`~/.dsh/skills-external/academic-Group-meeting-skills/academic-Group-meeting-skills/references/style-profile.md\`
   before laying out slides.
2. Renderer check: \`command -v pdftoppm\` (poppler). If missing, write the
   shim at the bottom of this skill to \`<scratch>/bin/pdftoppm\`,
   \`chmod +x\` it, and pass \`--pdftoppm <scratch>/bin/pdftoppm\` to extract.
3. Extract (paper PDFs live under \`<workspace>/papers/<arxivId>.pdf\` after
   \`paper_fetch\`):
   \`uv run --with pdfplumber --with pillow --with python-pptx python SCRIPT extract --pdf <paper.pdf> --workdir <scratch>\`
4. Polish \`<scratch>/manifest.json\` — this is where the quality comes from:
   drop logos/decorations/tiny icons; fill \`paper.title_zh\`,
   \`paper.journal_if\`, \`paper.author_school\`; turn every \`raw_caption\`
   into a takeaway \`zh_caption\` ("Fig. 2 去掉检索模块召回掉 8 个点", not an
   axis description) plus \`zh_panel_captions\` A/B/C/D lines when the figure
   has panels; crop huge composite figures into \`subslides\`. Keep exact
   values, units, gene/method names verbatim.
5. Build:
   \`uv run --with pdfplumber --with pillow --with python-pptx python SCRIPT build --manifest <scratch>/manifest.json --out <out.pptx> --reference-pptx ~/.dsh/skills-external/academic-Group-meeting-skills/academic-Group-meeting-skills/assets/reference-style.pptx\`
6. Register: copy the pptx to
   \`<workspace>/meetings/<projectId>/<slug>-<yyyymmdd>.pptx\` — it shows in
   the 组会 tab immediately.

## Path B — whole-project report (deterministic)

1. Curate what the deck renders — it projects exactly what the wiki holds:
   one-paragraph \`notes\` per featured paper
   (\`wiki_note { action: 'update_paper' }\`), takeaway captions on figures,
   logged runs with real metrics, and an honest stage
   (\`wiki_note { action: 'set_project' }\`).
2. Optional 逐图 slides inside the report: after a Path-A extract, copy the
   chosen crops into \`<workspace>/meetings/.paper-figures/<arxivId>/\` and
   write \`manifest.json\` there as
   \`[{"file": "fig-01.png", "label": "Figure 1", "caption": "Fig.1 中文 takeaway"}]\`
   — at most 3 per paper make the deck.
3. Call \`meeting_deck\` with \`project_id\` (plus optional \`title\`,
   \`presenter\`, \`date\`, \`paper_ids\`, \`include_*\` switches). The tool
   returns the deck path; the user downloads from the 组会 tab.

## Slide voice (both paths)

- Chinese, one message per slide, stated in the heading — never "实验结果",
  always "方法 X 在 Y 上超过 baseline 2.1 个点".
- Figures image-left / caption-right; the caption is the takeaway sentence.
- Microsoft YaHei everywhere; fixed readable caption sizes over auto-shrink.

## pdftoppm shim (Path A step 2)

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pypdfium2", "pillow"]
# ///
"""pdftoppm-compatible shim: -r <dpi> -png <input.pdf> <prefix> via pypdfium2."""
import sys
import pypdfium2 as pdfium

args = sys.argv[1:]
dpi = 150
while args and args[0].startswith("-"):
    flag = args.pop(0)
    if flag == "-r":
        dpi = int(args.pop(0))
    elif flag == "-png":
        pass
    else:
        raise SystemExit("shim: unsupported flag " + flag)
doc = pdfium.PdfDocument(args[0])
n = len(doc)
width = max(2, len(str(n)))
for i in range(n):
    doc[i].render(scale=dpi / 72).to_pil().save(args[1] + "-" + str(i + 1).zfill(width) + ".png")
doc.close()
` + SHARED_RULES


/** Every skill bundled with the suite, in catalog order. */
export const BUNDLED_SKILLS: readonly BundledSkill[] = [
  {
    name: 'research-pipeline',
    description: 'Orchestrate one project through the full research loop: ideation, novelty gate, literature, plan, experiments, claim gate, writing, review. Use when the user says "做科研", "research pipeline", "从想法到论文", or wants the whole workflow driven end to end.',
    whenToUse: 'Starting or resuming a research project that should move through every Mimir stage in order.',
    content: RESEARCH_PIPELINE,
  },
  {
    name: 'research-lit-review',
    description: 'Build a curated, noted literature base in the research wiki via arxiv_search + paper_fetch, with Zotero import and arXiv subscriptions when configured. Use when the user says "文献综述", "lit review", "调研一下", or needs the paper base for a direction.',
    whenToUse: 'A direction needs its defining works, baselines, and evaluation suite collected into the wiki with notes.',
    content: RESEARCH_LIT_REVIEW,
  },
  {
    name: 'research-novelty-check',
    description: 'Verdict-bearing novelty gate: attack an idea with live arXiv searches from mechanism, application, and result angles before any compute is spent. Use when the user says "查新", "novelty check", "有没有人做过", or before committing to an idea.',
    whenToUse: 'Before implementing or spending compute on an idea whose novelty is unverified.',
    content: RESEARCH_NOVELTY_CHECK,
  },
  {
    name: 'research-experiment-plan',
    description: 'Turn registered claims into a sequenced, budgeted experiment roadmap mapped to wiki experiment records and the Servers tab. Use when the user says "实验方案", "experiment plan", "ablation matrix", or needs a run order.',
    whenToUse: 'A plan exists and needs concrete, claim-mapped runs with budgets and tracking.',
    content: RESEARCH_EXPERIMENT_PLAN,
  },
  {
    name: 'research-result-to-claim',
    description: 'Judge which claims the finished experiments actually support, invalidate, or leave pending — with the exact settling run named. Use when the user says "结果分析", "结果支撑什么", "result to claim", or after experiments finish and before writing.',
    whenToUse: 'Experiments have finished and the paper must only assert what the evidence carries.',
    content: RESEARCH_RESULT_TO_CLAIM,
  },
  {
    name: 'research-paper-drafting',
    description: 'Draft the LaTeX paper section by section with an immediate latex_compile loop and evidence discipline (supported claims only). Use when the user says "写论文", "draft paper", "逐节写", or wants a checkpointed alternative to the paper-write command.',
    whenToUse: 'Writing or revising the paper deliberately, section by section, with compiles between.',
    content: RESEARCH_PAPER_DRAFTING,
  },
  {
    name: 'research-citation-audit',
    description: 'Zero-trust bibliography audit: verify every .bib entry exists via live search and every citation sentence is earned. Use when the user says "审查引用", "citation audit", "核对参考文献", or before submission.',
    whenToUse: 'Before submission, or whenever bibliography integrity is in doubt.',
    content: RESEARCH_CITATION_AUDIT,
  },
  {
    name: 'research-rebuttal',
    description: 'Draft a grounded, venue-limited rebuttal: parse reviews into atomic concerns, triage by evidence, answer response-first without new unsupported claims. Use when the user says "rebuttal", "回复审稿", "OpenReview response", or reviews arrive.',
    whenToUse: 'External reviews have arrived and need a safe, evidence-bound response.',
    content: RESEARCH_REBUTTAL,
  },
  {
    name: 'research-figure-plan',
    description: 'Design claim-carrying figures, produce them reproducibly, and file them through figure_save so the Figures tab and the paper stay in sync. Use when the user says "画图", "figure plan", "论文配图", or a paper needs its figures designed.',
    whenToUse: 'A paper or report needs figures planned, produced, and registered in the workbench.',
    content: RESEARCH_FIGURE_PLAN,
  },
  {
    name: 'research-meeting-deck',
    description: 'Generate a group-meeting (组会) deck that actually shows paper figures: either run the bundled academic-Group-meeting-skills pipeline (pdftoppm shim + paper_figures_to_ppt.py) for a figure-by-figure paper walkthrough, or call the meeting_deck tool for a whole-project report with per-figure slides. Use when the user says "组会", "组会汇报", "meeting deck", "group meeting slides", or a lab meeting is coming.',
    whenToUse: 'A group meeting is coming and the user wants a slide deck with real paper figures, generated end-to-end.',
    content: RESEARCH_MEETING_DECK,
  },
]

/**
 * Register the bundled skills into the composition's skill registry when one
 * is mounted. The `skills` service is deliberately NOT in the plugin's
 * `inject`: compositions without a skill registry (a bare CLI pipeline, a
 * minimal embed) still load the full suite, and registration simply never
 * happens there. `ctx.inject` fires the callback as soon as the registry
 * arrives and scopes the registrations to that child context, so teardown
 * order rides the normal effect stack. Same-name project skills outrank
 * these runtime entries (rank 250), so users can override any bundled
 * playbook from their project roots.
 * @param ctx - the plugin's context.
 */
export function registerResearchSkills(ctx: Context): void {
  ctx.inject(['skills'], (skillsCtx: Context) => {
    for (const skill of BUNDLED_SKILLS) {
      skillsCtx.skills.register({
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse,
        content: skill.content,
        source: 'bundled',
      })
    }
  })
}
