# 真实 Desktop 验收记录

日期：2026-09-06。当前状态：**本轮本地验收结束，核心链路及两项故障恢复已实测，跨 Workspace／双窗口由用户豁免；不代表原清单全部实测通过。** 最新结果见 §16–§20。§1–§15 保留各历史时点的环境、失败和阶段结论；既有审计人工复核及整体 NO-GO 不由本轮自动解除。

依据：[最终契约核对与 Desktop 验收清单](../审查记录/08-最终契约核对与Desktop验收清单.md)。本记录保存实际执行结果，不把准备脚本、SDK 或 CLI 验证当成真实 Desktop／模型验证。

## 1. 授权、范围与当前基线

用户在完成全局规则替换和正式空库连接配置后明确要求开始正式验收。单 Agent 串行，不改业务源码、测试、依赖、锁文件，不执行确认、迁移、重建、Task 终态或 Git 写操作。既有 F01–F07 等人工复核状态不在本轮自动更新；整体 NO-GO 保留。

本轮重新记录 143 个 tracked／非忽略 untracked 文件的 SHA-256。正式库位于 `knowledge-base/`，服务端口 18888；合成样本全部位于下述仓库外隔离目录，不写正式库。

外部证据目录：`/private/tmp/codex-memory-desktop-rfa3etaj/evidence/`。其中 `repository-baseline.json` 为本轮基线；`before-hooks.json`、`before-config.toml` 为执行前的相关配置原件，只保存在本地受限目录，不展示配置内无关内容。

## 2. 本轮已观察到的现场情况

1. 开始时 `curl http://127.0.0.1:18888/api/system/status` 连接失败；当前会话的实际可调用工具列表没有 CodexMemoryOS MCP 工具。此前由临时终端启动的服务已经退出。这是本轮现场事实，不将上一轮 READY 沿用为当前状态。
2. 已用现有 `knowledge-base/start-server.sh` 重启正式服务，再将正式与验收服务分别作为独立后台进程启动，保留确切 PID／启动时间／日志。没有创建 launchd、开机启动或新的恢复平台；尚未用实际 Desktop 重启验证进程存活。
3. 尝试通过 Computer Use 只读查看 Codex 应用时，工具明确返回：`Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.` 未尝试其他 UI 控制方式绕过。正常信任、重载及双窗口操作需用户执行。
4. 暂时移除了正式库的单条全局 UserPromptSubmit 注册，防止测试项目同时触发正式库 Hook。全局 MCP、其他配置及 trust state 不改；验收完成或取消后恢复此注册。这是临时暂停，不撤销之前的正式连接安装。

## 3. 当前隔离环境

| 对象 | 当前实际值 |
|---|---|
| 测试总目录 | `/private/tmp/codex-memory-desktop-rfa3etaj/` |
| alpha 项目 | `/private/tmp/codex-memory-desktop-rfa3etaj/alpha/` |
| beta 项目 | `/private/tmp/codex-memory-desktop-rfa3etaj/beta/` |
| Repository | 测试总目录下 `repository/` |
| SQLite／配置 | `runtime/desktop.sqlite`／`config/workspaces.json` |
| MCP | `http://127.0.0.1:59506/mcp`，项目服务名 `codex_memory_os_desktop_check` |
| 正式库排除 | 两个项目各自 `.codex/config.toml` 设置 `mcp_servers.codex_memory_os.enabled=false`；待正常项目信任后核对实际生效 |
| Hook | 两项目 `.codex/hooks.json` 调用测试根的 `hook-observe.mjs`，内部执行现有 dist Hook；未伪造事件、未设信任绕过 |
| 观察器 | 原字节传递 stdin、stdout／stderr；只记录真实 event 的 sessionId、turnId、cwd、显式路径和子进程结果，不读取 transcript |
| 样本 | GLOBAL、alpha、beta 各一份 MEMORY；真实生成器生成 ID，正文随机验收值尚未向测试模型透露 |
| 启动时进程 | 正式服务 PID 75325；验收服务 PID 75327。仅为本次时点，操作前须重新核验身份，不能按历史 PID 盲目 kill |

