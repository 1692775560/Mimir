# Mimir Workbench (dsh-client-ui-mimir)

English | [中文](README.zh.md)

Mimir workbench plugin, browser half: a "Mimir" toggle contributed as the `research` entry (order 10) of the `sidebar.footer.action` strip, plus the frame-level workbench it opens as the `research` entry (order 10) of `shell.overlay`. Both seats are declared by other packages (ui-sidebar and ui-layout respectively), so both registrations go through `slots.inject` and wait on the declaration. The workbench is a wide fixed overlay (96vw × 95vh) — the overlay layer is click-through, so the workbench opts back into pointer events itself — with a left rail (five view tabs plus the project picker at the bottom) and a content area rendering the active tab: the **overview** (the selected project's card with the five-stage pipeline progress, artifact list, and timestamps), the **paper** editor (a collapsible clickable outline rail, the `main.tex` source editor with a synced line-number gutter and the autosave status pill in a 3:2 editor/preview split, and the compile controls, severity-colored issue list, and iframe PDF preview of `/research/pdf/<project id>`), the **papers** library (the collected literature as an expandable-summary card grid), the **experiments** tab (the run table with status pills and expandable metrics above a minimal markdown rendering of the `EXPERIMENT_LOG.md` artifact), and the **figures** grid (thumbnails of the paper directory's image files served through `/research/figure/<project id>?path=…`, with a click-to-zoom lightbox and a forced-rescan refresh). Once the project list settles, the first project is auto-selected so the overview never opens blank.

One `ResearchController` per client runtime backs the workbench, over the generated `research` Remote namespace (`listProjects` / `getPaperOutline` / `compile` / `getCompileStatus` / `getPaperSource` / `savePaperSource` / `listPapers` / `listExperiments` / `readArtifact` / `listFigures`). The project list read is deferred to the first open rather than fired on mount, because the toggle mounts with the sidebar whether or not the panel is ever used; a failed load stays retryable, and a reconnect resyncs a warm view. The per-tab reads are lazy too: the library loads on the papers tab's first open, the experiment log on the experiments tab, and the figure scan on the figures tab; a ready same-project artifact or figure view skips its refetch unless forced. Outline, source, and experiment loads are superseded per selection, so a slow reply from a previously selected project never overwrites the current one. Each project row carries the wiki record's optional `paperDir`; the controller forwards it as the `dir` argument of every paper call (and the workbench appends it as `?dir=` to the PDF preview and figure URLs), so a project whose paper lives in another workspace subdirectory — set through the `wiki_note` tool's `set_project` action — edits, compiles, previews, and scans that directory instead of the default `paper`.

Edits autosave after an ~800 ms debounce through `savePaperSource`'s optimistic concurrency (the mtime check and atomic write run inside the host's writer lock); a successful save of an untouched draft schedules an auto-compile after ~1.5 s. A compile requested while one is running is queued and fired when the in-flight run settles. When the host reports `conflict` — the agent landed a newer version the draft never saw — the draft is kept, editing freezes, and the panel offers a reload that snaps the editor back to the file's content. Error-list entries with a line number jump the editor's caret and viewport to that source line.

Panel open-state and the selected project live in one store handle shared by both registrations, so the toggle's pressed state and the panel's content can never diverge.

The `/client` exports are the plugin body (`apply`/`inject`), the injected face and props types, the store factory, and the controller/view types. The components stay internal.

## Model Experience

None, as the panel is a pure view over the wiki domain and the compile artifacts; it never enters the append-only Session log, the model context, or telemetry.

#### KV Cache effect

None; no panel interaction touches the history tail.

## Known Limitations and Deferred Work

- **Compile status is host process memory** — a host restart forgets the last outcome, and the panel then shows `idle` until the next compile, even when a previously built `main.pdf` is still on disk.
- **One workspace, per-project paper directories** — each project's paper lives in the record's `paperDir` subdirectory of the workspace (default `paper`, the `/paper-write` convention); the project id keys the panel's bookkeeping and authorizes the PDF route, and every resolved path is confined inside the workspace.
- **Plain textarea editor** — no syntax highlighting, linting, or multi-file awareness; only `main.tex` is editable, `\input`/`\include`d files are not.
- **No live push** — the panel polls nothing and subscribes to no host events; a compile started elsewhere (the `/paper-compile` command or the tool) becomes visible on the next selection or compile, not immediately. An external edit is only discovered when the next autosave hits the mtime conflict.
