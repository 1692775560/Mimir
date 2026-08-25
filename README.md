<div align="center">

<img src="docs/media/mimir-cover.png" alt="Mimir — open-source AI research workspace" width="720">

<h1>Mimir</h1>

<p><strong>The research-lifecycle copilot inside <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>:</strong><br>
literature · experiments &amp; remote GPUs · figures · LaTeX writing → compile → preview · group-meeting decks — one workbench, driven by your agent.</p>

<p>
<a href="https://github.com/1692775560/dsh-Mimir-Academic-research/actions/workflows/ci.yml"><img src="https://github.com/1692775560/dsh-Mimir-Academic-research/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://www.npmjs.com/package/dsh-mimir"><img src="https://img.shields.io/npm/v/dsh-mimir?label=dsh-mimir" alt="npm: dsh-mimir"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p><strong>English</strong> · <a href="README.zh.md">中文</a></p>

</div>

## What it is

Mimir is a single npm package (`dsh-mimir`) that plugs into dsh and gives you:

- **Eight-view web workbench** (sidebar toggle → overlay, dark/light, 中/EN):
  **Overview** pipeline & stats · **Paper** Overleaf-style LaTeX studio (edit → compile → PDF preview, one-click AI fix) · **Library** arXiv + web search, AI relevance scoring, fullscreen PDF reader · **Experiments** metric charts, one-click paper figures · **Figures** upload/organize/insert into the paper · **Meetings** one-click group-meeting PPT (real paper figures + optional AI illustrations) · **Servers** GPU fleet probes + remote jobs · **Ledger** growth-record timeline + one-click progress report
- **Agent tools & slash commands**: `/research-idea` `/research-plan` `/research-review` `/paper-write` `/paper-compile`, plus `arxiv_search`, `web_search`, `wiki_note`, `figure_save`, `latex_compile`, `meeting_deck`
- **Nine bundled research skills** (literature review, novelty check, experiment planning, citation audit, rebuttal…) that teach the agent the workflow — no setup needed

| Overview | Paper | Library | Experiments |
| --- | --- | --- | --- |
| ![Overview](docs/screenshots/tab-overview.png) | ![Paper](docs/screenshots/tab-paper.png) | ![Library](docs/screenshots/tab-papers.png) | ![Experiments](docs/screenshots/tab-experiments.png) |

| Figures | Meetings | Servers | Ledger |
| --- | --- | --- | --- |
| ![Figures](docs/screenshots/tab-figures.png) | ![Meetings](docs/screenshots/tab-meetings.png) | ![Servers](docs/screenshots/tab-servers.png) | ![Ledger](docs/screenshots/tab-ledger.png) |

▶ [Full MP4 demo](https://raw.githubusercontent.com/1692775560/dsh-Mimir-Academic-research/main/docs/media/mimir-demo.mp4) (22 MB)

## Quickstart

Prerequisites: Node.js ≥ 22, the dsh CLI (`npm install -g @deepseek-ai/dsh`), and a `DEEPSEEK_API_KEY` for agent sessions.

```sh
dsh plugin --profile web add dsh-mimir@latest   # installs and self-activates
dsh web                                          # then open http://127.0.0.1:3080
```

Click **Mimir** in the sidebar footer. The wiki persists at `~/.dsh/storages/research_wiki.json`; artifacts land under `./.research`.

Optional capabilities:

- **Paper compilation** — install a LaTeX engine (`brew install tectonic` is easiest), or set `latex.engine` to a binary path
- **Web search** — the sxng CLI ships with the package; give it a SearXNG server with one command (Docker-free, local venv):
  ```sh
  bash scripts/setup-web-search.sh
  ```
- **Zotero** — set `zotero.apiKey` / `zotero.userId` in the plugin config (keys at zotero.org/settings/keys)

## Configuration

All keys are optional; set them in the profile's `cordis.patch.yml` (full commented example: [examples/mimir-agent/cordis.yml](examples/mimir-agent/cordis.yml)).

| Key | Default | Meaning |
| --- | --- | --- |
| `workspaceDir` | `.research` | Research workspace root (artifacts, backups) |
| `latex.engine` | `auto` | `latexmk` / `tectonic` probe, or absolute binary path |
| `search.command` | `auto` | Web search: `auto` uses `sxng` from PATH or the bundled copy |
| `reviewer.maxRounds` | `3` | Per-project review-round budget |
| `backup.enabled` / `intervalMinutes` / `keep` | `true` / `60` / `24` | Scheduled wiki snapshots |
| `skills.enabled` | `true` | Register the nine bundled research skills |

## Troubleshooting

- **Plugin not found** — dsh resolves plugin names from the profile directory; install with `dsh plugin --profile web add dsh-mimir@latest`, not from your cwd.
- **LaTeX engine not found** — `brew install tectonic`, or point `latex.engine` at an absolute path. First tectonic compile downloads packages; raise `latex.timeoutMs` if it times out.
- **arXiv fails** — export `HTTPS_PROXY` before starting dsh when behind a proxy.
- **Web search unavailable** — run `bash scripts/setup-web-search.sh` (local SearXNG), or `sxng init` against your own instance, then restart dsh.

## Changelog

- **Unreleased (`dev`)** — Ledger view (成长时间线 + 进展报告) by [@EriXPsy](https://github.com/EriXPsy) ([#115](https://github.com/1692775560/dsh-Mimir-Academic-research/pull/115)); SearXNG web search by [@hkwuks](https://github.com/hkwuks) ([#114](https://github.com/1692775560/dsh-Mimir-Academic-research/pull/114)); bundled sxng-cli + one-command SearXNG setup; Meetings AI illustrations; self-activating `dsh.bundle`
- **0.13.0** — figure-by-figure meeting decks from real paper PDFs, `meeting_deck` agent tool, academic-Group-meeting-skills pipeline integration
- **0.12.0** — Meetings tab (group-meeting PPT), `research-meeting-deck` skill
- **0.11.0** — single-package install: the workbench ships inside `dsh-mimir` itself
- **0.10.0** — venue templates (CVPR/NeurIPS/ACL/IEEE/ACM…), custom kit upload, format-to-venue
- **0.9.0** — per-project literature, AI relevance scoring, figure rename/caption + `figure_organize`, fullscreen PDF reader
- **0.8.x** — bundled research skills; collapsible subscriptions & project list
- **0.7.0** — Zotero integration; Linear-style visual overhaul
- **Earlier** — arXiv subscriptions, paper snapshots (diff/revert), metric→figure generation, related-work drafts, job writeback

## Contributing

Branch off `main` (`feature/<name>` / `fix/<name>`), keep `pnpm run build && pnpm test && pnpm run typecheck` green, and open a PR — see [CONTRIBUTING.md](CONTRIBUTING.md). Please merge PRs with a **merge commit** (not squash) so contributor authorship shows up on the contributors graph.

Contributors so far: [@EriXPsy](https://github.com/EriXPsy) (Ledger view) · [@hkwuks](https://github.com/hkwuks) (SearXNG web search, [sxng CLI](https://github.com/hkwuks/sxng-cli))

## Community

Questions, ideas, or show-and-tell — join the WeChat group (QR updated when it expires):

<img src="docs/wechat-group.jpg" alt="Mimir WeChat group" width="200">

## Acknowledgments

- Workflow inspiration: [ARIS / Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
- Built on the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin platform

## License

[MIT](LICENSE)
