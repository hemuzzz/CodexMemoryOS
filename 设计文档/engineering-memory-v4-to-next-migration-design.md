# Engineering Memory V4 → EM Next 数据迁移设计

> 文档状态：迁移设计基线 v1.0  
> 源系统：现有 Engineering Memory V4 及其关联知识目录  
> 目标系统：Engineering Memory Next  
> 迁移原则：只读导出、可重复执行、逐项对账、可回滚、绝不静默丢数据

---

## 0. 文档使用规则

本迁移工程按独立任务推进。每个编号任务必须使用一个新的 Codex 对话完成。

### 0.1 固定执行方式

1. 当前迁移任务开始前必须读取：
   - EM Next 新项目设计文档；
   - 本迁移文档；
   - 上一个迁移任务的完成记录；
   - 当前源系统和目标系统的实际 Schema、数据和测试。
2. 每次只完成一个迁移任务，不同时修改多个数据类别。
3. 所有迁移工具默认 `dry-run`，显式指定后才能写目标数据。
4. 每个源记录必须得到一个迁移结果：
   - `MIGRATED`；
   - `SKIPPED`；
   - `QUARANTINED`；
   - `DEFERRED`。
5. 禁止静默丢弃、覆盖或自动修正不确定数据。
6. 任务结束时必须更新任务状态、Commit、对账数字和简短总结。
7. 正式切换前，旧系统保持可运行或至少保持完整只读副本。

### 0.2 迁移状态定义

| 状态 | 含义 |
|---|---|
| 未开始 | 未执行 |
| 进行中 | 当前唯一允许执行的迁移任务 |
| 已完成 | 工具、测试、Dry Run 和对账均通过 |
| 阻塞 | 源数据或新系统能力不满足，已记录原因 |
| 延后 | 明确不阻塞切换，后续单独处理 |

---

## 1. 迁移目标

迁移不是把旧数据库原样搬进新数据库，而是：

> 保留旧系统已经验证有效的知识、来源、使用证据和可信机制，把它们映射到以 Asset 为中心的新模型，同时把无法可靠映射的内容完整留在 Legacy Archive。

迁移完成后应达到：

- 旧正式 Memory 成为 `MEMORY Asset`；
- 旧 Skill 成为 `SKILL Asset`；
- 经筛选的原 Obsidian / Markdown 文档成为 `DOCUMENT Asset`；
- Recall / Read / Used 与新 Asset ID、Hash 建立映射；
- Proposal、Human Confirmed、Promotion、Digest、Receipt 保留审计证据；
- CodeGraph 不迁移数据，只保留必要的项目配置说明；
- ConversationHistory 不阻塞主迁移，先保存来源和可恢复性；
- 全过程可重复、可对账、可回滚。

---

## 2. 非目标

本迁移不负责：

- 重新提炼全部历史 Codex 对话；
- 自动把每篇旧文档拆成 Memory 或 Skill；
- 把所有旧草稿都变成 Active Asset；
- 为旧数据补造不存在的来源证据；
- 迁移完整 CodeGraph 图数据；
- 把旧 SQLite 表结构直接作为新系统长期结构；
- 在迁移过程中删除旧仓库或旧数据库；
- 为追求 100% 映射而猜测不确定含义。

---

## 3. 迁移总原则

### 3.1 源系统只读

- 迁移工具不得修改 V4 数据库、Memory 文件、Skill 或旧文档；
- 导出前生成完整快照和 Hash 清单；
- 旧系统写入应在最终切换窗口冻结，正式冻结前允许多次增量导出。

### 3.2 先导出中间包，再导入新系统

不让 Node 新项目直接耦合旧 Python 内部实现。

```text
V4 源系统
    ↓ 旧系统语义导出器
不可变 Migration Package
    ↓ EM Next Node Importer
Asset Repository + SQLite
```

原因：

- 旧项目最了解自己的状态语义；
- 目标项目只需要理解稳定的迁移契约；
- 旧 Schema 变化不会污染新系统；
- 导出包可重复测试和长期归档。

### 3.3 所有写入必须幂等

每条导入记录使用：

```text
migration_run_id
source_system
source_entity_type
source_entity_id
source_version 或 source_digest
```

构成幂等键。重复导入不得创建重复 Asset 或 Usage。

### 3.4 不确定数据进入隔离区

不能可靠判断是否有效、是否重复、是否已经 Promotion 的数据进入 `quarantine`，不进入普通 Context。

### 3.5 Git 与 SQLite 同时对账

- Asset 正文对账：文件数、Asset ID、内容 Hash、Git Commit；
- 运行数据对账：Task、Usage、Proposal、Receipt 行数与映射结果；
- 两类对账必须都通过。

