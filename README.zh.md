# Mimir

[English](README.md) | 中文

**Mimir 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的科研全周期插件套件：arXiv 文献调研、持久化研究 wiki、独立子代理评审，以及 LaTeX 写作 → 编译 → 预览闭环——外加完整的 Web 工作台。**

![论文工作台：大纲、源码编辑器、编译后 PDF 预览](docs/screenshots/tab-paper-compiled.png)

## 功能

**五个斜杠命令**

| 命令 | 作用 |
| --- | --- |
| `/research-idea <方向>` | 注册项目、脚手架 `IDEA_REPORT.md`、调研 arXiv、记录想法 |
| `/research-plan [项目]` | 脚手架 `EXPERIMENT_PLAN.md`；计划论断进入 pending wiki claim |
| `/research-review ...` | 对工件（方案/论文）做独立 fresh-reviewer 评审轮次，按项目限轮 |
| `/paper-write [项目]` | 脚手架 `main.tex` 骨架并驱动写作直到编译干净 |
| `/paper-compile [目录]` | 直接输出编译报告（与工具同一引擎路径） |

**四个 agent 工具**

| 工具 | 用途 |
| --- | --- |
| `arxiv_search` / `paper_fetch` | arXiv Atom API 检索与单篇抓取 |
| `wiki_note` | 研究 wiki domain 的读写面（文献、想法、论断、实验、项目） |
| `latex_compile` | 编译 `main.tex` 并解析出带文件/行号的诊断；多引擎：`latexmk` 或 `tectonic`（自动探测或显式二进制路径） |

**Web 工作台（六视图）**——侧栏开关打开 96vw×95vh 浮层：**总览**（流水线阶段进度、统计芯片、工件清单）、**论文**（可折叠可跳行的大纲栏、自动保存的 `main.tex` 编辑器（同步行号 + 零依赖 LaTeX 语法高亮）、一键编译（状态行标注引擎）、点击跳源码行的错误列表、内嵌 PDF 预览）、**文献**（已收录论文：可编辑标签、按项目关联、标签/当前项目筛选栏；面板内 arXiv 搜索 + 一键导入 wiki，卡片可删除）、**实验**（运行记录：共享数值指标的内联 SVG 对比条形图、逐 run 可展开指标、行删除，以及 `EXPERIMENT_LOG.md`）、**图表**（论文目录图片网格：放大预览、上传、删除、复制 LaTeX 引用）、**服务器**（登记的 GPU 机器：TCP 连通性探测 + 尽力而为的 SSH `nvidia-smi` 读取，含利用率/显存条）。面板头部带深色/浅色主题切换和中/EN 语言切换（两者都落在宿主持久化偏好上），并支持快捷键：`1–6` 切换视图、`Esc` 关闭、论文视图内 `⌘/Ctrl+Enter` 编译。

| 总览 | 文献 | 文献：arXiv 搜索 |
| --- | --- | --- |
| ![总览](docs/screenshots/tab-overview.png) | ![文献](docs/screenshots/tab-papers.png) | ![文献：arXiv 搜索](docs/screenshots/tab-papers-search.png) |

| 论文：语法高亮 | 论文：编译问题 | 论文：点击跳源码行 |
| --- | --- | --- |
| ![论文：语法高亮](docs/screenshots/tab-paper-highlight.png) | ![论文：编译问题](docs/screenshots/tab-paper-issues.png) | ![论文：点击跳源码行](docs/screenshots/tab-paper-issue-jump.png) |

| 深色模式：总览 | 深色模式：论文（语法配色重调） |
| --- | --- |
| ![深色模式：总览](docs/screenshots/dark-overview.png) | ![深色模式：论文](docs/screenshots/dark-paper.png) |

| 实验 | 图表 | 服务器 |
| --- | --- | --- |
| ![实验](docs/screenshots/tab-experiments.png) | ![图表](docs/screenshots/tab-figures.png) | ![服务器](docs/screenshots/tab-servers.png) |

## 包

- **`dsh-mimir`**（`packages/mimir`）——宿主插件：命令、工具、wiki domain、评审循环、LaTeX 编译，以及支撑面板的 `research` Remote 命名空间（20 个方法）+ `/research/pdf` / `/research/figure` / `/research/figure-upload` 路由。
- **`dsh-client-ui-mimir`**（`packages/ui-mimir`）——浏览器工作台：侧栏开关 + 浮层面板。