每个项目都有本地 `AGENTS.md`，约束测试模型只通过本次 MCP 取样本内容，不直接读 Repository、数据库或监督证据。首条 `desktopfixture` 仅报告真实 Hook 上下文，不调用工具或自动 Resolve。监督者读取证据与模型获取知识明确区分。

## 4. 已执行验证

| 项目 | 实际结果 | 证据／边界 |
|---|---|---|
| 正式服务状态 | READY，Watcher RUNNING，无诊断 | `preflight.json`；只读观察，不算 Desktop 连接通过 |
| 隔离服务状态 | READY；3 个正式 Asset，Catalog／FTS 各 3 | 真实 Scanner／IndexManager；文件 Hash 与 Catalog 一致 |
| 隔离 MCP 协议 | 真实 SDK connect、ping、六工具发现通过 | 仅传输层准备；未用 SDK 代替模型业务调用 |
| 初始运行数据 | 两库 Task、Binding、Usage 均为 0；正式库 Asset 为 0 | `preflight.json`、隔离库 `initial-snapshot.json` |
| 包装脚本语法 | `node --check hook-observe.mjs`、`sh -n start-server.sh` 通过 | 没有手工喂 UserPromptSubmit 创建测试 Task |
| 测试答案隔离 | manifest 保存随机正文值，准备命令只输出 ID／范围／端口 | 后续由真实模型 Read 获取正文，再由监督者比较 |

没有重跑 F01–F04 全套安全回归或全量构建；继续复用清单中标明的历史正式证据。当前生产模块直接来自现有 dist，未改源码。

## 5. Desktop 项目状态

| 清单项 | 本轮状态 |
|---|---|
| D0／D1 范围、隔离服务准备 | 已执行；真实模型与 UI 步骤尚未开始 |
| D2 正常项目／Hook 信任及实际配置加载 | 待用户操作；未验证 |
| D3 非空 Loadout 后的真实 Hook 输出 | 未执行 |
| D4 Workspace Search／Read／Used 拒绝 | 未执行 |
| D5 真实模型工具调用与答案核对 | 未执行 |
| D6 同 Session 多 Turn／纯投影无计数 | 未执行 |
| D7 跨 Session 显式 attach | 未执行 |
| D8 两个 Desktop 窗口 | 未执行 |
| D9 服务故障后 Prompt 继续／恢复工具 | 未执行；本轮发现的服务退出不冒充该受控验证 |
| D10 Hook 依赖故障／恢复 | 未执行 |
| D11 数据结算及撤销临时配置 | 未执行；验收仍进行中 |

## 6. 用户下一步与后续观察

1. 在 Desktop 添加并打开 alpha 的确切目录，选择本地项目，不创建 worktree。
2. 正常审查并信任该项目及其 `hook-observe.mjs` Hook；重载相应 MCP 连接，确认使用 `codex_memory_os_desktop_check` 的 59506 端口。若本机界面不存在正常信任入口，提供实际提示，保留该项未通过，不使用绕过参数或手改 trust store。
3. 在 alpha 新任务的第一条消息只输入 `desktopfixture`。
4. 回到监督任务提供 alpha 任务的回复／异常提示。监督者从真实 Hook 观察记录取得 Session／Turn／Task 对应关系，再继续显式 Resolve 和后续验收；不从旧列表挑选 Task。

阶段之间采样完整 Loadout／Usage 行并核对真实工具轨迹。当前尚无真实 Hook event，因此没有可用的 alpha Task ID，不能先通过 SQL 或模拟 Hook 补造。

## 7. 恢复要求

正式 Hook 暂停前原件在 `evidence/before-hooks.json`，暂停后 SHA 和原因在 `global-hook-pause.json`。完成或取消验收时先核对当前文件仍为本次暂停版本，再恢复原件；若用户加入其他 Hook，只合并恢复本次那一条，不整体覆盖。

测试配置／服务的撤销按原清单执行；只操作本次测试项目与确切进程，保留正式库和合成证据，不清空 trust store，不执行 Task 终态。不因用户尚未完成界面操作而将这些项标为 PASS。