---

## 4. 已知源数据范围

根据现有 V4 设计和使用情况，迁移盘点至少覆盖以下内容。实际字段和文件位置必须在 M00 阶段从源码与数据库确认，本文不假定未知字段一定存在。

### 4.1 正式 Memory

- 已 Promotion 的有效 Memory；
- Human Confirmed 状态；
- Memory 内容、摘要、Scope、项目信息；
- 当前有效版本和历史版本；
- Catalog 条目；
- 来源引用。

### 4.2 Proposal 与审核记录

- Pending / Confirmed / Rejected / Legacy 等状态；
- Proposal 正文和建议类型；
- Review 证据；
- Promotion 记录；
- 旧 Review 中无法绑定新来源的 `LEGACY_UNBOUND` 等状态。

### 4.3 可信证据

- Semantic Digest；
- HMAC Receipt；
- Source / Evidence；
- 事务和回滚相关记录；
- Catalog freshness 或版本证明。

### 4.4 Usage

- Recall；
- Read；
- Used；
- usage_task_id / task correlation；
- Settlement；
- 旧系统中已确认的实际使用关系。

### 4.5 Skill

- 全局 Skill；
- 项目专属 Skill；
- Skill 主文件；
- 资源文件；
- 可能存在的版本或来源信息；
- 当前 Codex 固定目录中的可用 Skill。

### 4.6 旧文档与 Obsidian

- 项目专属设计文档；
- 通用工程文档；
- 技术方案、架构图、复盘；
- 草稿、重复文档、过时文档；
- `.drawio`、图片等附件；
- `.obsidian` 配置和插件数据不迁移。

### 4.7 Task / Session 元数据

- session_id；
- turn_id；
- project；
- usage_task_id；
- 任务时间；
- 与 Memory / Usage 的关联。

### 4.8 ConversationHistory

- 能否从现有 Codex 本地数据或旧系统中获取完整会话；
- 哪些会话已产生 Asset；
- 哪些会话只有引用而无正文。

该部分先盘点，不默认全量迁移。

### 4.9 CodeGraph

- 不迁移图数据；
- 只盘点当前项目级 AGENTS.md 或配置中是否需要保留“存在 CodeGraph 能力”的说明。

---

## 5. 目标数据映射

| V4 数据 | EM Next 目标 | 处理方式 |
|---|---|---|
| 已确认且有效 Memory | MEMORY Asset | 导入 Markdown + asset.yaml，保留 sourceRefs、旧 ID、Digest |
| Memory 历史版本 | Git 历史或 Legacy Version Record | 当前有效版进入工作树，历史版进入迁移归档或按顺序构造 Commit |
| Pending Proposal | Proposal 表 | 保留为 PENDING，不进入 Context |
| Confirmed 未 Promotion | Proposal / Promotion 待处理 | 精确保留状态，不自动 Promotion |
| Rejected Proposal | Legacy Proposal Archive | 保留审计，不进入 Active 数据 |
| LEGACY_UNBOUND | Quarantine / Legacy Archive | 不猜来源，不作为 Active Asset |
| Skill | SKILL Asset | 复制主文件和资源，生成 Manifest，保留旧路径 |
| 正式长文档 | DOCUMENT Asset | 人工/规则筛选后复制，保留原路径和 Hash |
| 草稿、重复、过时文档 | Skip / Quarantine / Task Document | 不默认进入 Workspace Current Context |
| Recall / Read / Used | Usage Event / Legacy Usage | 先映射 Asset ID，再按可信度导入 |
| Task correlation | Task / Legacy Task Link | 尽量保留原 task ID 和时间 |
| Semantic Digest | Promotion / Integrity metadata | 原值保留，不重新计算后冒充旧值 |
| HMAC Receipt | Integrity Receipt | 标记算法和旧系统来源，保留原始字节/文本 |
| Catalog | 不直接迁移 | 从目标 Asset Repository 重建，仅用于对账 |
| CodeGraph | 不迁移 | 通过 AGENTS.md / 项目配置重新声明能力 |
| 原始对话 | ConversationHistory（延后） | 先保留可恢复副本和 sourceRef |

---

## 6. Migration Package 格式

每次导出生成不可变目录：