## 安装

两个包都是 dsh（Cordis）插件。在你的 dsh 检出中应用示例 overlay：

```sh
dsh web --patch "$PWD/cordis.yml"
```

`cordis.yml` 内容（见 [examples/mimir-agent/cordis.yml](examples/mimir-agent/cordis.yml)）：

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

web profile 已挂载 storage，wiki 持久化在 profile 的 storage 根下。论文编译需要 PATH 上有 `latexmk` **或** `tectonic`（`engine: auto` 优先探测 latexmk），或在 `latex.engine` 配置二进制绝对路径。

## 配置项

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `workspaceDir` | `.research` | 研究工作区根目录（相对进程 cwd 解析） |
| `reviewer.provider` | `spawn` | 评审子代理的 provider 路由 |
| `reviewer.maxRounds` | `3` | 每项目评审轮次预算 |
| `latex.engine` | `auto` | `auto`（依次探测 PATH 上的 `latexmk`、`tectonic`）、引擎名，或二进制绝对路径（按 basename 判断命令行） |
| `latex.timeoutMs` | `120000` | 编译超时；tectonic 首次联网下载宏包时调大 |
| `arxiv.maxResults` | `10` | `arxiv_search` 默认结果上限 |

## 已知限制

- **工作台的 Remote 命名空间需要由 client 的 Remote 装配显式挂载。** dsh 已发布的 `@deepseek-ai/dsh-api-remotes` 早于 Mimir，不挂载 `research` 命名空间；请在你的装配中加一行 Mimir 的生成贡献：

  ```ts
  import researchRemote from 'dsh-mimir/remote'
  // 装配的 apply() 内，与其他贡献并列：
  disposers.push(await ctx.remote.$mount(researchRemote))
  ```

  这是 dsh 侧的设计约束（装配是显式白名单），不是 Mimir 的缺陷。
- **编译状态是宿主进程内存**——宿主重启后上次结果丢失；即使磁盘上还留着 `main.pdf`，面板也显示 `idle` 直到下一次编译。
- **无实时推送**——面板不轮询不订阅；别处启动的编译（`/paper-compile` 或工具）要到下一次选择或编译时才可见。

## 开发

```sh
pnpm install
pnpm run build       # 有序流水线：mimir typecheck → mimir bundle（产出 ui-mimir
                     # typecheck 依赖的 typert 产物）→ ui-mimir
pnpm test            # vitest，两个包
pnpm run typecheck   # tsc -b 两个包；需先构建过（ui-mimir 引用生成的
                     # dsh-mimir/remote 声明）
```

构建产物：`packages/mimir/lib/{index.js, invariant.js, typert.host.js, typert.remote-client.js, types/}` 与 `packages/ui-mimir/lib/{index.js, invariant.js, client.js, types/}`。

`packages/ui-mimir/scripts/screenshot.ts` 是 QA 工具（不属于测试套件）：对着挂载了插件的 `dsh web` 实例把每个工作台 tab 截一张 PNG 到 `/tmp/research-ui/`。需要本机有 Playwright；按文件顶部的 import/`CHROMIUM` 路径调整。

### 仓库说明

- `packages/typert-protocol` 是 `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.8` 的**内 vendored、永不发布**的源码副本：Typert 生成器只识别 workspace 注册包内声明的 `Remote` 元数据，因此协议包必须在仓库内编译。运行时消费方仍解析 npm 发布版。
- Typert 生成走**按贡献者过滤的 workspace 模式**（`packages/mimir/tsdown.config.ts` 里 `mode: 'workspace'`）：只有暴露 `./typert`/`./remote` 入口的包——即 dsh-mimir——会被建模。默认 package 模式会连 vendored 协议包一起分析，进而在被 npm 发布版增强的 Typert 映射接口上失败（session/agent 特意保持 npm 外部依赖，其类型永不展开）。
- `build/client-preset/` vendored 了 dsh 的 client bundle tsdown 预设（闭包工厂式浏览器产物 + lightningcss 流水线），裁剪到本仓库所需。

## 致谢

- 工作流灵感来自 [ARIS / Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
- 构建于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件平台（Cordis、Typert、client 模块系统）。

## 许可证

[MIT](LICENSE)
