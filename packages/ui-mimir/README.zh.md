# Mimir 工作台 (dsh-client-ui-mimir)

[English](README.md) | 中文

Mimir 工作台插件的浏览器侧：一个“Mimir”开关按钮，作为 `sidebar.footer.action` 条带的 `research` 条目（order 10）贡献；以及它打开的帧级工作台，作为 `shell.overlay` 的 `research` 条目（order 10）。两个座位都由其他包声明（分别是 ui-sidebar 和 ui-layout），因此两处注册都走 `slots.inject` 并等待声明就位。工作台是宽幅固定浮层（96vw × 95vh）——overlay 层本身不拦截点击，因此工作台自己恢复 pointer events——左侧竖导航（六个视图 tab + 底部项目选择器），右侧内容区按当前 tab 渲染六个视图：

- **总览**——所选项目卡片：五阶段流水线进度、统计芯片（文献/实验/图表/服务器）、工件清单与时间戳，外加数据卡片：一键导出整个 wiki 为带日期的 JSON 快照，或经“摘要-确认”流程导入回放（合并跳过已存在主键、绝不覆盖；替换会先清空六张表，因此要点红字二次确认），导入完成后给出逐表的已导入/已跳过计数；
- **论文**编辑器——可折叠、可点击跳行的大纲栏（顶层章节可从行首手柄拖拽重排，在乐观大纲校验下重写 `main.tex` 的 `\section` 顺序），带零依赖 LaTeX 语法高亮、同步行号列与自动保存状态徽标的 `main.tex` 源码编辑器，编译控件与按严重级配色的错误列表（条目点击跳到源码行），通过 `/research/pdf/<project id>` 内嵌的 iframe PDF 预览，以及覆盖项目 `references.bib` 的参考文献面板（条目列表可删除、乐观并发保存带冲突重载、勾选文献库论文一键追加）；三栏可用拖拽手柄调宽且布局跨会话持久化，编辑器/预览栏可一键全屏、`Esc` 退出；
- **文献**库——已收录文献的卡片网格（摘要默认三行折叠可展开），支持可编辑标签与按项目关联、标签/当前项目筛选栏、面板内 arXiv 搜索一键导入 wiki、卡片删除、逐卡片一键加入 `references.bib`；
- **实验**——运行记录表格：状态徽标、共享数值指标的内联 SVG 对比条形图、逐 run 可展开指标、每行的服务器关联 badge 与内联下拉换绑、行删除，以及由内置受限 Markdown 渲染器渲染的 `EXPERIMENT_LOG.md`（标题、粗体/斜体/行内代码、代码块、列表、引用、分隔线、表格、链接，非 http(s) 的链接协议一律中性化为纯文本）；
- **图表**网格——论文目录图片文件的缩略图，经 `/research/figure/<project id>?path=…` 提供，点击放大浮层预览，上传（工具栏按钮，或直接拖拽进视图：悬停时显示虚线高亮框，不支持的类型会点名提示而不是静默忽略）、删除、复制 LaTeX 引用的卡片操作，外加强制重扫的刷新按钮；
- **服务器**面板——登记的 GPU 机器：TCP 连通性探测 + 尽力而为的 SSH `nvidia-smi` 读取（利用率/显存条），卡片与表单支持标签 chips、网格上方有标签筛选条，可增删改。

面板头部带深色/浅色主题切换和中/EN 语言切换（两者都落在宿主持久化偏好上），并支持快捷键：`1–6` 切换视图、`Esc` 关闭（有全屏栏时先退全屏）、论文视图内 `⌘/Ctrl+Enter` 编译。窄窗口下布局自动降级：宽度不足 900px 时论文视图收起大纲栏、编辑器/预览改为单栏 tab 切换；不足 700px 时侧栏变为顶部水平条，导航可横向滚动。项目列表加载完成后会自动选中第一个项目，总览不再是空白开场。

每个 client runtime 有一个 `ResearchController` 支撑工作台，走生成的 `research` Remote 命名空间——共 27 个方法：项目与论文（`listProjects` / `getPaperOutline` / `getPaperSource` / `savePaperSource` / `reorderPaperSections` / `compile` / `getCompileStatus`）、文献（`listPapers` / `searchArxiv` / `importPaper` / `removePaper` / `updatePaper`）、参考文献（`getBibliography` / `saveBibliography` / `importPapersToBib`）、实验与工件（`listExperiments` / `deleteExperiment` / `updateExperiment` / `readArtifact`）、图表（`listFigures` / `deleteFigure`——上传走 `/research/figure-upload` 路由）、服务器（`listServers` / `saveServer` / `deleteServer` / `checkServer`），以及 wiki 备份（`exportWiki` / `importWiki`）。项目列表的读取推迟到首次打开面板时才发出，而不是挂载时——因为开关按钮随侧栏挂载，与面板是否被使用无关；加载失败保持可重试，重连时会重新同步已加载的视图。各 tab 的读取同样是惰性的：文献库在文献 tab 首次打开时加载，实验日志在实验 tab 打开时加载，图表扫描在图表 tab 打开时触发；同项目已就绪的工件或图表视图会跳过重复拉取，除非强制刷新。大纲、源码与实验记录加载按选择 supersede，先前所选项目的慢响应永远不会覆盖当前选择。wiki 导入成功后会重新拉取所有已加载的切片，面板无需重开即反映新数据。每个项目行携带 wiki 记录的可选 `paperDir`；controller 会把它作为每个论文调用的 `dir` 参数转发（工作台也把它作为 `?dir=` 拼到 PDF 预览与图表 URL），因此论文位于 workspace 其他子目录的项目——通过 `wiki_note` 工具的 `set_project` action 设置——编辑、编译、预览和扫描的都是那个目录，而不是默认的 `paper`。

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
- **单文件编辑器** —— LaTeX 语法高亮是零依赖的 overlay 实现，无 lint 或多文件感知；只有 `main.tex` 可编辑，`\input`/`\include` 引入的文件不可编辑。
- **无实时推送** —— 面板不轮询也不订阅宿主事件；在别处启动的编译（`/paper-compile` 命令或工具）要到下一次选择或编译时才可见，不会立即反映。外部对文件的修改也要等到下一次自动保存撞上 mtime 冲突时才会被发现。在别处改动的 wiki 数据（`wiki_note` 工具、另一个窗口里的导入）同样在下一次加载时才刷新，而非实时。