```text
migration-package-<timestamp>/
├── manifest.json
├── checksums.sha256
├── source-schema/
│   ├── database-schema.sql
│   └── source-version.json
├── data/
│   ├── memories.jsonl
│   ├── memory-versions.jsonl
│   ├── proposals.jsonl
│   ├── promotions.jsonl
│   ├── usage-events.jsonl
│   ├── usage-settlements.jsonl
│   ├── tasks.jsonl
│   ├── receipts.jsonl
│   ├── source-links.jsonl
│   └── documents-inventory.jsonl
├── skills/
├── documents/
├── conversations/             # 若能安全导出，第一版可仅保存原始归档
├── reports/
│   ├── source-counts.json
│   └── export-warnings.jsonl
└── README.md
```

### 6.1 `manifest.json`

至少包含：

```json
{
  "formatVersion": 1,
  "sourceSystem": "engineering-memory-v4",
  "sourceVersion": "...",
  "exportedAt": "...",
  "sourceCommit": "...",
  "databaseHash": "...",
  "recordCounts": {},
  "warnings": [],
  "files": []
}
```

### 6.2 JSONL 规则

- 一行一条记录；
- UTF-8；
- 保留原始 ID；
- 时间统一为 ISO-8601，同时保留无法解析的原始时间字段；
- 二进制附件使用文件保存，JSONL 只存相对路径和 Hash；
- 未知字段可以放到 `legacyMetadata`，不能丢弃。

---

## 7. 迁移工具架构

### 7.1 旧系统 Exporter

建议继续用旧项目现有语言实现，只负责：

- 读取旧数据库和文件；
- 根据旧系统真实语义输出中间包；
- 不转换成新 Asset 目录；
- 生成源端计数和 Hash；
- 不修改源数据。

### 7.2 新系统 Importer

在 EM Next Monorepo 中建立：

```text
apps/migrator/
├── package-reader
├── mapping
├── asset-writer
├── runtime-writer
├── reconciliation
└── cli
```

能力：

```text
inspect
validate
dry-run
import
resume
reconcile
rollback-run
```

### 7.3 Legacy ID Map

目标 SQLite 保存：

```text
source_system
source_type
source_id
source_version
source_digest
target_type
target_id
target_content_hash
migration_run_id
result
reason
```

这是 Usage、Proposal、Receipt 重新关联 Asset 的基础。

---

## 8. 各类数据详细迁移规则

### 8.1 正式 Memory

#### 进入 Active Asset 的条件

必须同时满足：

1. 旧系统状态明确有效；
2. 内容非空；
3. 能确定当前有效版本；
4. 没有被更新版本明确替代；
5. Scope 至少能够映射到 GLOBAL 或已知 Workspace；
6. 内容 Hash 可稳定计算。

#### 目标目录

```text
workspaces/<workspace>/assets/memory/<asset-id>/
  asset.yaml
  content.md
```

或：

```text
global/<domain>/memory/<asset-id>/
```

#### ID 策略

- 不直接把数据库自增 ID 当公开 Asset ID；
- 使用稳定新 ID；
- 旧 ID 保存在 `sourceRefs` 和 `legacy_id_map`；
- 重跑同一源版本必须得到同一目标 ID。

#### 重复处理

按以下顺序判断：

1. 旧系统明确版本关系；
2. Semantic Digest；
3. 规范化内容 Hash；
4. 标题/Scope/正文近似；
5. 无法确认时进入 Quarantine，不自动合并。

### 8.2 Memory 历史版本

MVP 不强制把每一个旧版本伪造成新的 Git Commit。可采用两阶段策略：

- 当前有效版本写入 Asset 工作树；
- 历史版本原样保存在 `legacy-archive/memory-versions/`，并在 Asset sourceRefs 中关联；
- 后续确有需要再构造版本 Git 历史。

这样避免迁移为了“漂亮 Git 历史”篡改真实时间和作者信息。

### 8.3 Proposal / Review / Promotion

- Pending 保留为 Pending；
- Confirmed 但未 Promotion 不自动升级；
- Rejected 只保留审计；
- 已 Promotion 且对应 Active Memory 时建立关联；
- `LEGACY_UNBOUND` 等无来源状态进入 Quarantine；
- 审核人、审核时间、证据和原状态都保留在 `legacyMetadata` 或专用字段。

### 8.4 Semantic Digest 与 Receipt

- 原始 Digest 和 Receipt 不重新计算后覆盖；
- 保存旧算法名称、版本、原始值和验证结果；
- 如果新系统能够验证，记录 `VERIFIED`；
- 无法验证时记录 `PRESERVED_UNVERIFIED`，不能写成验证通过；
- 新系统对迁移后的 Asset 另行生成新的 contentHash 和 Receipt。

### 8.5 Skill

Skill 迁移前先判断：

1. 是否用于一类可重复任务；
2. 是否包含步骤或判断规则；
3. 是否有输入、输出或验收方式；
4. 是否只是一次性任务文档。

