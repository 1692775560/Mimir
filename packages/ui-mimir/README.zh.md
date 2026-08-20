# Mimir 工作台 (dsh-client-ui-mimir)

[English](README.md) | 中文

Mimir 工作台插件的浏览器侧：一个“Mimir”开关按钮，作为 `sidebar.footer.action` 条带的 `research` 条目（order 10）贡献；以及它打开的帧级工作台，作为 `shell.overlay` 的 `research` 条目（order 10）。两个座位都由其他包声明（分别是 ui-sidebar 和 ui-layout），因此两处注册都走 `slots.inject` 并等待声明就位。工作台是宽幅固定浮层（96vw × 95vh）——overlay 层本身不拦截点击，因此工作台自己恢复 pointer events——左侧竖导航（五个视图 tab + 底部项目选择器），右侧内容区按当前 tab 渲染五个视图：**总览**（所选项目卡片：五阶段流水线进度、工件清单、时间戳）、**论文**编辑器（可折叠、可点击跳行的大纲栏，带同步行号列与自动保存状态徽标的 `main.tex` 源码编辑器，编辑器与预览 3:2 分栏，以及编译控件、按严重级配色的错误列表、通过 `/research/pdf/<project id>` 内嵌的 iframe PDF 预览）、**文献**库（已收录文献的卡片网格，摘要默认三行折叠可展开）、**实验**（运行记录表格：状态徽标、可展开指标，下方是 `EXPERIMENT_LOG.md` 工件的极简 markdown 渲染）、**图表**网格（论文目录图片文件的缩略图，经 `/research/figure/<project id>?path=…` 提供，点击放大浮层预览，刷新按钮强制重扫）。项目列表加载完成后会自动选中第一个项目，总览不再是空白开场。

每个 client runtime 有一个 `ResearchController` 支撑工作台，走生成的 `research` Remote 命名空间（`listProjects` / `getPaperOutline` / `compile` / `getCompileStatus` / `getPaperSource` / `savePaperSource` / `listPapers` / `listExperiments` / `readArtifact` / `listFigures`）。项目列表的读取推迟到首次打开面板时才发出，而不是挂载时——因为开关按钮随侧栏挂载，与面板是否被使用无关；加载失败保持可重试，重连时会重新同步已加载的视图。各 tab 的读取同样是惰性的：文献库在文献 tab 首次打开时加载，实验日志在实验 tab 打开时加载，图表扫描在图表 tab 打开时触发；同项目已就绪的工件或图表视图会跳过重复拉取，除非强制刷新。大纲、源码与实验记录加载按选择 supersede，先前所选项目的慢响应永远不会覆盖当前选择。每个项目行携带 wiki 记录的可选 `paperDir`；controller 会把它作为每个论文调用的 `dir` 参数转发（工作台也把它作为 `?dir=` 拼到 PDF 预览与图表 URL），因此论文位于 workspace 其他子目录的项目——通过 `wiki_note` 工具的 `set_project` action 设置——编辑、编译、预览和扫描的都是那个目录，而不是默认的 `paper`。

编辑在约 800 ms 防抖后经由 `savePaperSource` 的乐观并发自动保存（mtime 检查与原子写入都在宿主的写锁内完成）；未再改动的草稿保存成功后约 1.5 s 自动触发编译。编译进行中再次请求编译会排队，在在途编译结束后立即触发。当宿主返回 `conflict`——agent 写入了草稿没见过的新版本——草稿保留、编辑冻结，面板提供“重新加载”，把编辑器对齐回文件当前内容。带行号的错误列表条目会把编辑器的光标与视口跳到对应源码行。

面板的开合状态与所选项目存放在两处注册共享的同一个 store handle 中，因此开关按钮的按下态与面板内容不会分叉。

`/client` 的导出是插件本体（`apply`/`inject`）、inject 面与 props 类型、store 工厂，以及 controller/视图类型。组件保持包内私有。

## Model Experience

无。面板只是 wiki domain 与编译产物之上的纯视图；它从不进入只追加的 Session 日志、模型上下文或遥测。

#### KV Cache effect

无。面板的任何交互都不会触碰历史尾部。

## Known Limitations and Deferred Work

- **编译状态是宿主进程内存** —— 宿主重启会忘掉上次结果，此时面板显示 `idle`，直到下一次编译，即使磁盘上还留着之前构建的 `main.pdf`。
- **单一 workspace，按项目分论文目录** —— 每个项目的论文位于记录的 `paperDir` 子目录下（默认 `paper`，与 `/paper-write` 同一约定）；项目 id 用于面板的记账和 PDF 路由的授权，所有解析路径都被限制在 workspace 之内。
- **纯 textarea 编辑器** —— 无语法高亮、lint 或多文件感知；只有 `main.tex` 可编辑，`\input`/`\include` 引入的文件不可编辑。
- **无实时推送** —— 面板不轮询也不订阅宿主事件；在别处启动的编译（`/paper-compile` 命令或工具）要到下一次选择或编译时才可见，不会立即反映。外部对文件的修改也要等到下一次自动保存撞上 mtime 冲突时才会被发现。
