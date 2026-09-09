---
name: knowledge-capture
description: Assess reusable engineering knowledge before delivering engineering work or on request, compare related Assets, and prepare warranted Inbox candidates.
---

# 知识提炼与候选生成

遵循安装位置同一 Codex home 下的 KNOWLEDGE.md。仅评估已验证的原因、取舍、适用条件与验证边界；普通 Todo、可直接从源码恢复的事实、未验证猜测无需沉淀。

1. 无知识要点时结束评估，不作空检索。有要点时用 knowledge_recall：提炼当前简洁 Query，仅选择必要且已获授权的 capabilityIds，每次明确选择 Scenario；GLOBAL 用 []。不默认全选范围。
2. 比较实质相关正文：有持久 recallItemId 时据此 asset_read，否则用 assetId + expectedContentHash 读当前内容。已有检索与正文充分时复用，不为流程重复读取。摘要不是全文，无命中不是无历史。
3. 比较结论、适用条件与证据，判断新增、扩展/修订、无增量或暂不能判断。访问缺口说明具体原因，继续主任务；不通过 Hub、直接文件路径或自填 Workspace 绕过访问边界。
4. 只有获授权且值得沉淀时，在已确认目标 Workspace 的 Inbox 准备候选。访问能力不是文件写入授权；只读、禁止知识写入或目标不清楚时仅展示建议。读取项目工程约定/知识内容模型.md 的模板和审阅要求。
5. 新增用共享 Asset ID；修订保留 ID，记录当前正式基线原始字节 SHA-256，生成合并后完整正文。保留当前源事实和历史差异，不覆盖正式 Asset。
6. 重读候选计算原始字节 Hash，展示路径、Asset ID、Hash、增量理由；修订另展示基线 Hash 与必要 Diff。人工确认须绑定确切内容与当前 Hash，再使用现有单文件 asset:confirm；内容/基线变化重新展示。一般继续或实现授权不等于正式确认。
7. 接受后重读核 Hash 再确认；修改按具体意见重写并重新展示；暂存只保留候选；拒绝只在明确删除授权且路径/Hash核对一致时删除本次候选。不新增提醒、账本或迁移旧知识。
8. 检查 usageRecorded；检索失败计数不妨碍评估已返回内容，但无稳定引用不得 Used 或补账。只有知识实质影响工作才按使用结算协议标记；比较本身不自动算 Used。