处理结果：

- 满足条件：迁移为 SKILL Asset；
- 只是说明或背景：迁移为 DOCUMENT；
- 只服务单次任务：迁移为 TASK Scope DOCUMENT；
- 内容重复或废弃：Skip / Quarantine。

Skill 文件形式保持原样，Importer 只增加 `asset.yaml` 和稳定入口，不要求压缩。

### 8.6 Obsidian / Markdown 文档

Obsidian 完全退出系统，但不能直接全量导入 Vault。

#### 排除

```text
.obsidian/
.trash/
插件缓存
布局文件
临时导出
无正文附件
```

#### 分类结果

| 分类 | 目标 |
|---|---|
| 项目正式设计/说明 | WORKSPACE DOCUMENT Asset |
| 跨项目工程文档 | GLOBAL + engineering DOCUMENT Asset |
| 可重复工作方法 | SKILL Candidate |
| 短小明确规则 | MEMORY Candidate |
| 单次任务过程文档 | TASK DOCUMENT Asset 或 Legacy Archive |
| 过时/重复/无价值 | SKIPPED |
| 无法判断 | QUARANTINED |

#### 正式副本原则

迁移后正式文档只存在于 Asset Repository。旧 Obsidian 仓库保留只读备份，不再双向同步。

#### 附件

- `.drawio`、图片等复制到 Asset `resources/`；
- Markdown 内相对链接在迁移时重写；
- 每个附件保存 Hash；
- 丢失附件必须进入报告。

### 8.7 Usage

#### 映射顺序

```text
旧 Usage 记录
→ 找到旧 Memory/Skill/Document 标识
→ legacy_id_map
→ target asset_id + content_hash
→ 新 Usage Event 或 Legacy Usage 汇总
```

#### 可信度处理

- 有明确 task、asset/version、事件类型：导入为正式历史 Usage Event；
- 只有累计次数：导入为 `legacy_usage_summary`，不伪造成逐次事件；
- 无法确定 Asset 版本：关联 Asset ID，但 `content_hash = unknown` 并标记低可信；
- 只有 Recall、没有 Read/Used：保持原样，不补造 Used；
- 旧 Settlement 结果原样保存，并与新规则区分 `source_system`。

### 8.8 Task / Session

- 保留旧 task correlation 和时间；
- 无法还原原始任务文本时不得生成假的 `originalPrompt`；
- 可以建立 `LEGACY_COMPLETED` 任务类型或 legacy 标志；
- 旧任务不要求拥有 codeSnapshot / assetSnapshot；
- 能获取旧代码 Commit 时才填写。

### 8.9 Catalog

旧 Catalog 不作为目标真相来源：

- 用于核对哪些 Memory 当时可见；
- 新 Catalog 从迁移后的 Asset Repository 重建；
- 新旧 Catalog 数量不要求机械相等，必须有逐条结果报告。

### 8.10 CodeGraph

- 不复制节点、边和索引；
- 迁移报告记录哪些 Workspace 曾使用 CodeGraph；
- 在目标项目 AGENTS.md 或 Workspace 说明中重新配置；
- 旧 CodeGraph 数据保留在旧项目备份中。

### 8.11 ConversationHistory

主迁移只做三件事：

1. 盘点会话来源和可访问性；
2. 保存不会丢失的原始归档或路径引用；
3. 统计哪些会话已经关联正式 Memory/Skill/Document。

不在主迁移中全量重新提炼。

后续独立模块采用“缺口检查”：

- 有重要代码变更但没有任何 Asset；
- 用户多次纠正 Codex 但没有沉淀；
- 产出完整方案却没有 Document；
- 形成可重复流程却没有 Skill；
- 当前知识明显缺失，需要回溯。

只有这些会话进入选择性提炼。

---

## 9. Obsidian 退役方案

### 9.1 退役前

- 对旧 Vault 建立完整 Git Tag 或压缩快照；
- 生成文件清单和 SHA-256；
- 统计 Markdown、Drawio、图片和未知附件；
- 保存 `.obsidian` 仅作为历史备份，不导入目标。

### 9.2 迁移中

- 文档逐项分类；
- 正式内容复制到 Asset Repository；
- 保留 `sourceRefs: file://...` 和原 Hash；
- 处理内部相对链接；
- 生成迁移报告。

### 9.3 切换后

- Obsidian Vault 改为只读归档；
- 不再允许新正式知识写入旧 Vault；
- 不做双向同步；
- 经过一个稳定观察周期后，可从日常工作目录移走，但不立即删除备份。

---

## 10. 冲突、重复和隔离

