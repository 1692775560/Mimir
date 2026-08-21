# Mimir

[![CI](https://github.com/1692775560/Mimir/actions/workflows/ci.yml/badge.svg)](https://github.com/1692775560/Mimir/actions/workflows/ci.yml)

English | [中文](README.zh.md)

**Mimir is a research-lifecycle plugin suite for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): arXiv literature search, a persistent research wiki, independent subagent review, and a closed LaTeX writing → compile → preview loop — plus a full web workbench.**

![Paper workbench: outline, source editor, compiled PDF preview](docs/screenshots/tab-paper-compiled.png)

## Features

**Five slash commands**

| Command | What it does |
| --- | --- |
| `/research-idea <direction>` | Registers a project, scaffolds `IDEA_REPORT.md`, surveys arXiv, records the idea |
| `/research-plan [project]` | Scaffolds `EXPERIMENT_PLAN.md`; planned claims become pending wiki claims |
| `/research-review <scope> <files...>` | Independent fresh-reviewer rounds over an artifact (plan / paper), capped per project |
| `/paper-write [project]` | Scaffolds the `main.tex` skeleton and drives drafting to a clean compile |
| `/paper-compile [dir]` | Direct compile report over the same engine path as the tool |

**Four agent tools**

| Tool | Purpose |
| --- | --- |
| `arxiv_search` / `paper_fetch` | arXiv Atom API search and single-paper fetch |
| `wiki_note` | Read/write surface over the research wiki domain (papers, ideas, claims, experiments, projects) |
| `latex_compile` | Compiles `main.tex` with parsed file/line diagnostics; multi-engine: `latexmk` or `tectonic` (auto-detected, or an explicit binary path) |

**Web workbench (six views)** — a sidebar toggle opens a 96vw×95vh overlay:

- **Overview** — pipeline stage progress, stat chips, artifact list, and a data card that exports/imports the whole wiki as one dated JSON snapshot (merge skips existing keys; replace arms a red second confirm).
- **Paper** — outline rail with drag-to-reorder sections, autosaving `main.tex` editor with LaTeX syntax highlighting, one-click compile, click-to-jump error list, inline PDF preview, and a `references.bib` panel; resizable panes, fullscreen, persisted layout.
- **Library** — remembered papers with editable tags and per-project links, a tag/current-project filter bar, in-panel arXiv search with one-click import, and add-to-`references.bib` per card.
- **Experiments** — run records with metric-comparison bar charts (inline SVG), expandable metrics, linked-server badges with inline relink, and a rendered `EXPERIMENT_LOG.md`.
- **Figures** — paper-directory image grid with preview, upload (button or drag-and-drop), delete, and copy-LaTeX-reference actions.
- **Servers** — remembered GPU boxes: TCP reachability probe plus a best-effort SSH `nvidia-smi` readout with utilization/memory bars and tag filters.

Dark/light theme and 中/EN language toggles live in the panel header; keyboard shortcuts: `1–6` switch views, `Esc` closes, `⌘/Ctrl+Enter` compiles. Narrow windows degrade gracefully (below 900px the paper view goes single-column; below 700px the rail becomes a top strip).

| Dark mode: overview | Dark mode: paper | Paper: narrow-width tab layout |
| --- | --- | --- |
| ![Dark mode: overview](docs/screenshots/dark-overview.png) | ![Dark mode: paper](docs/screenshots/dark-paper.png) | ![Paper: narrow-width tab layout](docs/screenshots/narrow-paper.png) |

## Quickstart

> **Status:** `dsh-mimir` / `dsh-client-ui-mimir` are not on npm yet (publication planned); the only install path today is building this repository from source.

### Prerequisites

- **Node.js** — no `engines` constraint is declared; developed and verified on Node v24.
- **pnpm** — verified on v11.18.
- **dsh CLI** — published on npm:
  ```sh
  npm install -g @deepseek-ai/dsh
  ```
- **`DEEPSEEK_API_KEY`** — required for agent sessions (export it, or put it in dsh's `.env`).
- **A LaTeX engine** — only for paper compilation: `latexmk` or `tectonic` on PATH. Tectonic is a single binary and the easiest to install:
  ```sh
  brew install tectonic        # macOS; see https://tectonic-typesetting.github.io for others
  ```
- **arXiv access** — literature search calls `export.arxiv.org`; behind a proxy, export `HTTPS_PROXY` before starting dsh.

### 1. Clone and build

```sh
git clone https://github.com/1692775560/Mimir.git
cd Mimir
pnpm install
pnpm run build
pnpm test          # optional sanity check: vitest, both packages
```

### 2. Install the plugin into the web profile

dsh resolves patch plugin names from the profile directory (`~/.dsh/profiles/web`), **not** from the current directory — so link the built package into the profile (the profile directory is created on dsh's first run):

```sh
dsh plugin --profile web add "$PWD/packages/mimir"
```

### 3. Start the example

```sh
dsh web --patch "$PWD/examples/mimir-agent/cordis.yml"
```

Then open http://127.0.0.1:3080. The wiki persists at `~/.dsh/storages/research_wiki.json`; research artifacts land in the workspace directory (default `./.research` under the directory you started dsh from).

### 4. First session

In a dsh session (web UI or TUI with the same patch):

```
/research-idea efficient long-context retrieval for code agents
/research-plan
/research-review plan EXPERIMENT_PLAN.md
/paper-write
/paper-compile
```

### 5. The web workbench

The six-view workbench ships as `dsh-client-ui-mimir` (`packages/ui-mimir`). One honest caveat: **the published dsh web composition predates Mimir** — it neither loads the client plugin nor mounts the `research` Remote namespace, so a cordis patch alone does not put the Mimir button in the sidebar. Mounting the panel today requires a dsh source checkout with the client plugin registered and the Remote assembly one-liner from [Known limitations](#known-limitations) applied. Everything agent-side — the slash commands, tools, wiki, reviewer loop, and the `/research/*` routes — works through the patch alone.

## Usage guide

Longer actions — compiles, imports, probe-alls, deletions, uploads — end with a small toast card in the workbench's bottom-right corner (green/blue/red accent by outcome, auto-dismissing after a few seconds, × for early dismissal).

### Overview

The landing view: the selected project's five-stage pipeline progress, stat chips (papers / experiments / figures / servers), the artifact list, and timestamps. The **data card** shows the scheduled-backup status (cadence, keep cap, on-disk count) and exports the entire wiki as one dated JSON snapshot (`mimir-wiki-<date>.json`) for backup or migration, and imports one back: pick a file (an auto-backup from `<workspaceDir>/backups/` works as-is), review the per-table row counts, then choose merge (existing keys are skipped, never overwritten) or replace (wipes all six tables — a red second confirm guards it). A successful import refreshes every loaded view and reports the imported/skipped totals in a toast.

| Overview | Overview: wiki export/import |
| --- | --- |
| ![Overview](docs/screenshots/tab-overview.png) | ![Overview: wiki export/import](docs/screenshots/tab-overview-data.png) |

### Paper

An Overleaf-style editor for the project's paper directory: a collapsible outline whose top-level sections drag-reorder via row grips (rewriting `main.tex`'s `\section` order), an autosaving `main.tex` editor (~800 ms debounce, optimistic concurrency — a displaced draft freezes and offers reload) with LaTeX syntax highlighting and synced line numbers, one-click compile with the engine labeled, an error list whose entries jump the editor to the source line, an inline PDF preview, and a bibliography panel over `references.bib` (delete entries, conflict-safe saves, append checked library papers). Saving an untouched draft auto-compiles after ~1.5 s. Drag handles resize the three panes (widths persist); editor and preview go fullscreen on one click. `⌘/Ctrl+Enter` compiles.

| Paper: syntax highlighting | Paper: compile issues | Paper: click-to-jump |
| --- | --- | --- |
| ![Paper: syntax highlighting](docs/screenshots/tab-paper-highlight.png) | ![Paper: compile issues](docs/screenshots/tab-paper-issues.png) | ![Paper: click-to-jump](docs/screenshots/tab-paper-issue-jump.png) |

| Paper: bibliography panel | Paper: editor fullscreen |
| --- | --- |
| ![Paper: bibliography panel](docs/screenshots/tab-paper-bib.png) | ![Paper: editor fullscreen](docs/screenshots/tab-paper-fullscreen.png) |

### Library

Every remembered paper as a card grid (summaries collapse to three lines): editable tags, per-project links, a tag/current-project filter bar, and in-panel arXiv search — one click imports a result into the wiki, another appends it to the project's `references.bib`.

| Library | Library: tags | Library: arXiv search |
| --- | --- | --- |
| ![Library](docs/screenshots/tab-papers.png) | ![Library: tags](docs/screenshots/tab-papers-tags.png) | ![Library: arXiv search](docs/screenshots/tab-papers-search.png) |

### Experiments

Run records from the wiki: a status pill per row, metric-comparison bar charts for numeric metrics shared by ≥2 runs, per-run expandable metrics, a linked-server badge with an inline relink dropdown, and row delete. Below the table, `EXPERIMENT_LOG.md` renders with the built-in restricted Markdown renderer (headings, emphasis, code, fences, lists, quotes, rules, tables, links — non-http(s) URLs are neutralized to plain text).

| Experiments |
| --- |
| ![Experiments](docs/screenshots/tab-experiments.png) |

### Figures

The paper directory's images as a grid: click to zoom, copy a ready-made LaTeX `\includegraphics` snippet, upload via the toolbar button — or just drop image files anywhere on the view (a dashed overlay shows while hovering; unsupported types are named, not silently ignored) — and delete what you no longer need. Refresh forces a rescan.

| Figures | Figures: drag-and-drop upload |
| --- | --- |
| ![Figures](docs/screenshots/tab-figures.png) | ![Figures: drag-and-drop upload](docs/screenshots/tab-figures-drop.png) |

### Servers

Remembered GPU boxes: add/edit/delete, one-click TCP reachability probe, and a best-effort SSH `nvidia-smi` readout with per-GPU utilization and memory bars. Tag chips on the cards and a filter bar above the grid keep large fleets navigable.

| Servers |
| --- |
| ![Servers](docs/screenshots/tab-servers.png) |

### Slash commands in practice

A typical loop inside a dsh session:

```
/research-idea efficient long-context retrieval for code agents
```

Registers a project in the wiki, scaffolds `IDEA_REPORT.md` in the workspace, surveys arXiv for the direction, and records the idea — failed ideas are never deleted, so retreading a dead end is flagged instead of repeated.

```
/research-plan
/research-review plan EXPERIMENT_PLAN.md
```

`research-plan` scaffolds `EXPERIMENT_PLAN.md` and registers the planned claims as pending wiki claims. `research-review` starts a **fresh reviewer subagent** that receives only the listed file paths — never the executor's summary — and returns a schema-validated PASS/WARN/FAIL verdict; WARN/FAIL is handed back to the agent as a revision follow-up, capped at `reviewer.maxRounds` rounds per project (default 3).

```
/paper-write
/paper-compile
```

`paper-write` scaffolds the `main.tex` skeleton and drafts to a clean compile; `paper-compile` runs one compile and reports parsed errors/warnings directly.

### Agent tools in practice

The agent reaches the same capabilities mid-conversation:

- `arxiv_search` — "search arXiv for recent whole-body mesh recovery papers" (default cap `arxiv.maxResults`).
- `paper_fetch` — fetch one paper's metadata by arXiv id.
- `wiki_note` — the wiki's read/write surface, one flat parameter set keyed by `action`: `add_paper`, `add_idea`, `fail_idea`, `add_claim`, `set_claim`, `set_project` (points a project at its paper directory), `add_experiment`, `set_experiment` (status `running`/`success`/`failed`), plus `list` and `get` over the five tables.
- `latex_compile` — "compile the paper in `paper/`" (`project_dir` parameter); returns parsed file/line diagnostics.

## Configuration reference

All keys are optional; these are the defaults from `packages/mimir/src/index.ts`:

| Key | Default | Meaning |
| --- | --- | --- |
| `workspaceDir` | `.research` | Research workspace root, resolved against the process cwd; must be a non-empty path |
| `reviewer.provider` | `spawn` | Subagent provider route for review rounds |
| `reviewer.maxRounds` | `3` | Per-project review-round budget (positive integer) |
| `latex.engine` | `auto` | `auto` (probe `latexmk` then `tectonic` on PATH), an engine name, or an absolute binary path (basename picks the dialect) |
| `latex.timeoutMs` | `120000` | Compile kill timeout (ms); raise it for tectonic's first network fetch |
| `arxiv.maxResults` | `10` | Default `arxiv_search` result cap |
| `backup.enabled` | `true` | Scheduled wiki backup timer; `false` disables it entirely |
| `backup.intervalMinutes` | `60` | Backup cadence in minutes (positive integer); the first pass runs one minute after plugin start |
| `backup.keep` | `24` | Keep the newest N backups, prune the rest (positive integer) |
| `backup.dir` | `backups` | Backup directory, resolved against `workspaceDir` unless absolute |

Full example with comments: [examples/mimir-agent/cordis.yml](examples/mimir-agent/cordis.yml).

## Troubleshooting

- **`dsh: plugin tree failed to load … Cannot find package 'dsh-mimir'`** — the patch resolves plugin names from the profile directory, not your cwd. Run the [install step](#2-install-the-plugin-into-the-web-profile): `dsh plugin --profile web add <repo>/packages/mimir`.
- **`pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`** — pnpm ≥ 11.18 requires explicit build-script approval; this repository's `pnpm-workspace.yaml` already pins `allowBuilds` for `esbuild`, so a fresh checkout is fine. If you add dependencies that ship build scripts (e.g. the dsh CLI as a dev dependency), approve them in the same `allowBuilds` map.
- **LaTeX engine not found** — install tectonic (single binary): `brew install tectonic` on macOS, or see <https://tectonic-typesetting.github.io>. Alternatively point `latex.engine` at an absolute binary path. `engine: auto` probes `latexmk` first, then `tectonic`.
- **Compile errors** — `/paper-compile` prints parsed file/line diagnostics; in the workbench's Paper view, clicking an error jumps the editor to that source line. First tectonic runs download packages over the network — raise `latex.timeoutMs` if the initial compile times out.
- **arXiv search fails** — the tools call `export.arxiv.org`; check connectivity, and export `HTTPS_PROXY`/`HTTP_PROXY` before starting dsh when you are behind a proxy.
- **Where is my data / how do I back it up** — the wiki lives at `~/.dsh/storages/research_wiki.json`, research artifacts under `workspaceDir` (default `./.research`). Two backup tracks: the host writes a full snapshot to `<workspaceDir>/backups/mimir-wiki-<UTC timestamp>.json` every `backup.intervalMinutes` (keeps the newest `backup.keep`, atomic writes, failures only warn and retry next cycle), and the Overview view's data card exports the same snapshot manually on demand. Both files import back through the data card (merge is non-destructive) — to restore from an auto-backup, pick the file under `backups/` in the import flow.

## Known limitations

- **The workbench's Remote namespace must be mounted by the client's Remote assembly.** dsh's published `@deepseek-ai/dsh-api-remotes` predates Mimir and does not mount the `research` namespace; add Mimir's generated contribution to your assembly (one line):

  ```ts
  import researchRemote from 'dsh-mimir/remote'
  // inside the assembly's apply(), alongside the other contributions:
  disposers.push(await ctx.remote.$mount(researchRemote))
  ```

  The client plugin (`dsh-client-ui-mimir`) must likewise be registered in the web composition. This is a dsh-side design constraint (the assembly is an explicit allowlist), not a Mimir defect — see [Quickstart §5](#5-the-web-workbench).
- **Compile status is host process memory** — a host restart forgets the last result; the panel shows `idle` until the next compile even if a previously built `main.pdf` is still on disk.
- **No live push** — the panel neither polls nor subscribes; compiles started elsewhere (`/paper-compile` or the tool) become visible on the next selection or compile.

## Development

```sh
pnpm install
pnpm run build       # ordered pipeline: mimir typecheck → mimir bundle (emits the
                     # typert artifacts ui-mimir typechecks against) → ui-mimir
pnpm test            # vitest, both packages
pnpm run typecheck   # tsc -b both packages; assumes a prior build (ui-mimir
                     # imports the generated dsh-mimir/remote declarations)
```

Layout:

- `packages/mimir` — the host plugin (`dsh-mimir`): commands, tools, wiki domain, reviewer loop, LaTeX compile, BibTeX management, the `research` Remote namespace (27 methods), and the `/research/pdf` / `/research/figure` / `/research/figure-upload` routes.
- `packages/ui-mimir` — the browser workbench (`dsh-client-ui-mimir`): sidebar toggle + overlay panel.
- `packages/typert-protocol` — vendored, never-published source copy of the Typert protocol (see below).
- `examples/mimir-agent` — the cordis patch used in the Quickstart.

Build artifacts: `packages/mimir/lib/{index.js, invariant.js, typert.host.js, typert.remote-client.js, types/}` and `packages/ui-mimir/lib/{index.js, invariant.js, client.js, types/}`.

`packages/ui-mimir/scripts/screenshot.ts` is a QA harness (not part of the test suite): against a running `dsh web` instance with the plugin mounted, it captures one PNG per workbench tab into `/tmp/research-ui/`. It requires a local Playwright installation; adjust the import/`CHROMIUM` path at the top of the file.

Contributing: branch off `main` (`feature/<name>` or `fix/<name>`), keep `pnpm run build && pnpm test && pnpm run typecheck` green, and open a PR.

### Repository notes

- `packages/typert-protocol` is a **vendored, never-published** source copy of `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.8`: the Typert generator only recognizes `Remote` metadata declared inside a workspace-registered package, so the protocol must compile in-repo. Runtime consumers still resolve the npm release.
- Typert generation runs in **contributor-filtered workspace mode** (`mode: 'workspace'` in `packages/mimir/tsdown.config.ts`): only packages exposing a `./typert`/`./remote` entry — dsh-mimir alone — are modeled. The default package mode analyzes the vendored protocol too, which fails on Typert map interfaces augmented by npm releases (session/agent stay npm externals precisely so their types are never expanded).
- `build/client-preset/` vendors the dsh client-bundle tsdown preset (closure-factory browser artifact + lightningcss pipeline), slimmed to what this repository builds.

## Acknowledgments

- Workflow inspiration: [ARIS / Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
- Built on the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin platform (Cordis, Typert, the client module system).

## License

[MIT](LICENSE)
