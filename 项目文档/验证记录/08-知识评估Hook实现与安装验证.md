# 知识评估 Hook 实现与安装验证

日期：2026-09-10。用户授权：按[设计 06](../设计方案/06-知识评估标准与Stop兜底设计.md)完成开发，并直接配置环境、重启服务。

**开发与本机安装完成，服务 READY；Desktop 新回合自动行为尚未验收。** 不将 CLI 信任或隔离输入当成真实 Desktop 触发证据。

## 实现与安装

- capture Skill 补充先提炼后去重、无增量的具体依据、只读工程结论、失败边界，以及交付前短结果记录。已同步 `/Users/hemu/.codex/skills/knowledge-capture/SKILL.md`，与安装源 Hash 一致。
- `capture-assessment.ts` 保存本轮 JSON（8 KiB）及两个空标记，使用 Session/Turn 摘要隔离、结果原子替换、标记排他创建；不保存工具输入输出，不访问知识数据库。
- `capture-cli.ts` 是独立入口；普通无活动 Stop 静默，有活动缺结果、无效结果或 FAILED 只提醒；候选待确认放行。检查异常和 750 ms 内部超时允许结束，不返回阻断或补跑指令。记录命令失败退出 1，令主 Agent 知道未记录；两个 Hook 始终正常结束。
- UserPromptSubmit 在既有能力交付后追加宿主 Session/Turn 与直接记录命令；未拿到宿主标识时不造默认值。活动入口只接受 Bash/apply_patch，非零命令退出也能标记。
- 版本化包装入口为 `integrations/codex/user-prompt-submit.sh` 和 `capture-hook.sh`；本机 `knowledge-base/user-prompt-submit.sh` 转发到前者，保持原注册命令。Node 固定为既有 22.16.0 绝对路径；缓存固定为 `knowledge-base/runtime/capture/`。
- 保留全局规则和原 UserPromptSubmit 配置，追加知识记录摘要与两个事件，超时 1 秒。`integrations/codex/manifest.json` 保存这次安装 Hash、实际脚本/产物 Hash、验证结果；无需数据库迁移，没有正式知识确认、commit 或 push。

## 自动验证

固定使用 Node 22.16.0 / pnpm 11.1.3。以下结果分别来自实际命令：

| 检查 | 结果与证明范围 |
|---|---|
| `tsx --test --test-concurrency=1 test/capture-hook.test.ts test/multi-expression-recall.test.ts` | 17/17 通过；覆盖新记录/Hook 6 项与现有召回/能力/Read/Used 11 项，提交事件的标识/命令交付断言放在当前 fixture 内 |
| `typecheck:source` | 生产源码 strict 类型检查通过；不声称历史全仓测试已迁移 |
| Server `build` | 当前生产源码构建通过 |
| `smoke:capture:build` | 编译后独立 CLI、普通静默、活动提醒及去重、候选记录后静默通过；不配置知识服务或数据库，缓存中没有 Asset/Usage/SQLite 文件 |
| Skill `quick_validate.py` | 安装源校验通过，实际安装文件与源字节相同 |
| Shell 语法、安装 Hash、文档引用、`git diff --check` | 通过；旧索引中的三条 migration 链接为原有缺口，未纳入本次修复 |

记录测试包括四种结果、空理由/无引用候选拒绝、超长输入、身份错配、非法 JSON、不同 Session/Turn 隔离、并发写入和标记、结果覆盖、缺失标识、缓存错误及正文 Symlink。真实子进程验证无数据库配置时运行，输入不结束时超时返回警告；这些均为隔离构造输入，不是 Desktop 自动行为验收。

现有 `mcp-build-smoke.mjs` 依赖退役 Task 协议，本次没有把它运行或修改为“通过”。新增 CLI 用专门构建 smoke 验证；重启后的真实 HTTP MCP 另核对发布的三个工具。

## 成本测量

一次隔离本机样本，直接启动编译后的 Node CLI，包含 Node 进程启动和文件读写，不含模型调用、宿主调度、Shell 包装和真实任务 Token：

