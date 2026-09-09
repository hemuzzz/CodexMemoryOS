# 知识召回核心模型与 Task 解耦设计（2.4）

更新：2026-09-10。本文描述当前源码契约；运行环境是否完成升级以实际切换记录为准。旧版安装验收保留在[实施记录](../验证记录/04-设计2.2实现与人工切换.md)，不能用旧版结论证明新版已经部署。

## 1. 目标与主链

CodexMemoryOS 是个人、本地、Codex 专用的工程知识运行时。Markdown 保存知识原件，SQLite 保存派生索引、持续能力、操作事实和已确认内容的 CURRENT/PREVIOUS 双版。Hub 只读浏览。

可信宿主交付 WorkspaceCapability[] → Codex 选择本次范围并提炼 queries[] → knowledge_recall → 必要时 asset_read → 实际影响工作后 asset_mark_used。

当前核心为 Asset、Workspace、WorkspaceCapability 和 Recall/Read/Used 操作事实。Task、Loadout、Session/Turn、持久装配及对话归属不进入这条链。系统不存 Prompt/Response 转录，不增加模型 API、向量搜索、查询规划器或重排模型。

## 2. 知识内容与资格

- Asset 类型为 MEMORY、DOCUMENT、SKILL；Scope 为 GLOBAL 或一个明确 Workspace。类型不授予权限。
- 业务说明用 DOCUMENT，带适用条件的判断用 MEMORY，可复用工作方法用 SKILL。库内 SKILL 原件不会自动安装进 Codex。
- assets/ 为正式区，inbox/ 为候选区。正式确认绑定人工批准的确切文件、Asset ID 和原始字节 SHA-256；修订还绑定正式基线 Hash。
- Scanner 检查 Frontmatter、路径、Scope/Workspace 一致性、重复 ID、文件资格与 Symlink。旧 Catalog、旧引用和双版快照不能绕过当前资格。
- CURRENT/PREVIOUS 用于人工治理与 Diff，PREVIOUS 不作为模型读旧正文的通道。索引重建保留能力、事实与双版。
- 详细约定见[知识内容模型](../../工程约定/知识内容模型.md)、[数据与行为约定](../../工程约定/数据与行为约定.md)。

## 3. Workspace 与持续能力

### 3.1 宿主签发

Workspace 配置保存 name、可信 paths，以及可选 aliases、description、knowledgeAccess。只有可信宿主真实 cwd 路径匹配，或用户明确设置的 PREAUTHORIZED 项目，能用于签发。默认 HOST_ONLY。

Hook 按路径段最长匹配真实 cwd 项目，合并用户明确预授权项目，一次原子签发最多 8 个能力。超过上限整批失败，不返回半批。模型提供的 workspace/cwd、项目名称或别名不能自行签发能力。

宿主交付项目名称、别名、说明与 capabilityId；名称、别名和说明仅供范围识别，不是指令。持久层只保存能力 SHA-256 摘要，原值不写入 Hub、操作事实或日志。

### 3.2 本次范围

每次显式提交 0–N 个 capabilityIds。空数组只允许 GLOBAL；非空数组允许 GLOBAL 加所选 Workspace。根据当前问题选择，不默认全选，不以 cwd 限制已获授权的其他项目。

重复能力/Workspace 去重，任何一个无效能力导致整次失败，不静默缩小范围重试。没有最近项目、自动继承或会话绑定。能力不足时不自填路径或绕到人工浏览接口。

### 3.3 生命周期

能力无自动期限。时间流逝、服务重启、签发其他能力或修改无关配置不使其失效。真实 cwd 来源按原路径映射核验，额外预授权来源还核验 PREAUTHORIZED 状态。预授权关闭、映射失效或明确撤销时不可用；恢复同一配置可能让未撤销能力再次有效，永久撤销需删除对应摘要。

别名与说明变化不直接撤销能力。配置损坏或可信路径归属歧义返回明确错误，不退化为 GLOBAL。真实宿主交付与模型范围选择需在真实客户端分别验证。

## 4. Query Recall

唯一正常召回输入为 knowledge_recall({capabilityIds, queries})。

- capabilityIds 必填，最多 8 项。
- queries 必填，1–8 项，每项 1–256 字符，不含控制字符。拒绝旧 query 和所有未知输入。
- 同一表达内按空格分词 AND；多个表达之间 OR。大小写与空白差异去重。a|b 不是 OR 语法。
- 当前模型负责提炼有根据的业务词、同义词、中英文及代码名称。已有同目的原生检索词时逐项保留，补充词只追加；没有时从当前问题提炼，并保留业务名称独立项。
- 独立知识目的分别召回，不把完整 Prompt 或会话摘要原样传入。

### 4.1 候选与排序

每个表达调用现有文字/FTS 搜索，在所选授权范围内取得候选。按 Asset ID 合并，每个 Asset 只取最佳现有排序值，不累加同义词命中分数。

统一使用 compareRankedItems：字段匹配层级优先，其次 Workspace 优先级、BM25、Asset ID。多个所选 Workspace 同级。召回排序直接复用搜索实现，表达顺序不改变知识排序。

