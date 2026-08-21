# mimir-agent

[English](README.md) | 中文

这个 overlay 让一个 `dsh` profile 挂载科研助手套件（`dsh-mimir`）：arXiv 文献工具、持久化研究 wiki、LaTeX 编译，以及相互独立的新 reviewer 评审轮次。

## 运行

需要 `DEEPSEEK_API_KEY`（根目录 `.env` 或环境变量）；论文编译还需要 PATH 上有 `latexmk` 或 `tectonic`（或在 `latex.engine` 配置二进制绝对路径；`auto` 优先探测 latexmk）。

先构建本仓库（`pnpm install && pnpm run build`），再把插件 link 进 web profile——dsh 从 profile 目录（`~/.dsh/profiles/web`）解析 patch 里的插件名，而不是当前目录：

```sh
dsh plugin --profile web add "$PWD/packages/mimir"
dsh web --patch "$PWD/examples/mimir-agent/cordis.yml"
```

web UI 默认监听 http://127.0.0.1:3080。然后在会话中：

```
/research-idea efficient long-context retrieval for code agents
/research-plan
/research-review plan EXPERIMENT_PLAN.md
/paper-write
/paper-compile
```

workspace 根目录默认是调用目录下的 `./.research`：`IDEA_REPORT.md`、`EXPERIMENT_PLAN.md` 和 `paper/` 都落在那里，wiki 的 JSON 存储在 `~/.dsh/storages/research_wiki.json`，重启后仍在。失败想法永远留在 wiki 里，因此对已探索过的死胡同再次运行 `/research-idea` 会被标记而不是重复。

`/research-review` 启动一个全新的 reviewer subagent，它只收到列出的绝对文件路径——永远拿不到执行者的总结——返回 schema 校验过的 PASS/WARN/FAIL 结论。WARN/FAIL 会作为修订后续交还给 agent；每个项目最多 `reviewer.maxRounds` 轮（默认 3）。

完整的工具/命令面与配置项见 [packages/mimir](../../packages/mimir/README.md) 的包 README。
