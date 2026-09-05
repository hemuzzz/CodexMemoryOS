# V2 启动核查与 W01 复核记录

日期：2026-09-05

本轮状态：仅复核；W01 = **SINGLE_ONLY**；F01–F07 未实施，整体 **NO-GO 保留**。

## 1. 范围与基线

- 依据：`设计文档/CodexMemoryOS-audit-remediation-plan-v2.md` 第 0、11、15 节，以及原审计 `docs/reviews/n00-n13-post-implementation-review.md`。
- 本轮未指定实施编号，按 V2 的只读启动流程核对决策和 W01。单 Agent 串行；仅新增本记录，不自动继续各项修复。
- 当前分支 `main`，HEAD `7f359aa8b41ca97817d1d9d86938d784c380893f`，与原审计相同。当前受跟踪业务源码无差异。
- 启动时已有：暂存的 `.idea/CoolRequestCommonStatePersistent.xml`；未跟踪的 `docs/`、`pelican-bicycle.html`、V2 修复计划。全部保留，未将已有文件当作本轮产出。
- 实际核验使用 Node.js **22.16.0**、pnpm **11.1.3**。主机默认 Node.js 为 25.9.0，命令仅临时指定已有 Node 22 路径，未修改个人配置或依赖。
- 仓库未发现项目 `AGENTS.md` / `AGENTS.override.md` 或 `.codegraph/`；依据本轮用户规则和 V2，直接核验源码。

## 2. W01：当前只有 GLOBAL 或单一 Workspace

| 必答问题 | 当前结论 |
|---|---|
| 同一个 Asset 能否同时用于 A/B？ | 可以：GLOBAL 对 A、B 都有资格。单一 WORKSPACE Asset 只属于其指定 Workspace。 |
| 能否同时对 C 不可用？ | 不能用当前模型表达“仅 A/B 可用、C 不可用”。GLOBAL 也对 C 及 workspace=NULL 的任务有资格。这里说的是范围资格，仍需文件本身有效。 |
| 是否为同一 ID 和同一权威内容？ | GLOBAL 可以保持同一 ID、同一个正式 Markdown。复制为不同 ID 是不同 Asset；复制同一 ID 到多个目录则触发冲突，不构成共享。 |
| 可信 Task.workspace 如何判断？ | Hook 根据 cwd 最长路径匹配得到单值或 NULL。MCP 从 Task 读取该值；有效 Asset 为 GLOBAL，或 WORKSPACE 值与之严格相等时才可访问。 |

当前设计 Revision 2.1 与实现一致；未在当前仓库设计、补充决策、Schema、持久化、调用链或测试中发现后续已确认的多 Workspace 成员模型。此结论不推断仓库外是否有未提供的决策。

### 证据链（均为本轮当前文件行号）