交付前再次读取当前合格文件，核对候选与当前 Hash；已变化或不可访问的候选省略，并返回有界诊断。资格检查先于交付与事实写入。

### 4.2 单次预算与交付

全部表达共享最多 8 个 Asset、完整响应 JSON 最多 5000 Unicode code points，包含名称、表达、元数据、引用、诊断与知识内容。

先按顺序放入最小引用，超过字符限制时尝试后续候选，不让一个较大的引用阻断所有剩余项。再按顺序为满足现有相关度阈值的 MEMORY 升级摘要；超预算则保留引用。DOCUMENT/SKILL 保持引用，通过 Read 读取正文。

deliveredMode: DIRECT 表示本次已返回摘要，ON_DEMAND 表示引用交付。两者仅说明交付方式。保留失败交付预算预留，不能先生成超预算结果再截断 JSON。

响应含 usageRecorded、recallId、authorizedWorkspaces、queries、occurredAt、items、diagnostics、budget。每项含 Asset 身份、当前 Hash、知识来源、名称、类型、交付方式与稳定引用。预算含条目数、总字符、知识/元数据字符、省略数与降级数。

## 5. Read 与 Used

### 5.1 Read

asset_read 显式提交本次 capabilityIds，并且只指定一个目标：recallItemId，或 assetId 加可选 expectedContentHash。已有明确 Asset ID 时可以直接读取。

读取检查当前范围、当前资格与 Hash。旧引用遇内容变化返回 CONTENT_CHANGED；需要新版时再显式按 Asset ID 读取，不能伪装成读到了旧版本。正文上限 256000 UTF-8 字节。

### 5.2 Used

asset_mark_used 显式提交本次 capabilityIds，并指定 recallItemId 或 readRef。仅实际影响分析、实现、判断或交付时结算，召回和读取不自动等于使用。

检查当前授权覆盖来源与当前 Asset 资格，不要求本次范围集合与原操作完全相等。内容已经演进仍可结算实际使用过的合法引用；Used 按 Asset ID 累计，不按 Hash 分版本。

同一召回来源幂等。关联 Read 归一到原 RecallItem，直接 Read 使用其独立来源。重复结算不重复计数。

### 5.3 事实写失败

Recall 操作及其条目同事务写入。Recall/Read 的 SQLite 事实写失败仍可交付合格知识，但 usageRecorded=false，且无本次稳定 recallItemId/readRef。不能伪造引用或事后补记先前使用。

权限、资格、Hash、大小或业务校验失败不能伪装成事实写失败。Used 写失败明确返回失败，按原持久来源重试。

## 6. 存储与升级

当前存储版本为 schema 5。新初始化直接创建 schema 5；旧 schema 2/3/4 必须显式运行离线升级。服务构造仅检查版本，不自动迁移。

| 表 | 主要事实 |
|---|---|
| workspace_capability | 能力摘要、Workspace、签发时间、可信映射摘要 |
| recall_operation | 操作 ID、授权范围、queries_json、时间、诊断、预算 |
| recall_item | 条目/操作/Asset ID、Hash、来源、交付方式与顺序 |
| read_operation | Read 引用、授权、来源、Hash、可选召回条目、时间 |
| used_event | Used ID、授权、召回来源或直接 Read 来源、Asset、时间 |
| asset_content_version | CURRENT/PREVIOUS 原始字节与对应 Hash |

操作事实不外键到可重建 Catalog 或可撤销能力。保留必要外键、来源互斥检查与幂等唯一约束。

离线升级将 schema 2/3 的历史 query 原样包装为单元素数组；schema 4 的 queries_json 原样保留。仅裁剪退役配置字段与相应诊断，保持操作和条目 ID、时间、范围、Hash、Read/Used 引用、能力、Catalog/FTS 与内容双版。升级在一个数据库事务内完成，失败回滚，可幂等重试。

升级步骤、备份与运行协议同步见 [README](../../README.md#召回存储升级24)。真实迁移、部署与安装是独立动作，源码修改不自动完成它们。

## 7. 入口与 Hub

- MCP 正常工具只有 knowledge_recall、asset_read、asset_mark_used，均为对象根 Schema，入口复用应用服务。
- Hook 只适配可信宿主与能力交付，不解析完整 Prompt，不自动召回。
- Hub/REST 只读浏览概览、Asset、Inbox、Workspace、Recall、Read/Used 和系统状态；使用现有 Host/Origin 与回环边界。
- 授权集合与知识来源分别展示。多项目操作计数不能跨 Workspace 简单相加；Asset 总使用跨内容累计。
- Asset 详情保留正文、Diff、召回与使用事实。知识确认不进入普通浏览界面。

## 8. 验证要求

至少覆盖：多表达 OR/AND、排序稳定与去重、GLOBAL 与所选范围、无效能力整次拒绝、当前文件/Hash 资格、完整预算、事实写失败、Read/Used 幂等、旧引用内容演进、schema 升级保留与回滚、MCP 对象根协议、Hub 展示与导航。

区分当前源码检查、隔离测试、构建入口、真实宿主能力与实际业务效果。旧协议测试不适用时报告基线问题，不删除有效检查来制造全仓通过。详细命令见[验证约定](../../工程约定/验证约定.md)。