## 8. alpha 首条真实 Turn 反馈与排查（2026-09-06）

用户反馈在 alpha 发送 `desktopfixture` 后，模型报告 Task ID、Workspace 注入及摘要标记缺失，且未调用工具、未 Resolve。此为用户转述的真实回复，不等于已取得客户端完整工具轨迹。

本轮只读核实：

- 隔离服务 59506 仍为 READY，Watcher RUNNING，正式 Asset／Catalog／FTS 均为 3，无诊断。
- evidence 目录没有 `hook-*.json`；尚无观察器完成执行的证据，不能归因为 Loadout 为空。
- alpha 的 `.codex/hooks.json` 和项目 MCP 配置存在，Hook 指定的 Node 可执行文件存在。
- 当前个人配置已包含 alpha 项目的 `trust_level="trusted"`，但 `[hooks.state]` 中没有本次 alpha Hook 的信任记录。项目信任与具体 Hook 定义信任不能混同；当前优先排查 Hook 尚未审查信任或加载。
- 官方 Hooks 文档明确：非托管 Hook 按当前定义 Hash 单独信任；未信任则跳过。其明确记载的 `/hooks` 审查入口为 CLI，尚未证明本机 Desktop 有同名入口。来源：https://learn.chatgpt.com/docs/hooks 。

D2／D3 保持未通过；未修改源码、客户端配置或信任状态，未模拟 Hook、补造 Task 或执行 Resolve。下一步需用户提供 Desktop 中实际 Hook 审查入口／提示；若没有入口，记录客户端限制，再决定正常 CLI 信任诊断的适用范围，不能把 CLI 操作算作 Desktop UI 验收。

## 9. 取消隔离环境并转为本地项目验证（2026-09-06）

用户明确要求删除隔离环境，直接在本地项目验证。本轮已执行：

- 核对全局 hooks.json 与暂停时 SHA-256 一致后，恢复暂停前原字节，并确认恢复后的 SHA-256 与原记录一致。
- 核对 PID 75327 的启动时间、Node Server 命令及 59506 监听身份后发送 SIGTERM；确认 59506 已无监听。正式服务保持运行。
- 从个人 config.toml 移除仅属于本次 alpha 路径的 project 表；未发现其他本次路径的 project／hooks.state 表。保留其余配置。
- 按用户删除授权删除 `/private/tmp/codex-memory-desktop-rfa3etaj/` 整个目录，含 alpha／beta、样本、SQLite、脚本、日志、备份和 evidence；确认目录已不存在。上文外部证据路径现在仅为历史记录，文件不再保留。
- 正式服务 18888 为 READY，Watcher RUNNING，无诊断；正式库 Asset／Catalog／FTS 均为 0。workspaces.json 将当前仓库映射为 CodexMemoryOS。

本地下一步是在恢复 Hook 后的真实新 Turn 核对注入 Task ID 与 Workspace；当前 Turn 没有可信 Hook Task ID，不补造或挑选历史 Task。正式空库不能证明非空 Search／Read／Used 和隔离拒绝；先验证真实 Hook／MCP 连通性，不执行正式库故障注入、真实 Asset 确认或迁移。Desktop 可能保留已打开的隔离任务页面，本轮没有归档或删除用户任务。

## 10. 当前本地项目首轮真实验收（2026-09-06）

用户在恢复正式 Hook 后的当前 Desktop 任务发送“开始本地验收”。本轮没有收到可信 Hook 注入的 Task ID／Workspace。

- 正式服务 18888 的实际 status 返回 READY，Watcher RUNNING，无诊断，Asset／Catalog／FTS 均为 0。
- 当前模型实际调用 `mcp__codex_memory_os__task_loadout_list`，参数为 `{"workspace":"CodexMemoryOS","status":"RUNNING","limit":10}`，structuredContent 返回 `{"ok":true,"items":[]}`。本地 Desktop→MCP 的真实调用连通性通过；不将工具元数据可见代替本次实际调用。
- 正式 SQLite 使用 mode=ro 查询，Task、Turn Binding、Usage 三张表均为 0。只读 list 未产生运行记录。正式 hook.log 尚不存在；日志不存在单独不能证明 Hook 未启动，但 Task／Binding 为 0 证明建立任务的验收结果未达成。
- 没有合法 Task ID，因此未执行 get／resolve／search／read／used，没有伪造事件或通过数据库补造绑定。