### 10.1 冲突类型

- 同一 Scope 下内容相反；
- 旧版本比新版本更完整但状态不明；
- Skill 和 Document 语义重复；
- Obsidian 文档与正式 Memory 不一致；
- Usage 指向不存在的 Memory；
- Receipt 无法验证；
- sourceRef 指向丢失会话。

### 10.2 处理原则

- 不自动选择“看起来更合理”的一条；
- 优先使用旧系统明确的有效状态和版本关系；
- 无法判定时隔离；
- 冲突双方都保留 Hash 和来源；
- Quarantine 不参与普通 Search/Context；
- Hub 后续可以提供人工处理，但不阻塞不相关数据迁移。

### 10.3 迁移结果记录

每条源记录必须有：

```text
source identity
target identity（若有）
result
reason
warnings
source hash
target hash
migration run
```

---

## 11. 幂等、断点续传与回滚

### 11.1 幂等

- 导入前查询 `legacy_id_map`；
- 源 Digest 未变化时跳过重复写入；
- 源记录变化时生成新的迁移版本或冲突，不覆盖已确认目标；
- 每批次使用事务；
- 文件写入使用临时目录和原子移动。

### 11.2 断点续传

Migration Run 保存：

```text
run_id
package_hash
stage
last_successful_item
counts
started_at
updated_at
status
```

失败后从已提交批次继续，不重新创建已迁移 Asset。

### 11.3 回滚

- 每个正式 Import Run 前备份 SQLite；
- Asset Repository 创建专用迁移分支或 Tag；
- 所有写入使用一个可定位的 Migration Commit 范围；
- `rollback-run` 删除该 Run 新增的运行数据，并把 Asset Repository 回退到迁移前 Tag；
- 回滚不修改源系统。

---

## 12. 对账与验收

### 12.1 数量对账

对每种源实体统计：

```text
SOURCE_TOTAL
= MIGRATED
+ SKIPPED
+ QUARANTINED
+ DEFERRED
```

任何差值均视为失败。

### 12.2 内容对账

- 每个迁移 Asset 有 source Hash、target Hash 和转换说明；
- 未改变正文语义时，应能验证规范化内容一致；
- 发生格式转换时保留原始文件副本或 Diff；
- 附件数量和 Hash 对账。

### 12.3 关联对账

- Active Memory 与 Promotion 关系；
- Usage 与 Asset；
- Proposal 与源证据；
- Receipt 与 Digest；
- Workspace 与项目；
- Task 与 usage_task_id。

### 12.4 搜索验收

使用固定查询集比较旧系统和新系统：

- 项目规则；
- 资金结算；
- 充值回调；
- Dubbo Provider；
- Jackson 未知字段；
- Java 代码审查。

不要求 Top-K 顺序完全相同，但关键有效内容必须可找到，错误项目内容不得越 Scope 出现。

### 12.5 使用记录验收

至少验证：

- Recall 总数；
- Read 总数；
- Used 总数；
- 非空 Settlement 数；
- 成功映射到 Asset ID 的比例；
- 版本不可确定记录的数量。

所有无法映射的数据必须在报告中可见。

---

## 13. Shadow、切换与回滚窗口

### 13.1 Shadow 阶段

旧系统继续正式工作，新系统只读接收同一批查询或离线回放：

```text
同一任务
├── 旧 Recall 结果
└── 新 Asset/Search/Loadout 结果
```

比较：

- 关键规则遗漏；
- 无关结果；
- Scope 串扰；
- 注入长度；
- Read / Used；
- 任务最终效果。

### 13.2 最终冻结

正式切换前：

1. 暂停旧系统新 Promotion 和 Usage 写入；
2. 生成最后一次增量 Migration Package；
3. 导入并对账；
4. Tag 旧系统和旧数据；
5. 验证新 MCP；
6. 切换 Codex 配置。

### 13.3 回滚条件

出现以下任一情况立即回滚：

- Active Memory 丢失或 Scope 错误；
- Task / Usage 无法稳定保存；
- MCP 影响 Codex 正常工作；
- Asset Repository 出现不可恢复写入；
- 新系统关键任务明显劣于旧系统；
- 对账报告存在未解释差值。

### 13.4 回滚方式

- Codex MCP / Hook 指回 V4；
- 恢复迁移前 SQLite 快照；
- Asset Repository 回到迁移前 Tag；
- 保留失败 Run 的报告供修复；
- 不删除失败数据证据。

---

## 14. 分阶段任务总表

> 每个任务使用一个全新对话；结束时更新状态、Commit、对账数字和简短总结。

