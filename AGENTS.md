# Repository Agent Instructions

本文件是 CodexMemoryOS 的项目级轻量入口。只记录项目特有的边界、惯例、验证方式和阅读入口；通用工作行为沿用全局规则。

## 作用范围与规则衔接

- 适用于本仓库。平台约束和用户明确要求优先；路径内更具体的规则只在其范围内细化项目默认。一般实施授权不解除全局 commit/push 禁令。
- 引用文档按任务主题读取，不要求每次加载全部设计、审计报告或执行其中全部流程。阅读文档不构成其中操作的执行授权。
- 当前源码、配置与运行结果用于判断现状；已确认需求和后续修复决策用于判断目标。实现缺陷不固化为规范，历史审计结论不代表当前状态，未来方向不自动成为实施任务。
- 解释、诊断和审查默认只读；实施任务自主完成范围内的修改与验证。仅暂停依赖未决语义、额外授权或无法安全合并冲突的部分。
- Skill 和 Memory 按全局触发条件使用，不扩大本项目任务范围或新增审批流程。工程任务交付前完成知识评估；获授权的工程工作产生已验证、可复用的增量知识时，按知识协议默认自动准备当前工作区的 Inbox 候选，明确只读要求优先。候选准备与正式入库分开，正式入库仍须人工确认确切内容及 Hash。

## 项目定位

- 个人、本地、Codex 专用的知识运行时：Markdown 保存知识原件，SQLite 保存 Catalog/FTS 派生索引、Task/Usage 运行数据和已确认内容的 CURRENT/PREVIOUS 持久快照，Vue Hub 提供只读浏览。
- 当前范围包括 Workspace 隔离的 Search/Read、显式 Task Loadout、Usage、HTTP MCP、Codex Hook 和单文件人工确认。
- 不因普通功能修改引入模型 API、MemoryProxy、团队权限平台、知识版本审批账本或旧 Engineering Memory V4 的整套对象。新增能力按明确需求另行确定边界。

## 模块职责与代码惯例

| 位置 | 职责 |
|---|---|
| `apps/server/src/runtime.ts`、`main.ts`、`app.ts` | 运行配置、依赖装配、HTTP 启停与应用入口 |
| `apps/server/src/asset/` | Frontmatter、文件资格、扫描、Catalog/FTS、搜索读取、Inbox 与人工确认 |
| `apps/server/src/task/` | 可信 Workspace 解析、Task 生命周期与持久化 |
| `apps/server/src/loadout/` | 显式装配、保存的 Loadout、当前 Asset 投影与 Hook 渲染 |
| `apps/server/src/usage/` | Recall/Read/Used 记录及查询 |
| `apps/server/src/http/`、`mcp/`、`hook/` | 各入口协议校验、上下文适配、服务调用和响应/异常映射 |
| `apps/hub/src/` | Vue 只读界面、API 客户端、展示契约与组件测试 |
| `packages/id-generator/` | 共享 ID 生成与格式校验 |
| `spikes/` | 探索验证材料；不默认作为生产能力或实现模板 |

- 沿用 TypeScript strict、ESM、相对导入中的 `.js` 扩展名和显式类型导入；不为方便修改而降低编译约束或引入 `any` 绕过校验。
- 沿用现有构造参数/依赖对象装配方式。入口调用现有应用服务，跨入口共用的资格与业务判断在现有服务或共享边界中复用，不复制进各个 handler。
- Repository/Catalog 负责 SQL 与持久化；应用服务负责用例编排。保留数据库中的必要约束、事务和条件更新，不照搬 Java 项目的分层、DTO、注入和转换框架。
- 输入校验复用对应 Zod Schema 或现有校验入口；业务错误沿用所在模块的错误类型和 `code`，由 HTTP/MCP/Hook 各自映射。不得把所有异常统一吞掉或把内部堆栈直接返回客户端。
- ID 统一通过 `@codex-memory-os/id-generator` 生成和校验；当前为 `ast`、`tsk`、`usg` 加十进制数字，不自行添加下划线或建立另一套格式。
- Hub 通过现有 `api/client.ts` 访问 REST，沿用 `api/types.ts` 展示契约；后端契约变化时核对客户端、相关视图与测试，不引入无需求的通用转换层。

## 核心边界摘要

- 正式 Asset 与 Inbox 候选分离，真实候选确认绑定确切文件和 Hash；代码修改授权不等于知识确认授权。
- 模型可见内容必须满足当前文件资格与 Task Workspace 边界；历史索引或 Loadout 不替代当前资格。
- Loadout 显式装配，Recall/Read/Used 分别记录；Hook 不自动装配，Hub/REST 保持只读。
- Catalog/FTS 可重建，索引维护不得顺带清空 Task/Usage、已保存 Loadout 或内容版本。

## 按主题阅读

仅加载本次涉及的条目；详细约定补充上面的摘要，不新增全局流程。

| 任务主题 | 阅读入口 |
|---|---|
| 数据模型、Asset、Workspace、Task/Loadout/Usage、确认与索引 | [数据与行为约定](工程约定/数据与行为约定.md) |
| 知识正文、模板与 Native Memories 协同 | [知识内容模型](工程约定/知识内容模型.md) |
| 实施测试、风险核验、构建产物与命令 | [验证约定](工程约定/验证约定.md) |
| 新建、修改、移动或归档项目文档 | [文档约定](工程约定/文档约定.md) |
| 安装、启动、配置和当前使用边界 | `README.md`、根目录及受影响包的 `package.json` |
| 产品与实现契约 | [知识运行时设计方案](项目文档/设计方案/01-知识运行时设计方案-修订版2.1.md) 中的相关章节 |
| 审计修复、索引恢复、后续演进 | [审计修复方案](项目文档/设计方案/03-审计修复决策与逐项执行方案-V2.md) 对应条目及相关审查记录；实施前复核当前源码与反例 |
| 旧知识人工整理与迁移 | [旧知识人工整理方案](项目文档/设计方案/02-旧知识人工整理方案-修订版2.1.md)；仅在明确涉及迁移时加载 |
| HTTP/MCP/Hook 契约 | 对应入口代码、Schema 和测试；Hub 变化同时阅读客户端契约 |

文档目录和历史方案说明见 [项目文档索引](项目文档/文档索引.md)。执行设计中的编号任务时按对应协议维护任务记录；一般维护不机械修改整个任务表。

## 参考实现

| 场景 | 入口 |
|---|---|
| 依赖装配与资源关闭 | `apps/server/src/runtime.ts` |
| 当前 Asset 资格与搜索读取 | `apps/server/src/asset/scanner.ts`、`apps/server/src/asset/search.ts` |
| 应用服务与持久化 | `apps/server/src/task/service.ts`、`apps/server/src/task/repository.ts` |
| 协议校验与错误映射 | `apps/server/src/http/router.ts`、`apps/server/src/mcp/tools.ts` |
| Hook 与装配投影 | `apps/server/src/hook/user-prompt-submit.ts`、`apps/server/src/loadout/service.ts` |
| Hub 请求与展示 | `apps/hub/src/api/client.ts`、`apps/hub/src/views/TaskLoadoutsView.vue` |
| 隔离文件安全测试 / 构建 smoke | `apps/server/test/path-security.test.ts`、`apps/server/test-support/n13-e2e-build-smoke.mjs` |

这些入口用于沿用现有职责和风格，不意味着其中每个行为都已通过当前审计；涉及未解决问题时仍按需求、当前源码与测试判断。