| 入口 | 样本数 | 中位耗时 | 最大耗时 |
|---|---:|---:|---:|
| PostToolUse 活动标记 | 10 | 38.5 ms | 40.7 ms |
| 记录 CLI | 10 | 39.7 ms | 50.0 ms |
| Stop（含静默、提醒、去重） | 40 | 38.9 ms | 50.4 ms |

例如 20 次匹配活动＋1 次记录＋1 次 Stop，按样本中位数计算约 0.85 秒本地进程开销，是估算而非该类任务实测。新增流程不主动产生模型续跑；主 Agent 判断、必要的 Recall/Read 和记录工具调用仍有成本，不能据此宣称零 Token。首次安装、慢磁盘、冷缓存等条件未形成统计保证。

## 本机切换与服务检查

通过 Codex CLI 0.153.2 正常 `/hooks` 界面检查：初始两个新增 Hook 为 Installed=1、Active=0、Review=1；信任后 UserPromptSubmit、PostToolUse、Stop 均为 Installed=1、Active=1。未直接编辑信任存储、未使用绕过信任参数，未发送模型测试任务。

确认端口对应本项目 `dist/main.js` 后，SIGTERM 停止原 PID `43741`；通过已有 `knowledge-base/start-server.sh` 启动 PID `66714`，监听 `127.0.0.1:18888`。

重启后实际检查：

- `/health` 为 `ok`；`/api/system/status` 为 READY，Watcher RUNNING，diagnostics 为空。
- 正式 Asset、Catalog、FTS 均为 46，与重启前一致；Inbox 为 0。
- 真实 HTTP MCP 发布 `knowledge_recall`、`asset_read`、`asset_mark_used`；当前 Desktop 连接器重启后成功完成一次 Recall，持续能力仍有效。
- 只读 SQLite `integrity_check=ok`，`foreign_key_check` 无结果，无 capture 表；本次没有执行迁移、重建或数据清理。

## 判断标准回放与待验收

以下是按规则对设计给出的六类合成场景做人工推演，不是独立模型实验：

| 给定事实 | 采用新规则后的判断 |
|---|---|
| 验证记录只有“删除模块、测试通过” | 缺取舍/前提，不能凭文档存在判无增量；从已验证工作提炼或明确证据不足 |
| 已读 Asset 完整覆盖原约束，本次只执行 | NO_INCREMENT，引用该 Asset 并说明条件/边界未变 |
| 原文完整且由任务规则明确引用、后续必读 | 可判 NO_INCREMENT，说明发现路径及重复保存无收益 |
| 机械修改发现并查明新故障 | 评估新故障知识，不能以机械实施跳过 |
| 正文读失败、关键判断未验证 | FAILED，不能冒充无增量 |
| 只读审查形成有价值判断 | 展示具体建议与证据，可用 CANDIDATE 引用该建议，不强制写 Inbox |

仍待真实 Desktop 新回合核对：普通工程活动故意漏记录时的提醒可见性、无工具交流静默、内嵌 code mode/异步 Bash 完成事件映射、主 Agent 自动评估和同轮继续工作后的结果更新。服务重启与 CLI Active 不证明 Desktop 当前任务热加载；必要时由正常客户端重载后验证。本轮未重启 Codex Desktop 客户端。

结构校验不能保证无增量判断正确；同轮记录过期不由程序独立发现；未观察工具、纯对话工程判断、客户端中断或崩溃仍可能漏提醒。这些是设计接受的边界，不伪装成已通过项。

## 本轮知识评估

已评估已验证工作：本轮按冻结设计实施，没有新增业务规则或独立架构取舍。无增量判断标准及收尾步骤现已完整放入真实安装的 capture Skill，并由全局 AGENTS 的交付要求和 UserPromptSubmit 指引加载；开发/安装细节从 README 明确链接到本设计与记录。另存相同规则为 Asset 会造成重复维护。本机几十毫秒样本只表明此环境的启动成本，尚不足以形成通用性能结论。

因此本轮结论为 **NO_INCREMENT**，不准备重复候选。此前相关 Recall 无命中只作为查询结果，不作为这个结论的依据。本轮开始时旧 UserPromptSubmit 没有提供记录所需 Session/Turn 与命令，更新发生在执行中，故未伪造宿主标识写入本轮 JSON；评估结论在此交付，真实新回合记录链路仍待验收。
