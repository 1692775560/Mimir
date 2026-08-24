<div align="center">

<img src="docs/media/mimir-cover.png" alt="Mimir — open-source AI research workspace" width="720">

<h1>Mimir</h1>

<p><strong>The research-lifecycle copilot inside <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>:</strong><br>
arXiv literature · persistent research wiki · experiments &amp; remote GPUs · figures · LaTeX writing → compile → preview — one workbench, driven by your agent.</p>

<p>
<a href="https://github.com/1692775560/dsh-Mimir-Academic-research/actions/workflows/ci.yml"><img src="https://github.com/1692775560/dsh-Mimir-Academic-research/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://www.npmjs.com/package/dsh-mimir"><img src="https://img.shields.io/npm/v/dsh-mimir?label=dsh-mimir" alt="npm: dsh-mimir"></a>
<a href="https://www.npmjs.com/package/dsh-client-ui-mimir"><img src="https://img.shields.io/npm/v/dsh-client-ui-mimir?label=dsh-client-ui-mimir" alt="npm: dsh-client-ui-mimir"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p><strong>English</strong> · <a href="README.zh.md">中文</a></p>

<p><a href="#video-demo">Demo</a> · <a href="#quickstart">Quickstart</a> · <a href="#features">Features</a> · <a href="#usage-guide">Usage guide</a> · <a href="#changelog">Changelog</a></p>

</div>

## Video demo

