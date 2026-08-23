# Mimir (dsh-mimir)

[English](README.md) | 中文

Mimir 是 DeepSeek Harness 的科研助手插件套件：arXiv 文献检索、持久化研究 wiki、LaTeX 编译工具，以及相互独立的新 reviewer 循环。它把 ARIS 的工作流机制（失败想法记忆、reviewer 独立性、编译驱动的写作）移植进一个 dsh 插件。

## 插件

函数式插件（`name`/`inject`/`Config`/`apply`）。注入 `commands`、`tools`、`subagents`、`storageDomain` 和 `webServer`，因此组合中还必须挂载 storage hub、一个 KV 后端、domain 表单，以及——为 web 面板的 PDF 路由——HTTP 载体（见 `examples/mimir-agent/`）。

## Web 研究工作台

插件还挂载了 `research` Remote 命名空间（`ResearchService`）以及 `/research/pdf/<project id>` 和 `/research/figure/<project id>?path=<rel path>` 两条前缀路由，为 web 研究工作台（`dsh-client-ui-mimir`）提供数据：来自 wiki `projects` 表的项目列表、章节大纲、面板编辑器的源码读取/替换、带解析诊断的 latexmk/tectonic 编译、编译产物 PDF 流、文献列表（`listPapers`）、arXiv 关键词订阅（`listArxivSubscriptions` / `saveArxivSubscription` / `deleteArxivSubscription` / `checkArxivSubscriptions`——持久化为 `<workspaceDir>/arxiv-subscriptions.json`，不进入 wiki domain；每日定时检新加手动触发，新条目推给面板一键导入）、实验运行列表（`listExperiments`）、白名单 markdown 工件读取（`readArtifact`——`IDEA_REPORT.md`、`EXPERIMENT_PLAN.md`、`EXPERIMENT_LOG.md`、`REVIEW_REPORT.md`；其他名字返回 `invalid-artifact` 失败，文件缺失返回 `artifact-not-found`），以及论文目录的图表扫描（`listFigures`——顶层及 `figures/` 一层内的 `.png`/`.jpg`/`.jpeg`/`.svg`/`.pdf` 文件），外加 `deleteFigure` 与 `convertFigure`（宿主侧 SVG → PDF 转换——兜底走平台栅格化输出 PNG——为工作台的「插入论文」流程服务，按序探测 PATH 上的 `rsvg-convert`/`inkscape`/`magick`，macOS 上再兜底 `qlmanage`）。 备份与迁移走 `exportWiki` / `importWiki`：导出把全部六张 wiki 表打成一份 JSON 快照（`format: "mimir-wiki"`，`version: 2`）；导入在任何写入之前先校验信封和每一行（逐表 zod schema + 主键非空/去重），`merge` 只 upsert 不存在的主键（已存在记录跳过、绝不覆盖），`replace` 先清空六张表，因此必须带 `confirmReplace: true`。figure 路由按 workspace 相对路径提供单个扫描到的文件：非图片扩展名或 `..` 逃逸返回 400，未知项目或文件返回 404。每个项目可以指向自己的论文目录：记录的可选 `paperDir`（通过 `wiki_note` 工具的 `set_project` action 设置）命名 workspace 的一个子目录，每个论文调用也接受显式的 `dir` 覆盖（路由上为 `?dir=`）；候选路径必须是限制在 workspace 内的相对路径——绝对路径或 `..` 逃逸是 `invalid-dir` 失败（路由上为 400）。`savePaperSource` 在乐观并发下替换 `main.tex`——调用方的基准 mtime 会被重新检查，原子提交在 `@deepseek-ai/dsh-atomic-write` 的写锁内执行，因此 agent 通过文件工具写入时永远无法穿插进检查-写入之间；被顶掉的草稿会收到携带当前 mtime 的 `conflict` 回复。编译状态是按项目 id 键控的进程内存；两条路由对未知项目都返回 404。没有 `webServer` 的组合（例如 TUI）无法挂载本套件——inject 是全有或全无的。

## 配置

