# Mimir

English | [中文](README.zh.md)

**Mimir is a research-lifecycle plugin suite for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): arXiv literature search, a persistent research wiki, independent subagent review, and a closed LaTeX writing → compile → preview loop — plus a full web workbench.**

![Paper workbench: outline, source editor, compiled PDF preview](docs/screenshots/tab-paper-compiled.png)

## Features

**Five slash commands**

| Command | What it does |
| --- | --- |
| `/research-idea <direction>` | Registers a project, scaffolds `IDEA_REPORT.md`, surveys arXiv, records the idea |
| `/research-plan [project]` | Scaffolds `EXPERIMENT_PLAN.md`; planned claims become pending wiki claims |
| `/research-review ...` | Independent fresh-reviewer rounds over an artifact (plan / paper), capped per project |
| `/paper-write [project]` | Scaffolds the `main.tex` skeleton and drives drafting to a clean compile |
| `/paper-compile [dir]` | Direct compile report over the same engine path as the tool |

**Four agent tools**

| Tool | Purpose |
| --- | --- |
| `arxiv_search` / `paper_fetch` | arXiv Atom API search and single-paper fetch |
| `wiki_note` | Read/write surface over the research wiki domain (papers, ideas, claims, experiments, projects) |
| `latex_compile` | Compiles `main.tex` with parsed file/line diagnostics; multi-engine: `latexmk` or `tectonic` (auto-detected, or an explicit binary path) |

**Web workbench (six views)** — a sidebar toggle opens a 96vw×95vh overlay: **Overview** (pipeline stage progress, stat chips, artifacts), **Paper** (collapsible clickable outline, auto-saving `main.tex` editor with sync line numbers and dependency-free LaTeX syntax highlighting, one-click compile with engine label, error list that jumps to source lines, inline PDF preview), **Library** (remembered papers with editable tags, per-project links, and a tag/current-project filter bar; in-panel arXiv search with one-click import into the wiki, card delete), **Experiments** (run records: metric-comparison bar charts over shared numeric metrics as inline SVG, per-run expandable metrics, row delete, plus `EXPERIMENT_LOG.md`), **Figures** (paper-directory image grid with preview, upload, delete, and copy-LaTeX-reference card actions), **Servers** (remembered GPU boxes: TCP reachability probe plus a best-effort SSH `nvidia-smi` readout with utilization/memory bars). The panel header carries a light/dark theme toggle and a 中/EN language switch (both ride the durable host preferences), and the workbench answers keyboard shortcuts: `1–6` switch views, `Esc` closes, `⌘/Ctrl+Enter` compiles in the paper view.

| Overview | Library | Library: arXiv search |
| --- | --- | --- |
| ![Overview](docs/screenshots/tab-overview.png) | ![Library](docs/screenshots/tab-papers.png) | ![Library: arXiv search](docs/screenshots/tab-papers-search.png) |

| Paper: syntax highlighting | Paper: compile issues | Paper: click-to-jump |
| --- | --- | --- |
| ![Paper: syntax highlighting](docs/screenshots/tab-paper-highlight.png) | ![Paper: compile issues](docs/screenshots/tab-paper-issues.png) | ![Paper: click-to-jump](docs/screenshots/tab-paper-issue-jump.png) |

| Dark mode: overview | Dark mode: paper (syntax colors re-tinted) |
| --- | --- |
| ![Dark mode: overview](docs/screenshots/dark-overview.png) | ![Dark mode: paper](docs/screenshots/dark-paper.png) |

| Experiments | Figures | Servers |
| --- | --- | --- |
| ![Experiments](docs/screenshots/tab-experiments.png) | ![Figures](docs/screenshots/tab-figures.png) | ![Servers](docs/screenshots/tab-servers.png) |

## Packages

- **`dsh-mimir`** (`packages/mimir`) — the host plugin: commands, tools, wiki domain, reviewer loop, LaTeX compile, and the `research` Remote namespace (20 methods) + `/research/pdf` / `/research/figure` / `/research/figure-upload` routes backing the panel.
- **`dsh-client-ui-mimir`** (`packages/ui-mimir`) — the browser workbench: sidebar toggle + overlay panel.

## Install

Both packages are dsh (Cordis) plugins. In your dsh checkout, apply the example overlay:

```sh
dsh web --patch "$PWD/cordis.yml"
```

with `cordis.yml` (see [examples/mimir-agent/cordis.yml](examples/mimir-agent/cordis.yml)):

```yaml
- insert:
    - id: mimir
      name: 'dsh-mimir'
      config:
        workspaceDir: .research
        reviewer: { provider: spawn, maxRounds: 3 }
        latex: { engine: auto, timeoutMs: 120000 }
        arxiv: { maxResults: 10 }
```

The web profile already mounts storage, so the wiki persists under the profile's storage root. Paper compilation needs `latexmk` **or** `tectonic` on PATH (`engine: auto` probes latexmk first), or an absolute binary path in `latex.engine`.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `workspaceDir` | `.research` | Research workspace root, resolved against the process cwd |
| `reviewer.provider` | `spawn` | Subagent provider route for review rounds |
| `reviewer.maxRounds` | `3` | Per-project review-round budget |
| `latex.engine` | `auto` | `auto` (probe `latexmk` then `tectonic` on PATH), an engine name, or an absolute binary path (basename picks the dialect) |
| `latex.timeoutMs` | `120000` | Compile kill timeout; raise it for tectonic's first network fetch |
| `arxiv.maxResults` | `10` | Default `arxiv_search` result cap |

## Known limitations

- **The workbench's Remote namespace must be mounted by the client's Remote assembly.** dsh's published `@deepseek-ai/dsh-api-remotes` predates Mimir and does not mount the `research` namespace; add Mimir's generated contribution to your assembly (one line):

  ```ts
  import researchRemote from 'dsh-mimir/remote'
  // inside the assembly's apply(), alongside the other contributions:
  disposers.push(await ctx.remote.$mount(researchRemote))
  ```

  This is a dsh-side design constraint (the assembly is an explicit allowlist), not a Mimir defect.
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

Build artifacts: `packages/mimir/lib/{index.js, invariant.js, typert.host.js, typert.remote-client.js, types/}` and `packages/ui-mimir/lib/{index.js, invariant.js, client.js, types/}`.

`packages/ui-mimir/scripts/screenshot.ts` is a QA harness (not part of the test suite): against a running `dsh web` instance with the plugin mounted, it captures one PNG per workbench tab into `/tmp/research-ui/`. It requires a local Playwright installation; adjust the import/`CHROMIUM` path at the top of the file.

### Repository notes

- `packages/typert-protocol` is a **vendored, never-published** source copy of `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.8`: the Typert generator only recognizes `Remote` metadata declared inside a workspace-registered package, so the protocol must compile in-repo. Runtime consumers still resolve the npm release.
- Typert generation runs in **contributor-filtered workspace mode** (`mode: 'workspace'` in `packages/mimir/tsdown.config.ts`): only packages exposing a `./typert`/`./remote` entry — dsh-mimir alone — are modeled. The default package mode analyzes the vendored protocol too, which fails on Typert map interfaces augmented by npm releases (session/agent stay npm externals precisely so their types are never expanded).
- `build/client-preset/` vendors the dsh client-bundle tsdown preset (closure-factory browser artifact + lightningcss pipeline), slimmed to what this repository builds.

## Acknowledgments

- Workflow inspiration: [ARIS / Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
- Built on the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin platform (Cordis, Typert, the client module system).

## License

[MIT](LICENSE)
