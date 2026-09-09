# 知识召回核心模型与 Task 解耦设计

> 2026-09-09 当前源码修订：用户已授权实施多表达召回，现行契约见§22，覆盖下文2.2的单query、禁止queries[]及相关存储/Skill描述。运行环境仍是已验收的2.2；2.3源码不代表已迁移或安装。
>
> 2026-09-09 历史安装状态：2.2及“项目名称/别名/业务语义自动识别＋明确预授权项目由Hook交付能力”已安装，用户确认该轮验收成功、无阻碍。真实检查与范围裁定见[验收记录](../验证记录/04-设计2.2实现与人工切换.md#2026-09-09-人工验收与用户确认)。§21覆盖此前仅依赖cwd的新项目签发路线和较窄的Recall触发条件；以下2026-09-08的“本轮/尚未实施”保留为当时文档修订边界。

日期：2026-09-08。版本：**2.2**。状态：**最终收敛语义已冻结；P0 新 Workspace 可信签发路线待验证，尚未实施**。

本文按用户《CodexMemoryOS 知识召回模型最终收敛修订指令》替代 2.1 的相关目标约束：Usage 按 Asset 统计并允许结算已演进内容的旧引用；Capability 无自动期限；显式选择 0–N 能力；Recall Skill 负责提炼 Query；DIRECT/Query 采用 50/50 缺额回流；完整模型输出初始预算为 5000 字符；Recall/Read 事实写失败仍交付知识。Task、Loadout、Session/Turn、Asset Kind 及 Legacy 产品退出方向保持。

本轮只修订本文、必要文档索引及本文内的 Recall Skill 协议草案。已安装 Skill 只读检查，不修改源码、业务测试、真实数据库、真实数据、正式 Asset、运行配置、Hook/MCP/Hub，不创建策略文件，不执行 P0 或 P1–P8，不安装、部署、删除数据或 commit/push。保留原路径作为本主题唯一设计入口。

旧源码核对基线为 `f1cd8a53abf98b3cf032dc28cd20f91f2916de2f`；§2 保留该基线事实。前轮审查的隔离 Search/Read、Usage 故障测试和规则模拟只证明各自边界，不代表新版实现或真实宿主验收。本轮执行文档一致性检查，目标语义、旧实现与 P0 的未知事实分开记录。

## 1. 产品目标、非目标与文档效力

CodexMemoryOS 聚焦**知识沉淀 + 基于当前工作内容的知识召回**：保留人工治理的经验、决策、历史约束和验证边界，并在当前工作需要时交付相关知识。系统优先级冻结为：**知识可用性 > Usage 记录完整性**；权限、当前内容资格和不得伪造 Used 仍是硬约束。

```text
Trusted Workspace Capabilities[] + Current Query + optional Scenario[]
                                  |
                                  v
                           knowledge_recall
                                  |
                                  v
                             RecallResult
                                  |
                            +-----+-----+
                            v           v
                           Read        Used

Selected Workspace Scope = GLOBAL + 本次选中的 0..N 已授权 Workspaces
```

Workspace 是知识所属项目范围，不是对话的唯一当前项目。Authorization 表示已经拥有 A/B/C 的访问能力；Selection 表示本次只选择 B 或 A+C。模型每次显式选择仍有效的 capability，不自动提交全部能力、不猜最近项目、不把 Scope 固定到对话。

Query 是 Codex 针对当前知识召回目的生成的简洁检索表达，不是首次 Prompt、完整用户 Prompt 或会话摘要。Kind 只帮助收窄可选 Scenario；没有 Kind/Scenario 仍有基础 Recall。

知识领域对象仅为 Asset、Workspace、WorkspaceKind、Scenario、RecallPolicy、Usage Facts；技术对象为 WorkspaceCapability。Scope、Activation、RecallResult 是调用输入/派生集合/响应，Usage 的操作与条目是事实结构，不增加业务目标或历史管理实体。

系统不管理任务、会话、轮次、持久装配或对话归属，不保存 Prompt/Response 转录；历史对话由 Codex 原生能力承担，不承诺其完整性。第一版不新增向量搜索、模型 API、LLM Query Planner、服务端查询拆分、queries[]、LLM rerank、动态权重或自动场景分类。

本文是新版目标。在正式切换前，[知识运行时设计方案修订版 2.1](01-知识运行时设计方案-修订版2.1.md)、当前源码、README、工程约定和已安装 Skills 仍描述旧运行行为，不得混用。保留[Native Memories 协同与知识变更设计](04-Native-Memories协同与知识变更设计.md)的人工确认、原始字节 Hash、CURRENT/PREVIOUS 与 Diff 边界；本次冻结取代与之冲突的未来方向，不改历史验收结论。

## 2. 当前旧实现问题与可复用基础

本节为 2.0 已核对的旧实现基线；多 Workspace 签发时点与宿主隐式上下文尚无实测结论。

| 2.0 源码事实 | 证据与定位 | 设计含义 |
|---|---|---|
| Hook 解析完整 Prompt 中的 taskId，调用 resolveTask，并渲染保存的装配 | [user-prompt-submit.ts](../../apps/server/src/hook/user-prompt-submit.ts)，handleCodexHook、extractExplicitTaskId | 建立可信范围不应附带业务对象创建或历史选择注入 |
| 找不到可复用绑定时自动创建，request 保存初始 Prompt；后续复用不会改成当前 Query | [task/service.ts](../../apps/server/src/task/service.ts)，resolveTask；[task/repository.ts](../../apps/server/src/task/repository.ts)，resolveAndBind | 初始 Prompt 不是后续工作召回的可靠查询表达 |
| task_loadout 同时承载业务字段与 loadout_json；task_turn_binding 使用宿主标识并外键引用它 | [task/repository.ts](../../apps/server/src/task/repository.ts)，两段 CREATE TABLE | 两张表属于待退役旧运行数据，无需转换成新领域对象 |
| 旧 MCP Search/Read/Used 强制 taskId；Search 写 RECALL，Used 无版本引用 | [mcp/tools.ts](../../apps/server/src/mcp/tools.ts)，输入 Schema 与三个 handler | 必须先建立新闭环，才能停止旧入口；Search 的双重含义需要消除 |
| Usage 为 UNIQUE(task_id, asset_id) 聚合，外键依赖 task_loadout | [usage/repository.ts](../../apps/server/src/usage/repository.ts)，CREATE_TASK_ASSET_USAGE_SQL | 无法据此还原每次 Query、原因和 Hash；不伪造新事件 |
| 底层搜索和读取仅需 context.workspace；当前资格由扫描器检查 | [asset/search.ts](../../apps/server/src/asset/search.ts)，AssetSearchContext、search、read、isAccessible；[scanner.ts](../../apps/server/src/asset/scanner.ts) | 知识访问能力本身不依赖旧业务对象，可保留资格与检索基础 |
| 查询匹配采用归一化词项全部命中；排序用字段层级、Workspace 优先级、BM25、assetId | [asset/search.ts](../../apps/server/src/asset/search.ts)，normalizeAssetSearchQuery、compareRankedItems、publicScore | 复用确定性搜索，不能用舍入后的公开 score 冒充真实排序键 |
| 装配先取少量搜索结果，再做 minScore=200、MEMORY DIRECT 门槛=300 和预算选择 | [loadout/service.ts](../../apps/server/src/loadout/service.ts)，resolve、buildTaskLoadout；[policy.ts](../../apps/server/src/loadout/policy.ts) | 不复制提前截断导致候选不足的流程；区分相关性与交付方式 |
| DIRECT 渲染 MEMORY summary，非 MEMORY 降为引用；有 Unicode 预算与降级 | [loadout/renderer.ts](../../apps/server/src/loadout/renderer.ts)、[loadout/service.ts](../../apps/server/src/loadout/service.ts)，renderStoredTaskLoadout | 保留算法价值，去掉保存对象及业务身份参数 |
| Hook 独立进程打开同一 SQLite，主服务另行装配；不存在共享 JS 内存 | [hook/user-prompt-submit.ts](../../apps/server/src/hook/user-prompt-submit.ts)、[runtime.ts](../../apps/server/src/runtime.ts) | Capability 必须解决跨进程传递；能否获得额外项目的可信信号另由 P0 验证 |
| Hub、Overview、Asset 详情和 REST 都含旧对象投影 | [http/overview.ts](../../apps/server/src/http/overview.ts)、[http/service.ts](../../apps/server/src/http/service.ts)、[hub navigation](../../apps/hub/src/navigation.ts) | 删除范围包含统计与详情侧栏，不能只删一个列表页 |
| 内容双版独立存表，构造函数严格要求 user_version=1 | [asset/content-version.ts](../../apps/server/src/asset/content-version.ts)，AssetContentVersionRepository | Schema 演进必须同步版本判断，不能破坏正文双版或重置整个库 |

当前严格 [Asset Schema](../../apps/server/src/asset/schema.ts) 没有 appliesToKinds；当前运行层也没有独立 Session/Turn 实体或 Scenario 实现。删除这些设计不等于已有对应业务表要迁移；实际删除清单以实施时 Schema 清点为准。

## 3. 冻结设计原则

| 编号 | 冻结内容 |
|---|---|
| D01 | Asset 内容更新是同一知识演进；保留 CURRENT/PREVIOUS、确认和 Diff，不增加版本序列、版本 Usage 或 Asset Kind |
| D02 | 可信宿主签发 WorkspaceCapability；模型每次显式选择 0–N 个，服务端形成 GLOBAL + 所选 Workspace 集合 |
| D03 | Workspace Kind 为 0–N 标签，仅决定 Scenario 候选范围，不直接改变 Asset 权限或基础检索 |
| D04 | Scenario 为长期策略；每次显式激活 0–N ID，不从上一轮、会话、Prompt 或 Usage 自动继承 |
| D05 | DIRECT/ON_DEMAND 是 Scenario–Asset 关系模式；前者进入 DIRECT 桶，后者须 Query 命中并进入 Query 桶 |
| D06 | Task、绑定、Session/Turn、持久 Loadout 及旧 Usage 在新链独立验收和正式切换后删除，无 Legacy 产品 |
| D07 | Capability 无自动期限，跨轮和重启持续有效；只因授权映射失效或明确撤销而失效，无 current Workspace 单例 |
| D08 | 正常 Codex 召回唯一入口为 knowledge_recall；Recall Skill 的查询提炼、范围选择和引用规则是 P3 硬退出条件 |
| D09 | asset_search 仅为人工/Hub/调试纯检索，不计 RECALL，不进入正常 MCP 召回工具目录 |
| D10 | Usage 是显式操作事实；Used 总数按 assetId 跨内容演进累加，Hash 仅证明交付/校验引用，不分桶统计 |
| D11 | Read 保持当前资格/Hash 契约；Used 可结算旧内容的持久引用，不重新交付旧正文、不把旧 Hash 冒充当前 |
| D12 | Recall/Read 事实写失败仍交付实际知识，usageRecorded=false 且不提供本次稳定结算引用；Used 写失败仍失败 |
| D13 | 合格候选按 Asset 去重后分 DIRECT/Query 两桶；8 条目标 4/4，不足回流，不叠加来源权重 |
| D14 | maxAssets=8，maxModelVisibleCharacters=5000 为初始值；统计完整模型可见响应并单列知识内容与元数据字符数 |
| D15 | 每个真实 Scenario 必须证明净收益才可 enabled；无明显收益不启用，明显变差不得进入默认策略 |
| D16 | 可选策略失效可回退；权限、可信配置和当前资格错误不得伪装为 GLOBAL 或无记录成功 |
| D17 | 保留正式知识、新事实与内容双版；旧运行数据不分类、不转换、不兼容运行、不保留浏览或备份要求 |

本次明确取消 2.1 的固定能力期限、全配置原始字节变化一律失效、非空能力前置、Used 当前 Hash 相等前置、Usage 写失败拒绝交付、DIRECT 全局优先占满以及 3000 字符目标预算。版本 Usage 不进入目标 Schema/统计；旧文档中的 Hash 追溯不扩展为版本计数。

SQLite 能力落点、稳定排序、引用唯一性与预算算法属于落实冻结目标的实现选择；P0 只回答从未授权的新 Workspace 如何获得可信 capability，尚无真实宿主结果。

## 4. 核心对象与权威来源

| 对象/结构 | 最小语义 | 权威来源与边界 |
|---|---|---|
| Asset | 既有 identity、type、scope、workspace、title、summary、content 与确认/修订资格 | Markdown 原件及当前确认机制；CURRENT/PREVIOUS 用于治理，不是两条知识，不新增 Frontmatter 分类字段 |
| Workspace | 知识所属项目名称与可信路径映射 | workspaces.json；本期不新增 workspaceId |
| WorkspaceKind | id、name，Workspace 可绑定 0–N 个 | RecallPolicy；无 Profile 或分类树 |
| Scenario | id、name、description、enabled、applicableKinds[]、Asset 关系 | RecallPolicy；仅经净收益验证的定义可以启用 |
| RecallPolicy | Kind、Workspace 标签、Scenario/Asset 模式关系 | 独立配置原件；每次使用一份一致快照 |
| WorkspaceCapability | capabilityId、workspace、createdAt、trustedWorkspaceMappingHash | 技术授权记录；单能力单 Workspace，持续有效直到授权失效或撤销，无对话归属 |
| Selected Workspace Scope | authorizedWorkspaces[]，GLOBAL 隐含 | 本次显式 0–N 能力解析出的去重排序集合，不持久化为当前上下文 |
| Scenario Activation | 本次实际有效 Scenario ID 集合 | 输入经校验所得，不建历史实体 |
| RecallResult | usageRecorded、nullable recallId、条目、预算、诊断等 | 本次交付响应，无事实记录也能交付知识；不是持久装配 |
| RecallOperation | recallId、authorizedWorkspaces[]、query、activeScenarios[]、policyHash?、occurredAt、diagnostics、budget | 仅在事实事务成功时存在，空结果也可记一次操作 |
| RecallItem | recallItemId、recallId、assetId、contentHash、assetScope、assetWorkspace、selectionReasons[]、bucket、requestedMode?、deliveredMode | 一次已持久召回的去重条目事实；不存整篇正文 |
| ReadOperation | readRef、authorizedWorkspaces[]、assetId、contentHash、assetScope、assetWorkspace、recallItemId?、occurredAt | 成功持久的读取事实，支持直接 Read |
| UsedEvent | usedId、authorizedWorkspaces[]、sourceRef、assetId、occurredAt | 显式使用确认；交付 Hash 与来源范围从不可变来源事实派生，不复制 Hash 计数维度 |

Usage Facts 由上述 Recall/Read/Used 事实构成，不新增通用 Activity、计数权威或版本账本。Asset totalUsedCount = 按 assetId 聚合的 UsedEvent 行数；重复来源引用只计一次。内容更新不重置或迁移计数，11 次使用后更新仍是 11，再独立使用并确认一次才为 12。

Hash 是原始 Markdown 字节 SHA-256，用于证明交付内容、校验读取引用和检测变化；不是知识身份、Usage 维度或知识质量评分。Query 仅存本次提炼的有界检索表达，不自动收集完整 Prompt/Response。

## 5. WorkspaceCapability 与可信访问范围

### 5.1 Authorization 与 Selection

WorkspaceCapability 表示可信宿主已经授权访问某一 Workspace 的知识。它不代表当前工作目标、对话归属或唯一当前项目。cap_A/cap_B/cap_C 可以同时存在，访问 B 不撤销 A，重启不使仍成立的授权消失。

```text
Trusted Host --可信授权--> cap_A / cap_B / cap_C
                                  |
                    Codex 按当前召回目的显式选择
                       [] / [B] / [A,C]
                                  |
                                  v
                  GLOBAL / GLOBAL+B / GLOBAL+A+C
```

只有实际提交的能力参与本次 Scope、Kind 并集和检索。Query 帮助 Codex 决定本次需要哪些已获授权范围，不授予新权限；模型填写 workspace/cwd、读到另一个目录或认为需要 D 均不能生成 cap_D。

### 5.2 签发与范围合并

1. 可信 Hook/宿主事件提供 cwd 或经 P0 证实等价的授权信号。沿用既有路径段边界、最长匹配规则解析 Workspace，使用同一份有效配置快照解析并生成授权映射指纹。
2. 配置有效且无项目匹配时不签发 Workspace 能力；调用者可以显式选择 [] 访问 GLOBAL。**不再需要 workspace=null 的能力记录。** 配置损坏、歧义或信号不可信时不得签发，也不得把错误称为成功解析。
3. knowledge_recall、scenario_list、asset_read、asset_mark_used 均要求显式、有界的 capabilityIds 数组；**[] 合法，仅代表 GLOBAL；字段缺失、结构错误或超限仍为 INPUT_INVALID。** 不新增匿名网络入口，不改变既有 MCP 接入边界。
4. 先检查输入结构，再去重能力 ID，读取同一份可信配置快照并校验全部提交项。每个能力须确实签发、未撤销，其 Workspace 仍存在且原授权映射仍成立。
5. 从有效记录取 Workspace，去重并固定字典排序得到 authorizedWorkspaces[]。GLOBAL 天然包含；重排、重复、同项目多能力不改变范围、配额或统计。
6. 任一提交能力无效，整个调用返回 CAPABILITY_INVALID，不忽略该项、不返回部分范围，也不退为 []。合法 [] 同样要求当前配置可用，配置不可确认返回 WORKSPACE_CONFIG_UNAVAILABLE。
7. 下次调用重新显式选择；不保存最近 Scope、不自动加入所有已持有能力、不建立 Conversation/Session/Turn/窗口绑定。

### 5.3 持续授权、失效与撤销

第一版能力**无自动期限**。时间流逝、长轮次、访问次数、切换目录、签发别的项目能力或 Scenario 策略变化均不使能力失效；不存在续期动作或定时过期清理。

| 事件 | 行为 |
|---|---|
| Workspace 删除或名称改变 | 原能力失效；新名称视为新授权，不能猜映射 |
| 对应 Workspace 的可信路径映射改变，或配置变化使原授权不再成立 | 原能力不再放行，需可信流程重新签发 |
| 仅配置排版/无意义顺序变化，或其他 Workspace 变化且不影响本授权 | 不自动撤销该能力；仍校验当前配置整体有效性 |
| 当前可信配置不可读、损坏或歧义 | 当前请求拒绝，不伪造范围；配置恢复后重新校验授权成立与否 |
| 用户或可信本地管理流程明确撤销能力 | 移除该能力摘要记录，后续按 CAPABILITY_INVALID 拒绝；不提供模型任意范围签发/撤销工具 |
| 服务重启、切项目或长时间工作 | 已持久且授权仍成立的能力继续有效 |

trustedWorkspaceMappingHash 对**规范化后的单个 Workspace 授权映射**计算：项目名称与按既有路径语义规范化、去重排序的路径集合；不把整份配置原始字节 Hash 当统一撤销开关。解析与指纹计算必须基于同一份已校验配置字节快照；物理编码由 P1 固定并测试，不扩大现有路径授权。

能力表不承担配置变更历史账本。请求时按当前映射校验；若需保证某个旧能力在映射恢复后也永不恢复，应明确撤销该能力记录，不能把临时配置故障等同于已持久撤销。自动失效判断与明确撤销的区别须在维护说明中一致。

### 5.4 存储与安全边界

当前独立 Hook 与 MCP 不共享 JS 内存，最小持久落点为 SQLite `workspace_capability`，存能力摘要、workspace、createdAt、trustedWorkspaceMappingHash。该表没有对话字段、过期字段或定时清理要求；只清理已明确撤销/已确认失效的授权记录，不影响操作事实。

capabilityId 是不可预测的 bearer 能力，持久层只保存摘要；共享 ID 包提供专用密码学随机生成 API，不使用顺序业务 ID。普通日志、Usage、Hub 不展示能力原值；Hook/经验证宿主仅向获授权调用上下文交付原值与项目名称，不展示不存在的到期信息。

持有能力并不证明当前意图；模型必须按本次 Query 做 Selection。能力本身不证明对话/窗口身份，不宣称抵御能盗取能力、篡改数据库或控制可信签发进程的本地程序。现阶段无模型可调用的能力创建、列表或导出接口；尚未授权的新项目如何可信签发由 P0 回答。

持久知识引用不外键到能力。Read/Used 可以换用仍有效、覆盖目标来源与当前资格的能力，不要求使用原 capabilityId 或恢复父 Recall 的整个项目集合。

## 6. Workspace Kind 与 Scenario Definition / Activation

### 6.1 最终关系

```text
Scope 中每个 Workspace --0..N 标签--> Kinds
                                      |
                              所有有效 Kind 取并集
                                      |
                                      v
                      通用 + 与 Kind 并集相交的 Scenario
                                      |
                             Codex 本次显式选择 0..N
                                      |
                                      v
Scenario --DIRECT / ON_DEMAND--> Scope 内合格 Asset
```

例如 A={frontend}，B={backend,product-design}，Scope=[A,B] 的有效 Kind 为三者并集。Scenario 候选为启用的通用定义，加上 applicableKinds 与任一有效 Kind 相交的定义。只有实际提交能力对应的 Workspace 参与 Kind 并集。

Kind 不直接过滤、排序或注入 Asset，不建立 Kind→Asset Policy。Asset 不保存 Kind 或 Scenario 镜像。没有 Kind-level baseline；如果日后真实使用证明有新需求，需单独设计，本期不预埋。

Scenario 经整个 Scope 的 Kind 并集校验后，其关系候选在整个授权 Scope 内检查，不再次按 Asset 所属 Workspace 的 Kind 做隐藏过滤。例如 A 的 Kind 使场景适用，场景关联的 B 知识只要 B 已获授权且满足当前资格/模式就可参与；这不是给 Asset 增加 Kind。

### 6.2 可选与激活规则

- applicableKinds=[] 表示通用 Scenario；否则与本次 Scope 的有效 Kind 并集有任意交集才适用，不要求全部匹配。
- Scope 中所有 Workspace 均无 Kind，或 authorizedWorkspaces=[] 时只提供通用 Scenario；这不减少基础 Query 可见的 Asset。
- 只有 enabled=true 且适用的定义可激活。省略 scenarios 等于 []，不从其他调用、历史 Usage、Prompt 关键词、宿主启动事件或上一轮继承。
- Codex 根据当前工作显式选 ID；没有匹配场景时提交 []。服务端只校验明确集合，不分类工作，不调用额外模型。
- 输入为 []、[A]、[A,B] 都合法。重复 ID 去重，有效 ID 按确定性字典顺序归一化；输入顺序不影响最终优先级。
- 未知、禁用、Kind 不适用的 ID 逐项跳过并返回有界诊断；合法项与基础 Recall 继续。整个参数结构错误或超过硬上限时拒绝输入。
- “与 Query 内容无关”不等于“Kind 不适用”：一个 Kind 适用但被 Codex 误选的 Scenario 不会被服务器自动语义分类驳回。其 DIRECT 仍可入候选，ON_DEMAND 仍须匹配 Query；误选影响通过原因、预算和消融验证呈现。
- scenario_list({capabilityIds}) 校验全部提交能力后，可列出整个 Scope 适用的启用候选及描述，纯读取、不计 Usage。capabilityIds=[] 只提供 GLOBAL 范围的通用候选；采用稳定排序与有界分页，让 Hook 列表截断不等于场景不可选择；每次 Recall 仍重新校验。

## 7. Recall Pipeline、Query 与固定配额

### 7.1 Query 输入与处理顺序

正常入口为 `knowledge_recall({capabilityIds: [], query, scenarios?})`，capabilityIds 也可显式提交一至多个已授权能力。无调用者可填 Workspace、候选模式、原因或业务身份。

Query 必须非空、有界，是 Codex 针对本次知识召回目的提炼的**短、具体、包含核心实体与关键约束的检索表达**。不原样使用首次 Prompt、完整用户 Prompt 或 Session Summary；服务端继续采用文字归一化、FTS/字面匹配、短词处理和词项 AND，不做语义改写或模型规划。

例如 Request“帮我审核一下充值回调这里是不是可能在 MQ 重试时重复处理”，可提炼为“充值回调 幂等 MQ重试 重复处理”。这是表达示例，不保证这些词在同一 Asset 中全部出现；AND 下堆叠词项可能降低覆盖。复杂问题可由 Codex 按独立知识目的分别调用，如“充值回调 幂等”“MQ 重试 重复处理”，每次仍是单个 query。无命中不证明不存在历史知识，不增加 queries[]、服务端 Query Decomposition 或额外 LLM Query Planner。

```text
显式选择 0..N capability -> 校验全部能力 -> Selected Scope
      + Codex 提炼 Query + 本次显式 Scenario[]
      -> 固定可信配置/策略快照
      -> 生成 Query / Scenario 关系候选
      -> 当前资格校验 -> 按 assetId 去重、合并全部来源
      -> DIRECT / Query 分桶 -> 桶内稳定排序
      -> 50/50 名额与缺额回流 -> 类型交付与完整 5000 字符预算
      -> 构造成功/计数降级两种有界响应
      -> 尝试持久 Recall 事实
      -> RecallResult（事实失败仍返回知识，无本次稳定引用）
```

**资格与去重先于配额计算。** 流程图中两桶是来源分类，不先给失效、跨范围或重复候选分配名额。每次固定一份可信配置与可选策略快照；合法 Query 无命中可返回空结果，不改查初始 Prompt 或自动注入全库。

### 7.2 候选来源与当前资格

| 来源 | 进入条件 | 最终桶 |
|---|---|---|
| Scope + Query | GLOBAL + 所选 Workspace 内满足完整 Query 匹配 | Query |
| Scenario DIRECT | 有效激活场景关联且当前合格，无须 Query 命中 | DIRECT |
| Scenario ON_DEMAND | 有效场景关联且满足同一 Query 匹配 | Query |

不带入旧 `minScore=200` 的候选资格门槛，正文命中同样属于相关候选。策略关系按 assetId 定位，不能只在基础搜索前 8/20 条里找；多个项目统一评分，不能拼接各自提前截断的 top-K 冒充完整候选。资源受限可分批，但未检查候选须报告截断，不冒称无匹配。

全部候选复用当前目录、Frontmatter、Workspace/Scope、配置和 Symlink 等资格检查。Inbox、PREVIOUS、失效正式文件、旧索引正文不能绕过资格进入结果；整体索引或资格不可确认仍失败，不受 Usage 降级影响。

按 assetId 在整个 Scope 去重，GLOBAL 只出现一次；完整保留实际来源 QUERY_MATCH、SCENARIO_DIRECT(id)、SCENARIO_ON_DEMAND(id)。任一有效 DIRECT 来源使去重条目只归 DIRECT 桶，其余归 Query 桶，不能跨桶占两格或重复计 Recall。DOCUMENT/SKILL 即使类型降为引用，仍保留 DIRECT 来源桶，不按最终显示方式重新分桶。

同条目的 Hash、内容和原因来自同一次已验证文件读取；发现来源间 Hash 不一致则重新验证该条，仍不能确认就省略并诊断。不承诺文件系统与 SQLite 原子快照；Hash 证明当次字节，Read 仍检查当前内容。

### 7.3 桶内稳定排序与多项目平等

- DIRECT 桶：Query 命中优先；命中者依次按 fieldTier 降序、workspacePriority 降序、有效 BM25 升序、assetId 升序；无命中者按 assetId。
- Query 桶：有 SCENARIO_ON_DEMAND 原因者优先于普通 Query 命中；同层按 fieldTier、workspacePriority、BM25、assetId 的上述顺序。
- 所有选中 Workspace 的 workspacePriority=1，GLOBAL=0；仍在 fieldTier 之后比较。A/B 同级，不按能力顺序、项目名称、签发时间、Kind/场景数量加权。
- BM25 缺失排在同层有效值之后，两者都缺失再比 ID；使用固定字符串比较，不依赖系统语言环境。公开 score 只作解释，不替代真实排序键。

无可调权重、动态 rerank 或按来源数量叠加得分。取消 DIRECT 在全体候选中无限优先占满的规则，跨桶名额只由下一节决定。

### 7.4 50/50 quota 的最终算法

第一版固定 maxAssets=8，目标 DIRECT=4、Query=4。令 D、Q 为资格校验且跨来源去重后的两桶数量，字符预算足够时：

1. `d=min(D,4)`，`q=min(Q,4)`。
2. DIRECT 不足四条的空额补给 Query：`q += min(4-d, Q-q)`。
3. Query 不足四条的空额补给 DIRECT：`d += min(4-q, D-d)`；只在 `q<4` 时执行。
4. 每桶按稳定顺序取对应数量；不足八条不伪造结果。

| 合格候选 | 最终名额（字符预算足够） |
|---|---|
| D≥4，Q≥4 | 4 / 4 |
| D=0，Q≥8 | 0 / 8 |
| D=2，Q≥6 | 2 / 6 |
| D≥7，Q=1 | 7 / 1 |
| D=3，Q=2 | 3 / 2 |

名额不是输出字符数承诺。两桶按 **Query、DIRECT 交替**形成稳定交付顺序，分别保持桶内次序；某桶耗尽后追加另一桶的剩余名额。预算先为选中条目预留最小引用表示，再尝试摘要升级，不能先渲染四条 DIRECT 摘要吃尽 Query 的空间，详见 §8。

预算下不可容纳的条目降级或跳过后，先检查同桶后续更小候选补足该桶目标；该桶候选耗尽或其剩余条目均无法容纳时，空位才回流另一桶，仍受总数八条和完整字符预算约束。内部未检查候选不算“该桶不足”。数量/字符两种限制分别诊断，因字符不足最终少于 4/4 时不声称配额已经完全交付。

## 8. 类型交付与 5000 字符预算

mode 是 Scenario–Asset 关系的候选策略，bucket 是去重后的名额归属，deliveredMode 是实际交付方式，三者不写回 Asset。

| 条件 | requestedMode | 交付规则 |
|---|---|---|
| 有效 Scenario DIRECT | DIRECT | MEMORY 可交付 summary；不要求 Query 命中 |
| 仅 Scenario ON_DEMAND 且 Query 命中 | ON_DEMAND | 标题与读取引用；不因高 score 升级摘要 |
| 无 Scenario 关系的基础 MEMORY 命中 | 省略 | 沿用 score≥300 的摘要门槛；低分仍保留引用，不淘汰候选 |
| DOCUMENT / SKILL | 按实际关系，可省略 | 始终 ON_DEMAND；原请求 DIRECT 时记 TYPE_DOWNGRADED |
| 摘要升级不适配剩余预算 | 保留请求 | 保留引用并记 BUDGET_DOWNGRADED，不移桶、不占第二个名额 |

DIRECT 只交付 MEMORY summary，不是整篇正文，也不意味着 Read 或 Used。ON_DEMAND 提供 assetId、contentHash、标题和读取提示；仅事实持久成功时附可用 recallItemId。无稳定引用时仍可按 assetId + expectedContentHash 读取当前内容，不提供任意本地路径。

初始预算冻结为 **maxAssets=8、maxModelVisibleCharacters=5000**，整个多 Workspace 结果共享，不按项目增加。5000 是首版初始值，后续调整须依据实际成本/覆盖证据，不是永久不可变常量。计数按 Unicode code point，包含实际序列化响应中所有模型可见字符：title、summary/reference、原因、bucket、请求/交付模式、所有必要 ID/Hash、Workspace/来源、Query 回显、Scenario、diagnostics、usageRecorded、时间、预算信息与 JSON 结构。MCP 不得重复展示正文而漏算另一份 content/structuredContent。

### 8.1 配额与字符预算共同执行

1. 为有界外壳和两种 Usage 结果预留空间；先按 §7.4 得到两桶交错候选顺序。
2. 先为两桶所选条目装入完整最小引用表示。最小表示超限的条目跳过，检查同桶更小候选；同桶无法补齐才回流名额。不得截断 Hash、ID、必要原因或权限信息以强行装入。
3. 在已容纳全部引用的基础上，按该稳定顺序尝试符合类型/模式条件的 MEMORY 摘要；空间不足保留引用及有界降级原因。此时不能挤掉其他桶已预留的引用。
4. 最终重新计算成功响应与 Usage 写失败响应的真实序列化大小，均须≤5000；计数字段本身的长度也计入。输入和诊断设置硬上限，确保最小外壳可容纳；极端情况允许有解释的空结果。
5. 因数量、字符或候选检查上限导致的省略分别可诊断；最终实际条目及交付模式才用于事实写入。没有写成功的事实不产生稳定引用。

最小引用预留只是单次响应组装，不是新持久装配或额外状态机。无 Scenario 时全部名额回流 Query，使用同一预算算法。

### 8.2 必须记录的预算指标

- `modelVisibleCharacters`：完整模型可见响应字符数。
- `knowledgeContentCharacters`：输出 title、summary 及 reference 中实际知识说明文本在序列化表示中占用的字符数；纯工具调用提示、ID/Hash 和定位信息不算知识内容，归元数据。无知识说明的读取引用，其知识正文字符数为零。
- `metadataCharacters`：其余字段值（含读取提示、ID/Hash）、JSON 结构和包装字符数；modelVisibleCharacters = knowledgeContentCharacters + metadataCharacters，不靠摘要长度估算。测试另记录其中 summary 正文字符数，避免只有引用也被解释为充分交付了知识。
- `deliveredAssets`、`directBucketAssets`、`queryBucketAssets`、省略/降级数量；固定评估样本另报告人工标注的必要知识覆盖、关键遗漏和额外 Read 成本，不由线上服务伪造相关性真值。

全文 Read 有独立大小上限，P2 冻结；超限返回明确错误，不能截断后冒充完整读取。Read 事实写失败仍按 §10 返回完整可交付正文，大小/资格错误不适用此降级。

## 9. Recall Result 与可选持久引用

以下是新版目标契约，不表示当前工具已存在：

```text
RecallResult
  usageRecorded: boolean
  recallId: string | null
  authorizedWorkspaces[]      // 本次所选能力解析出的集合；GLOBAL 隐含
  query                      // 本次提炼检索表达
  scenarios[]                // 实际有效集合
  policyHash?                // 生效策略原始字节 SHA-256
  occurredAt
  items[]
    recallItemId: string | null
    assetId / contentHash
    assetScope / assetWorkspace
    title / type
    selectionReasons[]
    bucket                   // DIRECT | QUERY
    requestedMode?
    deliveredMode
    deliveryReasons[]
    summary? / reference
  diagnostics
  budget
    maxAssets / maxModelVisibleCharacters
    modelVisibleCharacters / knowledgeContentCharacters / metadataCharacters
    deliveredAssets / directBucketAssets / queryBucketAssets
    omittedCount / downgradedCount
```

`usageRecorded=true` 当且仅当 RecallOperation 及所有实际返回 RecallItem 的事务成功，recallId/recallItemId 才非空且可用。`usageRecorded=false` 时 recallId 及各 recallItemId 为 null，附 USAGE_WRITE_FAILED 诊断；仍交付相同合格知识条目，读取提示改用 assetId + expectedContentHash。内部生成过的未提交 ID 不得对外称为稳定引用，不留部分条目或补账状态。

RecallResult 是本次响应；成功持久的 RecallOperation/RecallItem 是不可变历史事实。无历史装配复用接口，重新获取内容仍须新 Recall 或当前资格 Read。写失败的交付不会神奇出现在 Hub，Hub 仅展示已记录事实。

contentHash 是源 Markdown 原始字节 SHA-256，说明交付的摘要/引用源自哪些字节，不证明读过全文。内容演进不改变 Asset 身份或 totalUsedCount；不按 Hash 拆分计数，不建立超过 CURRENT/PREVIOUS 的正文版本库。

## 10. Usage：Asset 总使用、历史引用与可用性

### 10.1 事实与统计身份

| 事实 | 记录条件 | 统计口径 |
|---|---|---|
| RECALL 操作 | 召回响应构造合格且事实事务成功 | RecallOperation 行数，含成功记录的空结果；Asset Recall 数按 assetId 聚合 RecallItem |
| READ | 完整当前内容可交付且读取事实提交成功 | 按 assetId 聚合 ReadOperation；内部扫描、Hook/Hub 浏览不计 Read |
| USED | Codex 显式提交有效持久引用且 Used 事务成功 | 按 assetId 聚合 UsedEvent，重复来源幂等；独立来源可分别确认 |

**Asset 是业务统计身份，Hash 不是统计维度。** totalUsedCount 从 UsedEvent 派生，不另建可编辑累计权威；内容更新前为 11，更新后仍为 11，下一次独立显式确认后才为 12。不新增 versionUsageCount/currentVersionUsedCount/historicalVersionUsedCount 或 V1/V2/V3 模型。

Used 表示知识实际影响了分析、决策、实现、修复或审查。被召回、被读取、DIRECT、场景关联或高计数都不等于有效使用或知识质量。系统按独立来源引用记录显式使用确认，不能在没有 Task/工作目标实体时声称识别了自然语言上不同的“工作次数”；同一来源只计一次，独立 Recall/直接 Read 来源可以各计一次。

RECALL/READ 事实表示服务端完成响应构造并持久成功，不证明网络对端一定收到或模型理解。提交后断连可导致接收状态未知；不增加客户端确认状态机，不承诺网络 exactly-once，也不补写无法证实的历史。

### 10.2 本次授权集合与交付来源

RecallOperation、ReadOperation、首次 UsedEvent 各自记录本次实际选中的能力范围 authorizedWorkspaces[]；不保存能力原值、不外键到能力记录。RecallItem/ReadOperation 保留 assetScope、assetWorkspace、assetId、contentHash，来源与交付取同次读取快照；Used 的来源范围和交付 Hash 从其不可变来源引用派生。

例：Recall 选择 [A,B]，item_A 来源 A，item_G 来源 GLOBAL。后来只选 A 可 Read/Used item_A，只选 B 不可；item_G 可配合任何合法选择，包括 []。仍须校验全部实际提交能力；不要求包含父 Recall 中与目标无关的项目。

目标引用的来源范围以及当前 Asset 的范围都必须被本次 Scope 覆盖。当前配置/文件资格继续校验，不能因旧引用放行当前非法文件或跨范围内容。**内容变化时 Read 校验 Hash，Used 不要求当前 Hash 等于交付 Hash。** 当前文件缺失、身份改变或资格损坏不等同于合法内容演进；按资格规则拒绝，已有事实与累计数保留。

单条 Read/Used 响应不带父 Recall 的 Query、其他项目或其他条目；幂等 Used 也不泄露首次事件的其他授权范围。人工只读 Hub 的历史浏览另行处理。

### 10.3 Read 的当前内容契约

`asset_read` 必填显式 capabilityIds[]，目标严格二选一：

- `{recallItemId}`：须存在持久条目；当前 Asset 身份/资格/范围有效且 Hash 等于该条目 Hash，否则 CONTENT_CHANGED，不返回其他版本、不写 Read。
- `{assetId, expectedContentHash?}`：直接读取本次范围内当前合格文件；可选 Hash 仅作相等前置条件，不决定返回哪份内容，不要求先 Recall。

成功读取返回 markdown、assetId、实际 contentHash、assetScope/assetWorkspace、usageRecorded、readRef 及可选原 recallItemId。事实成功才有非空 readRef；事实失败返回正文、usageRecorded=false、readRef=null 和 USAGE_WRITE_FAILED。已有 recallItemId 若原本就有效仍是原召回事实，不能将它伪称为本次成功记录的 Read。

无记录 Recall 的条目可以按 assetId + expectedContentHash Read；取得稳定 readRef 后才具备这次读取的 Used 来源。若文件已变，先说明变化，需要时显式读取当前内容，不偷偷重取 PREVIOUS。

### 10.4 Used 的最终业务语义与幂等

`asset_mark_used` 接受 `{capabilityIds, recallItemId}` 或 `{capabilityIds, readRef}`，严格二选一。不能以调用者自填 assetId+Hash 或 usageRecorded=false 的空引用补造交付来源。

1. 校验全部选择能力、持久来源引用、来源范围覆盖、当前 Asset 身份/范围/资格。assetId 和交付 Hash 从来源事实取得；**不比较当前 Hash 与来源 Hash 相等**。
2. 如果旧内容已合法 Recall/Read，且 Codex 实际采用，即使文件后来演进，oldRef 仍可成功记录该 assetId 的使用。不能重新交付旧正文、不读取 PREVIOUS、不把旧 Hash 声称为 CURRENT。
3. 相同 Asset/Hash 的关联 readRef 规范化为原 recallItemId，直接 Read 的 readRef 规范化为自身。“先标召回，再标关联读取”只有一个 UsedEvent；当前内容后来变化不破坏这个幂等键。
4. UsedEvent 按 `(sourceKind, sourceId)` 唯一、原子插入。首次成功返回 usedId、created=true；重复合法请求返回相同 usedId、created=false，累计数不变。重复请求仍校验当前能力/资格，单纯 Hash 演进不得导致 CONTENT_CHANGED。
5. 换一组覆盖目标的有效能力不会产生新 Used，保留首次事件授权快照；不泄露该历史事件中与当前目标无关的范围。
6. 独立 Recall 或独立直接 Read 有不同来源引用，可分别显式确认；累计总数跨 Hash 汇总到 assetId，不按会话、轮次或自然语言工作去重。
7. Used 写失败返回 USAGE_WRITE_FAILED，不宣称成功，可按已知持久引用重试，不重建来源、不自动增加 Read/Recall。

无记录交付实际可能影响工作，但它没有稳定来源，不能直接结算。后来重新 Read 当前内容只产生新的真实读取事实：仅在当前读取知识确实影响工作时使用新 readRef，不能补记为先前未记录的历史使用，也不能把演进后的内容冒充先前所用内容。原来已持久的其他有效来源可按其自身事实结算。

### 10.5 Usage 写失败时继续交付

| 内容/校验与事实写入 | 响应 | 可用于 Used 的本次引用 |
|---|---|---|
| Recall 合格，操作及条目事务成功 | 知识 + usageRecorded=true | 非空 recallId/recallItemId |
| Recall 合格，事实事务失败 | 知识 + usageRecorded=false + USAGE_WRITE_FAILED | recallId/recallItemId 均为 null |
| Read 合格，事实提交成功 | 正文 + usageRecorded=true | 非空 readRef |
| Read 合格，事实提交失败 | 正文 + usageRecorded=false + USAGE_WRITE_FAILED | readRef=null |
| Used 事实写失败 | 明确失败 | 不返回成功确认 |
| 权限、能力、配置、当前资格、Read Hash 或大小校验失败 | 对应错误，不交付不合格内容 | 不适用 Usage 降级 |

先构造完整且有界的响应，再尝试写事实。RecallOperation 与所有实际返回条目同事务写入，失败回滚，不部分返回“稳定”引用；Read/Used 各自事务。只捕获事实持久错误进入 usageRecorded=false，不能把编程错误或权限错误统一吞成降级成功。

不设计补账、临时签名回执、客户端自报历史或备用计数通道；正常召回仍用 knowledge_recall，不能切回 asset_search 冒充正式操作。事实缺失是明确接受的遥测缺口，不阻断普通工作，不能将 Hub 计数视为实际交付/使用全量。

## 11. Hook / MCP / REST 与 Recall Skill 正式协议

### 11.1 入口与模块边界

| 入口 | 新版职责与输入 | Usage |
|---|---|---|
| Hook / 经验证可信宿主 | 签发新 WorkspaceCapability，输出能力与项目及查询提示；不设唯一当前项目、不注入持久装配、不自动 Recall | 无 |
| knowledge_recall | capabilityIds[]、单个 query、scenarios?；[] 仅 GLOBAL，返回 RecallResult | 尝试 RECALL；写失败仍交付、无稳定引用 |
| scenario_list | capabilityIds[]、可选有界分页；按所选范围 Kind 并集列候选，不默认激活 | 无 |
| asset_read | capabilityIds[] + recallItemId，或 assetId + expectedContentHash? | 尝试 READ；事实失败仍交付正文，readRef=null |
| asset_mark_used | capabilityIds[] + recallItemId 或 readRef；支持已演进内容的持久旧引用 | 显式幂等 USED；写失败仍失败 |
| asset_search | 人工/Hub/调试/诊断纯检索，不注册到正常 Codex MCP 工具目录 | 无 |
| Hub REST | Assets、Inbox、Workspace、Scenario、已持久 Recall/Read/Used 和系统状态只读投影 | 无 |

MCP 输入 Schema 严格拒绝 workspace/cwd、旧业务身份、自填原因和 queries[]。显式 [] 是 GLOBAL 选择，不是忽略无效能力的降级路径。Read/Used 不要求包含父 Recall 全部授权范围；也不因当前 Hash 演进拒绝合法 Used。

纯搜索服务/Hub 搜索 REST 保留。人工全库 REST 不作为模型绕过能力的通道，不注册全库工具；正常模型召回只走 knowledge_recall。建议投影 `/api/workspaces`、`/api/scenarios`、`/api/recalls`、`/api/recalls/:recallId`、`/api/usage`，保留 Asset/Inbox/系统入口，最终分页与 URL 于 P7 落实。

沿用入口适配 → 应用服务 → Repository 职责；搜索/扫描器处理资格和相关性，Recall 应用服务处理两桶、去重、配额、预算及响应，Usage 服务处理持久事实和幂等。可信范围解析迁出旧 Task 目录；不为复用一个函数保留整个旧子系统。

### 11.2 已安装 Recall Skill 的只读差异清单

本轮只读检查 `~/.codex/skills/memory-recall/SKILL.md`，原始字节 SHA-256 为 `8a340a5f40bb03f03bb2ec48e96fbad426d3c0a6f1ece23399bef2b95aa07f83`。当前 Skill 仍使用真实 taskId、asset_search、Task Workspace 与旧 asset_read 参数；这反映现行协议，不在本轮改装运行文件。

| 当前 Skill 条目 | P3 必须替换/保留的完整行为 |
|---|---|
| 描述及第 1 条触发 | 保留有意义的历史回忆/重要工程选择触发，不为冻结实施机械 Recall；隐式使用说明原因 |
| 第 2 条取 taskId | 删除身份/绑定依赖；只使用可信宿主实际签发的已持有能力，缺某项目授权不伪造；GLOBAL 显式 [] |
| 第 3 条 asset_search + Task Workspace | 替换为 knowledge_recall；Authorization 与 Selection 分离，按本次目的仅提交必要已授权能力，不默认全选 |
| 第 3 条 Query | 明确提炼短、具体的实体/约束表达，去掉自然语言修饰；复杂工作可多次单 Query Recall，词项遵循 AND |
| 新增 Scenario 规则 | 每次显式选择 0–N ID，必要时 scenario_list 查询；不继承上一轮、会话或 Usage；能力范围与场景激活分别选择 |
| 第 4 条 Read | 需要全文时用持久 recallItemId；无稳定条目时按 assetId + expectedContentHash 读当前内容；直接 Read 仍允许 |
| 第 5 条知识评估 | 保留来源、原场景、当前差异与验证边界；正文资格不等于正确性，摘要不等于全文，无命中不等于无历史 |
| 第 6 条计数与结算 | 检查 usageRecorded；只用成功持久的引用显式 Used；无引用不补账，Used 不按版本统计，内容演进不自动否定旧引用 |
| 末尾 Loadout/Resolve 防护 | 删除旧装配术语与调用分支；改为权限不扩张、工具缺失不绕路、故障不阻断主工作 |

当前 Skill **没有**把完整 Prompt 原样送入搜索、默认提交全部能力或 current singleton 的明确规则；新版将其明确禁止，不能把新增防护冒称为已存在代码的删除。协议草案不得含 taskId、Loadout、asset_search 正常召回分支或隐式当前 Workspace。

### 11.3 新版 Recall Skill 完整替换草案（仅设计，未安装）

下列文本是正式协议切换时的完整行为目标。部署时同目录 KNOWLEDGE 协议须先同步为新版；本轮不把草案复制到运行 Skill。

```markdown
---
name: memory-recall
description: Use CodexMemoryOS to recall relevant engineering Asset knowledge when past decisions or an unresolved engineering choice materially affect the current work. Not for routine execution of frozen decisions.
---

# 工程知识 Recall

遵循当前已切换的 CodexMemoryOS 知识协议，使用实际工具 Schema，不猜测接口。

1. 用户要求回忆历史，或当前存在影响工程语义、边界、数据、风险的重要未决选择时使用；隐式触发先说明原因，普通冻结实施不机械召回。
2. 先理解当前 Request，提炼短、具体的检索表达，保留核心实体与关键约束，去掉无意义自然语言修饰。不要把完整用户 Prompt、首次 Prompt 或会话摘要原样作为 Query。底层是文字/FTS/AND，多个词须同时命中，避免堆叠所有问题。
3. 复杂问题可按独立知识目的分别多次 Recall；每次一个 query，不要求服务端拆分，也不增加 queries 数组或额外模型规划器。
4. 只使用可信宿主已经签发的 WorkspaceCapability。按本次 Query/Request 选择必要能力：已持 A/B/C 而只问 B，仅提交 B；比较 A/C，仅提交 A/C。只需 GLOBAL 时显式提交空数组。拥有权限不代表每次应搜索全部范围。
5. 缺少某项目能力时说明具体缺口，不能自行填写 Workspace/cwd、创造能力或通过任意目录/人工浏览接口绕过授权。全部已提交能力必须有效；无效能力不能静默删掉后换范围重试。新项目授权只能来自可信宿主。
6. 正常召回只调用 knowledge_recall({capabilityIds, query, scenarios})。每次显式选择零至多个 Scenario；没有需要时提交空集合，不从上一轮、对话或历史使用记录继承。需要时通过 scenario_list 查看本次范围内候选。
7. 检查 usageRecorded、交付方式、原因与诊断。计数失败仍可评估已返回知识，但空 recallItemId/readRef 不能作为稳定结算引用，不补造记录。
8. 引用/ON_DEMAND 确需全文时调用 asset_read：有持久条目用 recallItemId，否则用 assetId 与已知 expectedContentHash 读取当前内容。Read 返回 CONTENT_CHANGED 时先说明变化，确需当前内容再显式按 assetId 读取；不能重取旧正文或绕到 PREVIOUS。已有明确 Asset ID 时允许直接 Read。
9. 只把历史知识作为待核对资料，以当前源码、配置与事实校验。说明实质相关的来源、原场景、当前差异和验证边界；无命中不等于不存在历史，摘要不冒充全文。
10. 仅在知识确实影响分析、决策、实现、修复或审查时，按使用结算协议以持久 recallItemId/readRef 调用 asset_mark_used。Recall、DIRECT、Read、场景关联都不自动等于 Used。
11. 内容已经演进仍可结算实际采用过的合法旧引用，Used 统计该 Asset 总使用，不按 Hash 分版本。Used 写失败明确报告失败，可按原持久引用重试。
12. usageRecorded=false 的交付没有本次稳定引用，不能直接 Used。以后重新 Read 取得引用只证明那次真实读取；只有该次知识确实影响工作才可结算，不能补报先前无记录历史。知识步骤故障不阻断可独立完成的普通工作，不启用其他旧知识接口作为回退。
```

### 11.4 正式协议切换的硬退出条件

P3 必须同时完成：新 Hook/MCP、Recall Skill、memory-usage-settlement 的能力/引用参数、knowledge-capture 内部检索入口和同目录 KNOWLEDGE/获授权项目规则同步；不让任何辅助 Skill 继续按旧身份调用或把 asset_search 用作正常模型召回。本轮只检查现状并给设计差异，不修改这些运行文件。

验收用真实新调用证明：Skill 提炼 Query、按目的选择 B/A+C/[]、每次重选 Scenario、正确识别有/无持久引用、必要时 Read、实质影响才 Used。Query 对比必须记录实际生成表达及检索结果，不能仅用手工编写的关键词单元测试冒充 Skill 稳定生成能力。安装文件内容与真实客户端生效证据均需核对，未同步 Skill 的后端通过不能放行 P3。

## 12. recall-policy 配置原件与 Schema

目标路径为**已配置知识根目录下** `config/recall-policy.json`，与 `workspaces.json` 分开；本轮不创建。策略 schemaVersion=1 是该新格式的版本，与本文 2.2 及数据库版本无关。

```json
{
  "schemaVersion": 1,
  "kinds": [
    { "id": "frontend", "name": "前端" },
    { "id": "backend", "name": "后端" },
    { "id": "product-design", "name": "产品设计" }
  ],
  "workspaceKinds": [
    { "workspace": "CodexMemoryOS", "kindIds": ["frontend", "backend", "product-design"] }
  ],
  "scenarios": [
    {
      "id": "ui-redesign",
      "name": "界面重设计",
      "description": "重做布局与交互时召回已确认的界面决策。",
      "enabled": false,
      "applicableKinds": ["frontend", "product-design"],
      "assets": []
    },
    {
      "id": "change-review",
      "name": "变更审查",
      "description": "审查改动时按当前查询召回历史约束。",
      "enabled": false,
      "applicableKinds": [],
      "assets": []
    }
  ]
}
```

关系条目 Schema 为 `{assetId: 合法现有 Asset ID, mode: DIRECT | ON_DEMAND}`。示例的 assets=[] 刻意不填虚构真实绑定，enabled=false 表示尚未完成净收益验证；同一真实 Asset 可在两个 Scenario 分别 DIRECT 和 ON_DEMAND。同一 Scenario 内重复 assetId（包括冲突 mode）视为配置错误，不依赖文件顺序决定赢家。

| 校验或故障 | 行为 |
|---|---|
| 配置文件缺失 | 无增强；scenarios=[]，基础 Recall 正常，可返回 POLICY_MISSING |
| JSON、字段、schemaVersion、重复定义 ID、Kind 引用或关系结构损坏 | 本次整份策略增强不可用，POLICY_INVALID；不沿用“最后一次有效配置”静默增强 |
| workspaceKinds 引用不在当前 workspaces 配置中的名称 | 仅该绑定不生效，POLICY_WORKSPACE_UNKNOWN；其他有效绑定保留，基础 Recall 不受影响 |
| Workspace 被重命名 | 不自动猜映射；旧名称绑定无效，显式更新策略才能重新绑定 |
| Workspace 无绑定或 kindIds=[] | 0 个 Kind，仍有通用 Scenario 与基础召回 |
| 已定义但未启用 Scenario | 可以被 Hub 查看，不能激活 |
| 关系指向缺失、跨范围或当前不合格 Asset | 仅淘汰对应候选；模型只见有界不可用诊断，不输出跨范围标题、路径或正文 |

Kind/Scenario ID 使用有界稳定字符串；定义内 ID 唯一，Workspace 绑定名称唯一，数组及文本长度有硬上限，未知字段严格拒绝。unknown Workspace 是可隔离的外部引用错误，与整份结构损坏区分。

一次 Recall 只使用一份完整策略快照，policyHash 是其原始字节 SHA-256；内容 Hash 不作为版本审批账本。损坏/缺失时不声称有生效 policyHash。SQLite 不维护独立可编辑的 Kind/Scenario 原件；可重建投影不是第二权威。配置编辑不改 Asset scope、正文、确认状态或 CURRENT/PREVIOUS。

## 13. Hub 产品结构与 Asset 统计

保持现有密集中文知识 Web App：概览、知识库、待确认、工作区、场景、召回与使用；系统状态为辅助入口。只改必要投影，不重做视觉系统、不新增网页写权限。

| 导航 | 展示与最小调整 |
|---|---|
| 概览 | 正式知识/Inbox 数量、已记录 Recall 操作/条目、Read、Used 总数；取消旧 Task 状态卡；注明统计来自成功持久事实 |
| 知识库 | 当前知识、摘要、Diff、场景关系、最近事实；Asset totalUsedCount 按 assetId 跨内容更新累计，不展示当前/历史版本用量 |
| 待确认 | 保留只读浏览、人工确认说明与现有外部单文件确认 |
| 工作区 | 名称、Kinds、真实 Asset 数、GLOBAL 数、场景候选及事实摘要；区别授权操作范围与实际知识来源 |
| 场景 | 定义、适用 Kind、enabled、DIRECT/ON_DEMAND 关系、策略诊断；关系不等于已召回，净收益未验证不得启用 |
| 召回与使用 | 已持久 Query、所选范围、条目来源、场景原因、两桶交付、Hash、Read/Used 与字符预算；直接 Read/Used 独立展示 |

同一 Asset 从旧内容演进为新内容后 totalUsedCount 保持；oldRef 的合法使用仍加到同一 assetId。Hash 只用于单次交付证据/变化提示与 Diff，不设置版本 Usage 筛选、分组、曲线或累计列。Asset 更新不能重算历史来源与原因。

Workspace 展示“授权范围包含该项目的操作数”和“实际来自该项目的条目数”，不能强行将 A+B 归唯一项目；授权操作数跨项目求和会重复，GLOBAL 按来源单独统计。Read/Used 使用各自授权快照及对应来源事实，不从当前 Asset 元数据反推历史。

Scenario 展示激活操作数、实际贡献条目数、这些条目的 Used 数；多原因分别归因不等于全库去重合计。预算显示完整字符数、实际知识文本、元数据、桶数量及省略，更多命中/使用计数不自动代表净收益。

Usage 写失败的知识交付没有持久操作可展示，Hub 不伪造失败交付历史或补算次数；可展示既有系统故障诊断，不新增第二事件账本。统计只覆盖已记录事实；响应断连也可能产生客户端未收到的记录，因此不把它称为真实接收/认知活动的精确值或严格下界。

历史 Hash 与当前不同可以显示“内容已变化”；旧引用 Used 成功并不把旧 Hash 标成 CURRENT，也不允许展开过往正文。人工浏览不记 Usage。不保留 Tasks、Session/Turn、Loadout、Legacy 或版本用量页面。

## 14. 旧子系统删除与代码影响面

### 14.1 删除目标与硬门槛

旧 Task、Binding、Task Loadout、Task Usage 是旧模型运行数据。目标是**新版独立链路成立并验收后直接删除**，不分类、合并、映射、降级、转换、兼容运行、归档或展示 Legacy 数据，不要求备份或历史导出。不能为了保住旧 Usage 在新表中恢复旧业务字段。

当前实际旧表是 task_loadout、task_turn_binding、task_asset_usage。Binding 是含 source_session_id/source_turn_id 的关系表，不能误称已存在独立会话或轮次实体。执行前重核真实结构，但本轮不读写真实库。

删除前必须完成：

1. 新 Capability Scope + 基础 Recall + Read + Used 已在完全不创建旧表的隔离环境成立。
2. 新 Hook/MCP 正式路径完成真实 Desktop 最小验收，停止自动创建旧对象及旧装配注入；已部署的新路径在事实写入正常时拥有闭环操作引用，并验证事实写失败时仍交付且无虚假引用。
3. 服务端启动、维护、REST、Overview 和 Hub 当前使用路径都已取消旧表依赖；需要的新投影先提供，未完成的旧 UI 入口先移除，不留下请求不存在表的客户端。
4. 所有旧 Hook/Server 写进程停止且不会被旧注册重新拉起；运行匹配版本的程序，防止旧构造函数重建已删除表。
5. 新事实表无到旧表的外键、触发器、查询或构造依赖；保留数据边界清楚并通过隔离删除演练。

P4 完成这些条件后才删旧表。P8 是包含 Scenario 和新 Hub 的最终完整验收，不能把删除前必要的基础真实验收推迟到 P8。

### 14.2 保留边界与混表处理

保留正式 Asset 文件、Inbox、Workspace 配置、Catalog/FTS、asset_content_version 的 CURRENT/PREVIOUS 原始字节与 Hash，以及 P1/P2 新产生的 WorkspaceCapability 和操作事实。旧表按依赖顺序删除，不能删除 SQLite 文件或整库初始化。

当前源码显示需保留的知识数据与旧运行表分开；新操作事实从第一天写独立新表，不写入旧表的新增 nullable 字段，不做双写或旧计数转换。因此正常路径无需从旧聚合还原事件。

若实施时发现共享表/触发器中混有必须保留的数据，先按明确字段和主键在**同库事务内**拆入新版专用表，逐项核对行数、主键和原始字节 Hash，修复引用后才删旧结构。没有真实 Query/Hash 的旧 Usage 不属于“必须拆出的新事实”。无法确认保留集时中止删除步骤，不因表复杂恢复整个旧模型，也不增加备份、归档或 Legacy 产品。

删除使用有界、版本化事务；失败回滚本次结构变更，修复失败原因后重试。事务回滚不是备份方案。成功提交后不承诺恢复旧运行数据，程序只能前向修复，保留的知识原件与新操作事实不得被旧程序覆盖。

### 14.3 按当前源码列出的影响面

| 概念/范围 | 现有位置 | 后续实施动作 |
|---|---|---|
| Task 生命周期、绑定与表 | apps/server/src/task/{model,repository,service,errors,index}.ts | 删除业务模型、自动创建/复用/attach、状态管理、两张旧表及相关 Schema |
| 可信路径解析 | apps/server/src/task/workspace-resolver.ts | 迁出并复用解析算法，由 WorkspaceCapability 签发流程调用；不随旧目录误删 |
| Hook 与宿主字段 | apps/server/src/hook/user-prompt-submit.ts | 去掉 Prompt 身份提取、持久绑定和装配读取；只按真实宿主授权信号签发范围能力；宿主 payload 字段只作适配输入，不建历史对象 |
| 装配对象/算法 | apps/server/src/loadout/{service,policy,renderer,projection-repository,errors,index}.ts | 删除实体、JSON、Get/List/Resolve 和持久投影；把必要 Unicode 计数、类型降级、当前资格读取迁入 Recall，采用新两桶配额/5000 字符预算后删除旧模块 |
| MCP | apps/server/src/mcp/tools.ts、mcp/http.ts、mcp/index.ts | 替换依赖装配与输入 Schema；移除 task_loadout_* 工具和旧 taskId 参数；新 Recall/Read/Used；纯搜索退出正常工具目录 |
| Usage | apps/server/src/usage/{model,repository,service,errors,index}.ts | 换成独立事实、可选持久引用和 Used 唯一约束；按 assetId 跨内容累计，Recall/Read 写失败仍交付；删除 task_asset_usage 及旧累计投影 |
| REST/Asset 详情/概览 | apps/server/src/http/{router,service,overview}.ts、http/contracts/index.ts | 移除 /api/task-loadouts、taskId 筛选、recentLoadouts、taskCount/usedTaskCount 等；替换 Recall/Usage 投影 |
| 启停与维护 | apps/server/src/runtime.ts、main.ts、app.ts、maintenance-cli.ts | 移除旧 Repository 构造、服务依赖与 complete/cancel；新 Capability/Recall 装配；维护命令不能重新创建旧表 |
| Schema/确认/索引 | apps/server/src/asset/content-version.ts、catalog.ts、index-manager.ts、确认与重建入口 | 协调数据库版本判断，验证不破坏双版与派生索引；不改知识语义或绕过确认 |
| Hub 导航与详情 | apps/hub/src/App.vue、navigation.ts、views/TaskLoadoutsView.vue、OverviewView.vue、UsageView.vue、AssetsView.vue、api/{types,client}.ts | 删除旧页面/路由/DTO，替换卡片及详情关联，增加工作区、场景和召回投影 |
| 多 Workspace 检索与资格 | apps/server/src/asset/search.ts、scanner.ts 及相关测试 | 将内部单值 AssetSearchContext 演进为授权集合；查询/当前资格对整个集合校验，GLOBAL 去重，显式项目同一优先层；不改 Asset 单项目归属 |
| Asset Kind | apps/server/src/asset/schema.ts、scanner.ts、catalog.ts 及确认/Diff 边界 | 当前没有 appliesToKinds 实现；取消 1.0 的新增计划，不给现有 Asset 增加字段，不做无数据依据的清洗 |
| Session/Turn 管理 | 旧 Binding、Hook 与相关测试；1.0 仅提出的 session_context 等 | 删除真实绑定依赖；不实施旧方案中的新实体、历史页或归属接口 |
| 测试与构建验证 | apps/server/test/{task,loadout,loadout-qualification,hook,hook-resilience,mcp,usage,rest,maintenance,n13-integration,multiprocess-identity}.test.ts；apps/server/test-support/；Hub 相关组件/API 测试 | 行为保障迁入无旧表 fixture，再移除只验证废弃功能的测试；保留资格、并发、预算、Hash 与构建覆盖 |
| ID 与运行文档 | packages/id-generator/src/index.ts、README、工程约定、已安装 Recall/Used Skills 及 Hook/MCP 注册 | 普通知识操作复用 usg，新增随机 capability 能力值 API；退役业务身份调用；Recall Skill 完整行为及结算/知识协议同步是 P3 硬退出条件，获对应阶段授权后更新构建产物，不由本轮文档自动部署 |

表中是影响面，不是本轮改动清单，也不表示每个列出的文件都必须重写。源码证据证明旧依赖位于编排、存储和投影，而非知识访问业务不可替代的必要条件。

## 15. Schema 草案与 P0–P8 实施阶段

### 15.1 最小逻辑持久结构

下表是目标约束，不是可执行 SQL。失败交付不占事实行；无版本 Usage、临时交付凭据、补账或业务身份表。

| 结构 | 最小列及约束 |
|---|---|
| workspace_capability | capability_key_hash 主键、workspace 非空、created_at、trusted_workspace_mapping_hash；单能力单项目，只存摘要，无自动期限或对话归属；明确撤销可移除记录 |
| recall_operation | recall_id 主键、authorized_workspaces_json（去重排序名称数组，允许 []）、query、active_scenarios_json、policy_hash nullable、occurred_at、diagnostics_json、budget_json；只存成功提交事实 |
| recall_item | recall_item_id 主键、recall_id 非空外键、asset_id、content_hash、asset_scope、asset_workspace nullable、selection_reasons_json、bucket、requested_mode nullable、delivered_mode、delivery_reasons_json、ordinal；UNIQUE(recall_id, asset_id)、UNIQUE(recall_id, ordinal) |
| read_operation | read_ref 主键、authorized_workspaces_json、asset_id、content_hash、asset_scope、asset_workspace nullable、recall_item_id nullable 外键、occurred_at；关联条目的 Asset/交付 Hash/来源快照一致，不要求授权数组相同 |
| used_event | used_id 主键、authorized_workspaces_json、recall_item_id 或 direct_read_ref 二选一外键、asset_id、occurred_at；非空来源分别唯一；asset_id 与来源相等，Hash/来源范围从持久来源派生，不设版本计数列 |

recallId、recallItemId、readRef、usedId 复用共享生成器的 usg 身份，按所在字段/表区分；跨进程唯一性沿用并核对。capabilityId 用独立密码学随机 API。usageRecorded 和 null 引用是响应状态，不为失败交付新增占位事实表。

事件不外键到旧表、能力表或可重建 Catalog；能力撤销、索引重建、Asset 缺失不级联删除事实。条目→操作、Read→条目、Used→来源保持必要外键和非丢失约束。Used 唯一性由 SQLite 原子约束保证，不只靠先查后写。

来源范围约束为 GLOBAL→asset_workspace IS NULL、WORKSPACE→非空项目；authorized_workspaces_json 不含 GLOBAL/null。应用服务在写事务中核对来源一致性与范围；Read 必须验证引用 Hash，Used 的历史 Hash 只从来源事实取得，不要求当前文件 Hash 相等。

`totalUsedCount` 通过按 asset_id 聚合 used_event 派生，不按 content_hash 分组，不新增累计权威或版本 Usage 索引。只有既有 asset_content_version 的 CURRENT/PREVIOUS 管正文治理；正常知识更新不修改 used_event。

物理命名、索引与迁移编号由 P1/P2 落实。必须协调 content-version.ts 当前对 user_version=1 的严格检查；统一迁移入口和所有读取者后再切换，确认/Diff/索引重建不得因新表升级而失效。不替换数据库文件，不重置双版。

### 15.2 阶段、依赖与硬退出条件

```text
P0 新 Workspace 的真实可信签发路线
 -> P1 无旧业务身份的独立核心
 -> P2 事实持久/降级、Asset 使用与引用完整契约
 -> P3 正式 Hook/MCP + Recall/Used/知识协议切换及真实基础验收
 -> P4 取消旧依赖后删除旧子系统/数据
 -> P5 Kind 与策略配置
 -> P6 两桶配额 + Scenario 净收益验收
 -> P7 Hub 只读投影及 Asset 总使用统计
 -> P8 真实完整链路验收
```

| 阶段 | 内容与边界 | 退出门槛 |
|---|---|---|
| P0 | §15.3 三个真实宿主 Case，验证从未授权的新项目如何获得能力 | 信号来源、可信性、范围、签发路线证据明确；无信号时记录条件性后续授权设计，不能用模型参数补齐 |
| P1 | 持续 Capability、显式 0–N 选择、基础 Recall/Read/Used 独立核心，最小新表原型 | 从未创建旧表也能闭环；[]/B/A+C、全部能力校验、范围覆盖、持续授权成立；不转接旧 Usage |
| P2 | 固化操作事实与可选稳定引用、Asset 总使用、旧引用 Used、当前 Read Hash、事实失败降级和完整预算 | 旧内容演进可幂等 Used；不读取旧正文；Recall/Read 写失败有知识但无本次稳定引用；Used 写失败明确失败；无版本计数 |
| P3 | 正式 Hook/MCP 及 §11.2–§11.4 的 Recall Skill、结算/知识协议同步，停止旧对象创建及装配注入 | 真实非空 Recall/Read/Used、B/A+C/[] 选择、提炼 Query、多能力复用；核对实际 Skill 生效及失败处理；只改后端不放行 |
| P4 | 先换启动/REST/详情/Overview 依赖，移除旧 Hub 入口；停旧写进程，再删旧模块/表/数据 | §14 硬门槛全部成立；知识原件、双版、新事实保留，基础链/现存只读页正常，旧程序不重建表 |
| P5 | Kind/策略配置 Schema、快照、关系校验、候选列表及缺失/损坏回退 | 0/1/N Kind、[] Scope、坏外部引用可解释；不影响权限、不改 Asset Schema；待评估真实场景 enabled=false |
| P6 | 场景候选、去重后两桶、4/4 缺额回流、模式/预算；逐场景固定样本对照 | 所有配额用例通过；每个进入真实配置的启用场景均有明确净收益、关键遗漏与误选损失边界；无收益不启用、明显变差不得进入默认策略 |
| P7 | 工作区/场景/召回详情及真实聚合，Asset totalUsedCount 跨内容累加 | 无版本统计，已记录事实与实际交付的缺口说明准确；组件/DTO/浏览器一致，不依赖旧表 |
| P8 | 真实宿主、多项目/并行窗口、无/多场景、直接读取、旧引用 Used、重启和配置授权变化 | 完整证据覆盖、长期能力持续有效、Skill 正常选择范围、失效拒绝、5000 全量预算及统计；未验证项不借用旧 GO |

P1 原型演进为同一组正式表，不建兼容或双写桥；P2 固化完整契约。P3 前旧程序暂运行是实施时序，不是新版兼容功能。P4 必须先取消必要 Hub/REST 依赖，不能等 P7 再修已经删表的调用。

P0–P8 均未实施。本轮文档修订不授权阶段执行、配置切换或真实数据删除；后续只执行明确授权阶段。旧运行数据删除的无备份目标沿用既有决定，不扩大本轮写入范围。

### 15.3 P0 唯一核心问题

**从未授权的新 Workspace，如何由可信宿主签发新的 WorkspaceCapability？** 已授权能力的持续使用不依赖时间，不再把 TTL、长轮次续期或到期恢复列为 P0 目标。

| Case | 观察与证据要求 |
|---|---|
| 1：同一 Conversation 先 A 后 B | 观察两次真实 Hook/宿主信号是否分别可靠覆盖 A/B；Prompt 写 B 不等于真实 cwd 变化 |
| 2：同一轮比较 A/B，中途进入 B | 观察是否出现新的可信 cwd、working directory、tool-level workspace 或 Hook event；模型自己填写的路径参数不是授权 |
| 3：真实 MCP Tool Call | 验证是否有绕开模型输入 Schema 的宿主执行目录信息，记录来源、可信依据、范围、生命周期；静态 roots 不能冒称逐调用动态授权 |

三项目前全部 **未执行 / UNKNOWN**。记录必要的宿主/集成版本、事件时点、去敏字段、反例和信号向能力接收方传递的证据。P0 可证明签发前提，不能将没有实现的正式能力标成已通过。

| 事实结果 | 下一步边界 |
|---|---|
| 有充分可信信号 | 固定签发与传递路线后进入获授权 P1；跨轮成功不能替代同轮证据 |
| 仅部分情况下有信号 | 已持能力仍可自由选择组合；没有 B 授权时不得从起始 cwd 推导 B；明确缺口对应后续可信授权机制 |
| 存在可信 MCP 隐式授权信息 | 评估适配层传递能力的具体路线，保留授权与本次选择分离，不恢复隐式唯一当前项目 |
| 没有足够信号或证据矛盾 | 记录新项目签发路线受阻，后续单独设计可信授权动作，不让模型自填 Workspace，不开始依赖该路线的正式实现 |

只有 P0 证实缺口时，才产生需要后续设计/冻结的额外授权机制；当前不预建 workspace_request/workspace_switch、绑定实体或模型授权器。真实 Hook 现有路径会写运行记录，本轮不执行探针、修改配置或触发真实新运行。

## 16. 异常与降级矩阵

| 情况 | 新版行为 | 事实/权限边界 |
|---|---|---|
| 显式 capabilityIds=[]，配置有效 | GLOBAL-only；只提供通用 Scenario | 不需要 null 能力，不扩张到已持有的项目 |
| 能力字段缺失、结构错误或超限 | INPUT_INVALID | 不猜最近范围 |
| 任一能力未知、撤销或授权映射失效 | CAPABILITY_INVALID，整次拒绝 | 不忽略无效项、不退为 []，不写成功 Usage |
| 能力重排、重复或同项目多能力 | 去重后稳定处理 | 不改变范围、桶名额、排序、预算和统计 |
| 时间流逝、长轮次、重启、切换到别的项目 | 原授权仍成立则继续有效 | 无时间过期错误或续期要求 |
| 可信配置不可读、损坏或歧义 | WORKSPACE_CONFIG_UNAVAILABLE | 不签发、不伪装 GLOBAL，不以 Usage 降级返回知识 |
| 配置格式变化/别的项目变化不影响本授权 | 本能力保持可用，配置仍须整体合法 | 不以整份原始字节 Hash 变化统一撤销 |
| Kind=[]、Scenario=[] | 基础 Query 正常，全部名额可用 Query 桶 | 无增强不影响知识权限 |
| 未知/禁用/Kind 不适用 Scenario | 跳过无效项，保留有效场景与 Query | 有界诊断，不自动分类或继承 |
| 误选但合法 Scenario | DIRECT 入其桶；ON_DEMAND 须 Query 命中 | 受 50/50/预算限制，仍记录净收益评估中的退化 |
| 策略缺失/损坏/未知 Workspace 绑定 | 按 §12 隔离增强错误 | 不沿用旧策略、不改变可信权限 |
| Query 非法/超限 | INPUT_INVALID | 不替换成完整 Prompt 或自行规划查询 |
| 合法 Query 无命中且无可交付 DIRECT | 空 RecallResult，尝试记录空操作 | 写成功 true+recallId，写失败 false+null |
| 某 Asset 缺失、跨范围、当前资格失效 | Recall 淘汰该条，Read/Used 拒绝 | 不输出不可访问元数据，既有事实不删 |
| 整体索引/当前资格不可确认 | 正式召回不可用 | 不以策略 ID 绕过、不冒称只是计数失败 |
| 多来源同一 Asset | 合并原因；有 DIRECT 就只归 DIRECT 桶 | 一条 RecallItem、一个桶名额 |
| 某桶合格/可容纳候选不足 | 先查同桶后续候选，再回流空额 | 总数≤8，完整响应≤5000 |
| 摘要超预算或类型限制 | 降为引用；引用仍不适配则省略 | 不改变来源桶，输出真实桶数/内容/元数据字符数 |
| Recall/Read 内容合格而事实写失败 | 仍交付，usageRecorded=false，USAGE_WRITE_FAILED | 无本次稳定 recallItemId/readRef，无补账 |
| Used 写失败 | 明确失败，可按持久引用重试 | 不宣称使用已记录 |
| 当前内容合法演进，旧引用 Read | CONTENT_CHANGED | 不返回旧正文或冒充新版 |
| 当前内容合法演进，旧引用 Used | 其余权限/身份/资格通过则成功 | 累计到同一 assetId；不读 PREVIOUS、不拆版本用量 |
| 重复 Used，内容已演进但其余校验通过 | 相同 usedId、created=false | Hash 变化不破坏来源幂等 |
| 无记录交付试图 Used 空引用 | 拒绝无效输入/不存在引用 | 不能自填 assetId+Hash 补账 |
| 原选择 A+B 的 A 条目，后来只选 A | 可按 Read/Used 各自契约处理；只选 B 拒绝 | 只需目标来源与当前范围覆盖，不恢复无关 B |
| GLOBAL 条目与 [] 选择 | 可 Read/Used | 不泄露父操作其他项目、Query 或条目 |
| 事实提交后断连 | 接收状态未知 | 不宣称模型理解/使用，不提供网络 exactly-once |
| Hook 依赖故障 | 不签发新能力，普通工作可继续 | 不伪造范围、不自动撤销其他仍有效能力 |

错误优先级为：输入结构检查 → 可信配置可用性 → 全部能力有效性 → 目标权限/资格/Read Hash/大小 → 事实写入。有效输入重排不得改变错误类别；所有错误/诊断有界，不回显能力原值、内部堆栈或未授权路径。

## 17. 最小测试、消融与真实验收

### 17.1 必需行为矩阵（目标，尚未实施）

| 编号 | 用例 | 断言 |
|---|---|---|
| A01 | 隔离库从未创建旧表，无 Kind/Scenario | 非空 Recall→Read→Used 及直接 Read→Used 成功 |
| A02 | 已持 A/B/C，仅选 B，再选 A+C，再选 [] | 仅 GLOBAL+B、GLOBAL+A+C、GLOBAL；未选项目不出现 |
| A03 | 缺失/超限/未知/撤销能力、显式 [] | 输入错误与能力错误区分；[] 合法；拒绝 workspace/cwd 参数 |
| A04 | 0/1/N Kind，固定 Query、scenarios=[] | Asset 候选、顺序/交付一致，只改变 Scenario 候选 |
| A05 | []、多场景、重复、未知、禁用、不适用 | 显式生效集合确定，无自动继承，输入顺序不影响结果 |
| A06 | 适用但误选 Scenario | DIRECT 可进入其桶，ON_DEMAND 无 Query 命中不进入 |
| A07 | DIRECT 无匹配、ON_DEMAND 在基础前 20 条之外 | 关系候选不被提前 limit 丢失 |
| A08 | 同 Asset 三种来源、多个关系模式 | 先资格去重再配额；一条归 DIRECT，完整原因，一次 Recall 计数 |
| A09 | MEMORY/DOCUMENT/SKILL、长摘要与 Unicode | 类型降级不移桶，最小引用预留与完整 5000 字符限制正确 |
| A10 | 正文命中、score 舍入平局、BM25 缺失 | 不按旧 minScore 淘汰，比较器稳定/传递 |
| A11 | 正式操作、扫描、Hook、Hub 浏览 | 仅成功事实计数；失败交付不伪造事实；Used 不自动产生 |
| A12 | 标记条目后标关联 readRef、并发重复 | 一个 canonical source 只有一个 Used，直接 Read 独立闭环 |
| A13 | Recall/Read 旧内容后正常更新，再 oldRef Used | 同 assetId totalUsedCount +1；不读取旧正文、不使用 PREVIOUS；Hash 只作交付证据 |
| A14 | Recall/Read 内容成功而事实写失败 | 仍返回内容，usageRecorded=false；recallId/recallItemId/readRef 按契约为 null；无部分持久条目 |
| A15 | asset_search/Hub Search | 纯检索不计 Usage，不进入正常 Codex MCP 召回目录 |
| A16 | 策略缺失、损坏、未知绑定、项目重命名 | 策略错误按 §12 隔离，权限不扩大 |
| A17 | 时间推进、长轮次、重启、访问另一个项目 | 无自动能力失效，原授权仍成立即可复用，无旧对象创建/装配注入 |
| A18 | 旧表/模块删除后的隔离环境 | 新完整链无旧依赖，知识原件、双版、索引、新事实保留 |
| A19 | 构建、维护、确认、索引重建 | 不重建旧表，Schema 升级后 confirm/Diff 正常 |
| A20 | Hub Asset 内容更新前后 | Used 11→更新仍11→新独立使用12；无版本用量统计/分桶 |
| A21 | 同对话 A→B→A、A+B | 持有多个能力正常，无对话唯一范围或最近单例 |
| A22 | 混入撤销/映射失效能力、重排/重复 | 任一失效整次拒绝，合法集合重复/重排不影响配额/结果 |
| A23 | 选择 A+B，Kind frontend/backend，同分知识 | Kind 并集只选场景；A/B 同级、GLOBAL 去重、预算共享 |
| A24 | 原 A+B 操作的 A/GLOBAL 条目，换能力 Used | A 只需 A，GLOBAL 可 []；保留来源事实，不泄露父操作 |
| A25 | 内容/元数据后续改变 | 操作授权与交付来源快照不重算；合法内容更新的 Used 累计不丢失 |
| A26 | 去重后 D≥4/Q≥4、0/≥8、2/≥6、≥7/1 | 字符足够时分别 4/4、0/8、2/6、7/1 |
| A27 | 桶内失效/重复/超长条目，后面有较小条目 | 先资格/去重；先补同桶再回流，无提前判不足，最终≤8/5000 |
| A28 | 固定知识集，完整 Prompt 对比 Skill 实际提炼 Query | 记录实际表达、命中与必要知识覆盖；复杂问题多次单 Query；无 queries[]/服务端规划器 |
| A29 | 含全部元数据、两桶多场景及 Usage 降级响应 | 总模型可见字符≤5000，知识/元数据分项相加等于总数；另记 summary 字符、覆盖、最终条目数 |
| A30 | 旧内容已 Used 后更新，再重试同引用 | created=false、总数不变，不因 Hash 更新报 CONTENT_CHANGED |
| A31 | oldRef Read 与 oldRef Used 同时面对更新 | Read 拒绝变化；Used 在其他资格通过时可记录；资格/范围越权仍拒绝 |
| A32 | Usage 降级结果尝试 Used，或 Used 自身写失败 | 无引用不得结算，Used 写失败明确失败；重新 Read 只能记录新实际读取，不补历史 |
| A33 | 对应映射改变/删除/明确撤销，配置排版或无关映射变化 | 授权失效拒绝；无关变化保留有效能力；配置损坏不退 GLOBAL |
| A34 | 真实 Skill 已持 A/B/C，只问 B或比较A/C | 实际调用仅选 B/A+C；每次重新选择 Scenario，不默认全库 |
| A35 | P3 Skill/协议切换检查 | Recall、Used、capture/KNOWLEDGE 无旧调用依赖；新客户端实际生效，未部署草案不能标通过 |
| A36 | 场景固定样本对照与误选 | 按 §17.2 净收益门槛判启用/不启用，不以更多命中或可解释代替收益 |

### 17.2 每个 Scenario 的净收益退出门槛

对每个准备启用到真实配置的 Scenario，先冻结同一合格 Asset 集、选择范围、当前 Query、8/5000 预算及人工标注的必要知识/关键知识。对比基础 Recall 与基础+该 Scenario；另测多场景和误选，同样样本下 Kind 单独改变不能改变基础结果。

必须报告：必要知识覆盖、关键知识遗漏、无关条目数、额外 Read 次数/内容成本、总字符及知识/元数据分项、误选退化程度；计数更多不等于更好。

退出判定：

- **有明确净收益**：至少一项目标收益明确改善，预先标为不可遗漏的关键知识不新增遗漏，其他成本/误选损失在该样本评审前约定的可接受范围；可 enabled=true。
- **无明显收益或证据不足**：保持 enabled=false，不为凑完整策略启用。
- **明显变差**：不得进入默认策略；可以保留禁用定义供后续修订，不扩大为自动分类/权重系统。

各样本的人工必要知识、关键知识及成本容忍是 P6 的具体验收数据，不新增通用权重或线上质量打分器。先冻结评价标准再看结果，不允许事后调整标准使场景过关。首次真实配置及关系内容仍需阶段授权，本轮不创建。

### 17.3 真实验收与证据界限

P0 只验证新 Workspace 的可信签发前提，三项全部 UNKNOWN。P3 删除旧数据前必须由真实宿主取得能力，用实际新版 Skill 完成提炼 Query、选择 B/A+C/[]、非空 Recall、按来源 Read/Used，并确认新 Prompt 不创建旧对象；不得手工插能力或模拟 Hook 冒充宿主证据。

P8 覆盖同/不同 Workspace 并行窗口、同对话多项目、无/多场景、直接 Read、历史引用 Used、重复 Used、服务重启及长期能力、合法配置变更/撤销、两桶配额与完整预算。权限/数据库故障先用隔离 fixture；真实环境操作需具体授权。

前轮审查的无 Task 表 Search/Read、旧搜索器 Query 对照与 best-effort 测试，只是旧源码/隔离证据；2.1 的 3000 字符、DIRECT 全局优先模拟不作为 2.2 的配额效果证明。本轮仅检查文档契约与示例，A01–A36、新 Skill 稳定生成、P0–P8 均未标 PASS。

按[验证约定](../../工程约定/验证约定.md)选择相关测试/typecheck/build/smoke，Hub 实际渲染单独验证。源码、隔离端到端、构建、Skill 模型实际选择和真实宿主证据分别报告，不借旧 GO。

## 18. 未冻结实施细节与条件性后续决定

**本次范围内没有必须继续由用户冻结的产品语义。** Asset 总使用与历史引用、持续能力、0–N 选择、Query/Skill 协议、50/50 回流、5000 初始预算和事实失败继续交付均已按本次指令确定。下表为实施参数或真实事实，不把已冻结目标重新打开。

| 待落实事项 | 阶段与判定标准 |
|---|---|
| 从未授权项目的可信宿主信号及签发/传递路线 | P0；真实三 Case 及可信依据，不以模型路径参数补授权 |
| 若 P0 证实无充分信号，可信额外授权动作 | 条件性的 P1 前置设计，届时就具体机制确认；目前不预造接口或当前项目模型 |
| 随机能力长度、单项目映射规范编码、明确撤销的本地维护入口 | P1；不可预测、持续授权、变更/撤销拒绝、无关变化不误伤；无时间清理参数 |
| SQLite 物理命名、索引、迁移号及严格版本读取者升级 | P1/P2；新空库/旧基线升级、失败回滚、confirm/Diff/索引与独立链覆盖 |
| Query、能力/Workspace、Scenario/关系、诊断的硬上限及 Read 大小上限 | P1/P2/P5；两种 Usage 响应均≤5000，能力失败不降级，完整原因有界 |
| 首批真实 Scenario/Asset 关系、评估样本与成本容忍 | P6；预先标注并证明净收益才启用，配置内容未生成 |
| Hub 详情布局、分页 URL、现有诊断展示 | P7；Asset 跨内容累计、事实缺口、授权集合/来源快照准确，只读 |

P0 若现有可信信号足够，就不新增授权产品流程；若不足，后续单独设计授权机制。这个条件性未知不影响当前其它目标收敛，也不能将其写成宿主已经支持。

## 19. 取消项与残留概念审查

旧名只允许出现在当前事实、历史差异、删除清单或否定性验收；不能出现在新版必填输入、权威外键或正常召回依赖。

| 概念 | 最终处置 |
|---|---|
| Task、taskId、Task Binding/Usage/Pins、Focused Task、TaskType | **取消**；旧模型按阶段删除，不保留业务身份或目标管理分支 |
| Session/Turn 实体、绑定、生命周期、会话摘要查询 | **取消**；宿主字段只属于可信适配证据，不成为知识实体 |
| Loadout、持久装配、Resolve/Get/List、loadout_json | **取消**；直接返回 RecallResult，无历史重新装配功能 |
| WorkspaceProfile、Asset Kind、appliesToKinds | **取消**；保留 Workspace 的 0–N Kind 仅用于场景候选 |
| Current/Focused/Primary Workspace、Conversation/Session → Workspace、最近范围单例 | **取消**；多个能力并存，每次显式选择，无项目额外权重 |
| 版本 Usage、versionUsageCount/currentVersionUsedCount/historicalVersionUsedCount、V1/V2/V3 | **取消**；只有 Asset 总使用，CURRENT/PREVIOUS 仍用于正文治理 |
| Capability TTL、expiresAt、访问续期、到期恢复、CONTEXT_EXPIRED/CAPABILITY_EXPIRED | **取消**；持续授权直到映射失效或明确撤销 |
| 整份配置原始字节变化一律使所有能力失效、null capability、非空能力前置 | **取消**；按当前单项目授权成立与否校验，显式 [] 访问 GLOBAL |
| Used 要求当前 Hash 等于交付 Hash | **取消**；历史引用可结算，Read 的当前 Hash 契约继续保留 |
| Usage 写失败即拒绝交付 | **取消**；Recall/Read 返回知识与无记录状态，不伪造稳定引用；Used 写失败仍失败 |
| DIRECT 全局优先占满、3000 字符目标字段 maxInjectedCharacters | **取消**；两桶 50/50 缺额回流，完整 maxModelVisibleCharacters=5000 |
| 完整 Prompt Search、首次 Prompt Search、queries[]、服务端 Query Planner | **取消**；Skill 提炼当前检索表达，必要时多次单 Query Recall |
| asset_search 作为正常模型 Recall、默认全选已有能力 | **取消**；知识工作唯一正式召回入口 knowledge_recall，范围按目的选择 |
| Legacy 浏览、转换、兼容、归档、备份或导出产品 | **取消**；按已确认删除边界执行，不迁移旧聚合为新事实 |

结论：当前目标中，Task、Loadout、Session/Turn、版本 Usage、Capability TTL 和完整 Prompt Search 均不存在业务必要性，明确取消。必要条件是可信已授权能力的本次选择、当前检索表达、合格 Asset、可解释有预算的交付，以及不伪造的显式使用事实。

## 20. 实施记录与本轮交付边界

| 日期 | 事项 | 状态 |
|---|---|---|
| 2026-09-08 | 1.0 目标被 2.0 替代，去掉旧业务模型方向 | 历史设计决策，不是新版已实现 |
| 2026-09-08 | 2.1 多 Workspace Capability 与 P0 前置修订 | 历史范围设计；本次替代其期限、失败交付等冲突约束 |
| 2026-09-08 | 2.1 第一性审查与消融 | 当前 Search/Read 隔离及旧 Usage 故障验证、设计语义模拟；不等于新版验收 |
| 2026-09-08 | 2.2 最终收敛修订 | 仅本文及索引；已检查运行 Recall Skill，完整替换草案在 §11，未安装/部署 |
| — | P0–P8、A01–A36 与真实 Skill/宿主验收 | 全部未开始/未验证，本轮不实施 |

本次修订覆盖冻结决策、对象、持续 Capability/0–N 选择、Query、两桶算法、5000 字符预算、可选持久引用、Asset Usage、Skill 完整行为差异、Hub、Schema、异常/测试矩阵及阶段门槛；旧源码事实、人工知识治理、单条来源范围覆盖和旧子系统删除边界保留。

本轮文档验证包括章节/引用完整性、JSON 示例、配额公式边界、Skill 草案与运行文件差异、旧概念残留、尾随空白和 git diff --check；未跟踪设计文件另做直接检查。这些检查只验证文档自洽，不将其写成新运行功能通过。

本轮知识评估：可用性优先、Asset 跨内容使用与两桶配额是本次已明确的新设计取舍，尚无新版运行证据。用户限定只改设计且禁止真实数据库变更，现行知识搜索/读取会写 Usage，因此本轮不调用这些工具、不生成 Inbox、不修改正式 Asset；缺少本轮正式 Asset 比较，是否新增或扩展知识暂不能判断。本文保留决策原件和验证边界，后续在获授权范围内评估。

设计修订完成后停止；不执行 P0/P1+，不改变真实库、旧数据、配置、运行 Skill、Hook/MCP，不部署、不 commit/push。后续正式切换必须同步 Recall/Used/capture/KNOWLEDGE 与获授权运行协议，不能仅部署后端。

## 21. 2026-09-09 自动项目识别与预授权修订

用户确认：请求“查xm-ai-job企业端充值资金单在哪张表”或“查用工项目企业端充值逻辑”时，模型应自动识别项目并召回知识，不要求固定授权口令。此前真实对话只取得cwd项目能力；工具workdir切换和自然语言提及均未改变现有签发入口。

最小方案保留授权与选择分离：在严格schemaVersion=1的Workspace项增加可选aliases（最多4项，每项40字符）、description（160字符）和knowledgeAccess（HOST_ONLY/PREAUTHORIZED）。默认HOST_ONLY，兼容旧配置；PREAUTHORIZED必须由用户批准，含义是允许可信宿主各任务跨cwd取得该项目知识能力。它不授予源码修改、资产确认或其他外部写入权限。

Hook读取同一份有效配置快照，合并真实cwd解析项目与明确预授权项目，按规范名称去重排序，在一笔事务中签发并交付能力和识别元数据。并集最多8个项目；超限整批报WORKSPACE_CAPABILITY_LIMIT、不截断、不留下部分能力。Hook不读取Prompt，不调用额外模型，不因工具workdir或别名匹配扩大授权；配置示例additionalContextLimit=8000，仅约束Hook目录，Recall仍为8项/完整5000字符。

cwd来源保持原有授权映射Hash，兼容已持能力；额外项目来源将PREAUTHORIZED纳入同一列的授权指纹，关闭预授权后拒绝这些能力，不误伤独立cwd来源。别名/说明不参与授权Hash。相同授权恢复可能使未撤销能力重新有效；永久撤销继续使用指定摘要删除。不增加表、迁移、会话绑定或模型签发接口。

Recall Skill按当前请求的项目名、别名和业务语义选择已有能力：问B只选B，比较A/B选两者，GLOBAL用[]；不默认全选，不受会话cwd限制，范围歧义才询问。项目业务实现、表/接口、故障、历史判断与重要工程选择自动触发；正常冻结实施不机械召回。先Recall、按需Read，再核对当前源码与事实，已有知识不是当前实现证明。

消融判断：去掉识别元数据，“用工项目”等业务别名缺少明确映射；去掉预授权能力交付，即使模型识别B也无法访问；去掉服务端预授权状态校验，关闭授权仍能用旧能力。固定口令不满足自动触发；自然语言正则授权、模型自助签发、额外模型、会话授权账本均无必要，不引入。

初次实施阶段只修改源码、仓库协议与配置候选，完成静态检查；当时未安装、未重启、未执行真实宿主验收。后续经用户授权已完成安装与真实对话验收，2026-09-09用户确认本轮验收成功、无阻碍。授权关闭后由新业务请求重新触发签发的讨论未纳入本轮实现，不改变上述配置驱动语义，也不作为待办或验收阻碍。具体证据见[实施记录](../验证记录/04-设计2.2实现与人工切换.md#2026-09-09-人工验收与用户确认)。

## 22. 2026-09-09 多表达召回修订（2.3）

用户已确认后端必须支持一次提交多个表达，并授权实施。此节覆盖2.2正文中单query、禁止queries[]的约束、RecallOperation/RecallResult结构、MCP与Skill草案；旧验收表与历史审查记录不因此改写为通过。运行环境切换另行执行，见[README升级步骤](../../README.md#多表达召回升级23)。

表达生成由当前Codex模型承担。官方CLI `rust-v0.153.2` 的[原生搜索工具](https://github.com/openai/codex/blob/657a993cbee87acf52d14b758ce49dbd46d1b8eb/codex-rs/ext/memories/src/tools/search.rs)接收queries数组，[本地匹配器](https://github.com/openai/codex/blob/657a993cbee87acf52d14b758ce49dbd46d1b8eb/codex-rs/ext/memories/src/local/search.rs)做字面匹配，[读取提示](https://github.com/openai/codex/blob/657a993cbee87acf52d14b758ce49dbd46d1b8eb/codex-rs/ext/memories/templates/memories/read_path.md)让模型提炼相关关键词。源码未提供可单独调用的同义词生成器；用户观察到的rg多个OR词同样由模型提交。不能把CLI可选专用工具当作当前Desktop已启用的证据。

现行输入为`knowledge_recall({capabilityIds, queries, scenarios?})`。queries必填1–8项，每项1–256字符，去首尾空白且不含控制字符。复用搜索器的大小写、空格规范化规则，去重保留首次拼写。一个表达内继续空格分词AND，多个表达之间OR；每项调用现有FTS/LITERAL/HYBRID检索，Asset取最佳现有排序值，不按同义命中次数累加。旧query字段严格拒绝，不把正则`a|b`当作数组或OR运算。Hub人工搜索的单query协议不受影响。

同一调用共用能力/配置/策略快照。先合并所有表达的候选与场景原因，再复核当前资格和Hash；按Asset去重后继续DIRECT/Query 4/4不足回流。一次最多8项，整个JSON（含queries及元数据）最多5000 Unicode code points，不能每个表达各领预算。查询数组过大占用元数据预算时会减少可交付条目；不静默删掉调用者表达。场景仍由模型显式选择已配置、启用、适用的ID，不自动生成策略；POLICY_MISSING不阻断基础检索。

RecallResult、REST列表/详情与Hub使用queries数组；recall_operation改为queries_json。显式离线迁移将schema-2/3历史query原样包成单元素数组并升级到4，保留原ID、时间、范围、引用、计数、能力、索引与正文双版。迁移同事务、可重试；新服务/Hook只接受4，不在启动时自动升级，也不隐式退役旧表或降回3。人工恢复需同批数据库/构建/协议备份。

Recall Skill让模型像搜索原生Memories一样产生核心实体、同义表达和有依据的代码标识符，同目的已有适用表达直接复用。无需先搜索原生Memories、不解析隐藏轨迹、不增加模型API、服务端分词词典或额外规划器；把同义表达放在不同数组项，独立知识目的可分别Recall。仓库待安装协议保留本机已安装版本的触发与治理修订，仅增加多表达契约；实际自动扩词效果仍须重载后真实任务验证。

针对性验证入口为Server的`test/multi-expression-recall.test.ts`和Hub的`src/views/KnowledgeView.test.ts`，覆盖OR/AND、去重/最佳排序、原有匹配策略、权限与资格、两桶/完整预算、失败交付、MCP真实Schema与序列化、迁移保留/回滚/幂等、Hub列表/详情。它们使用隔离fixture，不能代替真实宿主和运行环境验收，也不能表示旧协议测试全套已迁移。
