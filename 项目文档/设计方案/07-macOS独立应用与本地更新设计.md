# macOS 独立应用与本地更新设计

初稿：2026-09-10；审查修订与源码实施：2026-09-12。状态：**桌面源码已实施，构建、隔离协议及临时 macOS App 更新验证通过；真实知识库安装切换和全部已安装配套复核未执行。**

§1–§10 保留实施前冻结的设计与审查时点说明；最新实施差异见 §11，实际操作见 README，验收明细见 [实施验证记录](../验证记录/09-macOS桌面实现与隔离验证.md)。

本文面向个人调试、研发和日常验证。沿用当前 Node 后端、Vue Hub、SQLite 和 Codex 接入能力，增加 Electron 独立窗口与本地更新入口。文中的新增目录、命令和启动流程均为拟实施内容，不代表当前已经可用。当前使用说明仍以 [README](../../README.md) 为准。

## 1. 背景、目标与范围

用户需要独立应用窗口，不再手动启动后端、打开浏览器；研发修改后，通过一条命令更新本机 App。当前只服务同一位用户和同一台 Mac，接受依赖已有 Node 环境以及现有知识、数据库和配置位置。

成功标准：

1. 双击 `CodexMemoryOS.app`，自动启动后端并在独立窗口显示现有 Hub。
2. 关闭窗口后，后端继续为 Codex 提供 MCP；再次激活 App 可重新打开窗口。
3. 通过菜单退出或 `Cmd+Q` 彻底退出应用时，先正常停止后端，再完成退出。
4. 一条本地命令完成当前代码的构建、App 替换和启动，更新程序不覆盖知识与数据库。
5. Hook、Skill、全局规则、MCP 注册和 CLI 调用方式按实际变化人工维护，不强制随每次 App 更新重装。

首版不包含对外分发、App Store、开发者签名与公证流程、自动更新服务器、开机自启、菜单栏常驻、独立服务管理平台、全局配置同步器。打包工具自身要求的本机构建步骤仍按实际工具处理。

数据库结构由用户在研发时与程序同步修改；本次不新增数据库版本检查、自动迁移、跨版本兼容或数据库回退流程，也不因打包删除现有后端中的校验和维护代码。

## 2. 现有实现与复用入口

以下为本次设计已核对的源码事实，不构成 Electron 运行验证。

| 当前能力 | 源码依据 | 本次复用方式 |
|---|---|---|
| 后端可独立启动，并返回统一关闭方法 | [runtime.ts](../../apps/server/src/runtime.ts) 中 `startCodexMemoryOsServer()`、`close()` | 保留后端入口和资源管理 |
| 命令行入口响应 SIGINT、SIGTERM | [main.ts](../../apps/server/src/main.ts) | App 退出时向自己启动的后端发送 SIGTERM |
| 单个服务提供 Hub、REST、健康检查与 HTTP MCP | [runtime.ts](../../apps/server/src/runtime.ts)、[app.ts](../../apps/server/src/app.ts) | 窗口继续通过 HTTP 加载 Hub，Codex 继续访问 `/mcp` |
| 项目固定普通 Node 环境并使用原生 SQLite 模块 | [根 package.json](../../package.json)、[Server package.json](../../apps/server/package.json) | 后端继续使用当前项目要求的 Node，当前基线为 `22.16.0` |
| 后端依赖工作区共享 ID 包 | [ID 包](../../packages/id-generator/package.json) | 打包包含其构建产物及生产依赖 |
| Hook、CLI 与安装源具有各自入口 | [UserPromptSubmit 包装](../../integrations/codex/user-prompt-submit.sh)、[评估包装](../../integrations/codex/capture-hook.sh)、[安装清单](../../integrations/codex/manifest.json) | 保留既有入口，按研发变化逐项维护 |

当前后端通过代码位置定位 `apps/hub/dist`。打包时保留 Server 与 Hub 的相对目录关系，不为此新增一套静态资源访问接口。

2026-09-12 补充核对：[main.ts](../../apps/server/src/main.ts) 当前在启动完成后输出 JSON `listening` 日志并注册信号处理，尚无桌面 IPC 回执和构建身份；不能将现有日志直接当作下文新增协议已实现。[runtime.ts](../../apps/server/src/runtime.ts) 的 `closeServer()` 已调用 `server.close()` 与 `closeAllConnections()`，随后关闭数据库相关服务和索引管理器；[MCP HTTP 入口](../../apps/server/src/mcp/http.ts) 已在响应关闭或结束时关闭 transport 与 MCP server。活动请求、异步清理及启动中退出是否完整收尾，仍需真实项目测试，不能据参考报告的通用 HTTP 实验认定当前实现有缺陷。

## 3. Electron 与 Node 的选择

“现有 Node API”指后端业务代码；“Node”还可以指执行这些代码的运行环境。Electron 自身包含 Node 能力，但不要求后端必须在 Electron 的运行环境中执行。