```yaml
- id: mimir
  name: 'dsh-mimir'
  config:
    workspaceDir: .research        # research workspace root, resolved against the process cwd
    reviewer:
      provider: spawn              # subagent provider route; reserved for cross-model review
      maxRounds: 3                 # per-project review-round budget
    latex:
      engine: auto                 # auto（依次探测 PATH 上的 latexmk、tectonic）、引擎名，或二进制绝对路径（按 basename 判断命令行）
      timeoutMs: 120000            # compile kill timeout
    arxiv:
      maxResults: 10               # default arxiv_search result cap
```

## 工具

- `arxiv_search { query, max_results? }` → 来自 arXiv Atom API 的 `{ results: [{ id, title, authors, summary, published, url }] }`。网络与 HTTP 失败会 reject。
- `paper_fetch { arxiv_id }` → 按裸 id 取一条论文记录（允许版本后缀）。
- `wiki_note { action, ... }` → 模型对 wiki domain 的读写面。Actions：`add_paper`、`add_idea`、`fail_idea`、`add_claim`、`set_claim`、`add_experiment`、`set_experiment`、`list`、`get`。
- `latex_compile { project_dir }` → `{ success, engine, errors, warnings, log_excerpt }`；在 `project_dir` 中运行解析后的引擎——`latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex` 或 `tectonic --keep-logs --synctex main.tex`——并把日志解析为带文件/行号归属的诊断（tectonic 优先用 `--keep-logs` 留下的 `main.log`，否则解析控制台的 `error:`/`warning:` 行）。

## 命令

- `/research-idea <方向>` —— 注册项目、脚手架 `IDEA_REPORT.md`，并指示模型先查失败想法、再调研 arXiv、记录想法。
- `/research-plan [项目 id]` —— 从想法报告脚手架 `EXPERIMENT_PLAN.md`；计划中的论断会成为 pending 的 wiki claim。
- `/research-review <范围> <路径...> [项目 id]` —— 一轮独立评审：全新的 reviewer subagent 只拿到绝对文件路径（永远拿不到执行者的总结），返回 schema 校验过的 PASS/WARN/FAIL 结论。WARN/FAIL 会作为修订后续交还给 agent。
- `/paper-write [项目 id]` —— 脚手架 `paper/main.tex` + `references.bib`，并指示模型起草、编译修复直至干净。
- `/paper-compile [目录]` —— 编译一次（默认 `<workspace>/paper`）并报告解析出的诊断。

## 存储

wiki 是配置在 storage-domain 后端之上的 `research_wiki` domain（version 2），共五张表：`papers`（以 arXiv id 为键）、`ideas`（失败想法永不删除——这就是防重复记忆）、`claims`、`projects`（流水线阶段、工件、评审轮次）和 `experiments`（运行记录：名称、状态、标量指标、可选日志路径）。插件卸载时关闭该 domain。

## 模板

`templates/` 携带工件骨架（`IDEA_REPORT.md`、`EXPERIMENT_PLAN.md`、`paper/main.tex`、`paper/references.bib`）。这些字节的运行时来源是 `src/templates.ts`；该目录仅供人类参考，运行时不会读取。

## Model Experience

### 工具 schema 与命令指令

#### 模型看到什么

工具目录中的四个工具 schema（`arxiv_search`、`paper_fetch`、`wiki_note`、`latex_compile`），加上对应 `/research-*` 命令运行后的结构化后续指令。

#### Token 影响

条件性：插件挂载时工具 schema 始终在场；命令指令只在对应 slash 命令运行后出现。

#### KV Cache 影响

只追加：后续指令扩展对话而不替换先前请求的内容。

## 已知限制与暂缓事项

- **尚无真正的端到端覆盖** —— 本套件由单元测试（日志解析器、wiki domain）和组合加载验证；真实模型示例运行需要 `DEEPSEEK_API_KEY` 和 TeX 安装，两者都不假设存在。
- **LaTeX 日志解析基于单行** —— 经典的 79 列日志折行不会重新拼接，因此折行的消息只保留第一行。
- **Reviewer provider 由部署选择但非跨模型** —— `reviewer.provider` 选择已注册的 subagent 路由；把不同模型家族路由给 reviewer 是 provider 自己的配置事项。