当前结论：MCP 连通性通过，Hook 任务建立未通过。当前任务可能没有热加载恢复后的 Hook，或具体定义尚未信任；当前证据不足以确定二者。需完整重启 Desktop 后在当前本地项目的新任务复验；若仍缺失，按正常 Hook 审查入口定位信任状态。整体不标记通过。

## 11. 重复验收与根因确认（2026-09-06）

再次真实调用 MCP list 成功且为空，正式 Task／Binding／Usage 仍全部为 0。随后在当前仓库启动本机 Codex CLI 0.153.2，仅查看启动诊断及 `/hooks`，未发送模型业务 Prompt，未执行信任操作。

CLI 实际显示 `Hooks need review`、`1 hook is new or changed`；`/hooks` 中 `UserPromptSubmit` 明确为 Installed=1、Active=0、Review=1。这确认当前正式 Hook 尚未受信任而不处于激活状态，不再仅以热加载问题解释。诊断 CLI 已退出。其他 MCP 的无关启动故障不纳入本项目修复。

下一步由用户在正常 CLI 审查界面信任当前正式 UserPromptSubmit 定义，再用 Desktop 真实新 Turn 验证；不使用信任绕过，不直接改信任 Hash。此步骤源于客户端真实信任检查，并非新增工程审批。

## 12. 用户授权信任正式 Hook（2026-09-06）

用户明确授权“直接信任这个hook”。通过本机 CLI 正常 `/hooks` 审查界面核对唯一 UserPromptSubmit 的来源为 `~/.codex/hooks.json`、命令为 `/bin/sh '/Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/user-prompt-submit.sh'`、timeout=10s、context limit=3000。界面原先明确显示 `Modified since last trusted - review required`。

只在该单条详情页执行 Trust，界面显示 `Trusted` 且勾选启用；返回概览后 UserPromptSubmit 为 Installed=1、Active=1，待审查提示消失。CLI 已正常退出。没有使用 trust bypass、手写 Hash、发送业务 Prompt 或运行 Resolve；未升级 CLI。

信任操作已完成。仍需下一次 Desktop 真实 Turn 验证 Task／Workspace 注入，不能将 CLI Active=1 等同于 Desktop Hook 执行通过。

## 13. 信任后当前 Desktop 任务复验（2026-09-06）

用户在信任后再次发送“开始本地验收”。本次仍未收到 Hook Task 上下文；只读核对正式 Task／Binding／Usage 均为 0，hook.log 不存在。MCP list 真实调用成功且 items 为空，服务 READY。

因此 CLI 信任成功尚未转化为当前 Desktop 任务的 Hook 执行，不能标记通过。本次消息未提供“信任后已完整重启 Desktop 并新建任务”的证据，当前任务热加载仍未证实；后续应在信任完成后重启客户端并以本地新任务复验，不继续在当前任务机械重复相同消息。未修改信任配置、源码或数据库。

## 14. 正常信任后真实 Hook 绑定首次通过（2026-09-06）

用户转述另一 Desktop 任务首项验收通过，其 Task 为 `tsk300861445660069650145807921973443831751610053318048234361`。本监督任务本轮也实际收到 Hook 注入，当前 Task 为 `tsk300861569924817263300505375368390800553318520178299451625`，Workspace 为 CodexMemoryOS，状态 RUNNING，Loadout 为空。两者分别记录，不混用 Task ID。

对本监督任务实际调用 MCP task_loadout_get，返回 Task ID／Workspace／RUNNING／空 Loadout 与真实注入一致，Usage 为空。只读数据库进一步核对当前 Task 的 source_session_id 为 `01a072ea-ec19-7e73-9251-a66a03cbe5dc`、source_turn_id 为 `01a072f7-a0c4-77d2-aca5-ddd99308e2db`；存在一条真实 Binding。初始 request 保存本轮完整用户消息（包含用户粘贴的另一任务报告），没有手工改写请求或创建 Task。