| 方式 | 后端如何运行 | 本次决定 |
|---|---|---|
| Electron 内置 Node | 主进程或后台进程直接执行后端代码 | 技术上可行，首版不选 |
| 本机现有 Node | Electron 启动本机 Node 子进程，执行现有后端构建产物 | **首版采用** |
| App 携带独立 Node | Electron 启动 App 内附带的 Node 可执行文件 | 首版不做，本机环境依赖已被接受 |

采用第二种方式的依据：现有后端、Hook 和 CLI 均使用普通 Node；`better-sqlite3` 包含原生依赖。如果改用 Electron 内置 Node，需要匹配其原生模块 ABI，并将相关产物与普通 Node 入口分开管理。当前独立窗口和一键更新的目标不要求改变后端运行环境，因此复用现有方式。

Electron 主进程只负责应用生命周期、窗口和后端子进程；不加载后端的 SQLite 模块。Server 的生产依赖按普通 Node 构建，不对其运行 Electron 原生模块重编译。窗口复用 Vue Hub，通过现有 HTTP API 访问业务，不启用窗口的 Node 集成，也不改写为 Electron 专用业务接口。

这是对当前范围的选择，不是性能实测结论。参考 [Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model) 与 [原生模块说明](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)，本次已在方案讨论中核对其对应边界。

## 4. 程序、运行环境与数据位置

### 4.1 App 携带的内容

App 包含 Electron 桌面程序，以及 Server、Hub、共享包和后端生产依赖的构建快照。后端由本机 Node 执行 App 内的快照，不在日常启动时临时构建源码。

拟采用以下资源关系，具体 Electron 打包输出由实施时选定的工具生成：

```text
CodexMemoryOS.app/Contents/Resources/
  app 或 app.asar                 Electron 桌面程序
  runtime/
    apps/server/package.json     保留 ESM 声明
    apps/server/dist/            后端及相关编译产物
    apps/hub/dist/               Hub 静态资源
    node_modules/               普通 Node 生产依赖，包含共享 ID 包
    build-info.json             本次程序快照身份及 Node/架构构建基线
  local-runtime.json            本机启动路径与既有运行参数
```

