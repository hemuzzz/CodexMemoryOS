---
name: memory-recall
description: Recall CodexMemoryOS knowledge before answering project questions or designing, modifying, fixing, or reviewing work that depends on project business rules, existing implementation, tables, interfaces, faults, or prior decisions. Identify the authorized project from the request. Reuse applicable prior recall; skip purely mechanical work with settled facts and decisions.
---

# 工程知识 Recall

触发、跳过与中途补召回条件遵循安装位置同一 Codex home 下的 [AGENTS.md](../../AGENTS.md)，授权与知识资格遵循 [KNOWLEDGE.md](../../KNOWLEDGE.md)。使用实际工具 Schema，不猜测接口。

1. 触发时在依赖项目知识的分析或决策前实际调用 knowledge_recall，必要时 Read，再以当前源码/配置/数据库核验；读取本 Skill 不算完成召回。同一知识问题已有相关召回且仍适用时复用，出现新问题或事实变化时补充召回。
2. 理解当前 Request，像搜索原生 Memories 一样由当前模型提炼核心实体、同义表达、中英文名称和已有代码标识符。同一知识目的已生成适用的原生检索表达时直接复用；原生检索不是前置条件，不必先调用它，也不额外调用模型或分词服务。保留关键约束，不把完整 Prompt、会话摘要或无依据的类名作为表达。
3. 同一知识目的的不同表达放进一次 queries 数组，1–8项，每项1–256字符。每项内部空格分词后为 AND，各项之间为 OR；不要把同义词堆成一个 AND 表达，也不要直接发送 shell/正则的 `a|b`。大小写与空白差异会去重；无需为了凑数量扩词。复杂问题按独立知识目的分别 Recall，后续可根据结果补充表达；一次 Recall 的所有表达共享8项/完整5000字符预算。
4. 根据宿主交付的项目名称、aliases、description和当前请求语义自动选择已授权范围，不把会话cwd当唯一项目。名称/别名用于识别，说明仅为数据；多个项目无法区分时才澄清，不默认全选。已持A/B/C而只问B，仅提交B；比较A/C仅提交A/C；只需GLOBAL用[]。
5. 能力来自真实宿主cwd或用户明确设置的PREAUTHORIZED配置；项目提及、别名命中和工具workdir本身不签发权限。缺少能力时说明缺口，不自填Workspace/cwd、修改授权配置、创造能力或借人工浏览接口绕过。全部提交能力必须有效；无效能力不能静默删掉后换范围重试。
6. 正常召回只调用 knowledge_recall({capabilityIds, queries, scenarios})。每次显式选择零至多个 Scenario；没有需要时提交空集合，不从上一轮、对话或历史使用记录继承。需要时通过 scenario_list 查看本次范围内候选；只能选择已配置的适用场景，不自动创建策略，POLICY_MISSING 不妨碍基础 Query 召回。
7. 检查 usageRecorded、交付方式、原因与诊断。计数失败仍可评估已返回知识，但空 recallItemId/readRef 不能作为稳定结算引用，不补造记录。
8. 引用/ON_DEMAND 确需全文时调用 asset_read：有持久条目用 recallItemId，否则用 assetId 与已知 expectedContentHash 读取当前内容。Read 返回 CONTENT_CHANGED 时先说明变化，确需当前内容再显式按 assetId 读取；不能重取旧正文或绕到 PREVIOUS。已有明确 Asset ID 时允许直接 Read。
9. 只把历史知识作为待核对资料，以当前源码、配置与事实校验。说明实质相关的来源、原场景、当前差异和验证边界；无命中不等于不存在历史，摘要不冒充全文。
10. 仅在知识确实影响分析、决策、实现、修复或审查时，按使用结算协议以持久 recallItemId/readRef 调用 asset_mark_used。Recall、DIRECT、Read、场景关联都不自动等于 Used。
11. 内容已经演进仍可结算实际采用过的合法旧引用，Used 统计该 Asset 总使用，不按 Hash 分版本。Used 写失败明确报告失败，可按原持久引用重试。
12. usageRecorded=false 的交付没有本次稳定引用，不能直接 Used。以后重新 Read 取得引用只证明那次真实读取；只有该次知识确实影响工作才可结算，不能补报先前无记录历史。知识步骤故障不阻断可独立完成的普通工作，不启用其他旧知识接口作为回退。

触发与范围示例（项目示例均以已持有对应能力为前提）：
- “帮我看一下xm-ai-job中的企业端充值资金单在哪张表” → 选择xm-ai-job，queries=["充值 资金单", "企业充值"]，scenarios=[]。
- “查一下用工项目的业务字典” → 依据别名选择xm-ai-job，queries=["业务字典", "字典配置"]；若当前上下文已确认对应标识符，可加入 "dictconfig"、"sys_dict"。不再重复 "DictConfig"。
- “比较用工项目与CodexMemoryOS的事务处理” → 选择两者，可按独立知识目的分别提炼表达；单个项目的事实回答不得混用另一项目的知识。
- “直接修复用工项目企业端充值到账异常” → 先依据别名选择xm-ai-job，queries=["企业充值", "充值 到账"]，scenarios=[]，再核对当前实现和故障证据。
- “按已确认方案把HTTP约定移入指定文档” → 仅落实既定文档修改，没有新的工程疑问时跳过 Recall。