| 任务 | 阶段 | 内容 | 状态 | 完成 Commit | 对账/简短总结 |
|---|---|---|---|---|---|
| M00 | 盘点 | 冻结 V4 事实、Schema 和数据清单 | 未开始 | - | - |
| M01 | 契约 | 定义 Migration Package 与目标映射 | 未开始 | - | - |
| M02 | 导出 | 实现 V4 只读 Exporter | 未开始 | - | - |
| M03 | 导入 | 实现 Node Importer 骨架、Dry Run 和 Run 状态 | 未开始 | - | - |
| M04 | Memory | 迁移 Active Memory 与历史版本归档 | 未开始 | - | - |
| M05 | Skill | 迁移并重新分类 Skill | 未开始 | - | - |
| M06 | Document | 筛选文档、迁移附件并退役 Obsidian | 未开始 | - | - |
| M07 | Usage | 迁移 Task、Recall、Read、Used、Settlement | 未开始 | - | - |
| M08 | Trust | 迁移 Proposal、Promotion、Digest、Receipt | 未开始 | - | - |
| M09 | Conversation | 盘点会话并完成缺口分析决策 | 未开始 | - | - |
| M10 | 对账 | 全量 Dry Run、冲突隔离和对账报告 | 未开始 | - | - |
| M11 | Shadow | 新旧搜索、Loadout、Usage 对比 | 未开始 | - | - |
| M12 | Cutover | 最终增量、正式切换和回滚演练 | 未开始 | - | - |
| M13 | 收口 | 旧系统只读归档、迁移报告和清理 | 未开始 | - | - |

### 14.1 对新项目任务的依赖

| 迁移任务 | 最低依赖的新项目任务 |
|---|---|
| M00～M02 | N00～N02；只需要设计、契约和任务协议 |
| M03 | N03～N06；需要 Asset Repository、Catalog 和写入服务 |
| M04～M06 | M03 完成；目标 Asset 写入和 Git/Hash 已稳定 |
| M07 | N10～N11；需要 Task、Usage Event 和 Settlement |
| M08 | N12；需要 Proposal、Promotion、Digest/Receipt 目标模型 |
| M09 | 无额外强依赖，但不得阻塞主迁移 |
| M10 | M04～M09 全部有结果 |
| M11 | N13～N17；需要 MCP、Hub、Codex 联调和稳定运行环境 |
| M12 | N18 准入评审通过 |
| M13 | M12 正式切换稳定后 |

推荐跨文档总顺序以新项目设计文档第 21.1 节为准。

---

## 15. 各迁移任务详细说明

### M00：冻结事实与数据盘点

**目标**

从 V4 真实源码、数据库和文件中建立权威清单，消除对旧结构的猜测。

**范围内**

- 记录旧项目 Commit、运行版本和配置；
- 导出数据库 Schema；
- 列出所有表、文件目录、Skill、文档、Usage、Receipt；
- 统计记录数、状态分布、缺失字段；
- 明确哪些 Codex 会话可访问；
- 创建只读备份和 Hash。

**不做**

- 不写迁移转换逻辑；
- 不清洗数据；
- 不修改源系统。

**验收**

- 每个源类别都有位置、Schema、数量和示例；
- 未知项形成问题清单；
- 备份可恢复。

**完成记录（任务结束时填写）**

```text
状态：未填写
Commit：未填写
源系统 Commit：未填写
数据库 Hash：未填写
关键计数：未填写
发现的问题：未填写
下一任务前置：未填写
```

### M01：Migration Package 契约

**目标**

根据 M00 的真实数据确定 JSONL Schema、Manifest、结果枚举和映射表。

**要求**

- 使用 Zod 或 JSON Schema 固化中间格式；
- 保留 unknown legacy metadata；
- 定义每种实体的稳定 source identity；
- 定义 MIGRATED / SKIPPED / QUARANTINED / DEFERRED 原因码；
- 建立测试样例包。

**验收**

- 旧 Exporter 和新 Importer 使用同一份版本化契约；
- 非法包和 Hash 不一致会被拒绝。

### M02：V4 只读 Exporter

**目标**

生成完整、可验证、不可变的 Migration Package。

**要求**

- 默认只读；
- 支持全量导出；
- 后续支持按时间或版本的增量导出；
- 导出 source counts、warnings、checksums；
- 任何读取失败都进入报告。

**验收**

- 连续两次对未变化源数据导出，核心 Hash 一致；
- 源记录总数与 package 计数一致；
- 不产生源端写入。

### M03：Node Importer 骨架

**目标**

建立 `inspect / validate / dry-run / import / resume / reconcile / rollback-run`。

**要求**

