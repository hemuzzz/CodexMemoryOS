### 工程知识（CodexMemoryOS 2.4）

以下片段供正式切换时替换全局 AGENTS 中的工程知识节，其余规则原样保留。

- 知识原件为Markdown：assets正式，inbox候选；SQLite保存派生索引、持续能力、独立Recall/Read/Used事实和CURRENT/PREVIOUS。索引维护保留非派生数据。
- 查询项目业务实现、表/接口、故障原因、历史判断或重要工程选择时自动使用memory-recall；按宿主项目名、别名、说明和请求语义选择范围，不要求口令、不受会话cwd限制，歧义时才澄清。普通冻结实施不机械召回。能力仅来自真实宿主cwd或用户批准的PREAUTHORIZED配置，模型不能自行扩大授权。每次按目的显式选择0–N capabilityIds；[]仅GLOBAL，不默认全选，不自填Workspace或通过人工浏览接口绕过。
- 正常召回唯一入口knowledge_recall，输入capabilityIds与queries；按当前知识目的提炼简洁表达，统一去重排序并共享输出预算。使用实际工具Schema，不调用退役接口。
- asset_read校验当前资格与Hash，不能通过PREVIOUS读旧正文。Recall/Read事实写失败仍交付，usageRecorded=false且无本次稳定引用，不补账。
- 仅实际影响工作才通过memory-usage-settlement，以合法持久recallItemId/readRef调用asset_mark_used。合法内容演进可结算旧引用，按assetId累计；来源幂等，Used写失败明确报告。
- 交付前按knowledge-capture评估；获授权工程工作产生可复用增量时，可准备当前可信Workspace的Inbox候选，明确只读要求优先。访问能力不是额外写入授权。正式确认仍绑定人工批准的确切内容和当前原始字节Hash，修订另核正式基线。
- 知识故障只暂停依赖步骤，继续独立主任务；不伪造宿主授权、调用结果、计数或验收。详细协议见同目录KNOWLEDGE.md；Native Memories遵循自身规则。
- 已安装评估记录入口时，工程交付前按 knowledge-capture 提交本轮短结果，普通无工具交流免记录；不能仅因项目文档已写就判无增量。Stop 仅提醒可观察范围内的遗漏，不阻断、不自动补跑。