结论：本监督任务真实 Hook→Task／Workspace 绑定及 MCP get 一致性通过；用户转述的另一任务结果保留为转述证据。此轮只完成首项核对，没有执行 Resolve／Search／Read／Used；空库不代表非空装配和知识使用通过。后续显式 Resolve 需用户明确要求该动作。

## 15. 当前任务显式装配与空库结果通过（2026-09-06）

用户明确要求“显式装配当前任务并验证空库结果”。当前真实 Hook 仍绑定 `tsk300861569924817263300505375368390800553318520178299451625`／CodexMemoryOS／RUNNING。

实际 MCP 调用 task_loadout_resolve 一次，返回 ok=true、changed=false、loadout.assets=[]。随后 task_loadout_get 返回相同空 Loadout、usages=[]。前后使用只读 SQLite 对当前 Task 全行、Binding 全行、Usage 全行与 Catalog 数量采样并比较，全部一致；包括 request、loadout_json 原始字符串、created_at 和 updated_at。Catalog=0，Usage=0。

本轮 Resolve 前已存在两个同 Session 的真实 Turn Binding，较上一轮增加一个；Task ID／初始请求／空 Loadout 保持不变。Resolve／get 本身未增加 Binding 或任何 Usage。

结论：显式空库装配及本次 get 的零副作用通过，changed=false 符合已有 Loadout 同为空的事实。非空装配、知识 Read／Used 和 Workspace 拒绝仍未验证；未新增或确认 Asset，未模拟 Hook、手工创建 Task、修改业务源码或执行终态。

## 16. 本地非空装配与真实 Hook 投影（2026-09-06）

本轮使用用户当前本地项目、现有正式服务和已存在的合成测试 Asset。用户要求不模拟 Hook、不手工创建 Task；显式装配、测试工具调用、停机及配置故障分别按会话授权执行。本节以后时间均为 UTC，来源为实际工具返回和运行记录；不沿用早期隔离环境的 Task 或样本。

| 对象 | 本轮值 |
|---|---|
| Desktop Session | `01a07517-f47b-7893-8b6e-7400202a9cdb` |
| 真实 Hook Task | `tsk300912486265494463357414744807539850078043777498875588788` |
| Workspace／状态 | `CodexMemoryOS`／`RUNNING` |
| 初始 request／创建时间 | `"CodexMemoryOS\n"`／`2026-09-06T05:01:42.450Z` |
| 测试 Asset | `ast300912202107615084320737652022520558812734028727624193422` |
| 标题／类型／范围 | CodexMemoryOS 本地验收测试样本／DOCUMENT／WORKSPACE CodexMemoryOS |
| Asset 原字节 Hash | `4beffd7331a9e32c5df51d73b9de9c70153df1df338b8c270dd2ab81308c45a1` |

真实 MCP `task_loadout_get` 确认初始 request 与用户首条消息一致，初始 Loadout、Usage 为空。随后显式 `task_loadout_resolve` 返回 `changed=true`，只入选上述 Asset：`mode=ON_DEMAND`、`reason=DOCUMENT_ON_DEMAND`、`estimatedCharacters=317`；限制为 3000 字符、8 项。再次 Get 确认保存，Task updatedAt 为 `2026-09-06T05:02:59.674Z`。

为核对样本身份实际调用一次 `asset_read`，形成首条 Read Usage。下一真实 Turn 的 Hook 注入相同 Asset ID、标题、ON_DEMAND 和调用提示；只读 Get 返回 Recall=0、Read=1、Used=false，Usage updatedAt 仍为 `2026-09-06T05:03:12.798Z`。这证明本次非空 ON_DEMAND 投影未额外计数，不证明 MEMORY 的 SUMMARY 投影或 GLOBAL 可见性。

## 17. Search／Read／Used 与跨 Session attach（2026-09-06）

由当前 Desktop 模型调用真实 MCP，每阶段用 Get 核对；样本用于功能验收，Used 不代表生产知识贡献。

