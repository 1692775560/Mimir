# Mimir Roadmap

Goal-mode work queue. Each item ships in one iteration: implement in the dev
repo (`~/deepseek-harness`), tests + screenshot QA, sync here, push.
Priority: literature+experiments > writing > servers, with a pure UI/UX
polish round every few iterations.

## In progress

## Done

- [x] BibTeX management: the paper view's bibliography panel reads the
      project's `references.bib` (tolerant dependency-free parser with a
      parse∘serialize round-trip invariant), lists entries with delete, and
      appends library papers as `@misc` entries — from the panel's import
      picker or each library card's one-click button (new `getBibliography` /
      `saveBibliography` / `importPapersToBib` Remotes; deletes and imports
      write the file under optimistic concurrency, conflicts reload)
- [x] Figures view: upload / delete / copy-LaTeX-snippet image management
- [x] Servers view: CRUD + TCP probe + SSH nvidia-smi GPU bars
- [x] UI refresh: nav icons, view headers, stat chips, status pills
- [x] In-panel arXiv search: search box in the literature view, one-click
      import into the wiki library (plus library card delete)
- [x] Compile issues click-through: clicking a LaTeX error/warning in the
      paper view jumps the editor to that line (line badges, gutter flash,
      no-wrap editor so line numbers never drift)
- [x] Experiment metrics charts: numeric metric keys shared by ≥2 runs render
      as inline SVG comparison bar charts; experiment rows can be deleted
      (new `deleteExperiment` Remote; the "add experiment" form was skipped —
      no saveExperiment Remote yet)
- [x] Literature tagging + per-project linking of papers (new `updatePaper`
      Remote; tag pills, project badges, inline editor, tag/current-project
      filter bar; PaperRecord grew `tags`/`projectIds` with zod defaults, no
      wiki version bump)
- [x] LaTeX syntax highlighting in the editor: zero-dependency overlay
      (transparent-text textarea over a token-rendered `pre`); single-pass
      tokenizer with plain/comment/command/math/brace/bracket/env tokens,
      escape-safe (`\%` stays plain), same-line `$…$` pairing; degrades to
      plain text past 200 KB
- [x] UI polish round: dark mode + language switch + keyboard shortcuts. Both
      toggles ride the host services (`ctx.theme` / `ctx.locale`, durable via
      Host settings — no panel-local localStorage): the header has sun/moon
      and 中/EN buttons; the panel only re-tints its private `--mimir-tok-*`
      syntax colors plus `error-secondary` (a stroke token in the dark base
      palette, used here as a fill) under `body[data-ds-dark-theme]`.
      Shortcuts (pure `shortcutFor` mapping, guarded while typing): `1–6`
      switch views, `Esc` closes, `⌘/Ctrl+Enter` compiles; a hint line sits at
      the rail bottom. (Opening the panel by shortcut was skipped — the host
      sidebar owns that surface.)

## Queue

### Literature & experiments

- [ ] Experiment comparison: select multiple runs of one project, side-by-side
      metrics table

### Writing experience

- [ ] Outline drag-to-reorder sections (rewrites `main.tex` section order)
- [ ] Paper view layout: draggable editor/preview splitter, editor fullscreen

### Servers

- [ ] Submit a remote job over SSH (run a training command) + poll job status
      — needs a real server address from the user, otherwise demo-only
- [ ] Link experiment records to the server they ran on
- [ ] Server groups/tags

### UI/UX polish rounds

- [ ] Narrow-width layout adaptation

## Blocked (needs user input)

- Real GPU server host/credentials for end-to-end job submission testing
- `DEEPSEEK_API_KEY` for model-driven e2e (reviewer loop, paper writing)
