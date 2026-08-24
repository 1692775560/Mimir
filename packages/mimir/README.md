# Mimir (dsh-mimir)

English | [中文](README.zh.md)

Mimir is the research-assistant plugin suite for the DeepSeek Harness: an arXiv literature surface, a persistent research wiki, a LaTeX compile tool, and an independent fresh-reviewer loop. It ports the ARIS workflow mechanisms (failed-ideas memory, reviewer independence, compile-driven writing) into one dsh plugin.

## Plugin

Function plugin (`name`/`inject`/`Config`/`apply`). Injects `commands`, `tools`, `subagents`, `storageDomain`, and `webServer`, so a composition must also mount the storage hub, one KV backend, the domain form, and — for the web panel's PDF route — the HTTP carrier (see `examples/mimir-agent/`).

## Web research panel

The plugin also mounts the `research` Remote namespace (`ResearchService`) plus the `/research/pdf/<project id>` and `/research/figure/<project id>?path=<rel path>` prefix routes, which back the web research workbench (`dsh-client-ui-mimir`): project list from the wiki's `projects` table, the section outline, source read/replace for the panel's editor, latexmk/tectonic compile with parsed issues, the compiled PDF stream, the literature list (`listPapers`), the arXiv keyword subscriptions (`listArxivSubscriptions` / `saveArxivSubscription` / `deleteArxivSubscription` / `checkArxivSubscriptions` — persisted as `<workspaceDir>/arxiv-subscriptions.json` outside the wiki domain, re-checked on a scheduled daily timer and on demand, new entries surfaced to the panel for one-click import), the experiment-run list (`listExperiments`), whitelisted markdown artifact reads (`readArtifact` — `IDEA_REPORT.md`, `EXPERIMENT_PLAN.md`, `EXPERIMENT_LOG.md`, `REVIEW_REPORT.md`; any other name is an `invalid-artifact` failure, a missing file an `artifact-not-found`), and the paper directory's figure scan (`listFigures` — `.png`/`.jpg`/`.jpeg`/`.svg`/`.pdf` files at the top level and one `figures/` level deep), plus `deleteFigure` and `convertFigure` (host-side SVG → PDF conversion — PNG via the platform rasterizer as the fallback — for the workbench's insert-into-paper flow, probing `rsvg-convert`/`inkscape`/`magick` on PATH and `qlmanage` on macOS). Backup and migration go through `exportWiki` / `importWiki`: the export snapshots all six wiki tables into one dated JSON envelope (`format: "mimir-wiki"`, `version: 2`); the import revalidates the envelope and every row against its table's zod schema before any write, `merge` upserts only absent primary keys (existing records are skipped, never overwritten), and `replace` wipes all six tables first, so it requires `confirmReplace: true`. The figure route serves one scanned file by workspace-relative path; a non-image extension or a `..` escape is a 400, an unknown project or file a 404. Each project can point at its own paper directory: the record's optional `paperDir` (set via the `wiki_note` tool's `set_project` action) names a subdirectory of the workspace, and every paper call also accepts an explicit `dir` override (`?dir=` on the routes); the candidate must be a relative path confined inside the workspace — an absolute path or a `..` escape is an `invalid-dir` failure (400 on the route). `savePaperSource` replaces `main.tex` under optimistic concurrency — the caller's base mtime is re-checked and the atomic commit runs inside the `@deepseek-ai/dsh-atomic-write` writer lock, so an agent writing through the file tools can never interleave a check-then-write; a displaced draft gets a `conflict` reply carrying the current mtime. Compile status is process memory keyed by project id; both routes 404 unknown projects. A composition without `webServer` (e.g. the TUI) cannot mount the suite — inject is all-or-nothing.

## Config

```yaml
- id: mimir
  name: 'dsh-mimir'
  config:
    workspaceDir: .research        # research workspace root, resolved against the process cwd
    reviewer:
      provider: spawn              # subagent provider route; reserved for cross-model review
      maxRounds: 3                 # per-project review-round budget
    latex:
      engine: auto                 # auto (probe latexmk then tectonic on PATH), an engine name, or an absolute binary path (basename picks the dialect)
      timeoutMs: 120000            # compile kill timeout
    arxiv:
      maxResults: 10               # default arxiv_search result cap
```

## Tools

- `arxiv_search { query, max_results? }` → `{ results: [{ id, title, authors, summary, published, url }] }` from the arXiv Atom API. Network and HTTP failures reject.
- `paper_fetch { arxiv_id }` → one paper record by bare id (version suffix allowed).
- `wiki_note { action, ... }` → the model's read/write surface over the wiki domain. Actions: `add_paper`, `add_idea`, `fail_idea`, `add_claim`, `set_claim`, `add_experiment`, `set_experiment`, `list`, `get`.
- `latex_compile { project_dir }` → `{ success, engine, errors, warnings, log_excerpt }`; runs the resolved engine in `project_dir` — `latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex` or `tectonic --keep-logs --synctex main.tex` — and parses the log into file/line-attributed diagnostics (tectonic's `--keep-logs` `main.log` when present, else its `error:`/`warning:` console lines).

## Commands

- `/research-idea <direction>` — registers a project, scaffolds `IDEA_REPORT.md`, and instructs the model to survey arXiv, check failed ideas first, and record the idea.
- `/research-plan [project id]` — scaffolds `EXPERIMENT_PLAN.md` from the idea report; planned claims become pending wiki claims.
- `/research-review <scope> <paths...> [project id]` — one independent review round: a fresh reviewer subagent gets only absolute file paths (never the executor's summary) and returns a schema-validated PASS/WARN/FAIL verdict. WARN/FAIL is handed back to the agent as a revision follow-up.
- `/paper-write [project id]` — scaffolds `paper/main.tex` + `references.bib` and instructs the model to draft and compile-fix until clean.
- `/paper-compile [dir]` — compiles once (default `<workspace>/paper`) and reports parsed diagnostics.

## Storage

The wiki is the `research_wiki` domain (version 2) over the configured storage-domain backend, with five tables: `papers` (keyed by arXiv id), `ideas` (failed ideas are never deleted — this is the anti-repetition memory), `claims`, `projects` (pipeline stage, artifacts, reviewRounds), and `experiments` (run records: name, status, scalar metrics, optional log path). The plugin closes the domain on unmount.

## Templates

`templates/` carries the artifact skeletons (`IDEA_REPORT.md`, `EXPERIMENT_PLAN.md`, `paper/main.tex`, `paper/references.bib`). The runtime source of these bytes is `src/templates.ts`; the directory exists for human reference and is not read at runtime.

## Model Experience

### Tool schemas and command instructions

#### What the model sees

Four tool schemas (`arxiv_search`, `paper_fetch`, `wiki_note`, `latex_compile`) in the tool catalog, plus structured follow-up instructions when a `/research-*` command runs.

#### Token effect

Conditional: tool schemas are present whenever the plugin is mounted; command instructions appear only after the corresponding slash command.

#### KV Cache effect

Append-only: follow-up instructions extend the conversation without replacing earlier request content.

## Known Limitations and Deferred Work

- **No real end-to-end coverage yet** — the suite is verified by unit tests (log parser, wiki domain) and composition loading; a live-model example run requires `DEEPSEEK_API_KEY` and a TeX installation, neither of which is assumed present.
- **LaTeX log parsing is single-line based** — the classical 79-column log wrap is not re-joined, so a wrapped message keeps its first line only.
- **Reviewer provider is deployment-selected but not cross-model** — `reviewer.provider` picks a registered subagent route; routing a different model family to the reviewer is the provider's own configuration concern.