`runtime/` 以普通文件目录放在 Electron 的 ASAR 之外，供独立 Node 直接读取；ASAR 的透明读取是 Electron 提供的能力，不能假定本机 Node 具有同样行为，参见 [ASAR 说明](https://www.electronjs.org/docs/latest/tutorial/asar-archives)。生产依赖必须完整可解析，不能只复制仍指向开发仓库的包管理器链接。无需复制整个源码仓库、开发依赖或知识文件。

Electron 及其自身依赖与后端运行依赖分别处理；App 不再额外携带独立的 Node 可执行文件。

### 4.2 本机启动配置

打包时根据本机配置生成 `local-runtime.json`，只保存 Node 可执行文件绝对路径和现有后端启动参数。配置承载方式是本机安装细节，不建设配置管理服务或同步协议。

- Node 使用本机已有的明确路径；不依赖从 Finder 启动时恰好存在的终端 `PATH`。
- Asset Repository、SQLite、Workspace 配置、日志路径与端口沿用现有配置，字段含义见 [README 配置说明](../../README.md#配置)。
- Electron 使用 `child_process.fork()`，显式指定普通 Node 的 `execPath`、空的或明确列出的 `execArgv`、包内 runtime 的绝对 `cwd`、入口和参数数组，并设置所需环境变量。不继承会注入模块或改变解析的 `NODE_OPTIONS`、`NODE_PATH` 等环境，不拼接 shell 命令，也不误将 Electron 的可执行文件当成普通 Node。仅保留父子进程的生命周期 IPC，不新增渲染器业务 IPC。依据见 [Node 22.16.0 child_process](https://nodejs.org/download/release/v22.16.0/docs/api/child_process.html)。
- 本机 Node 或数据路径改变时，由用户修改本机配置并重新更新 App；首版不自动下载 Node、不发现或迁移数据目录。

### 4.3 数据继续留在现有位置

知识 Markdown、SQLite、Workspace 配置、日志和评估缓存不放入 App，也不迁往新的 Application Support 目录。Server、现有 Hook 和 CLI 继续指向同一份数据与授权配置。

后端启动后的索引维护、日志和使用事实写入沿用既有行为；更新脚本不初始化、重建或覆盖数据库，不修改能力授权。程序包的构建快照与知识内容的 CURRENT/PREVIOUS 快照是不同概念。

### 4.4 普通 Node 与生产依赖的可执行检查（D05）

构建时将指定 Node 的实际版本、`process.arch` 和原生模块 ABI 记录到 `build-info.json`；启动前核对本机 Node 符合该包基线，当前要求版本为 `22.16.0`，体系结构以本机实际构建选择为准，不混用 arm64 与 x64 产物。路径存在不等于环境可用；缺失或不匹配时报告并停止，不自动安装、下载或修复本机环境。

打包验收从开发目录之外启动指定 Node，清理 `NODE_PATH`、`NODE_OPTIONS` 等可能掩盖缺包的环境，加载包内 Server、共享 ID 包、`better-sqlite3`，并在临时数据库执行最小建表、写入、查询及关闭。只使用隔离数据与显式参数，不能连接真实库验证依赖。

检查生产依赖的实际解析路径和符号链接最终目标都位于 App 内；允许包内部闭合的相对链接，不一律删除 symlink。runtime 必须在 ASAR 外，Electron 打包步骤不得将后端模块改编译为 Electron ABI。上述检查与 Finder 启动验收一起证明可执行性，不能用终端开发模式成功替代。

## 5. 启动、窗口与退出

### 5.1 启动

1. Electron 使用自身的单实例能力；再次打开 App 时激活已有实例，不再启动第二份后端。安装身份与测试隔离见 §6.1。
2. 读取本机启动配置并检查 §4.4 的运行基线；先设置退出状态和子进程事件处理，再启动后端，立即保存 ChildProcess 句柄。stdout/stderr 持续消费并写入日志，或直接重定向到日志文件，不能留下无人读取的管道。
3. 等待本次子进程通过 IPC 报告实际监听成功，核对 §5.4 的构建身份和当前状态响应；准备完成且未进入退出流程才加载 Hub。`/health` 只能说明服务可响应，不能替代索引就绪判断。
4. `error`、提前退出、IPC 断开或准备超时立即使本次启动失败，显示可理解的原因和日志位置，不显示无响应的空白 Hub，也不自动切换端口。超时但子进程仍在时保留句柄和受管理的错误状态，由同一退出流程收尾；不能因等待结束而遗失进程。

App 只管理自己启动的后端。若原来的开发服务仍占用目标端口，报告冲突，由用户正常退出原服务后重试；不接管外部进程、不按端口批量杀进程。首次切换到 App 时需结束原来手工启动的服务。

### 5.2 窗口行为

| 用户操作 | 预期行为 |
|---|---|
| 点击关闭窗口按钮 | 关闭窗口，App 与后端继续运行，HTTP MCP 保持可用 |
| 点击 Dock 图标或再次打开 App | 聚焦已有窗口；无窗口时创建窗口，复用现有后端 |
| 菜单退出或 `Cmd+Q` | 进入完整退出流程，停止后端后退出 Electron |

显式处理 `window-all-closed`，让应用在无窗口时继续运行；通过 `activate` 恢复窗口。不能直接省略事件处理，因为 Electron 在未订阅 `window-all-closed` 时默认退出应用。生命周期依据见 [Electron app API](https://www.electronjs.org/docs/latest/api/app)。首版无需为上述能力额外增加菜单栏常驻图标。

### 5.3 彻底退出与异常收尾（D02）

Electron 在 `before-quit` 中先通过 `event.preventDefault()` 拦截默认退出，设置正在退出状态，向它持有的后端子进程发送 SIGTERM，等待子进程实际结束及标准流关闭后再完成退出；不能只给事件回调加 `async` 并假定 Electron 会等待。重复 Cmd+Q 和菜单退出复用同一个关闭 promise；收尾完成后设置允许退出标志，再调用 `app.quit()`，避免 `before-quit` 重入循环。无需增加 HTTP 关闭接口。

后端收尾完成后关闭新增 IPC 通道，避免它维持进程存活。Electron 将本次子进程的正常退出或异常结果写入同一桌面日志，使用结构化记录关联 buildId、主/子进程身份（含启动时间）与退出码/信号；更新脚本核对本次记录和实际进程结束，不从旧日志推断成功。异常退出码、信号终止、缺少可关联结果均不算正常关闭，不为这些记录建设版本或服务状态数据库。

启动中退出时，取消后续窗口创建和所有晚到的就绪回调；尚未创建子进程则不再创建，已创建则仍由本 App 收尾。后端入口需在异步启动前安装信号处理：收到退出请求后，不发送成功回执，待已创建资源可关闭时复用 `runtime.close()` 或现有启动失败清理路径。此项是对当前信号注册时机的薄适配要求，不重写业务服务。

活动 MCP 请求、流式响应或会话存在时，核验 §2 所列 HTTP/transport 关闭、进行中的业务操作与数据库、watcher 收尾顺序。允许按现有关闭语义中断连接，但不能把“SIGTERM 已发送”或“端口暂时不可访问”当作资源已释放。先对当前实现验证；只有发现真实失败才针对缺口薄修补，不预设增加 transport 管理平台。

运行中的子进程意外结束时，清除服务就绪状态，窗口显示服务不可用；首版由用户退出重开，不自动循环重启。关闭超时或关闭异常时报告未正常完成，更新流程必须停止，不能替换包，也不自动 SIGKILL 后声称正常退出。若异常时子进程已经结束，可让 App 退出，但保留失败结果，不据此放行更新。强制退出和操作系统崩溃不纳入正常退出成功保证；App 不杀 Codex、用户终端或独立 CLI。

### 5.4 子进程回执与构建身份（D01）

每次临时组装生成新的不透明 `buildId`（例如随机 UUID），同一份 `build-info.json` 随产物验证和安装移动，不在替换时重新生成。它标识一次程序快照，允许未提交代码，不使用 Git HEAD 代替，也不写入业务数据库或新建版本账本；它不是权限凭据或代码完整性签名。

后端从自身 runtime 快照读取并固定 `buildId`，仅在 `startCodexMemoryOsServer()` 实际监听完成后，经父进程持有的 IPC 通道发送 `{ type: "listening", buildId, endpoint }`。父进程校验消息形状、构建身份与配置中的 endpoint，只接受这一个 ChildProcess 的消息。普通 stdout 日志、PID 变化和端口占用都不是回执；错误、提前退出或退出中的回执不能改变失败/退出状态。无桌面 IPC 的原有 CLI 启动保留正常使用方式。

为让外部更新脚本核对响应归属，拟在现有 `/api/system/status` 响应增加可选 `buildId` 字段，由启动时固定值提供，不能每次请求重读已替换文件。旧的非 App 启动允许无此字段；桌面及更新验收必须有且等于本次目标值。实施时同步 REST 类型、Hub 展示契约和相关检查，不新增路由或改变 MCP 输入协议。

字段位置为成功响应的 `data.buildId`，即 `SystemStatusDto` 顶层可选字段；业务状态仍读取 `data.service.readiness` 与 `data.mcpEndpoint.ready`。新增字段只用于产物核验，不要求在普通 Hub 用户流程显示实现细节。

服务成功条件同时满足：当前子进程仍存活且实际监听回执有效、响应 `buildId` 匹配、既有 `service.readiness` 为 `READY` 且 `mcpEndpoint.ready` 为真；索引与 watcher 的判断沿用 [SystemStatusApplicationService](../../apps/server/src/http/service.ts)。在这些条件满足后才加载 Hub；更新还要求 §6 的旧进程退出和目标路径检查通过。HTTP 200、旧服务 READY、目录存在或 `open` 返回零均不能单独证明更新成功。

### 5.5 独立窗口与链接边界（D06）

显式设置 BrowserWindow 的 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`。现有 Hub 继续使用同源 HTTP API；无必要不增加 preload，更不暴露任意文件读取、命令执行或业务 IPC。窗口与外链策略依据 [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) 和 [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)。

窗口只允许配置中 `http://127.0.0.1:<固定端口>` 的 Hub 正常导航，主进程 `loadURL`、页面导航和重定向都校验解析后的 origin，不能按字符串前缀放行。通过 `setWindowOpenHandler` 拒绝创建新窗口；同源合法链接可在原窗口导航，经 URL 解析校验为合法 `http:`/`https:`、无嵌入凭据的外部引用，在用户点击后交由系统浏览器打开，不把不可信字符串直接交给 `shell.openExternal`。

`javascript:`、`data:`、`file:`、任意应用协议和格式错误的目标不直接执行。当前未核实有受支持的本机文件/应用协议打开入口，首版对这类目标显示“不支持此链接”，保留原文供用户查看；如现有使用链确有已支持协议，实施前逐项确认其处理入口并验收，不能一律放行或静默失效。保留服务端 Host/Origin、Markdown HTML 与路径资格边界，不因 localhost 关闭浏览器安全检查。

## 6. 一条命令更新本地 App

拟提供仓库根入口 `./scripts/update-app.sh`，当前尚未创建。命令面向当前本地代码，包含用户有意保留的未提交修改，不自动执行 Git 拉取、提交、推送或清理。

### 6.1 固定身份、互斥与正常退出入口（D03）

首版拟固定 App 名称为 `CodexMemoryOS.app`、bundle ID 为 `local.codexmemoryos.desktop`、安装目标为 `/Applications/CodexMemoryOS.app`。这三个值由桌面构建配置统一提供；首次安装需验证目标归属和父目录写权限，不能覆盖同名但身份不符的 App，也不自动提权。桌面单实例使用与该身份对应的固定 Electron userData 路径，其缓存不属于知识数据迁移。隔离测试使用独立 bundle ID、userData、端口及临时数据，不能误激活正式实例。

更新脚本在开始构建前，以安装目标对应的本地锁目录（例如同一父目录的 `.CodexMemoryOS.update.lock`）原子创建实现互斥，直到完成或失败才释放自己取得的锁。第二次并发更新直接报错；无法判定归属的残留锁报告后交由用户处理，不删除别的更新进程持有的锁。不为此创建服务或数据库。

正常退出入口拟使用 `/usr/bin/osascript` 向已确认正在运行、路径与 bundle ID 匹配的旧 App 发送 Apple Event `quit`，由 Electron 的 `before-quit` 执行 §5.3 收尾。只在旧 App 确实运行时发送，避免退出请求反而启动 App。不得使用 `app.exit()`、直接终止主进程或只杀 Node 来替代。Apple Event 机制参考 [Apple quit 事件](https://developer.apple.com/documentation/coreservices/kaequitapplication)；这条接线尚须在真正 macOS App 上验证会触发退出钩子，命令返回不代表已完成退出。请求被拒绝、失败或超时时停止更新，不能绕过系统信任处理。

发出请求前，从匹配的应用主进程识别其普通 Node 子进程，核对父子关系、可执行路径与包内入口，保存 PID、启动时间和路径作为本次等待依据；发现额外或归属不清的后端则停止。等待已识别的旧主进程及后端实际结束，复核没有同身份重新启动的实例，再检查端口未被占用。PID 不用于单独判断归属或成功，更不能据端口杀进程。操作者在受控退出至新包启动期间不手动重开 App；替换前发现重开则中止，不以更新互斥锁冒充对用户启动的全局锁。

### 6.2 更新顺序与失败边界

更新步骤：

1. 取得 §6.1 的更新锁，检查本机构建环境、安装身份和 §7.1 的人工停工条件；首次安装时设置本机启动参数，后续复用。
2. 按项目锁定版本准备依赖，构建共享 ID 包、Server、Hub 和 Electron 桌面程序，在独立 staging 组装完整 App 并生成 buildId。打包与普通工作区 build 分开，避免脚本递归调用自身。
3. 按 §4.4 验证生产依赖闭合、SQLite、静态资源、子进程回执和准备条件。服务使用隔离数据与临时端口，测试结束确认进程释放，不启动第二个连接真实数据库的实例。旧 App 此时继续使用自己的快照。
4. 新包通过检查后，按 §6.1 请求旧 App 正常退出并等待主进程、后端结束。任一未结束或未正常收尾即停止。把验证过的新包准备在同一安装父目录内，先重命名保留旧包，再把新包换入固定目标；不先删旧包再复制，不热覆盖运行中的 App。两次普通 rename 不是抗断电的原子交换。
5. 从固定目标路径打开新 App，按 §5.4 校验目标 buildId、真实监听和既有就绪条件。新 App 的窗口加载必须由其本次子进程回执放行；更新脚本还核对匹配安装路径的主进程及其后端关系，不能只检查 `open` 退出码。成功后报告目标构建和日志位置；完整配套是否通过另按 §7.2 明示，不能仅因 App 启动就宣称全部能力验收通过。

构建或隔离验证失败时，停止更新并保留旧 App。文件替换失败时可恢复旧程序位置；业务启动失败时报告具体原因，保留旧程序供用户处理，不自动运行数据库修复、迁移或跨版本回退。保留旧程序不构成数据库兼容性保证。

恢复仅处理可捕获的文件替换失败：确认未启动新 App 后恢复本次保留的旧包；恢复也失败则报告现存路径，不继续覆盖。旧程序尚未结束、端口被占、退出入口失败以及新服务身份不匹配，都不能转为“更新成功”。脚本中断或断电不保证自动恢复，实施验收不把异常注入等同于断电安全。

只保留处理本次文件替换所需的旧程序副本，不建立多版本安装、更新服务器或自动回滚平台。新 App 仍依赖本机 Node，不把本次更新变成运行环境升级。

## 7. Codex 配套内容的维护

各入口需要在功能变化时保持语义配套，但不要求每次更新 App 都改写所有安装文件。

| 内容 | 首版维护方式 |
|---|---|
| Electron、Server、Hub、后端生产依赖 | 一键命令构建并更新 App 内产物 |
| MCP 服务实现 | 随 Server 更新 |
| Codex MCP 注册 | 沿用已安装地址；地址、端口或注册方式变化时人工调整 |
| Hook 包装脚本与注册 | 保留原入口；路径、参数、协议或启用事件变化时逐项调整 |
| 已安装 Skill | 修改相应知识流程时按需维护，不因 App 更新全量覆盖 |
| 全局 `AGENTS.md`、`KNOWLEDGE.md` | 按实际规则变化人工维护，保留无关个人规则 |
| CLI | 随 Server 构建生成；原有仓库调用入口继续可用，路径或参数改变时人工调整 |

当前 Hook 和 CLI 可以继续执行仓库中的构建产物，App 执行包内的构建快照；共享的是源码与外部数据，不要求所有入口立刻改为调用 App 内文件。研发修改影响多入口语义时，由用户同步处理，本次不建设强制版本绑定或配置同步器。

### 7.1 更新期间的人工边界（D04）

仓库构建可能先把 Hook/CLI 的 dist 更新为 B，而旧 App 仍运行 A；共享源码和数据不证明两者自动兼容。执行更新前先完成正在进行的同库工程交付、Hook/CLI 工作，更新期间不启动新的同库 Hook/CLI，也不在后台并行改库。这是个人研发的作业条件，不新增全局任务阻断器。

单纯桌面/Hub 变化不重装全部 Skill、规则或 Hook。协议、参数、路径变化时，先在停工窗口完成必要的人工配套维护，再启用新的调用链；未完成则标记“配套未验证”，不能宣布可恢复全部工作。涉及数据结构变化时，先停止旧 App 和所有同库写入，按既有授权与维护步骤由用户完成配套调整，再启动新程序；脚本本身不执行数据库变更，也不能让旧 App A 与不兼容的新结构同时运行。程序启动前的数据兼容性仍由操作者负责。

App 退出只负责自己的常驻后端；独立 CLI 仍可由用户另行执行。“常驻服务已停止”不承诺禁止全部离线 CLI。安装配置中的路径、Node、SQLite、Repository 和 Workspace/capability 范围要逐项核对，评估 Hook 则核对其评估缓存路径，不强行给不访问数据库的入口添加数据库依赖。

`integrations/codex` 是安装源与示例，不能把它的更新直接等同于已安装 Skill 或全局文件已经更新。实际安装位置以 [安装清单](../../integrations/codex/manifest.json) 和本机配置为准。

MCP 沿用官方 `config.toml` 的 `[mcp_servers.<名称>]` 配置方式，HTTP URL 指向后端 `/mcp`；不生成自定义的 `~/.codex/codex-memory-os.json` 作为注册入口。保持当前端口可避免重新注册，不能将文档示例端口当成本机已安装值。依据见 [OpenAI MCP 文档](https://developers.openai.com/codex/mcp) 与仓库 [配置示例](../../integrations/codex/mcp.toml.example)。

### 7.2 现有能力与验收入口

以下矩阵依据本次源码和 [安装清单](../../integrations/codex/manifest.json) 核对；清单是安装记录，不是本轮重新验证的实时状态。所有桌面与已安装链路验收当前均待执行。实施批次 C 应记录每项实际执行路径、Node、数据/配置位置、启用状态及结果，不能以示例或历史安装 Hash 替代当场检查。

| 现有能力 | 当前入口与拟运行位置 | 实施验收内容 |
|---|---|---|
| Hub 只读页面与操作 | App 内 Hub；[App.vue](../../apps/hub/src/App.vue)、[REST router](../../apps/server/src/http/router.ts) | 总览、资产搜索/筛选/详情/原文、收件箱与诊断、工作区、召回详情、使用记录、系统状态；独立窗口渲染、导航及外链策略 |
| Recall / Read / Used | App Server `/mcp`；[tools.ts](../../apps/server/src/mcp/tools.ts) 的 `knowledge_recall`、`asset_read`、`asset_mark_used` | 实际 Codex 连接目标 buildId 对应服务，核对显式能力范围、当前正文资格、稳定引用和 Used；隔离测试覆盖 Used，真实使用仅在实际采用时结算，不造事实 |
| 候选与人工确认 | 已安装 capture Skill 准备候选；仓库 `dist/asset/confirm-cli.js`，见 [confirm-cli.ts](../../apps/server/src/asset/confirm-cli.ts) | 隔离候选准备、Hub 只读查看、新增/修订确认及 Hash 拒绝路径；真实正式确认仍须对确切内容另获人工批准，App 不增加确认按钮 |
| CURRENT/PREVIOUS 与 Diff | [content-version.ts](../../apps/server/src/asset/content-version.ts)、[content-diff.ts](../../apps/server/src/asset/content-diff.ts)、REST `/api/assets/:assetId/diff` | 隔离数据确认/修订后的双版和 Diff，升级前后非派生快照保留；当前 Hub 未接入 Diff 交互，不以打包为由补建页面 |
| UserPromptSubmit | 清单记录注册到 `knowledge-base/user-prompt-submit.sh`；源码入口 [user-prompt-submit.ts](../../apps/server/src/hook/user-prompt-submit.ts) | 核对实际包装、普通 Node 与仓库 dist，Repository/SQLite/Workspace 配置一致；正常信任下新回合真实触发与能力交付 |
| 评估与非阻断提醒 | 已安装 capture Skill；[capture-hook.sh](../../integrations/codex/capture-hook.sh) → 仓库 `dist/hook/capture-cli.js` | 核对实际启用的 UserPromptSubmit、PostToolUse、Stop；新回合评估标识、活动与短结果、Stop 提醒和缓存路径，不能用直接运行 CLI 替代 Hook 自动触发验收 |
| 现有维护 CLI | [maintenance-cli.ts](../../apps/server/src/maintenance-cli.ts)、[Server scripts](../../apps/server/package.json) | 列明 `rebuild-index`、`migrate-knowledge`、`migrate-recall`、`retire-old-runtime`、`revoke-capability` 的现有入口；构建/参数与失败路径在隔离环境核对，迁移/撤销/删除命令不在真实库作为打包 smoke 执行 |

已删除的 Task/Loadout 不属于矩阵；旧 smoke 中若仍引用退役协议，应先迁移相关 fixture/断言再用于对应验收，不能恢复旧能力或以旧测试替代。尚未实现/未安装的能力标明不适用；对清单记载启用但现场不工作的能力记录失败或未验证，不能简单降为不适用。

## 8. 实施落点与验证

拟新增 `apps/desktop/` 承载 Electron 主进程、窗口与子进程管理，新增 `scripts/update-app.sh` 承载本机更新；沿用现有 Server、Hub 和 ID 包。Server 入口仅新增必要的 IPC 监听回执、启动中退出适配和构建身份读取，REST 状态响应及 Hub 类型同步可选 buildId；活动连接关闭根据实测决定是否薄修补。实施时确定并锁定适用于本机的 Electron 与打包工具版本，当前不填写未经验证的版本或完成时间估算。

实施完成后，当前使用命令维护到 README，本设计保留取舍与边界，不另建重复的安装说明或版本账本。

分三个可独立验收的批次，不建立新阶段管理系统：

1. **A：生命周期闭环。** 普通 Node 子进程、监听回执、独立窗口、单实例、关窗保留、激活重开及完整退出；使用隔离 fixture 或获授权准备的隔离副本，不触碰个人安装配置。包含启动中退出、连续退出、活动 MCP 请求时退出、启动失败和运行中后端退出。
2. **B：程序快照与本地更新。** 生产依赖闭合、Hub 资源、buildId、staging、互斥、正常退出、替换及目标服务验证。分别注入构建失败、替换失败、端口占用、旧服务未退出和新服务启动失败。
3. **C：已安装使用链。** 在 macOS 正常信任、Finder 启动下逐项执行 §7.2，明确真实路径和启用状态。App 启动成功与全部已安装能力通过分别记录。

按 [验证约定](../../工程约定/验证约定.md) 完成与实际改动匹配的检查，至少验证以下结果：

| 验证场景 | 通过标准 |
|---|---|
| 打包产物依赖 | 指定普通 Node 版本/架构/ABI 匹配；开发目录外、清理模块注入环境后加载包内依赖并读写临时 SQLite；解析与链接不越出 App |
| Hub 资源 | 包内后端正确提供页面和资源，独立窗口真实渲染正常 |
| 首次启动与重复打开 | 服务准备完成后显示 Hub，重复打开不增加后端实例 |
| 关窗、激活、彻底退出 | 关窗后 MCP 仍可用；激活恢复窗口；正常退出后后端进程和端口释放 |
| 启动与退出异常 | Node 路径无效、启动中 Cmd+Q、重复退出、准备超时但子进程存活、运行中后端退出可见且有归属；关闭超时不替换、不默认强杀 |
| 活动连接和日志 | 真实 MCP 请求/流存在时退出，验证 HTTP/transport、watcher 与数据库收尾，标准流持续被消费；普通 SSE 实验不能替代 |
| 服务身份 | 旧服务 READY 而新子进程 EADDRINUSE 必须失败；回执或响应 buildId 不匹配必须失败；只有本次目标实际监听且就绪才成功 |
| 本地更新 | 并发更新被拒绝；构建/隔离失败不换包，旧进程未结束不替换，可捕获替换失败恢复旧位置；新业务启动失败保留副本但不自动回退 |
| 数据边界 | 安装替换阶段不修改知识、SQLite、授权和配套配置；启动后按语义比较非派生内容保留，允许既有索引、日志、正常操作事实写入，不要求整个 SQLite 字节不变 |
| 窗口安全 | 四项 webPreferences 明确启用隔离；越界导航、重定向、window.open、危险协议被阻止，合法外链进入系统浏览器；主体仍为独立 Hub |
| 完整能力 | §7.2 的 Hub、Recall/Read/Used、候选/人工确认、双版/Diff、已启用 Hook 与有效 CLI 分项验收，保留授权和隔离边界 |

完整更新验收闭环：A 包实际 Recall/Read → 关窗 MCP 可用 → 暂停同库 Hook/CLI 作业 → 构建并隔离验证 B → A 正常退出且后端结束 → B 换入固定路径并返回目标 buildId → Hub 打开、非派生数据保留 → 已安装 Hook/当前 CLI 按预期工作 → Cmd+Q 后 B 后端与端口释放。阶段失败即停止，不把后续未执行项标为通过。

文档阶段仅检查内容完整性、链接和差异，不运行上述未来验收，也不把普通 Node 既有测试结果表述为 Electron 已通过。

## 9. 取舍依据

本次消融是对已确认方案的反事实整理，未实施 A/B 实验。

| 去掉的机制 | 是否仍满足当前目标 | 结论 |
|---|---|---|
| 独立应用窗口 | 否，用户已明确需要 | 保留 Electron 窗口 |
| 额外打包独立 Node | 是，接受现有本机 Node 依赖 | 首版不做 |
| 把后端改为 Electron 内置 Node 执行 | 是，普通 Node 子进程可复用全部 API | 首版沿用普通 Node |
| 新增 HTTP 关闭接口 | 是，已有 SIGTERM 与统一关闭方法 | 不新增 |
| 数据库升级管理 | 是，研发时由用户同步修改数据库与程序 | App 更新不承担该职责 |
| 全局配套强制同步 | 是，用户按实际变化逐项维护 | 不新增同步系统 |
| 程序与数据分离 | 否，替换 App 不能覆盖知识和数据库 | 保留现有外部数据位置 |
| 更新前构建验证与保留旧程序 | 文件替换失败时无法保证旧程序仍可恢复 | 保留必要的本地更新步骤 |

上述范围只针对个人研发阶段。将来如明确需要脱离本机环境、对外分发或自动管理配套，再重新评估对应需求；不将这些方向加入当前实施清单。

## 10. 审查落实与证据边界

修订依据为用户提供的仓库外文件 `CodexMemoryOS-macOS-App-design-review-and-ablation.md`（《CodexMemoryOS macOS 独立应用方案审查与消融》），本次完整阅读后仅修订本文，不复制其指令执行代码、安装或迁移。主方案、只读 Hub、现有实现及项目既有放行状态保持原边界；“补齐契约”不等于桌面实现通过。

本次审查输入的原始字节 SHA-256：`e9a817d9699f346b54a16058e3822a8de4331240f2522c16f40ef05a7a329751`。此值仅用于识别修订依据，不表示该报告的实验已经复验。

| 审查项 | 本文落实位置 | 文档完成与实施边界 |
|---|---|---|
| D01 本次服务与目标构建身份 | §4.1、§5.1、§5.4、§6.2 | 已定义 IPC 回执、固定 buildId 和成功条件；尚未实现新字段或桌面协议 |
| D02 退出与活动连接 | §2、§5.1、§5.3、§8 | 已列真实既有 close 机制、竞态、超时、日志与关闭结果；真实活动 MCP 收尾待测 |
| D03 更新顺序与归属 | §6、§8 | 已明确固定身份、本地互斥、Apple Event 正常退出、等待与替换恢复；macOS 退出接线与打包待验收 |
| D04 完整能力及配套 | §7、§8 | 已列源码/安装清单能力矩阵和人工停工边界；未改安装注册，真实启用状态须在实施时核对 |
| D05 普通 Node 可执行验证 | §4.2、§4.4、§8 | 已定义版本/架构/ABI、包内依赖闭合和临时 SQLite 检查；本轮未运行 |
| D06 窗口安全和链接 | §5.5、§8 | 已定义四项配置及导航、外链、未知协议行为；独立窗口尚未实现 |

报告自述在 Linux x64 / Node v22.16.0 上执行 E1–E5；本轮仅收到报告正文，未取得或运行其 `ablation.mjs`、`results.json`，不独立背书实验结果。以下只记录其报告的机制证据和本项目需要验证的事项：

| 参考实验 | 报告所述反例 | 本设计采用的约束 |
|---|---|---|
| E1 | 开发目录重建导致服务 A / 页面 B 混用 | 保留程序快照，日常不加载开发目录资源 |
| E2 | OLD READY 掩盖 NEW 的 EADDRINUSE | 校验持有子进程的监听回执与目标 buildId |
| E3 | SIGTERM 已发出但清理未结束，新服务仍端口冲突 | 等待实际正常退出，不以固定 sleep 放行 |
| E4 | 通用 SSE 活动流影响 close | 专项验证当前 MCP 与资源收尾，不据此判定项目 close 缺陷 |
| E5 | 注入复制/替换失败破坏旧程序 | staging、旧包保留、可捕获失败恢复；不宣称断电原子性 |

参考实验不是 Electron、真实 MCP/Hook/CLI、原生 SQLite 或 macOS PASS；E4 的 200ms 观察窗不是产品超时配置。审查修订轮仅做源码对照、文档覆盖与链接/差异检查，没有运行上述实验、业务测试或 App 验收，也未恢复 Task/Loadout 或启动新的实施任务；之后获授权实施的结果见下节。

## 11. 2026-09-12 实施状态

已新增 `apps/desktop/` 与 `scripts/update-app.sh`，保留普通 Node、外部数据和既有 REST/MCP。新增后端启动回执/构建身份、启动中退出处理、窗口隔离与正常退出、包内依赖检查、互斥更新和新产物验证。Server/Hub 类型同步了可选 `buildId`；没有新增数据库迁移、HTTP shutdown、托盘或服务守护。

实施细节相对示意结构的具体化：

- 普通 Node 的生产依赖位于 `runtime/apps/server/node_modules`，保留 pnpm 内部闭合相对链接。部署在一次性临时工作区进行，避免 legacy deploy 改写开发工作区安装状态；复制 App 时保留相对链接并再次校验边界。
- 父子进程先交换 `booted` 信号处理已安装回执，再处理启动中 SIGTERM；实际监听后才发送含 buildId 的 `listening` 回执。关闭新增 IPC，避免进程因通道残留无法结束。
- 用户点击外部 HTTP(S) 链接后，经本地对话框选择在系统浏览器打开。窗口仍禁用 Node 集成，并开启上下文隔离、sandbox 和 webSecurity。
- 测试更新入口只允许临时目录与独立测试 bundle 身份；正式 CLI 的 `/Applications/CodexMemoryOS.app` 目标不接受覆盖参数。macOS `/var` 与 `/private/var` 路径按真实父目录规范化后核对归属。

本机 arm64 构建、8 项桌面测试、22 项相关 Server 回归、隔离产物 MCP smoke、真实临时 App 窗口/Cmd+Q 与 A→B 更新已取得验证证据。当前真实知识库服务保持停止；没有运行正式安装脚本、修改已安装 Hook/Skill/MCP 注册或执行真实数据迁移。批次 C 的完整已安装链验收仍待正式切换时完成，不能将临时 App 结果等同于完整真实环境放行。
