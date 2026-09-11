# macOS 独立应用与本地更新设计

日期：2026-09-10。状态：**主方案已由用户确认，本轮仅落设计文档，尚未实施或完成 App 验收。**

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
  local-runtime.json            本机启动路径与既有运行参数
```

`runtime/` 以普通文件目录放在 Electron 的 ASAR 之外，供独立 Node 直接读取；ASAR 的透明读取是 Electron 提供的能力，不能假定本机 Node 具有同样行为，参见 [ASAR 说明](https://www.electronjs.org/docs/latest/tutorial/asar-archives)。生产依赖必须完整可解析，不能只复制仍指向开发仓库的包管理器链接。无需复制整个源码仓库、开发依赖或知识文件。

Electron 及其自身依赖与后端运行依赖分别处理；App 不再额外携带独立的 Node 可执行文件。

### 4.2 本机启动配置

打包时根据本机配置生成 `local-runtime.json`，只保存 Node 可执行文件绝对路径和现有后端启动参数。配置承载方式是本机安装细节，不建设配置管理服务或同步协议。

- Node 使用本机已有的明确路径；不依赖从 Finder 启动时恰好存在的终端 `PATH`。
- Asset Repository、SQLite、Workspace 配置、日志路径与端口沿用现有配置，字段含义见 [README 配置说明](../../README.md#配置)。
- Electron 使用 Node 子进程 API 和参数数组启动后端，明确设置环境变量，不拼接 shell 命令，也不误将 Electron 的可执行文件当成普通 Node。
- 本机 Node 或数据路径改变时，由用户修改本机配置并重新更新 App；首版不自动下载 Node、不发现或迁移数据目录。

### 4.3 数据继续留在现有位置

知识 Markdown、SQLite、Workspace 配置、日志和评估缓存不放入 App，也不迁往新的 Application Support 目录。Server、现有 Hook 和 CLI 继续指向同一份数据与授权配置。

后端启动后的索引维护、日志和使用事实写入沿用既有行为；更新脚本不初始化、重建或覆盖数据库，不修改能力授权。程序包的构建快照与知识内容的 CURRENT/PREVIOUS 快照是不同概念。

## 5. 启动、窗口与退出

### 5.1 启动

1. Electron 使用自身的单实例能力；再次打开 App 时激活已有实例，不再启动第二份后端。
2. 读取本机启动配置，检查 Node 和 App 内后端入口是否存在，然后启动后端子进程。
3. 等待本次子进程报告监听成功，并通过现有 `/api/system/status` 确认准备状态；之后加载 Hub。`/health` 只能说明服务可响应，不能替代索引就绪判断。
4. 子进程启动失败或准备超时时，显示可理解的原因和日志位置，不显示一个无响应的空白 Hub，也不自动切换端口。

App 只管理自己启动的后端。若原来的开发服务仍占用目标端口，报告冲突，由用户正常退出原服务后重试；不接管外部进程、不按端口批量杀进程。首次切换到 App 时需结束原来手工启动的服务。

### 5.2 窗口行为

| 用户操作 | 预期行为 |
|---|---|
| 点击关闭窗口按钮 | 关闭窗口，App 与后端继续运行，HTTP MCP 保持可用 |
| 点击 Dock 图标或再次打开 App | 聚焦已有窗口；无窗口时创建窗口，复用现有后端 |
| 菜单退出或 `Cmd+Q` | 进入完整退出流程，停止后端后退出 Electron |

显式处理 `window-all-closed`，让应用在无窗口时继续运行；通过 `activate` 恢复窗口。不能直接省略事件处理，因为 Electron 在未订阅 `window-all-closed` 时默认退出应用。生命周期依据见 [Electron app API](https://www.electronjs.org/docs/latest/api/app)。首版无需为上述能力额外增加菜单栏常驻图标。

### 5.3 彻底退出

Electron 在 `before-quit` 中先通过 `event.preventDefault()` 拦截默认退出，向它持有的后端子进程发送 SIGTERM，等待子进程结束后再完成退出；不能只给事件回调加 `async` 并假定 Electron 会等待。后端沿用现有 `runtime.close()` 关闭 HTTP、文件监听和数据库连接；无需增加 HTTP 关闭接口。

重复退出请求合并处理，不重复启动关闭流程。若关闭超时，明确显示尚未正常退出，不将超时视为成功；首版不增加后台重启或通用进程恢复系统。强制退出和操作系统崩溃不纳入正常退出成功保证。

## 6. 一条命令更新本地 App

拟提供仓库根入口 `./scripts/update-app.sh`，当前尚未创建。命令面向当前本地代码，包含用户有意保留的未提交修改，不自动执行 Git 拉取、提交、推送或清理。

更新步骤：

1. 检查本机构建环境和已明确的 App 安装目标；首次安装时设置本机启动参数，后续复用。目标是本机一个固定的 `CodexMemoryOS.app`，不是任意目录。
2. 按项目锁定版本准备依赖，构建共享 ID 包、Server、Hub 和 Electron 桌面程序，将完整 App 组装到临时目录。实现时把 App 打包与普通工作区 build 分开，避免更新脚本递归调用自身。
3. 验证临时 App 的后端依赖、静态资源和启动能力。服务验证使用隔离数据与临时端口，不启动第二个连接真实数据库的实例。旧 App 此时继续使用自己的构建快照。
4. 新产物通过检查后，正常退出旧 App，确认其后端结束，再切换安装目录。保留旧程序副本完成替换，不先删除旧 App 再复制。
5. 启动新 App，确认实际服务就绪；成功后报告更新结果和日志位置。

构建或隔离验证失败时，停止更新并保留旧 App。文件替换失败时可恢复旧程序位置；业务启动失败时报告具体原因，保留旧程序供用户处理，不自动运行数据库修复、迁移或跨版本回退。保留旧程序不构成数据库兼容性保证。

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

`integrations/codex` 是安装源与示例，不能把它的更新直接等同于已安装 Skill 或全局文件已经更新。实际安装位置以 [安装清单](../../integrations/codex/manifest.json) 和本机配置为准。

MCP 沿用官方 `config.toml` 的 `[mcp_servers.<名称>]` 配置方式，HTTP URL 指向后端 `/mcp`；不生成自定义的 `~/.codex/codex-memory-os.json` 作为注册入口。保持当前端口可避免重新注册，不能将文档示例端口当成本机已安装值。依据见 [OpenAI MCP 文档](https://developers.openai.com/codex/mcp) 与仓库 [配置示例](../../integrations/codex/mcp.toml.example)。

## 8. 实施落点与验证

拟新增 `apps/desktop/` 承载 Electron 主进程、窗口与子进程管理，新增 `scripts/update-app.sh` 承载本机更新；沿用现有 Server、Hub 和 ID 包。实施时确定并锁定适用于本机的 Electron 与打包工具版本，当前不填写未经验证的版本或完成时间估算。

实施完成后，当前使用命令维护到 README，本设计保留取舍与边界，不另建重复的安装说明或版本账本。

按 [验证约定](../../工程约定/验证约定.md) 完成与实际改动匹配的检查，至少验证以下结果：

| 验证场景 | 通过标准 |
|---|---|
| 打包产物依赖 | 使用指定普通 Node，在隔离环境加载包内 Server、共享 ID 包和 SQLite 模块；无依赖开发仓库的生产模块链接 |
| Hub 资源 | 包内后端正确提供页面和资源，独立窗口真实渲染正常 |
| 首次启动与重复打开 | 服务准备完成后显示 Hub，重复打开不增加后端实例 |
| 关窗、激活、彻底退出 | 关窗后 MCP 仍可用；激活恢复窗口；正常退出后后端进程和端口释放 |
| 启动异常 | Node 路径无效、端口冲突、后端失败和准备超时均可见，不误判已就绪 |
| 本地更新 | 隔离验证失败不替换旧 App；成功更新后能打开新产物，数据与配套配置不被更新脚本覆盖 |
| 真实 Codex 使用 | 对包内服务完成实际 Recall/Read，核对现有 Hook 和 CLI 仍使用预期数据；有实际采用时才结算 Used |

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
