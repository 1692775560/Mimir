# mimir-agent

English | [中文](README.zh.md)

This overlay opts one `dsh` profile into the research-assistant suite (`dsh-mimir`): arXiv literature tools, a persistent research wiki, LaTeX compile, and independent fresh-reviewer rounds.

## Run it

Requires `DEEPSEEK_API_KEY` (root `.env` or environment) and, for paper compilation, `latexmk` or `tectonic` on PATH (or an absolute binary path in `latex.engine`; `auto` probes latexmk first).

Build this repository first (`pnpm install && pnpm run build`), then link the plugin into the web profile — dsh resolves patch plugin names from the profile directory (`~/.dsh/profiles/web`), not the current directory:

```sh
dsh plugin --profile web add "$PWD/packages/mimir"
dsh web --patch "$PWD/examples/mimir-agent/cordis.yml"
```

The web UI listens on http://127.0.0.1:3080 by default. Then, in a session:

```
/research-idea efficient long-context retrieval for code agents
/research-plan
/research-review plan EXPERIMENT_PLAN.md
/paper-write
/paper-compile
```

The workspace root defaults to `./.research` under the invoking directory: `IDEA_REPORT.md`, `EXPERIMENT_PLAN.md`, and `paper/` land there, and the wiki's JSON store lives at `~/.dsh/storages/research_wiki.json`, surviving restarts. Failed ideas stay in the wiki forever, so a later `/research-idea` on an explored dead end is flagged instead of repeated.

`/research-review` starts a fresh reviewer subagent that receives only the listed absolute file paths — never the executor's summary — and returns a schema-validated PASS/WARN/FAIL verdict. WARN/FAIL is handed back to the agent as a revision follow-up; a project is limited to `reviewer.maxRounds` rounds (default 3).

See the package README at [packages/mimir](../../packages/mimir/README.md) for the full tool/command surface and config keys.
