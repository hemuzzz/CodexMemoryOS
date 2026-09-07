# 资金恢复、提现开票与报表：M01 审核批次

> 2026-09-07；本文件是普通审核稿，尚非 Inbox 候选或正式 Asset。用户已完成批量内容决策；候选正式确认另绑定生成文件及Hash。

[返回审核总索引](../v4-knowledge-review.md)

旧来源项目主要为 xm-ai-job；建议目标为 WORKSPACE / xm-ai-job，本轮配置映射到用户提供的代码库。

各条正文中的历史判断与本次源码核验分开。未列当前代码证据的业务细节不代表已验证当前实现。原状态仅为历史参考；精确字节重复组均为单文件。来源别名只用于本次阅读，不是新系统字段。

## REV-0009：未知外部结果、强关联与人工动作边界

### 来源信息

- 审核编号：REV-0009
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0012, REV-0013, REV-0014

来源原件（仓库外，仅只读引用）：

- **K26** · `MEMORY_VERSION` · [企业充值与提现 Query-only 人工恢复闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_customer_manual_query_recovery_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_customer_manual_query_recovery_20260823.md`
  - 原始字节 SHA-256：`b5c880c818d29081ba339eaf50b67a8d8472a5cc02e59b50a5c239511578b0a0`

- **K32** · `MEMORY_VERSION` · [提现未知结果人工释放与开票外部权威边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_invoice_authority_withdrawal_manual_release_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_invoice_authority_withdrawal_manual_release_20260823.md`
  - 原始字节 SHA-256：`e128b971e9a3be79e21c1081ce078a5326c10c64298d145e4a010fb409bf3e7f`

- **K60** · `MEMORY_VERSION` · [xm-ai-job 资金人工恢复授权规则](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_cc04af47fcb5ab79b7ea97a2/versions/mv_fba203042079164e9a6318cf.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_cc04af47fcb5ab79b7ea97a2/versions/mv_fba203042079164e9a6318cf.md`
  - 原始字节 SHA-256：`f102da51b4d0e610e54673ddee1973316096dff8edf22544fb0b6405aefee48f`

- **K79** · `MEMORY_VERSION` · [企业资金外调未知结果与缺单号恢复边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_finance_unknown_outcome_recovery/versions/mv_20260823_finance_unknown_recovery_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_finance_unknown_outcome_recovery/versions/mv_20260823_finance_unknown_recovery_v1.md`
  - 原始字节 SHA-256：`1d3b2ee56c6255d8c99c343677a0ec605b150db50c9c2751eecb02016912cc12`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

缺单号、空结果和超时只是本地观测缺失，不能推出中台未受理。充值/提现不自动重发、不换 requestId、不按金额时间弱匹配；未知提现保留冻结。

有 finance_order_id 的充值/提现通过 ALLOW_QUERY 进入既有查询链。人工取得真实外部单号时，先强 ID 查询并校验主体、类型和金额，再通过条件更新绑定并进入查询；不能借人工操作放宽关联。只有按原 requestId 取得明确未受理证据，才允许确认充值未发送，或在一个事务中失败提现单、释放原冻结、写唯一流水和恢复审计。普通授权状态 CAS 与审计同事务，不能直接改成功或账户余额。

#### 原因与取舍

保留未知与冻结增加人工成本，但避免已经发生的资金副作用被重复执行或资金重复可用。无消费者的授权状态不是恢复能力；恢复动作必须有明确执行路径。

#### 当前代码与未验证项

当前 CustomerFundOrderRecoveryHandler 区分充值/提现查询与企业参与人原号重发；企业结算重发在授权事务提交后立即执行，不能再写成所有动作仅由下一轮 Job 接管。StudentFundOrderRecoveryHandler 同时支持 ALLOW_QUERY/ALLOW_RESEND，旧文“学生只查询”的范围已不完整。当前执行器存在不等于外部强证据或生产恢复验收通过；本轮未执行恢复动作。

### 来源对照与整理说明

K60 早期三类企业单/学生查询/统一调度表述已落后；K26 是 Query-only 增量，K32/K79 补上强绑定及明确无单后的窄释放。开票最终权威拆为独立条目。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [CustomerFundOrderRecoveryHandler.java:79](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/finance/CustomerFundOrderRecoveryHandler.java:79>)：查询留给调度，企业结算授权重发立即执行。
  - SHA-256：`e395d94bef09bf77d94386a28e07aed0bb7cb3bfea9e66f5f48894a0f423d874`

- [StudentFundOrderRecoveryHandler.java:34](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/finance/StudentFundOrderRecoveryHandler.java:34>)：当前允许查询及重发动作，仍须状态规则授权。
  - SHA-256：`1e6a9359e04863eeaa86c81c67a32e51a3911226080b59581c4c8684170bb318`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：未知外部结果、强关联与人工动作边界
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0010：人工资金恢复按业务模式分派，避免策略类机械膨胀

### 来源信息

- 审核编号：REV-0010
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。

来源原件（仓库外，仅只读引用）：

- **K70** · `MEMORY_VERSION` · [人工资金恢复采用两层模式策略](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_finance_recovery_mode_strategy/versions/mv_finance_recovery_mode_strategy_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_finance_recovery_mode_strategy/versions/mv_finance_recovery_mode_strategy_20260823.md`
  - 原始字节 SHA-256：`81b1a9417e328a2012c2c1f368c03fd9d0c652b573833af46cadf85cd1205289`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

人工批量入口按 bizType + action 选择唯一模式执行器，再由执行器声明 bizIds 或 bindings 参数形态；模式合法性和执行选择应集中，批量层不散落资金动作分支。

普通状态授权继续复用原对象 Handler；强关联绑定、确认充值未发送、确认提现未发送并释放、显式隔离等具有不同事务/副作用的流程各用明确入口。不能按每个枚举组合机械创建一类，也不能把强查询、锁账户释放和纯状态 CAS 全塞入一个总控 Handler。

#### 原因与取舍

按业务流程拆分限制新增模式的修改面，代价是增加少量执行器；已有对象级策略负责同模板差异，重复抽象没有收益。批次保留逐项结果与失败隔离，幂等跳过不等于失败。

#### 当前核验与限制

当前源码除普通授权、绑定、充值无单、提现无单四类外，还存在 IsolateCustomerFundOrderToManualModeExecutor。旧“4 类执行器、6 种动作、10 组合”的计数是历史截面，不写成长期规则。本轮只核对注册器及各 supports/execute 分派，未重跑模式矩阵或真实 Job。

### 来源对照与整理说明

K70 的设计理由仍可复用，固定数量已被新增隔离模式突破；保留模式粒度取舍，删除历史测试数量与固定组合总数。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [FinanceRecoveryModeExecutorRegistry.java:32](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/finance/FinanceRecoveryModeExecutorRegistry.java:32>)：以 supports 匹配且要求唯一执行器。
  - SHA-256：`cc5667035d3d281383efaa592c0867f6b6b3f8fa445e4b1aaf5e50a721a07859`

- [IsolateCustomerFundOrderToManualModeExecutor.java:24](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/finance/IsolateCustomerFundOrderToManualModeExecutor.java:24>)：存在新增 ISOLATE_TO_MANUAL 模式。
  - SHA-256：`d7655f109fcbbdf9ce00346d46a2d55a4101385b41c279e2f6b5a32af5a24968`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：人工资金恢复按业务模式分派，避免策略类机械膨胀
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0011：生产告警后只读定位与显式人工隔离

### 来源信息

- 审核编号：REV-0011
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。；未知外部结果、恢复模式

来源原件（仓库外，仅只读引用）：

- **K78** · `MEMORY_VERSION` · [企业资金异常人工恢复链路](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_finance_unknown_outcome_recovery/versions/mv_20260823_finance_stale_manual_isolation_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_finance_unknown_outcome_recovery/versions/mv_20260823_finance_stale_manual_isolation_v1.md`
  - 原始字节 SHA-256：`89b3d908291f3af298e6d8ef6792530e2caf631169abd990c7d8547c47c7b401`

- **K84** · `MEMORY_VERSION` · [生产环境 ERROR 日志实时告警链路](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_project_error_alerting/versions/mv_20260823_project_prod_error_alerting_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_project_error_alerting/versions/mv_20260823_project_prod_error_alerting_v1.md`
  - 原始字节 SHA-256：`78b16e7e5799ac31486079341ca399cfc3b47650f524b7f49b853144245938e9`

- **D29** · `DOCUMENT` · [Candidate Draft — 企业资金异常人工隔离运行边界补充](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/candidate-finance-stale-manual-isolation-supplement.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/candidate-finance-stale-manual-isolation-supplement.md`
  - 原始字节 SHA-256：`2977fbaa3b97ced50839a440fdb1e1e6dede890b2ee3bd30260de5b939523cf6`

- **D34** · `DOCUMENT` · [Human Gate 2 Candidate 草稿审阅](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/human-gate2-candidate-review.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/human-gate2-candidate-review.md`
  - 原始字节 SHA-256：`62a8b304390c50bcb78c5b737422ccd825e1934468a4b15d0b4d2a90e3dd46ea`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

异常告警只提供调查入口，不能证明外部未受理或授权资金恢复。先只读定位明确业务单，再以显式 bizIds 进入无 Cron 的人工隔离入口；隔离到 MANUAL_REQUIRED 与后续查询、绑定、原号重试或释放是不同动作。

状态校验、CAS、恢复审计和资金副作用留在应用层执行器，XXL-JOB 只解析分发。单项失败与批次结果必须可见；不直接改库记成功，不把人工入口配置为持续自动处理。

#### 原因与取舍

显式目标限制当次影响范围，避免告警直接触发大范围变更。接受人工定位与等待强证据带来的时延，换取操作作用域和账务事实清楚。

#### 依据与验证边界

K78 只有一句话；D29 是未确认的补充草稿，为场景、替代方案和原因提供来源，不能冒充既有确认。K84 的“仅生产 ERROR 推群”来自 2026-08-23 用户陈述，本次未检查生产告警或工作群。当前已定位隔离执行器，未运行实际隔离或测试告警。

### 来源对照与整理说明

K78 与 K79 的未知结果安全约束互补，不重复整套恢复状态机。D29/D34 是补充建议，不因旧 Human Gate 文档存在而自动接受。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [IsolateCustomerFundOrderToManualModeExecutor.java:24](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/finance/IsolateCustomerFundOrderToManualModeExecutor.java:24>)：隔离作为独立模式存在，是否生产可用尚未验证。
  - SHA-256：`d7655f109fcbbdf9ce00346d46a2d55a4101385b41c279e2f6b5a32af5a24968`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：生产告警后只读定位与显式人工隔离
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0012：企业充值的强关联、支付编码与保守终态

### 来源信息

- 审核编号：REV-0012
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0004, REV-0009, REV-0013

来源原件（仓库外，仅只读引用）：

- **K35** · `MEMORY_VERSION` · [企业充值过期未支付终态与联调后的收口边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_recharge_closed_terminal_20260821.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_recharge_closed_terminal_20260821.md`
  - 原始字节 SHA-256：`e427be6bd2db7b3e8563b2383ee3b9cf59b78bfcc7fa2721a1c2db24cd00cbd5`

- **K26** · `MEMORY_VERSION` · [企业充值与提现 Query-only 人工恢复闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_customer_manual_query_recovery_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_customer_manual_query_recovery_20260823.md`
  - 原始字节 SHA-256：`b5c880c818d29081ba339eaf50b67a8d8472a5cc02e59b50a5c239511578b0a0`

- **K81** · `MEMORY_VERSION` · [企业充值支付MQ的稳定关联与保守结果应用](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_merchant_recharge_pay_mq_contract/versions/mv_20260824_merchant_recharge_pay_mq_contract_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_merchant_recharge_pay_mq_contract/versions/mv_20260824_merchant_recharge_pay_mq_contract_v1.md`
  - 原始字节 SHA-256：`153818248c58a9cb04e990702c571cbcdb9f0f0ae4102008aceafad0b6719215`

- **K82** · `MEMORY_VERSION` · [企业充值支付方式在入站边界归一为中台编码](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_merchant_recharge_pay_mq_contract/versions/mv_20260825_merchant_recharge_paytype_ingress_normalization_v2.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_merchant_recharge_pay_mq_contract/versions/mv_20260825_merchant_recharge_paytype_ingress_normalization_v2.md`
  - 原始字节 SHA-256：`94ccfc9d3ac3413fd90d8f5417e6b68cb7893fff06c893c7ff5b5d4338ace557`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

充值 Query 与支付 MQ 复用同一结果服务，在一次事务内应用订单终态、会员权益/FUND 入账和流水。MQ 用 ext.orderIds 中唯一原始充值单 UUID 关联 finance_order_id；不能把 orderId 的 MD5 或 payOrderId 当成本地请求号、充值单号或账户流水号。重复本地映射、非法 ext 不能猜测匹配。

历史正式协议中 tradeType 4/5 分别对应预存金/会员费；无关类型与未命中本项目订单按共享 Topic 语义确认消费。已命中订单必须核验业务类型、主体、支付方式与金额，不一致转人工。支付失败与本地 CLOSED 不等价；CLOSED 需轮询预算耗尽且权威订单确实未支付、已失效，关闭前重新查询，不改余额、不写成功流水。

HTTP 10/11/32 在入站归一到内部 30/31/32，本地快照、远程请求和 MQ 校验共用内部编码；仅展示兼容旧 10/11，不放宽结果校验。旧异常单须通过受控修复恢复，不能只改状态。

#### 原因与边界

稳定充值单身份使创建、查询和 MQ 指向同一事实，入站一次归一避免本地与回调双编码漂移。外部支付单关闭不能证明本地充值已失效。

#### 验证范围

本次完整阅读旧协议及故障记录，未连接生产 MQ、中台或数据库；编码、Topic 和外部字段仍须在正式使用前按部署制品核验，不把历史联调报告提升为当前端到端通过。

### 来源对照与整理说明

K35 的余额强门禁/缺恢复执行器属于相邻旧问题，不带入充值草稿。K81 强关联与 K82 编码修复互补；K26 为 CLOSED 以外异常提供有单号查询出口。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：企业充值的强关联、支付编码与保守终态
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0013：提现先冻结，强关联查询与预计费用分离

### 来源信息

- 审核编号：REV-0013
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0009, REV-0012, REV-0014

来源原件（仓库外，仅只读引用）：

- **K02** · `CANDIDATE` · [xm-ai-job 提现与开票未完成边界 Candidate](</Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_5319dedff4f74ce8a49930bb.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_5319dedff4f74ce8a49930bb.md`
  - 原始字节 SHA-256：`d647ed3fd327f2d5688bb6c63c7260195a1ee74566227531fb68d7ecdb0ee070`

- **K26** · `MEMORY_VERSION` · [企业充值与提现 Query-only 人工恢复闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_customer_manual_query_recovery_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_customer_manual_query_recovery_20260823.md`
  - 原始字节 SHA-256：`b5c880c818d29081ba339eaf50b67a8d8472a5cc02e59b50a5c239511578b0a0`

- **K32** · `MEMORY_VERSION` · [提现未知结果人工释放与开票外部权威边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_invoice_authority_withdrawal_manual_release_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_invoice_authority_withdrawal_manual_release_20260823.md`
  - 原始字节 SHA-256：`e128b971e9a3be79e21c1081ce078a5326c10c64298d145e4a010fb409bf3e7f`

- **K39** · `MEMORY_VERSION` · [企业提现创建时写入预计手续费并由外部结果覆盖](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_withdrawal_initial_estimated_fee_20260825.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_withdrawal_initial_estimated_fee_20260825.md`
  - 原始字节 SHA-256：`1a39bc6a87f7c4a77d71ffabcf5494208d882ca721eca0a7568a357b1ad75b5f`

- **K40** · `MEMORY_VERSION` · [企业提现创建与查询恢复闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_withdrawal_query_20260820.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_withdrawal_query_20260820.md`
  - 原始字节 SHA-256：`e6ff6edddc3112b2028fe3225e330b969a4812dd99d286cb0e440ad38f185668`

- **K41** · `MEMORY_VERSION` · [企业提现真实查询响应与本地落库投影](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_withdrawal_real_response_20260821.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_withdrawal_real_response_20260821.md`
  - 原始字节 SHA-256：`b035fbe6176dc246604673de391e9ef13a27822f6cf5efa067e42ad0c9fb9270`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

提现先在本地冻结请求总额并创建资金单，再以稳定本地订单身份提交。拿不到外部提现单号不能反推未受理；没有强关联单号时保留未知和冻结。明确成功扣减冻结，明确失败释放；人工明确无单后的窄释放遵循统一恢复事务。

查询用企业主体和外部提现单号强关联，外部到账额与手续费之和应等于本地总额；外部提现单号不能冒充流水号。历史提现协议允许成功结果缺 financeStreamId，这个特例不能推广到任务实付。只保留恢复/展示必要字段，卡号脱敏；本地 success_time 与外部完成时间含义不同。

报价和创建共用预计手续费 (2.00 + amount × 0.006) 向上进位到分；预计到账额为 amount－fee。冻结与外调仍使用原总额，不再额外加手续费。有效外部金额结果覆盖预计值，本地估算不是资金中台确认事实。

#### 原因与适用条件

预冻结防本地并发超用，未知保留冻结防已受理款项再次被花费；预计值解决处理中展示为零的误导，但不能夺取真实费用权威。

#### 当前约束与验证边界

当前 CustomerWithdrawalQuoteReq 与 CustomerWithdrawalCreateReq 均用 @DecimalMin("2.03")，最低金额已统一为2.03元；旧“报价2元、创建0.01元”的差异不再成立。按当前估算公式，2.03元手续费向上进位为2.02元，预计到账0.01元。已核对DTO注解、费用常量和计算方法；未重新验收HTTP校验链、查询金额、所有状态、数据库及外部费率。

### 来源对照与整理说明

K40 “本地不重算费用”针对最终费用；K39 增加展示用预计值并不改变外部权威。K02 的“尚未开放”是旧候选时点，不作为今天的总状态。K32/K26 的未知与明确无单边界互补。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [MerchantWithdrawalAppService.java:160](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/merchant/finance/MerchantWithdrawalAppService.java:160>)：固定2元、0.006及向上进位；当前quote/create共用。
  - SHA-256：`da170fef14fa75e63e87a643776286c391793d8102bc4fe53ae58ee86c5928fe`

### 用户决定

- 决定：REWRITE
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：提现先冻结，强关联查询与预计费用分离
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0014：开票外部页面拥有最终事实，本地保存提交审计

### 来源信息

- 审核编号：REV-0014
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0001, REV-0009, REV-0013

来源原件（仓库外，仅只读引用）：

- **K02** · `CANDIDATE` · [xm-ai-job 提现与开票未完成边界 Candidate](</Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_5319dedff4f74ce8a49930bb.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_5319dedff4f74ce8a49930bb.md`
  - 原始字节 SHA-256：`d647ed3fd327f2d5688bb6c63c7260195a1ee74566227531fb68d7ecdb0ee070`

- **K24** · `MEMORY_VERSION` · [xm-ai-job 企业资金全链路架构](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_20260816.md`
  - 原始字节 SHA-256：`0bf5334cb83a8c8a2c2075a1d4878720c7fc26058d7d594f314da91d2fb82fbf`

- **K31** · `MEMORY_VERSION` · [企业资金全链路最终本地设计闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_final_delta_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_final_delta_20260816.md`
  - 原始字节 SHA-256：`ade3538405a67366e8cce2c0aa9a18397212317e18842cc6bb542fae966f3054`

- **K32** · `MEMORY_VERSION` · [提现未知结果人工释放与开票外部权威边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_invoice_authority_withdrawal_manual_release_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_invoice_authority_withdrawal_manual_release_20260823.md`
  - 原始字节 SHA-256：`e128b971e9a3be79e21c1081ce078a5326c10c64298d145e4a010fb409bf3e7f`

- **K79** · `MEMORY_VERSION` · [企业资金外调未知结果与缺单号恢复边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_finance_unknown_outcome_recovery/versions/mv_20260823_finance_unknown_recovery_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_finance_unknown_outcome_recovery/versions/mv_20260823_finance_unknown_recovery_v1.md`
  - 原始字节 SHA-256：`1d3b2ee56c6255d8c99c343677a0ec605b150db50c9c2751eecb02016912cc12`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

待开票订单与发票最终结果由资金中台提供；pageInvoiceOrder/pageInvoice 展示外部事实，本地 customer_invoice_application 只记提交审计、稳定请求身份、脱敏快照和同步受理结果，不维护另一套最终发票状态。

同步受理不是开具成功，普通分页不能反向扫全库并更新本地最终状态。当前逐单响应全部明确接受才为 ACCEPTED，全部明确拒绝为 REJECTED，空/不完整或部分接受为 UNKNOWN；未知不自动重发。旧开票结果同步 Job 不应作为迁移后的现行能力。

#### 原因与取舍

财务可能后续驳回或作废，有限轮询不能保证本地投影永久一致；直接读权威页面减少过期事实。保留本地提交审计，接受无法仅凭本地订单宣布最终开具成功。

#### 当前申请限制与验证边界

外部超时后待开票列表尚未刷新可能导致用户以新 requestId 再申请；仍需中台同一待开票订单防重复能力或正式重放协议证明。本次核验当前 sendAfterClaim/toCommandResult 及分页入口，没有实际申请发票。当前申请入口使用上海时间并限制每月21～27日（含边界）；本地保存applyMonth，远端明确拒绝时使用返回的月度次数信息组装提示。当前入口及本地创建服务没有旧稿所述的本地每月一次配额锁，不将旧配额规则迁入。未核验中台实际月度次数配置。

### 来源对照与整理说明

K31 的完整本地开票状态机/查询恢复已被 K32/K79 的外部页面权威方向替代；K02 是未完成候选，不迁入其旧总阻断状态。当前代码对混合受理结果保留 UNKNOWN，草稿补明该事实。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [MerchantInvoiceAppService.java:508](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/merchant/finance/MerchantInvoiceAppService.java:508>)：全接受/全拒绝/混合或不完整分别归一为受理/拒绝/未知。
  - SHA-256：`0571fd674a1d92990c0e5ec15389716f3a926f915730d1b269d938bc7ed4c1cc`

### 用户决定

- 决定：REWRITE
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：开票外部页面拥有最终事实，本地保存提交审计
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0015：企业余额核对采用单次全量观测，不自动归因或调账

### 来源信息

- 审核编号：REV-0015
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0016, REV-0039

来源原件（仓库外，仅只读引用）：

- **K21** · `MEMORY_VERSION` · [企业余额自动核对排除固定平台内部账户](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_20260902_balance_reconciliation_fixed_platform_exclusion_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_20260902_balance_reconciliation_fixed_platform_exclusion_v1.md`
  - 原始字节 SHA-256：`0d4525492ad7b49191ecf24dd236037da07630d2a603a8bdbceb4215d01c2eb6`

- **K22** · `MEMORY_VERSION` · [企业余额自动核对采用夜间单次总额观测](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_20260902_balance_reconciliation_single_observation_tradeoff_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_20260902_balance_reconciliation_single_observation_tradeoff_v1.md`
  - 原始字节 SHA-256：`cbf6d3be2304a006878818d7fd9b1240c2ab360f8cf20ad9189ca31e13850a37`

- **K25** · `MEMORY_VERSION` · [企业余额核对采用人工按需处理的设计取舍](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_balance_manual_query_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_balance_manual_query_20260823.md`
  - 原始字节 SHA-256：`b8b1b7f76ec8fbe67ad36368239edc2496c0cb93c13afac7d2c3da2cca1e7ff3`

- **K89** · `MEMORY_VERSION` · [定时报表以数据库完整留痕为成功边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260902_system_report_database_authority_v3.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260902_system_report_database_authority_v3.md`
  - 原始字节 SHA-256：`cae3816ce6812263742a3c98c7f8b626f5df9464760de4a3a66df60ad84b8f23`

- **K90** · `MEMORY_VERSION` · [企业余额全量核对与用工 T-1 日报的最小留痕边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_daily_full_scope_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_daily_full_scope_v1.md`
  - 原始字节 SHA-256：`fc0e386a96f4627a4ec58e849e0726faaeb7d1eff3eb19f226939f8b28b6acec`

- **K91** · `MEMORY_VERSION` · [企业余额对账与用工T-1日报的本地实现和消融验证](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_local_implementation_ablation_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_local_implementation_ablation_v1.md`
  - 原始字节 SHA-256：`9e1861f8cf1488f14656f15e93a0751d68c18b03fe7ff7f24f800f3aed18a7a3`

- **D33** · `DOCUMENT` · [xm-ai-job 资金架构拆分治理方案](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/finance-architecture-split-governance.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/finance-architecture-split-governance.md`
  - 原始字节 SHA-256：`3b74deeb18ccc5567c832ca33190cac5a567ef01671bd0e08e0a2bf74d40a7d3`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

余额核对扫描普通 MERCHANT FUND 账户，排除无中台企业钱包的固定平台内部账户。每账户一次本地余额读取和一次远程查询；本地总额 = available_balance + frozen_amount + withdraw_frozen_amount，外部总额 = balanceAmount + frozenAmount，不比较冻结分项。

每页 50，完整遍历候选；单账户远程失败记录问题并继续，不设连续失败提前终止。只存金额差异、账户映射异常、远程查询失败的必要明细，一致账户只计数。报告是非同一时点观测，不区分稳定/瞬时差异，不查询资金单自动归因，更不执行恢复或调账。

#### 原因与取舍

提现冻结只是可用余额内部搬账，未提现成功前仍属于现金；去掉该项会制造差额。单次观测满足百级账户的低频人工排查需求，第二次紧邻查询也不能证明共同快照。接受在途噪声与人工确认，避免无需求的差异平台。

#### 当前验证与边界

本次代码确认全量循环、50条分页、逐户失败隔离、固定平台排除参数及三项现金公式。历史02:30是计划调度时刻，本轮未查询 XXL-JOB Cron。未重跑消融测试、真实 SQL 或中台余额。

### 来源对照与整理说明

K25/D33 的“仅人工、不自动对账”已被 K22/K90 改为低成本日报；K22“不新增结果表”和 K89“失败阈值/PARTIAL”又被 K90 的完整持久化、继续全量替代。K91给出提现冻结消融证据，仅作为历史测试，不伪称本轮重跑。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [MerchantAccountBalanceReconciliationAppService.java:90](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/report/MerchantAccountBalanceReconciliationAppService.java:90>)：按50页大小遍历，逐账户处理。
  - SHA-256：`65001d15d852a4a5d13b59983488488ddafc77c8c49d4dd3b365409855b1c441`

- [BalanceReconciliationRule.java:29](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-biz/src/main/java/com/zdms/app/xm/job/biz/service/report/BalanceReconciliationRule.java:29>)：现金总额包含提现冻结。
  - SHA-256：`4d5415fac7d8e7761af948420b025c6d942941b2c193d612a97ff3786f1c52fa`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：企业余额核对采用单次全量观测，不自动归因或调账
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0016：日报以完整数据库留痕为成功边界

### 来源信息

- 审核编号：REV-0016
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0015

来源原件（仓库外，仅只读引用）：

- **K83** · `MEMORY_VERSION` · [用工系统运营指标统计口径与周期](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_operational_metrics_reporting/versions/mv_20260902_operational_metrics_period_sources_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_operational_metrics_reporting/versions/mv_20260902_operational_metrics_period_sources_v1.md`
  - 原始字节 SHA-256：`93bb104be1de1042bfcb0e8715091bdd180d82c5e167418f660fd0599d4e65f5`

- **K89** · `MEMORY_VERSION` · [定时报表以数据库完整留痕为成功边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260902_system_report_database_authority_v3.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260902_system_report_database_authority_v3.md`
  - 原始字节 SHA-256：`cae3816ce6812263742a3c98c7f8b626f5df9464760de4a3a66df60ad84b8f23`

- **K90** · `MEMORY_VERSION` · [企业余额全量核对与用工 T-1 日报的最小留痕边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_daily_full_scope_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_daily_full_scope_v1.md`
  - 原始字节 SHA-256：`fc0e386a96f4627a4ec58e849e0726faaeb7d1eff3eb19f226939f8b28b6acec`

- **K91** · `MEMORY_VERSION` · [企业余额对账与用工T-1日报的本地实现和消融验证](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_local_implementation_ablation_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_system_report_execution_semantics/versions/mv_20260903_system_report_local_implementation_ablation_v1.md`
  - 原始字节 SHA-256：`9e1861f8cf1488f14656f15e93a0751d68c18b03fe7ff7f24f800f3aed18a7a3`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

用工指标只生成触发日的上海时区 T-1 自然日报，窗口左闭右开；不支持历史日期、单企业或周月报 JobParam。累计截止、周期新增、期末存量要按各自业务事实区分，沟通关系数不是消息数，业务收入不是财务利润。

完整 JSON 在独立事务写入 system_report_record 并标记完成后，才同步尽力发送钉钉概览；Webhook 空跳过，通知失败不回滚、不把 Job 改失败、不重试。失败只记录 reportRecordId 固定 WARN，不输出 Webhook 或响应详情。每次执行可以产生独立记录，不用发送状态机代替报表完成事实。

#### 原因与取舍

开发人员以数据库结果排查，通知不是正式交付；异步线程池、送达状态与补偿不改善报表质量。接受可能漏发/重复和人工查库成本。

#### 尚需保留的口径限制

历史指标设计要求精确首次终态时间，但 K91 的实现记录对部分任务回退 task.update_time，终态后修改可能漂移。不能把这个近似值改写成精确历史完成时刻。本轮没有核验最终全量 SQL 和生产存量；具体指标清单属于源码可恢复内容，不整表复制。

#### 当前核验

已读取 generateDailyReport、previousDay、markCompleted 的 REQUIRES_NEW 与 sendBestEffort。未调用钉钉、配置 Cron 或运行数据库统计。

### 来源对照与整理说明

K83 日/周/月设计被 K90 日报范围收窄；K89 的单公司/PARTIAL/连续失败分支不保留。K90 写尚未实现，K91记录本地实现，本次源码支持固定日报和先落库后通知；不继承任一旧测试数量为当前验收。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [EmploymentSystemMetricsAppService.java:71](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/report/EmploymentSystemMetricsAppService.java:71>)：previousDay及先markCompleted后通知。
  - SHA-256：`a297f5cfd0305f9e530d2a13f14c6d9657cfa7ac0f4ef8f3d9384836cfe9814a`

- [SystemReportRecordStateService.java:62](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/report/SystemReportRecordStateService.java:62>)：独立事务提交完整JSON。
  - SHA-256：`98f081b8cf45375d4cd0862c43c555a14b16cc02c3f8dc716a105db83c9c57fb`

- [DingTalkReportAppService.java:34](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/report/DingTalkReportAppService.java:34>)：空配置跳过，通知失败固定WARN，不抛出。
  - SHA-256：`8542fee1263e90b9907003b8adb66c0b75ac11bd0ac1ff4385a11370698b9da1`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：日报以完整数据库留痕为成功边界
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