[![Watch the Mimir product demo](docs/media/mimir-demo-preview.gif)](https://raw.githubusercontent.com/1692775560/dsh-Mimir-Academic-research/main/docs/media/mimir-demo.mp4)

▶ **[Play or download the complete MP4 demo](https://raw.githubusercontent.com/1692775560/dsh-Mimir-Academic-research/main/docs/media/mimir-demo.mp4)** (22 MB) — AI-assisted research, literature management, experiments, figure archiving, and paper writing, with smooth zooms that highlight each workflow.

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

**Five agent tools**

| Tool | Purpose |
| --- | --- |
| `arxiv_search` / `paper_fetch` | arXiv search; selected-paper fetch automatically archives and links it |
| `web_search` | Optional SearXNG web search through the `sxng` CLI (auto-registered when the CLI is on PATH); complements arXiv with non-arXiv sources |
| `wiki_note` | Read/write surface over the research wiki domain (papers, ideas, claims, experiments, projects) |
| `figure_save` | Copies a generated figure (any path) into the project's paper `figures/`, records caption/linked-experiment metadata in the wiki, and returns a ready-to-paste LaTeX figure block (SVG sources are auto-converted to PDF — PNG as the raster fallback — when a converter is available) |
| `latex_compile` | Compiles `main.tex` with parsed file/line diagnostics; multi-engine: `latexmk` or `tectonic` (auto-detected, or an explicit binary path) |

**Nine bundled research skills**

When the host composition mounts a skill registry (the shipped web profile does), Mimir registers nine workflow playbooks into the agent's skill catalog — no setup needed. They encode the research methodology (what to persist in the wiki, which gate comes next) and drive the tools and commands above. A project-level skill with the same name overrides the bundled one, so teams can replace any playbook with their own.

| Skill | Playbook |
| --- | --- |
| `research-pipeline` | End-to-end orchestration: ideation → novelty gate → literature → plan → experiments → claim gate → writing → review |
| `research-lit-review` | Curated, noted literature base in the wiki via `arxiv_search` + `paper_fetch`; Zotero import and arXiv subscriptions when configured |
| `research-novelty-check` | Verdict-bearing novelty gate — live searches from mechanism / application / result angles before any compute is spent |
| `research-experiment-plan` | Claim-mapped run order with budgets, wiki experiment records, and Servers-tab feasibility |
| `research-result-to-claim` | Post-experiment gate: which claims the results support / invalidate / leave pending, with the settling run named |
| `research-paper-drafting` | Section-by-section LaTeX drafting with an immediate compile loop and supported-claims-only discipline |
| `research-citation-audit` | Zero-trust bibliography audit: every .bib entry verified against live search, every citation earned |
| `research-rebuttal` | Grounded, venue-limited rebuttal drafting from parsed reviewer concerns |
| `research-figure-plan` | Claim-carrying figure design; reproducible production; filing through `figure_save` into the Figures tab |

Disable them with `skills.enabled: false` (see the configuration reference).

### Web workbench — seven views, one overlay

A sidebar toggle opens a 96vw×95vh workbench:

| View | Highlights |
| --- | --- |
| 📊 **Overview** | Five-stage pipeline progress, stat chips, artifact list, recent activity (latest remote jobs + experiment runs), and one-file wiki export/import with guarded replace |
| 📝 **Paper** | Overleaf-style three-pane studio: drag-to-reorder outline, autosaving editor with windowed syntax highlighting (smooth on thousand-line files), one-click compile, click-to-jump issues with a per-issue **Let AI fix** button, inline PDF preview, `references.bib` panel, project name always in view |
| 📚 **Library** | Remembered papers with tags, notes and per-project links, in-panel arXiv **and SearXNG web** search (a tab switch over one search box; web hits whose URL is an arXiv link import in one click), add-to-`references.bib` — and a one-click **related-work draft** that sends the filtered selection to the agent with thematic writing instructions |
| 🧪 **Experiments** | Run records with metric-comparison charts, inline create/edit form, server relink dropdowns, automatic **last-job writeback** when a remote run settles, one-click **paper figure** from any comparison chart, and a rendered `EXPERIMENT_LOG.md` |
| 🖼️ **Figures** | Paper-directory image grid: preview, drag-and-drop upload, copy-LaTeX-reference, insert-into-paper (SVG auto-converts to PDF/PNG on the host); `figure_save` figures show caption + linked-experiment badges |
| 🎞️ **Meetings** | One-click group-meeting deck: pick papers (default = top 12 by AI relevance) and figures, toggle sections, and the host renders a 16:9 pptx deterministically (no agent round-trip) into `meetings/<project>/`; decks list with download/delete |
| 🖥️ **Servers** | GPU fleet cards with TCP probe and SSH `nvidia-smi` readouts (utilization/memory bars, tag filters); submit remote commands as live-polled jobs with expandable output tails and optional experiment linkage |

Dark/light theme and 中/EN toggles live in the panel header. Keyboard-first: `1–7` or arrow keys switch views, `Esc` closes, `⌘/Ctrl+Enter` compiles; the dialog traps focus and every control shows a focus ring. Narrow windows degrade gracefully (below 900px the paper view goes single-column; below 700px the rail becomes a top strip).

| Dark mode: overview | Dark mode: paper | Paper: narrow-width tab layout |
| --- | --- | --- |
| ![Dark mode: overview](docs/screenshots/dark-overview.png) | ![Dark mode: paper](docs/screenshots/dark-paper.png) | ![Paper: narrow-width tab layout](docs/screenshots/narrow-paper.png) |

## Quickstart

Mimir is a single npm package: `dsh-mimir` carries the research commands, tools, wiki, reviewer loop, server APIs, **and** the seven-view Web workbench (shipped as the package's `dsh.client` bundle — installing the host plugin is all it takes; the Web roster row doubles as the browser row). The legacy `dsh-client-ui-mimir` package remains published for existing source integrations, but new installs do not need it.

Check the currently published version at any time:

```sh
npm view dsh-mimir version
```

### Prerequisites

- **Node.js** — v22 or newer; developed and verified on Node v24.
- **pnpm** — verified on v11.18.
- **dsh CLI** — published on npm:
  ```sh
  npm install -g @deepseek-ai/dsh
  dsh --version
  ```
- **`DEEPSEEK_API_KEY`** — required for agent sessions (export it, or put it in dsh's `.env`).
- **A LaTeX engine** — only for paper compilation: `latexmk` or `tectonic` on PATH. Tectonic is a single binary and the easiest to install:
  ```sh
  brew install tectonic        # macOS; see https://tectonic-typesetting.github.io for others
  ```
- **arXiv access** — literature search calls `export.arxiv.org`; behind a proxy, export `HTTPS_PROXY` before starting dsh.
- **A SearXNG deployment + sxng CLI** — only for the optional web search. This is the most involved prerequisite: it means self-hosting SearXNG (docker compose with Valkey, a `settings.yml` enabling JSON output, WSL keep-alive on Windows…) and installing the [sxng-cli](https://github.com/hkwuks/sxng-cli) wrapper. **Follow the full step-by-step setup in the [sxng-cli README](https://github.com/hkwuks/sxng-cli#readme)** — it covers the container stack, the `settings.yml` template (30+ engines), `sxng init`, and health checks. Once `sxng --health` reports healthy, Mimir picks it up automatically: with the default `search.command: auto`, the `web_search` tool and the Library web search register themselves when `sxng` is on PATH.

### 1. Install Mimir

The recommended method is to install the latest host plugin into dsh's `web` profile:

```sh
dsh plugin --profile web add dsh-mimir@latest
```

To add the package directly to an existing Node.js project instead, use npm:

```sh
npm install dsh-mimir@latest
```

### 2. Start Mimir

The repository includes a ready-to-use dsh patch. Clone it and start with the installed npm plugin; no source build is required:

```sh
git clone https://github.com/1692775560/dsh-Mimir-Academic-research.git
cd Mimir
dsh web --patch "$PWD/examples/mimir-agent/cordis.yml"
```

Then open <http://127.0.0.1:3080>. The wiki is stored at `~/.dsh/storages/research_wiki.json` by default. Research artifacts—including papers, generated figures, and experiments—are saved under `./.research` in the directory where dsh was started.

### 3. First session

Try these commands in a dsh session (the Web UI or a TUI using the same patch):

```text
/research-idea efficient long-context retrieval for code agents
/research-plan
/research-review plan EXPERIMENT_PLAN.md
/paper-write
/paper-compile
```

### 4. Upgrade

Install `latest` again to upgrade the host plugin, then restart `dsh web`:

```sh
dsh plugin --profile web add dsh-mimir@latest
npm view dsh-mimir version
```

For packages installed directly in a Node.js project instead, run:

```sh
npm install dsh-mimir@latest
```

### 5. Full Web workbench

Nothing extra to install: since v0.11.0 the workbench ships inside `dsh-mimir` itself (the package declares `dsh.client` and serves its client bundle at `/plugins/dsh-mimir/client.js`). Restart `dsh web` after installing or upgrading, then click **Mimir** in the sidebar footer.

If you previously integrated the standalone `dsh-client-ui-mimir` package into a dsh source checkout, remove its roster row (`ui-mimir`) when you upgrade — keeping both mounts the panel twice. The legacy package stays published and versioned in lockstep for integrations that still reference it.

### 6. Develop from source (optional)

Build from source only when contributing to Mimir or integrating the complete Web workbench:

```sh
git clone https://github.com/1692775560/dsh-Mimir-Academic-research.git
cd Mimir
pnpm install
pnpm run build
pnpm test
```

dsh resolves patch plugin names from the profile directory (`~/.dsh/profiles/web`), not the current directory. Add the local package to the profile when testing a local build:

```sh
dsh plugin --profile web add "$PWD/packages/mimir"
```

## Usage guide

Longer actions — compiles, imports, probe-alls, deletions, uploads — end with a small toast card in the workbench's bottom-right corner (green/blue/red accent by outcome, auto-dismissing after a few seconds, × for early dismissal).

<details>
<summary><strong>📊 Overview</strong> — pipeline progress · recent activity · wiki export/import</summary>

The landing view: the selected project's five-stage pipeline progress, stat chips (papers / experiments / figures / servers), the artifact list, and timestamps. The **recent activity** card lists the five latest remote jobs (command, status pill, relative time) next to the five latest experiment runs. The **data card** shows the scheduled-backup status (cadence, keep cap, on-disk count) and exports the entire wiki as one dated JSON snapshot (`mimir-wiki-<date>.json`) for backup or migration, and imports one back: pick a file (an auto-backup from `<workspaceDir>/backups/` works as-is), review the per-table row counts, then choose merge (existing keys are skipped, never overwritten) or replace (wipes all seven tables — a red second confirm guards it). A successful import refreshes every loaded view and reports the imported/skipped totals in a toast.

| Overview | Overview: wiki export/import |
| --- | --- |
| ![Overview](docs/screenshots/tab-overview.png) | ![Overview: wiki export/import](docs/screenshots/tab-overview-data.png) |

</details>

<details>
<summary><strong>📝 Paper</strong> — Overleaf-style studio · Let AI fix · live PDF preview</summary>

An Overleaf-style editor for the project's paper directory: a collapsible outline whose top-level sections drag-reorder via row grips (rewriting `main.tex`'s `\section` order), an autosaving `main.tex` editor (~800 ms debounce, optimistic concurrency — a displaced draft freezes and offers reload) with LaTeX syntax highlighting and synced line numbers (both windowed to the visible range, so multi-thousand-line papers stay responsive), one-click compile with the engine labeled, an error list whose entries jump the editor to the source line and offer a **Let AI fix** button (assembles the issue, a numbered ±3-line source window, and repair instructions into a prompt for the current session's agent), an inline PDF preview, and a bibliography panel over `references.bib` (delete entries, conflict-safe saves, append checked library papers). The editor head always shows the current project's name — with several projects side by side you can tell at a glance which paper you are editing. Saving an untouched draft auto-compiles after ~1.5 s. Every successful compile also snapshots the paper's `.tex`/`.bib` sources (newest 50 kept per project, under `<workspaceDir>/snapshots/<projectId>/`); the **Snapshots** panel lists them, diffs any snapshot against the current source line by line, and reverts with a confirm — the revert rides the same optimistic-concurrency write as the editor save, so a file the agent touched mid-review rejects instead of silently overwriting. Drag handles resize the three panes (widths persist); editor and preview go fullscreen on one click. `⌘/Ctrl+Enter` compiles.

| Paper: syntax highlighting | Paper: compile issues | Paper: fix with AI | Paper: click-to-jump |
| --- | --- | --- | --- |
| ![Paper: syntax highlighting](docs/screenshots/tab-paper-highlight.png) | ![Paper: compile issues](docs/screenshots/tab-paper-issues.png) | ![Paper: fix with AI](docs/screenshots/tab-paper-aifix.png) | ![Paper: click-to-jump](docs/screenshots/tab-paper-issue-jump.png) |

| Paper: bibliography panel | Paper: editor fullscreen |
| --- | --- |
| ![Paper: bibliography panel](docs/screenshots/tab-paper-bib.png) | ![Paper: editor fullscreen](docs/screenshots/tab-paper-fullscreen.png) |

</details>

<details>
<summary><strong>📚 Library</strong> — arXiv search · notes & tags · related-work drafts</summary>

Every remembered paper as a card grid (summaries collapse to three lines): editable tags, per-project links, a tag/current-project filter bar, and in-panel arXiv search — one click imports a result into the wiki, another appends it to the project's `references.bib`. The toolbar's **related-work draft** button sends the currently filtered selection — titles, abstracts, your notes, and citation keys — to the current session's agent with instructions to organize them thematically into a `\section{Related Work}`, cite exactly those keys, backfill missing entries into `references.bib`, and recompile until clean.

| Library | Library: tags | Library: arXiv search |
| --- | --- | --- |
| ![Library](docs/screenshots/tab-papers.png) | ![Library: tags](docs/screenshots/tab-papers-tags.png) | ![Library: arXiv search](docs/screenshots/tab-papers-search.png) |

</details>

<details>
<summary><strong>🧪 Experiments</strong> — metric charts · job writeback · one-click paper figures</summary>

Run records from the wiki: a status pill per row, metric-comparison bar charts for numeric metrics shared by ≥2 runs, per-run expandable metrics, a linked-server badge with an inline relink dropdown, and row edit/delete. Each comparison chart carries a **generate paper figure** button that renders a standalone vector SVG bar chart, saves it into the paper's `figures/` (registered in the wiki with an auto caption), converts it, and inserts a ready `\begin{figure}` block into `main.tex`. When a linked remote job settles, the row's **last job** badge shows the outcome, duration, and finish time (hover for the log tail), and the same outcome is appended to `EXPERIMENT_LOG.md`. The toolbar's **New experiment** opens an inline form (name, status, a metrics key/value row editor — values that parse as numbers are stored as numbers —, an optional server link) backed by the `saveExperiment` Remote upsert; a row's **Edit** backfills the same form. Below the table, `EXPERIMENT_LOG.md` renders with the built-in restricted Markdown renderer (headings, emphasis, code, fences, lists, quotes, rules, tables, links — non-http(s) URLs are neutralized to plain text).

| Experiments |
| --- |
| ![Experiments](docs/screenshots/tab-experiments.png) |

</details>

<details>
<summary><strong>🖼️ Figures</strong> — image grid · drag-and-drop upload · insert into paper</summary>

The paper directory's images as a grid: click to zoom, copy a ready-made LaTeX `\includegraphics` snippet, upload via the toolbar button — or just drop image files anywhere on the view (a dashed overlay shows while hovering; unsupported types are named, not silently ignored) — and delete what you no longer need. Refresh forces a rescan.

| Figures | Figures: drag-and-drop upload |
| --- | --- |
| ![Figures](docs/screenshots/tab-figures.png) | ![Figures: drag-and-drop upload](docs/screenshots/tab-figures-drop.png) |

</details>

<details>
<summary><strong>🖥️ Servers</strong> — GPU fleet probes · remote jobs · experiment linkage</summary>

Remembered GPU boxes: add/edit/delete, one-click TCP reachability probe, and a best-effort SSH `nvidia-smi` readout with per-GPU utilization and memory bars. Tag chips on the cards and a filter bar above the grid keep large fleets navigable. The **Remote jobs** section below the grid submits a command to any remembered server over SSH (`submitJob` Remote; the run executes in the background with a 30-minute session cap) and polls the job table while anything is queued/running — status pills flip queued → running → succeeded/failed with a toast, output tails expand inline, and a job linked to an experiment of the selected project flips that experiment to running on submit and success/failed on settle.

| Servers |
| --- |
| ![Servers](docs/screenshots/tab-servers.png) |

</details>

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

- `arxiv_search` — "search arXiv for recent whole-body mesh recovery papers" (default cap `arxiv.maxResults`); search results alone do not pollute the library.
- `web_search` — "search the web for the project's official docs and code repositories" (optional; requires the [sxng CLI](https://github.com/hkwuks/sxng-cli) against a self-hosted SearXNG instance). Supports `limit`, `categories`, `lang`, and `time_range`; results are transient and never written to the wiki, though hits whose URL points at an arXiv paper can be imported from the workbench.
- `paper_fetch` — fetch a useful paper by arXiv id and automatically archive its metadata, usefulness notes, and tags. It links to an explicit `project_id`, or the latest active project when omitted. Re-fetching refreshes arXiv metadata without losing existing notes, tags, links, or a downloaded PDF.
- `wiki_note` — the wiki's read/write surface, one flat parameter set keyed by `action`: `add_paper`, `add_idea`, `fail_idea`, `add_claim`, `set_claim`, `set_project` (points a project at its paper directory), `add_experiment`, `set_experiment` (status `running`/`success`/`failed`), plus `list` and `get` over the five tables.
- `latex_compile` — "compile the paper in `paper/`" (`project_dir` parameter); returns parsed file/line diagnostics.

### Bundled skills in practice

The nine bundled skills need no invocation syntax — the agent's skill catalog routes to them from natural requests ("帮我查新一下这个想法", "audit the citations before we submit", "plan the ablations"). They are playbooks, not new capabilities: every step drives the same tools, commands, and wiki tables listed above, so everything a skill does stays visible in the workbench. To override one, drop a same-named `SKILL.md` in your project's skill roots — project entries outrank the bundled runtime ones.

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
| `search.command` | `auto` | Web search CLI: `auto` registers the `web_search` tool and panel search only when `sxng` resolves on PATH; an explicit name/path always registers it |
| `search.timeoutMs` | `30000` | Web search kill timeout (ms) |
| `backup.enabled` | `true` | Scheduled wiki backup timer; `false` disables it entirely |
| `backup.intervalMinutes` | `60` | Backup cadence in minutes (positive integer); the first pass runs one minute after plugin start |
| `backup.keep` | `24` | Keep the newest N backups, prune the rest (positive integer) |
| `backup.dir` | `backups` | Backup directory, resolved against `workspaceDir` unless absolute |
| `skills.enabled` | `true` | Register the nine bundled research skills into the composition's skill registry (when one is mounted); `false` skips registration |

Full example with comments: [examples/mimir-agent/cordis.yml](examples/mimir-agent/cordis.yml).

## Troubleshooting

- **`dsh: plugin tree failed to load … Cannot find package 'dsh-mimir'`** — the patch resolves plugin names from the profile directory, not your cwd. Run the [install step](#2-install-the-plugin-into-the-web-profile): `dsh plugin --profile web add <repo>/packages/mimir`.
- **`pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`** — pnpm ≥ 11.18 requires explicit build-script approval; this repository's `pnpm-workspace.yaml` already pins `allowBuilds` for `esbuild`, so a fresh checkout is fine. If you add dependencies that ship build scripts (e.g. the dsh CLI as a dev dependency), approve them in the same `allowBuilds` map.
- **LaTeX engine not found** — install tectonic (single binary): `brew install tectonic` on macOS, or see <https://tectonic-typesetting.github.io>. Alternatively point `latex.engine` at an absolute binary path. `engine: auto` probes `latexmk` first, then `tectonic`.
- **Compile errors** — `/paper-compile` prints parsed file/line diagnostics; in the workbench's Paper view, clicking an error jumps the editor to that source line. First tectonic runs download packages over the network — raise `latex.timeoutMs` if the initial compile times out.
- **arXiv search fails** — the tools call `export.arxiv.org`; check connectivity, and export `HTTPS_PROXY`/`HTTP_PROXY` before starting dsh when you are behind a proxy.
- **`web_search` unavailable / panel web search errors** — install the sxng CLI (`npm install -g sxng-cli`), run `sxng init` against a self-hosted SearXNG instance, and restart dsh. With `search.command: auto` the tool appears only when `sxng` is on PATH; the Library view's Web tab reports setup guidance when the host has none configured.
- **Where is my data / how do I back it up** — the wiki lives at `~/.dsh/storages/research_wiki.json`, research artifacts under `workspaceDir` (default `./.research`). Two backup tracks: the host writes a full snapshot to `<workspaceDir>/backups/mimir-wiki-<UTC timestamp>.json` every `backup.intervalMinutes` (keeps the newest `backup.keep`, atomic writes, failures only warn and retry next cycle), and the Overview view's data card exports the same snapshot manually on demand. Both files import back through the data card (merge is non-destructive) — to restore from an auto-backup, pick the file under `backups/` in the import flow.

## Known limitations

- **The workbench's Remote namespace must be mounted by the client's Remote assembly.** dsh's published `@deepseek-ai/dsh-api-remotes` predates Mimir and does not mount the `research` namespace; add Mimir's generated contribution to your assembly (one line):

  ```ts
  import researchRemote from 'dsh-mimir/remote'
  // inside the assembly's apply(), alongside the other contributions:
  disposers.push(await ctx.remote.$mount(researchRemote))
  ```

  The Remote assembly line is the only wiring left: the client bundle itself ships inside `dsh-mimir` since v0.11.0, so no separate client package needs registering.
- **Compile status is host process memory** — a host restart forgets the last result; the panel shows `idle` until the next compile even if a previously built `main.pdf` is still on disk.
- **No live push** — the panel neither polls nor subscribes; compiles started elsewhere (`/paper-compile` or the tool) become visible on the next selection or compile.

## Development

```sh
pnpm install
pnpm run build       # ordered pipeline: mimir typecheck → mimir bundle (emits the
                     # typert artifacts ui-mimir typechecks against) → ui-mimir
                     # typecheck+bundle → mimir client bundle (the workbench,
                     # built from ui-mimir's compiled client entry)
pnpm test            # vitest, both packages
pnpm run typecheck   # tsc -b both packages; assumes a prior build (ui-mimir
                     # imports the generated dsh-mimir/remote declarations)
```

Layout:

- `packages/mimir` — the host plugin (`dsh-mimir`): commands, tools, wiki domain, reviewer loop, LaTeX compile, BibTeX management, paper snapshots, arXiv keyword subscriptions with scheduled new-paper checks, venue templates, the `research` Remote namespace (55 methods), the `/research/pdf` / `/research/paper-pdf` / `/research/figure` / `/research/figure-upload` / `/research/template-upload` routes, **and the bundled Web workbench** (`lib/client.js`, built from ui-mimir's client entry, served under the package's own `dsh.client` declaration).
- `packages/ui-mimir` — the browser workbench sources; also still published as the legacy standalone `dsh-client-ui-mimir` for existing integrations.
- `packages/typert-protocol` — vendored, never-published source copy of the Typert protocol (see below).
- `examples/mimir-agent` — the cordis patch used in the Quickstart.

Build artifacts: `packages/mimir/lib/{index.js, invariant.js, typert.host.js, typert.remote-client.js, client.js, types/}` and `packages/ui-mimir/lib/{index.js, invariant.js, client.js, types/}`.

`packages/ui-mimir/scripts/screenshot.ts` is a QA harness (not part of the test suite): against a running `dsh web` instance with the plugin mounted, it captures one PNG per workbench tab into `/tmp/research-ui/`. It requires a local Playwright installation; adjust the import/`CHROMIUM` path at the top of the file.

Contributing: branch off `main` (`feature/<name>` or `fix/<name>`), keep `pnpm run build && pnpm test && pnpm run typecheck` green, and open a PR.

### Repository notes

- `packages/typert-protocol` is a **vendored, never-published** source copy of `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.8`: the Typert generator only recognizes `Remote` metadata declared inside a workspace-registered package, so the protocol must compile in-repo. Runtime consumers still resolve the npm release.
- Typert generation runs in **contributor-filtered workspace mode** (`mode: 'workspace'` in `packages/mimir/tsdown.config.ts`): only packages exposing a `./typert`/`./remote` entry — dsh-mimir alone — are modeled. The default package mode analyzes the vendored protocol too, which fails on Typert map interfaces augmented by npm releases (session/agent stay npm externals precisely so their types are never expanded).
- `build/client-preset/` vendors the dsh client-bundle tsdown preset (closure-factory browser artifact + lightningcss pipeline), slimmed to what this repository builds.

## Changelog

### 0.13.0

- **Decks with real paper figures**: the Meetings pipeline now embeds figure-by-figure slides — drop a `meetings/.paper-figures/<arxivId>/manifest.json` (extracted from the paper PDF) next to the project and each selected paper's intro slide is followed by up to 3 per-figure slides with its extracted images.
- **New `meeting_deck` agent tool**: the agent can generate the whole-project report deck itself (title/presenter/date, section switches, paper selection) — same renderer as the tab, so the result lands in 已生成的汇报 with download/delete.
- **Direct integration of [academic-Group-meeting-skills](https://github.com/mlxbc12138/academic-Group-meeting-skills)**: the rewritten `research-meeting-deck` skill walks the agent through the original repo's pipeline end to end — clone the skill, run `paper_figures_to_ppt.py extract` against the project's cached arXiv PDFs (with a bundled single-file `pdftoppm` shim for hosts without poppler), let the agent polish manifest captions, `build` a figure-by-figure deck against the skill's reference style, then file the `.pptx` into `meetings/<project>/` where the tab manages it. Path B remains the built-in whole-project deck via `meeting_deck`.

### 0.12.0

- **Group-meeting decks (组会)**: a new workbench tab turns the project's wiki into a presentation — deck title/presenter/date, four section switches (progress/experiments/figures/papers), paper multi-select with relevance chips (empty = top 12 by score), and a figure thumbnail multi-select. The host renders a real 16:9 `.pptx` via pptxgenjs (no agent session needed) into `meetings/<project>/`; generated decks list in the tab with download and delete.
- **New bundled skill `research-meeting-deck`**: an agent playbook that curates the deck's raw material first (paper notes, figure takeaway captions, honest stage) — the slide-voice rules are adapted from [academic-Group-meeting-skills](https://github.com/mlxbc12138/academic-Group-meeting-skills), credited in the source.
- Deck figures come from a disk scan of the paper directory (registry captions merge by stem), so panel-uploaded images without a metadata row are embedded too; svg-only files are skipped.
- The `research` Remote namespace grows to 58 methods (`generateMeetingDeck`, `listMeetingDecks`, `deleteMeetingDeck`), plus the `/research/meeting` attachment download route.
- The repository moved to `1692775560/dsh-Mimir-Academic-research`; badges and clone links updated.

### 0.11.0

- **Single-package install**: the six-view Web workbench now ships inside `dsh-mimir` itself (a `dsh.client` declaration plus the bundled `lib/client.js`). `dsh plugin --profile web add dsh-mimir@latest` alone yields the full UI — the separate `dsh-client-ui-mimir` install and the source-integration requirement are gone. The legacy package stays published in lockstep; remove its roster row when upgrading to avoid a double mount.
- `dsh-client-ui-mimir`'s `dsh-mimir` peer floor now tracks the current release (>= 0.11.0), so a new workbench cannot pair with an older host that lacks its Remote methods.

### 0.10.0

- **Venue templates**: pick a target venue in the paper header — 11 built-in formats (CVPR/ICCV/ECCV, NeurIPS/ICML/ICLR/AAAI, ACL, IEEE conference/journal, ACM acmart) with official kit URLs and formatting checklists. Applying writes `template/TEMPLATE.md` (the re-layout brief) into the paper directory and records the venue on the project; "Format to venue" hands the re-layout task to the agent (content untouched, compile-verified).
- **Custom venue kits**: upload any venue's `.cls`/`.sty`/`.tex`/`.bst` files into `template/`, name the venue, and apply — same brief + agent handoff as a built-in.
- The `research` Remote namespace grows to 55 methods (`listVenueTemplates`, `applyVenueTemplate`, `clearVenueTemplate`), plus the `/research/template-upload` route.

### 0.9.0

- **Per-project literature scoping**: arXiv/Zotero imports auto-associate with the current project, and the literature view filters to the selected project by default (toggle to see all) — different papers no longer share one mixed reading list.
- **AI relevance scoring**: ask the agent to rate each paper's relevance to the project's direction (0–10 with a one-line reason, colored chip per band); single-paper and batch scoring, polled back into the panel. Scores are stored per project, so one paper can carry different verdicts in different projects.
- **Figure management**: same-stem `png`/`svg` exports collapse into one card with format badges; inline rename (rewrites every `.tex` reference and metadata row) and caption editing; a new `figure_organize` tool lets the agent batch-rename and caption figures on request ("AI 归纳命名").
- **Fullscreen PDF reader**: any paper with a fetched PDF opens in a fullscreen overlay (native viewer + notes sidebar, Esc to close).
- The `research` Remote namespace grows to 52 methods (`renameFigure`, `updateFigure`; `importPaper`/`importZoteroItem`/`updatePaper` signature extensions).

### 0.8.1

- Fix: a project without a paper directory broke the whole project list (`paperDir` was emitted as an explicit `undefined`, failing the gateway's JSON boundary validation); `submitJob`'s unlinked `experimentId` had the same latent bug. Both keys are now omitted when unset, with regression tests.
- Paper view: head-row buttons and the save pill no longer wrap character-by-character in narrow panes (project name / compile status absorb the squeeze with ellipsis).
- Literature view: the new-subscription-papers list is collapsible (default folded; a successful manual check unfolds it once; persists). Sidebar project list is collapsible too, still showing the selected project's name.

### 0.8.0

- Nine **bundled research skills** (`research-pipeline`, `research-lit-review`, `research-novelty-check`, `research-experiment-plan`, `research-result-to-claim`, `research-paper-drafting`, `research-citation-audit`, `research-rebuttal`, `research-figure-plan`) register into the host's skill catalog when a skill registry is mounted; `skills.enabled: false` opts out, and project-level same-name skills override them.
- Documentation screenshots retaken on the Linear-style workbench.

### 0.7.0

- **Zotero Web API integration (read-only)**: browse collections, search the library, import items into the wiki (arXiv-linked or as `zotero-<key>` entries), and export a collection to `.bib`; credentials live in `zotero.apiKey` / `zotero.userId` and never reach the wiki, logs, or the panel.
- **Linear-style visual overhaul** of the whole workbench: hairline borders, inline compile-error rows, a clearer type hierarchy, and independently tuned dark/light themes.

### 0.6.0

- **arXiv subscriptions**: per-query daily new-paper checks on a filesystem-backed store, with an unread badge in the Library view.
- **PDF reader notes**: a timestamped side panel for the embedded paper reader.
- Server probes report **staged progress** (TCP → SSH → GPU readout) so failures attribute to the right layer.

### 0.5.0

- **Paper version snapshots**: every successful compile snapshots the paper sources (50 kept); diff any pair, revert with optimistic-concurrency guards.
- Experiment records resist stale-task overwrites; light-theme contrast pass; internal service split for maintainability.

### 0.4.0

- Library: one-click **related-work draft** — the filtered literature selection (titles, abstracts, notes, citation keys) is sent to the session's agent with thematic-writing and citation instructions.
- Experiments: **generate paper figure** from any metric-comparison chart — standalone vector SVG, saved into `figures/` via the new `saveFigure` Remote, converted, and inserted into `main.tex` in one click.
- Paper: the editor head always shows the **current project's name**.

### 0.3.0

- Figures: **insert into paper** — a ready `\begin{figure}` block (caption, sanitized label) lands before `\end{document}`, with duplicate detection and jump-to-reference; **SVG sources auto-convert** to PDF (rsvg-convert/inkscape/magick) or PNG (macOS `qlmanage` fallback) on the host, also in the `figure_save` tool.
- Paper: per-issue **Let AI fix** button hands compile errors with source context to the session's agent.
- Experiments: settled remote jobs **write back** to the linked experiment — status flip, outcome/duration/log-tail badge, and an `EXPERIMENT_LOG.md` line.

### 0.2.0

- `figure_save` tool and the wiki `figures` metadata table (caption, linked experiment).
- Workbench polish: collapsible outline rail, two-line project names, adaptive card badges, metric-label wrapping, denser figure grid.

### 0.2.x / 0.1.x

- Editor highlight overlay and gutter windowed to the visible range (large-file responsiveness); dark-mode native form controls; keyboard navigation, focus trap, and ARIA audit; subsection-level outline drag; literature PDF fetch and embedded reader; experiment inline form; SSH remote jobs; wiki backup/export/import.

## Acknowledgments

- Workflow inspiration: [ARIS / Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
- Built on the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin platform (Cordis, Typert, the client module system).

## License

[MIT](LICENSE)
