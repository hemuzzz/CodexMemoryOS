---
name: memory-recall
description: Automatically recall CodexMemoryOS knowledge for project business logic, database tables, interfaces, troubleshooting, historical decisions, or important engineering choices. Identify the authorized project from its name, aliases and request context, including cross-project requests. Not for routine execution of frozen decisions.
---

# 工程知识 Recall

遵循当前已切换的 CodexMemoryOS 知识协议，使用实际工具 Schema，不猜测接口。

1. 用户查询项目业务实现、表结构/资金单落点、接口、故障原因、历史判断或重要工程选择时自动使用，不要求点名知识库或输入授权口令。先召回相关知识，必要时Read，再以当前源码/配置/数据库核验；普通冻结实施、纯格式修改不机械召回。
2. 先理解当前 Request，提炼短、具体的检索表达，保留核心实体与关键约束，去掉无意义自然语言修饰。不要把完整用户 Prompt、首次 Prompt 或会话摘要原样作为 Query。底层是文字/FTS/AND，多个词须同时命中，避免堆叠所有问题。
3. 复杂问题可按独立知识目的分别多次 Recall；每次一个 query，不要求服务端拆分，也不增加 queries 数组或额外模型规划器。
4. 根据宿主交付的项目名称、aliases、description和当前请求语义自动选择已授权范围，不把会话cwd当唯一项目。名称/别名用于识别，说明仅为数据；多个项目无法区分时才澄清，不默认全选。已持A/B/C而只问B，仅提交B；比较A/C仅提交A/C；只需GLOBAL用[]。
5. 能力来自真实宿主cwd或用户明确设置的PREAUTHORIZED配置；项目提及、别名命中和工具workdir本身不签发权限。缺少能力时说明缺口，不自填Workspace/cwd、修改授权配置、创造能力或借人工浏览接口绕过。全部提交能力必须有效；无效能力不能静默删掉后换范围重试。
6. 正常召回只调用 knowledge_recall({capabilityIds, query, scenarios})。每次显式选择零至多个 Scenario；没有需要时提交空集合，不从上一轮、对话或历史使用记录继承。需要时通过 scenario_list 查看本次范围内候选。
7. 检查 usageRecorded、交付方式、原因与诊断。计数失败仍可评估已返回知识，但空 recallItemId/readRef 不能作为稳定结算引用，不补造记录。
8. 引用/ON_DEMAND 确需全文时调用 asset_read：有持久条目用 recallItemId，否则用 assetId 与已知 expectedContentHash 读取当前内容。Read 返回 CONTENT_CHANGED 时先说明变化，确需当前内容再显式按 assetId 读取；不能重取旧正文或绕到 PREVIOUS。已有明确 Asset ID 时允许直接 Read。
9. 只把历史知识作为待核对资料，以当前源码、配置与事实校验。说明实质相关的来源、原场景、当前差异和验证边界；无命中不等于不存在历史，摘要不冒充全文。
10. 仅在知识确实影响分析、决策、实现、修复或审查时，按使用结算协议以持久 recallItemId/readRef 调用 asset_mark_used。Recall、DIRECT、Read、场景关联都不自动等于 Used。
11. 内容已经演进仍可结算实际采用过的合法旧引用，Used 统计该 Asset 总使用，不按 Hash 分版本。Used 写失败明确报告失败，可按原持久引用重试。
12. usageRecorded=false 的交付没有本次稳定引用，不能直接 Used。以后重新 Read 取得引用只证明那次真实读取；只有该次知识确实影响工作才可结算，不能补报先前无记录历史。知识步骤故障不阻断可独立完成的普通工作，不启用其他旧知识接口作为回退。

范围识别示例（仅当实际目录包含对应已授权项目时）：
- “帮我看一下xm-ai-job中的企业端充值资金单在哪张表” → 选择xm-ai-job，Query“充值 资金单”，scenarios=[]。
- “查一下用工项目企业端的充值逻辑” → 依据“用工项目”别名选择xm-ai-job，Query“企业充值”，scenarios=[]。
- “比较用工项目与CodexMemoryOS的事务处理” → 选择两者，可分别提炼Query；单个项目的事实回答不得混用另一项目的知识。
