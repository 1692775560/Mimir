# Mimir Roadmap

Goal-mode work queue. Each item ships in one iteration: implement in the dev
repo (`~/deepseek-harness`), tests + screenshot QA, sync here, push.
Priority: literature+experiments > writing > servers, with a pure UI/UX
polish round every few iterations.

## In progress

## Done

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

## Queue

### Literature & experiments

- [ ] Experiment comparison: select multiple runs of one project, side-by-side
      metrics table
- [ ] Literature tagging + per-project linking of papers

### Writing experience

- [ ] LaTeX syntax highlighting in the editor (lightweight self-drawn
      highlight overlay, no new dependency)
- [ ] BibTeX management: edit `refs.bib` in the panel, generate entries from
      the literature library in one click
- [ ] Outline drag-to-reorder sections (rewrites `main.tex` section order)
- [ ] Paper view layout: draggable editor/preview splitter, editor fullscreen

### Servers

- [ ] Submit a remote job over SSH (run a training command) + poll job status
      — needs a real server address from the user, otherwise demo-only
- [ ] Link experiment records to the server they ran on
- [ ] Server groups/tags

### UI/UX polish rounds

- [ ] Dark mode toggle
- [ ] Language switch (zh/en) in the panel header
- [ ] Keyboard shortcuts (toggle panel, switch tabs, compile)
- [ ] Narrow-width layout adaptation

## Blocked (needs user input)

- Real GPU server host/credentials for end-to-end job submission testing
- `DEEPSEEK_API_KEY` for model-driven e2e (reviewer loop, paper writing)