- 初期不处理具体业务实体，只完成框架；
- Migration Run 可断点续传；
- 建立 legacy_id_map；
- Dry Run 不修改 Asset Repository 和正式 SQLite；
- 每条记录有结果。

**验收**

- 故意中断后可恢复；
- 重跑相同 package 不重复创建数据；
- rollback-run 可回到 Run 前快照。

### M04：迁移 Active Memory

**目标**

把明确有效的 V4 Memory 转成 MEMORY Asset，并保留历史版本归档。

**要求**

- 只迁移明确 Active / Effective 内容；
- Scope 映射准确；
- 保留旧 ID、Digest、来源；
- 重复和冲突按规则处理；
- 历史版本不伪造 Git 时间线。

**验收**

- Active 源数量全部有迁移结果；
- 目标 Asset 可扫描、检索和读取；
- 随机抽样逐字/语义对账；
- 没有 Quarantine 内容进入普通 Context。

### M05：迁移 Skill

**目标**

迁移真正可复用的方法，并纠正“其实是 Document”的旧内容。

**要求**

- 对每个 Skill 给出 SKILL / DOCUMENT / TASK DOCUMENT / SKIP 结论；
- 原始主文件和资源不丢失；
- 生成 asset.yaml；
- 检查 Codex 固定 Skill 目录是否需要兼容映射；
- 不因文件夹形式判断 Skill。

**验收**

- 每个旧 Skill 有明确结果；
- 迁移后的 SKILL 能通过 `asset_read` 完整读取；
- 资源文件 Hash 一致。

### M06：Document 与 Obsidian 退役

**目标**

筛选旧文档，迁入 DOCUMENT Asset，并结束对 Obsidian 的依赖。

**要求**

- 排除 `.obsidian` 和缓存；
- 分类项目专属、跨项目通用、任务文档、过时/重复；
- 附件和相对链接正确；
- 正式文档只保留 Asset Repository 一份；
- 旧 Vault 建立只读 Tag/快照。

**验收**

- 文件总数满足来源总数 = 各结果之和；
- 所有迁移文档能在 Hub 预览；
- 丢失附件清单为零或有明确解释；
- 日常流程不再要求 Obsidian。

### M07：Task 与 Usage

**目标**

将旧任务关联和 Recall / Read / Used / Settlement 映射到新 Asset。

**要求**

- 先通过 legacy_id_map 找目标 Asset；
- 不把累计数据伪造成逐次事件；
- 不补造缺失 Used；
- 保存 source system 和可信度；
- 无法映射的记录进入报告。

**验收**

- Recall / Read / Used 总数对账；
- 映射率和未映射原因可见；
- 同一源记录重复导入不重复计数。

### M08：Proposal、Promotion、Digest 与 Receipt

**目标**

保留 V4 的可信治理链路。

**要求**

- 状态精确映射；
- 未 Promotion 内容不得变 Active Asset；
- LEGACY_UNBOUND 进入隔离；
- 原 Digest/Receipt 原样保存；
- 新系统另行生成目标 Hash/Receipt。

**验收**

- Promotion 与 Active Asset 可追溯；
- 旧 Receipt 验证结果如实记录；
- 抽样能从 Asset 回溯到 Proposal 和来源。

### M09：ConversationHistory 盘点与缺口决策

**目标**

确定历史会话保存方式和后续优先级，不进行全量提炼。

**要求**

- 统计可访问会话数；
- 判断哪些会话已有 Asset 覆盖；
- 标记高价值未覆盖候选；
- 保存不可丢失的归档或路径；
- 输出后续 ConversationHistory 模块建议。

**验收**

- 不因无法访问部分 Codex 窗口而猜测内容；
- 主迁移切换不依赖全量会话处理；
- 有明确的 Deferred 清单。

### M10：全量 Dry Run 与对账

**目标**

使用完整导出包跑通所有映射，但不切换正式系统。

**要求**

- 生成总报告、分类报告、冲突报告、Hash 报告；
- 每个源实体有结果；
- 随机抽样和关键资产全量核对；
- 修复工具问题后从头重跑。

**验收**

```text
SOURCE_TOTAL = MIGRATED + SKIPPED + QUARANTINED + DEFERRED
```

所有分类成立，无未解释差值。

### M11：Shadow 对比

**目标**

用真实或回放任务比较 V4 与 EM Next。

**场景**

- 资金结算方案设计；
- 充值链路代码实现；
- Java 代码审查；
- Dubbo 故障排查；
- 与项目无关的通用问题。

**指标**

- 关键知识召回；
- Scope 串扰；
- 注入长度；
- Read / Used；
- 结果正确性；
- 用户返工。

