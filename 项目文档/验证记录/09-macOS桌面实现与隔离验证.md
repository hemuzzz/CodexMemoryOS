# macOS 桌面实现与隔离验证

日期：2026-09-12。对象：[macOS 独立应用设计](../设计方案/07-macOS独立应用与本地更新设计.md) 的首版代码实现。环境：本机 macOS arm64，普通 Node 22.16.0，pnpm 11.1.3，Electron 44.3.0，Electron Packager 20.3.0。

结论：源码及隔离构建/运行验证完成，临时 macOS App 的正常启动、独立窗口与本地更新通过；正式安装切换、真实知识数据和全部已安装配套复核未执行。没有执行 commit/push。

## 1. 实施范围与停服

开始时 18888 端口及项目 Server/Hub 开发服务已无监听；另发现 PPID=1 的项目 CodeGraph 服务 PID 10438，发送 SIGTERM 后该进程及其子进程 10439 已退出。以仓库为 cwd 的其他进程属于 Codex 工具连接，未因 cwd 相同而停止。未停止 Codex、本机其他项目或 Übersicht 服务。

保留此前设计文档的未提交修改。新增桌面包、配置示例、打包与更新入口；Server 仅增加构建身份、IPC 启动回执和退出时机处理，Hub 仅同步返回类型。既有 `closeAllConnections`、MCP transport 关闭路径继续复用。

## 2. 已执行检查

以下 pnpm 命令均经 `npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm` 执行。

| 检查 | 结果及证明边界 |
|---|---|
| 全仓 `build` | 通过；共享 ID、Server、Hub、Desktop 构建产物可生成 |
| Server/Hub `typecheck:source`、Desktop `build` | 通过；生产源码与可选 buildId 类型契约成立，不等于全仓历史测试均通过 |
| Desktop `test` | 8/8 通过：导航协议/同源、依赖闭合、测试安装边界/更新互斥、替换失败恢复、旧 READY 不能掩盖新启动失败、启动取消与重复退出、启动超时及关闭超时持有进程 |
| Server `content-version.test.ts` + `capture-hook.test.ts` | 最终 22/22 通过；覆盖双版/确认/Diff、并发 REST/MCP 与评估 Hook。首次运行 21/22，一条旧测试仍引用已删除 Task；本次仅迁移该相关 fixture 到 capabilityIds/Read 事实协议后重跑通过，没有恢复旧模块 |
| Server `smoke:capture:build` | 通过；编译后的评估 CLI 使用独立缓存，无数据库/真实知识服务；不是宿主自动 Hook 触发验收 |
| `package:mac` | 成功生成 .app；普通 Node 从开发目录外加载实际包内生产依赖并完成临时 SQLite 建表/读写/关闭；没有替换 Electron ABI |
| `smoke:package` | 通过；实际包内后端的 booted/listening、目标 buildId/READY、Hub、HTTP MCP Recall/Read/Used、Origin 拒绝和关闭；活动 `/mcp` 请求体未结束时仍可正常停服，测试端口释放 |
| 原生窗口 | 通过 CUA 打开独立测试 bundle，实际看到总览、资产列表及“桌面验收”fixture；关窗后再激活重建窗口，后端启动记录仍为 1，服务保持 READY |
| Cmd+Q | 临时 App 子进程 `code=0`、`signal=null`、`normal=true`，随后主进程退出和测试端口释放 |
| A→B 临时安装更新 | 外部更新入口真实组装 B、隔离验证、Apple Event quit、等待旧父/子进程结束、保留旧包并 rename、新 App 启动、目标 buildId/就绪核对通过；使用独立测试身份和临时数据，未写入正式 Applications 目标 |

测试 bundle：`local.codexmemoryos.desktop.test.ef0e76c4-a2a6-4c5f-b792-2e768b93f9d3`。更新前 buildId `ef0e76c4-a2a6-4c5f-b792-2e768b93f9d3`，更新后 `76f34ffd-92a7-443c-8996-93a4ea4f489f`。B 退出日志确认主进程 15465 管理的子进程 15471 正常结束。上述 PID 只标识本次证据，不用于未来停服。

最终本机产物：`dist/desktop/535b6cea-4b01-4737-90d5-7df049d3db23/CodexMemoryOS.app`，buildId `98ca1a92-b188-45bc-9c91-deb09cd6aae7`；对该最终产物运行 `smoke:package` 通过。产物及本机配置不纳入 Git。

文档新增链接、`git diff --check` 与更新脚本 shell 语法检查通过。README 全量链接检查发现既有 `migration/v4-generation-report.md` 缺失；HEAD 中原已存在该引用，本轮未修复无关历史链接。

未调用全仓旧版测试作为当前协议证明；没有运行真实候选确认、迁移、撤销或删除命令。确认/双版等写入测试均使用新建临时目录与数据库。

## 3. 构建中发现并解决的问题

1. pnpm legacy deploy 默认生成的额外工作区 hoist 链接无效，且会改变调用工作区的安装状态。产物闭合检查拒绝交付；改为临时工作区部署并关闭该次部署的 workspace hoist，保留开发工作区依赖状态。
2. 打包工具复制额外资源时将相对符号链接变成指向 staging 的链接。改为显式 `verbatimSymlinks` 复制 runtime 与最终 App，并在最终落点再次验证所有链接处于 App 内。
3. macOS NSWorkspace 返回 `/private/var/...`，而临时路径可能是 `/var/...`。首次更新被归属检查阻止，旧 App 未替换；修正为真实父目录后同一临时 App 更新通过，没有放宽身份核对。

这些是本轮实际失败及修复证据，不使用审查附件的 Linux E1–E5 代替本项目验证。

## 4. 使用与未执行边界

本机配置 `.desktop-local.json` 已生成并被 Git 忽略，指向既有数据目录和已验证的 Node 路径。App 本身仅为程序快照，打包没有把知识或 SQLite 放入 App。正式安装/更新命令及隔离 smoke 见 [README](../../README.md#macos-独立-app个人本机)。

本轮没有运行正式 `scripts/update-app.sh` 安装切换，真实 18888 服务保持关闭。自动化更新链已在临时安装目标验证，但 `/Applications` 写权限、正式目标首次安装以及个人使用期间的人工停工流程没有被该测试替代。

批次 C 尚需在正式切换时按设计能力矩阵复核：真实 Codex MCP 注册、已安装 UserPromptSubmit/PostToolUse/Stop 新回合自动行为、人工确认与实际 CLI 的路径和配套。隔离 Used 测试只记入临时库，不创造真实 Used 事实；正式确认仍需批准确切候选与 Hash。

本轮未演练断电、强制退出恢复、数据结构升级或全仓所有旧版 fixture。更新保留旧程序不保证数据库跨版本可回退。正式服务未启动，因此不宣称真实数据安装升级已验收。
