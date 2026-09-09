---
name: memory-recall
description: Recall CodexMemoryOS knowledge before answering project questions or designing, modifying, fixing, or reviewing work that depends on project business rules, existing implementation, tables, interfaces, faults, or prior decisions. Identify the authorized project from the request. Reuse applicable prior recall; skip purely mechanical work with settled facts and decisions.
---

# 工程知识 Recall

触发、跳过与复用遵循同一 Codex home 下的 [AGENTS.md](../../AGENTS.md)。未加载时先读取 [KNOWLEDGE.md](../../KNOWLEDGE.md)，遵循其中的授权、知识资格与交付事实规则；工具参数以实际 Schema 为准。

1. 按当前知识目的，从宿主提供的能力中选择所需项目；结合项目名、别名、说明和请求语义识别范围，歧义才澄清。
2. 从当前 Request 和已有上下文提取相关关键词；同一目的已有适用的原生检索词时直接沿用，补充表达须有上下文依据。同一知识目的的不同表达放入一次 `queries` 数组，项内 AND、项间 OR，不发送 `a|b`；独立知识问题分别召回。
3. 调用 `knowledge_recall({capabilityIds, queries, scenarios})`。每次重新选择场景，无需场景时用 `[]`；需要时先用 `scenario_list` 查看已启用的适用项，不继承上次选择。`POLICY_MISSING` 不妨碍基础召回。
4. 确需正文时调用 `asset_read`：有持久 `recallItemId` 就用该引用，否则用 `assetId` 与本次返回的 `contentHash` 作为 `expectedContentHash`。已有明确 `assetId` 时也可直接 Read。若返回 `CONTENT_CHANGED`，说明变化；仍需当前内容时按 `assetId` 重读。将相关知识与当前源码及事实核对，说明适用范围和未验证部分。
5. 仅对实际影响工作的知识，按 [memory-usage-settlement](../memory-usage-settlement/SKILL.md) 结算。知识步骤故障只暂停受影响部分，继续能独立完成的工作。