| 动作后 | Recall | Read | Used | 结果 |
|---|---:|---:|---|---|
| 工具计数验收基线 | 0 | 1 | false | 保留 §16 身份核对产生的 Read |
| Search 一次 | 1 | 1 | false | 查询 `CodexMemoryOS 本地验收测试样本`，FTS 只返回目标样本 |
| Read 一次 | 1 | 2 | false | 返回当前 Markdown、上述 Hash 和正文校验值 `青竹-4827` |
| 首次 Used | 1 | 2 | true | 不隐含增加 Recall／Read |
| 重复 Used | 1 | 2 | true | 整条 Usage 与首次 Used 后一致，包括时间戳 |

Usage ID 为 `usg300912615214469004174062402098591479222995864120688085314`，createdAt 始终为 `2026-09-06T05:03:12.798Z`；首次及重复 Used 后 updatedAt 均为 `2026-09-06T05:04:51.423Z`。各阶段 Get 的 Task 字段及 Loadout 一致。正文校验值此前已在当前会话展示，故真实返回可证明 Read 通路成功，但不能替代原 D5 的未知正文值验证。

用户在同项目新建任务「验收跨 Session 显式 attach」，首条显式提供上述 Task ID，要求不调用工具、不 Resolve。通过任务读取工具核对其唯一完成 Turn 只有用户消息及正常回复；回复的 Task、Workspace、样本投影一致。只读 SQLite 确认：

- 新 Session：`01a0751c-4f47-7a32-9b5b-0b19590bc974`。
- 新 Turn：`01a0751c-50bb-7521-8e43-49bc1b96537e`。
- Binding 在 `2026-09-06T05:06:27.667Z` 指向原 Task；新任务创建时点之后没有新建运行时 Task。
- Get 返回原 request、Task 时间、Loadout 和整条 Usage 不变，仍为 Recall=1、Read=2、Used=true。

本次同 Workspace、RUNNING Task 的跨 Session 显式 attach 通过；不外推跨 Workspace 或终态 attach。

## 18. Server 停机与恢复（2026-09-06）

用户明确授权暂停正式 `127.0.0.1:18888` 服务。执行前核对 PID 75325 的启动时间、Node 命令和监听端口，发送 SIGTERM 后 `lsof` 无监听、curl 返回连接失败。原启动入口为 `knowledge-base/start-server.sh`，未修改配置或启动参数。

当前任务在服务离线后按要求不调用工具，正常回复“普通消息正常”。同时读取新任务「回复普通消息正常」（Session `01a0751f-202b-7af2-b6d6-39a4c2073acf`）的真实完成 Turn `01a0751f-2131-7201-a3dd-04f0a8d57dc7`，确认其也只回复该文本；不只依赖用户转述。

用户要求恢复后，通过原脚本启动独立后台进程，时点 PID 为 84955。status 返回 READY、Watcher RUNNING、Catalog／FTS 各 1、无诊断。当前客户端无需手动重连即成功调用 MCP Get／Read：

- 首次 Get 与停机前一致：Recall=1、Read=2、Used=true，Task／Loadout 不变。
- Read 返回相同样本正文和 Hash；随后 Get 确认 Read 仅增加一次至 3，Recall=1、Used=true，Usage updatedAt 为 `2026-09-06T05:10:24.104Z`。

本次离线普通消息及恢复工具调用通过。独立 Hook 在 Server 停机期间仍可访问配置和 SQLite，其仍有投影不构成故障；本项不替代 Hook 依赖故障测试。PID 仅为当时时点，不作为未来停机目标。

## 19. Hook 配置故障与真实恢复 Turn（2026-09-06）

用户在看到具体影响和恢复方案后，明确同意临时将 `knowledge-base/config/workspaces.json` 改为无效 JSON。原字节备份与 Hash 核对后，先更新数据基线，再于 `2026-09-06T05:12:08.201087Z` 写入两个字节 `{\n`。未改变 Hook 定义或信任状态，未手工执行 Hook。

