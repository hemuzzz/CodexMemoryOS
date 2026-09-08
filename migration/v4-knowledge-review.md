# V4 旧知识人工审核

> 2026-09-07 · M00～M05 已完成。
> Inventory文件794；Exact Hash794；完全相同文件组0。
> 审核44项，已处理44，待处理0。
> 用户决定：KEEP31，REWRITE9，MERGE0，DROP4。
> 候选40份，正式确认40份。

[正式Asset、精确Hash及迁移结果](v4-generation-report.md) · [逐源处置Inventory](v4-source-inventory.json)

用户已接受xm-ai-job全部内容，并要求冲突以当前源码为准；知识治理按用途保留6项归CodexMemoryOS、4项不迁入。旧源不改动，无需再逐项重做M02内容选择；M04已按用户确认的生成清单逐份完成正式入库。

## 批次汇总

审核过程稿已清理，以下保留批次统计与最终决定；正式内容及 Hash 见迁移结果报告。

| 批次 | 审核范围 | KEEP | REWRITE | DROP | 待处理 |
|---|---|---|---|---|---|
| 01-xm-ai-job-资金契约 | REV-0001～REV-0008 | 7 | 1 | 0 | 0 |
| 02-xm-ai-job-资金恢复与报表 | REV-0009～REV-0016 | 6 | 2 | 0 | 0 |
| 03-xm-ai-job-任务与数据语义 | REV-0017～REV-0023 | 7 | 0 | 0 | 0 |
| 04-xm-ai-job-查询与工程方法 | REV-0024～REV-0030 | 7 | 0 | 0 | 0 |
| 05-xm-ai-job-业务演进与设计参考 | REV-0031～REV-0034 | 4 | 0 | 0 | 0 |
| 06-知识治理-判断与方法 | REV-0035～REV-0041 | 0 | 6 | 1 | 0 |
| 07-知识治理-投影与历史材料 | REV-0042～REV-0044 | 0 | 0 | 3 | 0 |

## 来源与核验范围

118份来源用于候选，48份来源仅关联不迁入项；其余572份辅助材料、55份派生投影及1份配置原地保留。全部794份原字节Hash已复核。代码定向核验不等于生产数据、资金或通知验收。xm-ai-job目标资产语义比较仍受当前Task范围限制；没有换Task或绕过访问边界。

## 审核决定汇总

| 编号 | 主题 | 目标Workspace | 决定 |
|---|---|---|---|
| REV-0001 | 企业资金权威边界与稳定请求身份 | xm-ai-job | KEEP |
| REV-0002 | 任务结算按参与人生成子单与本地聚合 | xm-ai-job | KEEP |
| REV-0003 | 预付比例统一使用百分数并除以100 | xm-ai-job | REWRITE |
| REV-0004 | 企业参与人结算：响应归属是门禁，余额只是观测 | xm-ai-job | KEEP |
| REV-0005 | 企业首次审核资金预约按审核轮次闭合 | xm-ai-job | KEEP |
| REV-0006 | 预付开关的入口权威与任务快照 | xm-ai-job | KEEP |
| REV-0007 | 资金账套路由不能由入口渠道替代 | xm-ai-job | KEEP |
| REV-0008 | 学生资金 MQ：先抢占发送权，SENT 不代表到账 | xm-ai-job | KEEP |
| REV-0009 | 未知外部结果、强关联与人工动作边界 | xm-ai-job | KEEP |
| REV-0010 | 人工资金恢复按业务模式分派，避免策略类机械膨胀 | xm-ai-job | KEEP |
| REV-0011 | 生产告警后只读定位与显式人工隔离 | xm-ai-job | KEEP |
| REV-0012 | 企业充值的强关联、支付编码与保守终态 | xm-ai-job | KEEP |
| REV-0013 | 提现先冻结，强关联查询与预计费用分离 | xm-ai-job | REWRITE |
| REV-0014 | 开票外部页面拥有最终事实，本地保存提交审计 | xm-ai-job | REWRITE |
| REV-0015 | 企业余额核对采用单次全量观测，不自动归因或调账 | xm-ai-job | KEEP |
| REV-0016 | 日报以完整数据库留痕为成功边界 | xm-ai-job | KEEP |
| REV-0017 | 学生预付违约按周期累积，回收不跨周期结转 | xm-ai-job | KEEP |
| REV-0018 | 任务关闭、参与人结束与资金收口是不同事实 | xm-ai-job | KEEP |
| REV-0019 | 参与人当前态与每次尝试快照分离 | xm-ai-job | KEEP |
| REV-0020 | 报名审核状态由当次流程决定 | xm-ai-job | KEEP |
| REV-0021 | 场景与版本标识 JSON 协议，读取降级须按调用方区分 | xm-ai-job | KEEP |
| REV-0022 | 局部修改 JSON 应保留未修改字段，并验证真正落库 | xm-ai-job | KEEP |
| REV-0023 | 任务、岗位与外部主数据保持各自权威边界 | xm-ai-job | KEEP |
| REV-0024 | 分页查询批量装配，缺失扩展值不伪造主数据 | xm-ai-job | KEEP |
| REV-0025 | 讨论统计与已读游标分别定义，游标只能单调推进 | xm-ai-job | KEEP |
| REV-0026 | 外部流水分页即处理，窗口重叠依靠唯一身份去重 | xm-ai-job | KEEP |
| REV-0027 | 批处理逐项隔离故障，提交后通知保留配置边界 | xm-ai-job | KEEP |
| REV-0028 | 数据库真实结构优先于脚本和执行口述 | xm-ai-job | KEEP |
| REV-0029 | 单实现外部调用复用 Wrapper，不机械增加 Gateway | xm-ai-job | KEEP |
| REV-0030 | 依赖声明支持某枚举，不等于 DTO 和调用链可用 | xm-ai-job | KEEP |
| REV-0031 | 运营远程助理与已撤回的企业远程助理分开 | xm-ai-job | KEEP |
| REV-0032 | 老企业免费会员只以明确白名单为准 | xm-ai-job | KEEP |
| REV-0033 | 参与工作以发生事实计数，缺失历史事实不按状态猜补 | xm-ai-job | KEEP |
| REV-0034 | 对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始 | xm-ai-job | KEEP |
| REV-0035 | 知识系统减少治理对象，把维护成本用于内容质量 | 不迁入 | DROP |
| REV-0036 | 知识确认应绑定完整内容，不能用状态或使用量替代 | CodexMemoryOS | REWRITE |
| REV-0037 | 来源、快照和验证时点分别说明，不能补造历史证据 | CodexMemoryOS | REWRITE |
| REV-0038 | 私有工程资料需校验实际交付边界 | CodexMemoryOS | REWRITE |
| REV-0039 | 知识质量审核以独立可复用判断为单位 | CodexMemoryOS | REWRITE |
| REV-0040 | 运行审计区分代码证明、隔离实验和真实使用验收 | CodexMemoryOS | REWRITE |
| REV-0041 | 使用次数是行为遥测，不能自动决定知识质量与晋升 | CodexMemoryOS | REWRITE |
| REV-0042 | 可视化投影保持可重建，不能反向充当知识原件 | 不迁入 | DROP |
| REV-0043 | 旧系统运行指南与执行审计记录保留原地，不作为现行知识整体迁入 | 不迁入 | DROP |
| REV-0044 | 旧架构与结算流程图作为历史附件留存 | 不迁入 | DROP |