| 检查面 | 证据与含义 |
|---|---|
| 设计契约 | `设计文档/codex-memory-os-design-revision-2.md:448–449,560–582,745–773`：GLOBAL 禁填 workspace；WORKSPACE 要求已配置的单值并与目录匹配；Task 可信上下文限定读取资格。 |
| Frontmatter | `apps/server/src/asset/schema.ts:30–44`：严格联合 Schema；WORKSPACE 的 workspace 是非空字符串，GLOBAL 不含该字段；没有 workspaces 数组。 |
| 配置 | `apps/server/src/asset/schema.ts:59–86`：workspaces 数组定义多个独立 Workspace；每项 paths 数组仅代表同一 Workspace 的多个匹配目录。 |
| Scanner/重复 ID | `apps/server/src/asset/scanner.ts:330–380,622–706`：按 ID 收集所有冲突并全部排除；文件单一目录与单一 Frontmatter workspace 一致才有资格。 |
| Confirm | `apps/server/src/asset/confirmation.ts:84–103,263–303`：复用 Inbox/正式 Scanner、拒绝正式 ID 冲突；仅把 inbox 根改为 assets，保留同一 scope/workspace 路径，不产生多归属。 |
| Catalog/SQL | `apps/server/src/asset/catalog.ts:5–18,302–307`：workspace TEXT 单列、asset_id 主键、file_path 唯一。源码建表仅有 Catalog、FTS、Task、Binding、Usage，无 Asset—Workspace 关联表。 |
| Search/Read | `apps/server/src/asset/search.ts:226–268,619–632,706–712`：Catalog 过滤和当前文件 isAccessible 都是 GLOBAL 或与可信 workspace 相等；NULL 仅 GLOBAL。F02 路径缺陷独立保留。 |
| Mark Used | `apps/server/src/mcp/tools.ts:196–207`：先取 Task，再以 task.workspace 调用纯 Application Read，成功后才写 Used；UsageRepository 本身不承担资格检查。Search/Read 工具同样在 `127,167` 行使用 Task.workspace。 |
| Task/Binding | `apps/server/src/task/workspace-resolver.ts:21–66`：最长路径匹配、无匹配 NULL、同等最长歧义报错。`apps/server/src/task/repository.ts:218–243`：已有 Turn binding 优先，显式 attach 校验 Workspace 严格一致。跨 Session/Turn 复用不是 Asset 共享。 |
| Loadout/Hook | `apps/server/src/loadout/service.ts:261–273` 与 `projection-repository.ts:18–31`：后续按保存 ID 取 metadata，未校验当前范围。`renderer.ts:32–37` 直接输出当前 title/summary；`hook/user-prompt-submit.ts:135–155` 使用此路径。这是 F03 缺陷，不是多 Workspace 能力。 |
| Hub/REST/DTO | `apps/server/src/asset/search.ts:271–325,723–730` 的 Library 使用人工管理筛选；`apps/server/src/http/service.ts:73`、`apps/hub/src/api/types.ts:5–34` 均为单值。主设计 `1248–1256` 明确 Hub 全库只读不改变 MCP 的可信隔离。 |
| 测试 | `apps/server/test/asset-scanner.test.ts:26,205` 覆盖严格字段和冲突排除；`asset-search.test.ts:46` 验证 GLOBAL、alpha/beta、NULL 及越权 Read；`task.test.ts:141,174,472,506` 验证 NULL、attach、最长路径和歧义。未发现同一 Asset 选择性 A/B 允许且 C 拒绝的能力测试。 |

## 3. 对 F03 最小修法的约束

W01 已提供实施前输入：按当前 **GLOBAL 或单一 WORKSPACE** 的资格规则修复，不增加数组、关联表、共享协议或 GLOBAL 回退。

后续修复应在每次模型可见输出前，以保存的可信 Task.workspace 复核当前文件；复用纯 Application 资格读取，不能通过计数型 MCP Read 绕行。仅在 metadata SQL 增加 workspace 条件仍不足以覆盖无效/删除文件及 F02 父目录替换。

保持 loadout_json、数组顺序和终态冻结。失效项不输出新的 title/summary；类型已不允许 DIRECT 时，当前输出最多提供合格引用，不注入摘要。当前类型策略及预算见 `apps/server/src/loadout/service.ts:292` 起和 `loadout/policy.ts:15–20`。保留 Hub 全库人工管理契约。

正式实施 F03 时仍须固化 alpha→beta、GLOBAL→不允许范围、类型变化、删除/无效化及 F02 路径边界反例，并覆盖新 Turn、显式 attach、模型可见投影和 Usage 不变。本轮没有运行这些 F03 反例，不记作修复后通过。

## 4. 决策对应与当前修复跟踪

以下是当前源码复核，不是本轮重新运行原审计反例。尚未固化正式修复回归，也未更改 Finding 状态为已修复。