仓库外证据目录（本轮保留，临时目录不承诺长期存在）：`/var/folders/3k/g7_mt00n1rdfxx__dj6vnnk00000gn/T/codex-memory-hook-acceptance-twgqi1ra/`。其中包含 `workspaces.original.json`、`manifest.json`、`baseline.json`、`pre-injection.json`、`injection.json`、`during-fault.json`、`fault-hook.log`、`restoration.json`；本目录不是已删除的早期隔离证据目录。

| 阶段 | 实际证据 |
|---|---|
| 故障前 | 原配置 SHA-256 为 `6535885cdb76b5a82433fbe3c0e25e365eb5aa6c37e9295c8cec24953ed52b3e`；当前 Task Binding 为 15 条 |
| 故障真实 Turn | 模型本轮未收到 Hook 上下文，未沿用历史上下文或调用工具，正常回复；下一条“恢复配置”也正常进入模型 |
| 故障日志 | `05:12:28.833Z`、`05:12:42.576Z` 两条 `HOOK_CONTEXT_UNAVAILABLE`，errorCode=`WORKSPACE_CONFIG_INVALID` |
| 故障数据 | 恢复前只读事务快照与 pre-injection 比较：当前 Task／Loadout、Usage、Binding 全行相同，Binding 仍为 15 条 |
| 恢复原件 | 恢复前核对配置仍为注入故障字节，再写回原字节；SHA-256 与原件一致，服务 READY、Watcher RUNNING、无诊断 |
| 恢复真实 Turn | 用户另发消息，真实 Hook 再次注入原 Task／Workspace／ON_DEMAND 样本；Binding 15→16，仅新增本轮，原绑定无删除 |

恢复 Turn 为 `01a07522-b9f3-7fb1-bd27-1c3497413e8b`，属于原 Session，boundAt=`2026-09-06T05:13:25.415Z`。只读比较确认 Task／Loadout、Usage 整行不变；Recall=1、Read=3、Used=true，Usage updatedAt 仍为 `2026-09-06T05:10:24.104Z`。16 条是该验收时点的计数，后续普通消息可继续合法增加 Binding。

本次实测覆盖“依赖故障不阻断回复、不注入上下文、不错误写入当前 Task 数据，恢复后真实 Hook 正常”。没有捕获客户端 Hook 子进程的原始 stdout／stderr 或退出码，故不将源码的 exit 0／空 stdout 约定写成此次独立观测结果；原 D10 的进程级证据仍有此边界。

## 20. 本轮结论、豁免与未覆盖项（2026-09-06）

本轮本地验收结束，保留实测、豁免和未覆盖的区别；不将原 D0–D11 整表统一改为 PASS。

- 已实测：当前非空 ON_DEMAND 装配与真实投影、Search／Read／Used 计数及幂等、纯投影无额外 Usage、同 Workspace 跨 Session attach、Server 停机恢复、Hook 配置故障恢复的上述可观测行为。
- 用户明确要求“跳过这个验收视为已成功”：跨 Workspace 隔离与双窗口项按用户豁免接受，未建立第二 Workspace、未验证双向拒绝，不能记作安全隔离实测通过。
- 仍未覆盖：GLOBAL 样本可见性、MEMORY SUMMARY 投影、原 D5 未预先泄露正文值的验证，以及 §19 所述 Hook 原始进程输出／退出码证据。本轮未补做非空 Loadout 的 list 零副作用检查，也不声称已满足原清单全部细项。
- 恢复状态：正式服务已恢复 READY，Workspace 配置与原字节一致；测试 Asset 和 RUNNING Task 保留，不执行终态、数据清理、迁移或新的知识确认。
- 本轮验收未修改业务源码、依赖、Hook 定义或信任配置；当前文档补记仅更新本记录及索引说明。原有源码变更与历史人工复核状态保留，没有 commit／push，也没有以本地验收代替全量回归或解除整体 NO-GO。

主要证据为本 Desktop 会话的真实 Hook 注入、MCP 工具返回、新任务读取结果、只读 SQLite 比较和上述临时故障证据。§16–§20 为会话完成后的补记，不伪称所有阶段均保存了独立文件快照；恢复 Turn 比较结果保存在会话工具输出中。