**验收**

- 关键能力不劣于 V4；
- 新 Loadout 没有明显上下文膨胀；
- 发现问题有修复任务，而不是在迁移中临时打补丁。

### M12：正式切换与回滚演练

**目标**

完成最后增量导入、切换 Codex 和一次实际回滚演练。

**要求**

- 冻结 V4 写入；
- 最终增量 package；
- 对账通过；
- 切换 MCP/Hook；
- 验证真实任务；
- 回滚再切回，证明流程有效；
- 最终决定正式指向。

**验收**

- 无数据差值；
- Codex 会员链路正常；
- 回滚时间和步骤可重复；
- 旧系统数据仍完整。

### M13：收口与只读归档

**目标**

结束双轨期，保留完整历史证据。

**要求**

- V4 标记 Legacy Read-Only；
- 旧数据库、Obsidian Vault、导出包、报告建立不可变 Tag/备份；
- 清理临时迁移目录；
- 更新新项目文档和运维说明；
- 列出所有 Deferred 项。

**验收**

- 不再有双写；
- 任何迁移 Asset 可追溯源系统；
- ConversationHistory 等后续事项有独立任务，不影响当前稳定运行。

---

## 16. 每个迁移新对话的启动模板

```text
请执行 Engineering Memory V4 → EM Next 迁移任务 <任务编号>。

开始前：
1. 读取 EM Next 新项目设计文档；
2. 读取数据迁移设计文档；
3. 读取 <任务编号> 详细说明和上一个迁移任务完成记录；
4. 检查源系统、目标系统、Migration Package 和 Git 状态；
5. 不依赖上一轮聊天内容，不假设旧 Schema。

约束：
- 本轮只完成 <任务编号>；
- 源系统只读；
- 默认 dry-run；
- 每条源记录必须有迁移结果；
- 不确定内容进入 quarantine，不自动猜测；
- 结束时更新状态、Commit、源/目标计数、测试结果、遗留问题和简短总结。
```

## 17. 迁移任务完成记录模板

```markdown
#### <任务编号> 完成记录

- 状态：已完成 / 阻塞 / 进行中 / 延后
- 完成日期：YYYY-MM-DD
- Commit：<hash>
- Migration Run：<run-id 或 N/A>
- 源数据快照：<commit / db hash / package hash>
- 处理数量：
  - SOURCE_TOTAL：
  - MIGRATED：
  - SKIPPED：
  - QUARANTINED：
  - DEFERRED：
- 主要改动：
  1. ...
  2. ...
- 测试与对账：
  - `...`：PASS / FAIL
- 发现的数据问题：无 / ...
- 设计偏差：无 / 关联 ADR
- 回滚验证：N/A / PASS / FAIL
- 下一任务前置：...
- 简短总结：用 3～6 句话说明真实结果和风险。
```

---

## 18. 迁移完成标准

只有同时满足以下条件，才允许宣布迁移完成：

1. 所有源记录都落入四种明确结果之一；
2. Active Memory、Skill、正式 Document 完成内容和 Hash 对账；
3. Usage 总数、映射率和未映射原因全部可见；
4. Proposal、Promotion、Digest、Receipt 的审计链未丢失；
5. Quarantine 不参与普通 Context；
6. Obsidian 已退役，正式文档只在 Asset Repository 维护；
7. CodeGraph 未被错误复制为 Asset；
8. ConversationHistory 有安全归档和后续缺口计划，但不阻塞切换；
9. Shadow 结果达到准入标准；
10. 正式切换和回滚演练都通过；
11. V4、迁移包、迁移报告和旧文档均有只读备份；
12. 新系统能够从任意迁移 Asset 追溯到源记录。

---

## 19. 已冻结的迁移决策

| 决策 | 结论 |
|---|---|
| 迁移方式 | 旧系统 Exporter → 不可变中间包 → 新系统 Importer |
| 源系统 | 全程只读，切换前才冻结新增写入 |
| Active Asset | 只迁移明确有效内容 |
| 不确定数据 | Quarantine，不猜测 |
| 历史版本 | 先归档，不伪造 Git 历史 |
| Usage | 保留真实粒度，不将累计值伪造成事件 |
| Obsidian | 一次性迁移后退役，不做双向同步 |
| Conversation | 先保全和盘点，后续缺口式提炼 |
| CodeGraph | 不迁移图数据 |
| Catalog | 新系统从 Asset Repository 重建 |
| 回滚 | SQLite 快照 + Asset Git Tag + Codex 配置回切 |
| 执行节奏 | 一个任务一个新对话，任务结束更新状态和简短总结 |
