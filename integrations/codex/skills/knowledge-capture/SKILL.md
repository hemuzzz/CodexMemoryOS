---
name: knowledge-capture
description: Assess reusable engineering knowledge before delivering engineering work or on request, compare related Assets, and prepare warranted Inbox candidates.
---

# 知识提炼与候选生成

遵循安装位置同一 Codex home 下的 [KNOWLEDGE.md](../../KNOWLEDGE.md)。由智能体结合当前任务、已有知识和后续复用场景，自主判断内容是否具有沉淀价值，综合考虑信息增量、复用收益与证据充分性，并明确区分已验证事实和待验证判断。

1. 无知识要点时结束评估，不作空检索。有要点时用 knowledge_recall：按 Recall Skill 提炼同一知识目的的 queries 表达数组，仅选择必要且已获授权的 capabilityIds；GLOBAL 用 []。不默认全选范围。
2. 比较实质相关正文：有持久 recallItemId 时据此 asset_read，否则用 assetId + expectedContentHash 读当前内容。已有检索与正文充分时复用，不为流程重复读取。摘要不是全文，无命中不是无历史。
3. 比较结论、适用条件与证据，判断新增、扩展/修订、无增量或暂不能判断。访问缺口说明具体原因，继续主任务；不通过 Hub、直接文件路径或自填 Workspace 绕过访问边界。
4. 只有获授权且值得沉淀时，在已确认目标 Workspace 的 Inbox 准备候选。访问能力不是文件写入授权；只读、禁止知识写入或目标不清楚时仅展示建议。按 KNOWLEDGE.md 中的明确链接读取知识内容模型，不按当前业务仓库解析模板路径。
5. 新增用共享 Asset ID；修订保留 ID，记录当前正式基线原始字节 SHA-256，生成合并后完整正文。保留当前源事实和历史差异，不覆盖正式 Asset。
6. 重读候选，保留路径、Asset ID 和原始字节 Hash；修订另保留正式基线 Hash 与必要 Diff。按知识内容模型统一展示候选及增量理由，不另定展示字段。确认须绑定展示时的完整内容与 Hash，内容或基线变化须重新展示。
7. 接受后按 KNOWLEDGE.md 的链接读取 README 确认参数，重读核 Hash，再执行当前单文件 asset:confirm；修改按具体意见重写并重新展示；暂存只保留候选；拒绝只在明确删除授权且路径/Hash核对一致时删除本次候选。不新增提醒、账本或迁移旧知识。
8. 检查 usageRecorded；检索失败计数不妨碍评估已返回内容，但无稳定引用不得 Used 或补账。只有知识实质影响工作才按使用结算协议标记；比较本身不自动算 Used。
9. 工程任务附带的候选随主任务结果展示，未收到反馈也正常完成主任务交付，之后再处理用户的明确意见。仅在用户明确要求当场审阅知识时进入对应反馈步骤，不用等待工具维持附带候选的选择框。