| 项目 | 当前证据 | V2 处置与本轮状态 |
|---|---|---|
| F01 / S01 | `scanner.ts:532–555` 仍调用无 options 的 matter(source)。已读安装的 gray-matter 4.0.3：`index.js:35–50,85–109` 存在全文 cache 和文件语言选择；`lib/engines.js` 存在 JavaScript eval parser。Inbox、Status、Confirm 继续复用 Scanner。 | 首项修复待指定；统一 YAML-only、禁止文件切换 engine，核对实际 cache 行为。当前不迁移存储。 |
| F02 | `scanner.ts:254–280,489` 定向读取只检查末级文件并使用 O_NOFOLLOW；全量扫描逐级检查目录。 | 当前资格差异仍在；待单项实施根/父目录/最终真实路径检查。 |
| F03 | `loadout/service.ts:261–273`、`projection-repository.ts:18–31` 仍按 ID 读取 metadata。 | W01=SINGLE_ONLY；按上述资格规则修复，未实施。 |
| F04 | `asset/catalog.ts:354–398` 仍按旧行做 ID 或路径匹配，changed 数组可重复加入同一个新 Asset。 | 独立索引差异算法；必须明确指定 F04，不能用异常过滤替代。 |
| F05 + U04 | `hook/user-prompt-submit.ts:162–185` 仍统一 catch 返回 2；`task/repository.ts:116` 等待 5000ms；`loadout/renderer.ts:59–60` 超预算抛错。 | 仅 Hook 边界故障分类和合格内容预算降级；不放松资格、伪造 Task 或改变 MCP/REST 成功语义。未验证真实客户端阻断行为。 |
| F06 | `asset/index-manager.ts:99–107,251–285` 初扫后注册 ignoreInitial watcher，ready 后没有补扫。 | 待经既有串行队列完整对账，不能用固定 sleep 或提前 READY。 |
| F07 | `asset/index-manager.ts:115–117`、`asset/catalog.ts:137–155` 有内部 rebuild；当前 package scripts 和 CLI 无 rebuild-index；`README.md:282–304` 仍说明整库移动与历史丢失。 | 新增显式离线 rebuild-index 的方向不变：仅派生索引、保留运行数据、完整 Snapshot 后事务重建、失败不整库重置、不自动触发。未执行真实维护。 |

F04 是集合算法，F03 是当前 Asset 资格，F05/U04 是 Hook 故障与预算边界，三者不能合并为一个全局 catch。F04 的编号歧义不阻止 F01 开始，但未闭环前不能给整体 GO。

U01/U05 真实客户端与浏览器验收、U03 确定性多进程验证仍待完成；U02 薄终态入口、N13 指标文案待独立实施；S02–S04 不顺带清理。PostgreSQL/pgvector 为条件性未来方向，M00–M05、真实候选确认和迁移不在本轮范围。

## 5. 本轮验证与边界

使用命令级 PATH 指向 `/Users/hemu/.npm/_npx/78120b5db7e8f750/node_modules/node/bin`：

```sh
pnpm --filter @codex-memory-os/server exec tsx --test --test-concurrency=1 test/asset-scanner.test.ts test/asset-search.test.ts test/task.test.ts
```

结果 **22/22 PASS，0 failed，0 skipped**。测试均使用 mkdtemp 隔离样本/数据库并清理；仅验证当前 Schema、Scanner、Search/Read、Task/Binding 相关行为，不证明原漏洞已修复。

另以 `pnpm --filter @codex-memory-os/server exec node --import tsx --input-type=module --eval` 直接导入当前 `assetFrontmatterSchema`，使用有效 ast ID 和公共字段，断言以下结果：

| 输入范围字段 | safeParse.success |
|---|---|
| scope=GLOBAL | true |
| scope=WORKSPACE, workspace="alpha" | true |
| scope=WORKSPACE, workspace=["alpha","beta"] | false |
| scope=WORKSPACE, workspaces=["alpha","beta"] | false |
| scope=WORKSPACE, workspace="alpha", workspaces=["alpha","beta"] | false |

该内存探针 exit 0，Node v22.16.0，未写测试文件。首次使用 tsx --eval 因 CommonJS 解析碰到 ESM-only 包返回 ERR_PACKAGE_PATH_NOT_EXPORTED；改用上述 ESM 入口后通过，没有修改依赖或业务代码。

本轮未运行全量测试、build/typecheck、原漏洞动态复现、真实 CLI/Desktop 或浏览器验收；没有将原报告运行结果记成本轮结果。没有修改真实 Asset、运行库、个人 Codex/MCP/Hook 配置；没有执行确认、维护命令、commit/push。

## 6. 工作区核验与下一项

写入前对 tracked 和非忽略 untracked 的 119 个文件建立 SHA-256 清单，核验结果见本记录末尾。清单不覆盖 ignored 构建产物或仓库外目录；不声称对真实数据目录做过逐字节扫描。

下一项按 V2 为 **F01**：统一 YAML-only 解析及四类入口回归。需用户指定实施项后执行；不重新审批已接受的修复方向，不自动批量修复。

最终核验：原 119 个文件变更/丢失 **0**；非忽略新增文件仅本记录；`git diff --check` 通过，本记录单独检查无尾随空白且以换行结束。原审计、V2 计划和已有用户文件全部保留。
