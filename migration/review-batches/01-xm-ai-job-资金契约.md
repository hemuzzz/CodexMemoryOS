# 资金权威、预付与结算：M01 审核批次

> 2026-09-07；本文件是普通审核稿，尚非 Inbox 候选或正式 Asset。用户已完成批量内容决策；候选正式确认另绑定生成文件及Hash。

[返回审核总索引](../v4-knowledge-review.md)

旧来源项目主要为 xm-ai-job；建议目标为 WORKSPACE / xm-ai-job，本轮配置映射到用户提供的代码库。

各条正文中的历史判断与本次源码核验分开。未列当前代码证据的业务细节不代表已验证当前实现。原状态仅为历史参考；精确字节重复组均为单文件。来源别名只用于本次阅读，不是新系统字段。

## REV-0001：企业资金权威边界与稳定请求身份

### 来源信息

- 审核编号：REV-0001
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0014, REV-0028；结算成功判定、未知结果恢复、学生 MQ 发送

来源原件（仓库外，仅只读引用）：

- **K00** · `CANDIDATE` · [xm-ai-job 资金外部协议与发布门禁 Candidate](</Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_09ad4a35a3249616587e12db.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_09ad4a35a3249616587e12db.md`
  - 原始字节 SHA-256：`6fc13cea4b210c8f5cc3959f52963bbe9922f87c299cb7b5555eb953d39bd6eb`

- **K12** · `MEMORY_VERSION` · [xm-ai-job 客户与学生资金模型](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_08060fd7fa97889642487eed/versions/mv_d02e9bb7b76a3be856bad5e2.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_08060fd7fa97889642487eed/versions/mv_d02e9bb7b76a3be856bad5e2.md`
  - 原始字节 SHA-256：`ac5cd8f2d9180a2ec42a4c5f3ef82697501fd866a680098775334716ca238c4a`

- **K23** · `MEMORY_VERSION` · [xm-ai-job 资金架构](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_ffa952e10b4ea3bc7b4cce7f.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_ffa952e10b4ea3bc7b4cce7f.md`
  - 原始字节 SHA-256：`8b89d2b56d04bfb409fbe1272e663b0162dcada6062790c9b0a6bd8045c31ff1`

- **K24** · `MEMORY_VERSION` · [xm-ai-job 企业资金全链路架构](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_20260816.md`
  - 原始字节 SHA-256：`0bf5334cb83a8c8a2c2075a1d4878720c7fc26058d7d594f314da91d2fb82fbf`

- **K31** · `MEMORY_VERSION` · [企业资金全链路最终本地设计闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_final_delta_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_final_delta_20260816.md`
  - 原始字节 SHA-256：`ade3538405a67366e8cce2c0aa9a18397212317e18842cc6bb542fae966f3054`

- **K34** · `MEMORY_VERSION` · [企业资金第一阶段实现后的恢复与发布边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_phase1_recovery_boundaries_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_phase1_recovery_boundaries_20260816.md`
  - 原始字节 SHA-256：`2cdbf7432b51f03fbeb2a0ecad09d776d1dc63aa824fc5f0a2b7ae8f22e35db8`

- **K36** · `MEMORY_VERSION` · [企业资金全链路审查闭环](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_review_closure_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_review_closure_20260816.md`
  - 原始字节 SHA-256：`311c04129e3eeeafb61c6057b2331485e436f234eac737f08279283b41784d8f`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

资金中台拥有真实充值、结算、提现、外部余额和发票事实；xm-ai-job 拥有任务预算、业务预约、本地过程单和本地记账。任务冻结/释放是本地 Reservation，不应冒充中台资金交易。

真实外部动作使用稳定 financeBizId/requestId。本地先持久化业务单并取得发送资格，结果归一到统一应用服务；过程单状态、账户条件原子更新和成功流水须保持事务一致。技术超时、空响应、缺单号都不证明外部失败，SUCCESS 不能被后续过程结果覆盖。学生发放单与到账流水分别承载过程和成功事实。

#### 适用条件与原因

适用于本地业务账与外部资金事实分离的现有资金链。稳定身份限制重试歧义，统一结果入口避免 MQ、查询和人工处理各自记账。当前企业参与人 doSettle 是持有本地账户行锁的同步终态特例，不能把“所有外调都在事务外”写成无例外规则；具体结算见相邻条目。

#### 验证边界

旧稿的“企业过程单尚未实现”“所有资金链未联调”等是旧时点陈述，本次不保留为当前阻断结论。本地 CAS 和 Fake 测试不证明外部 Exactly Once；资金协议、生产钱包、消息与目标库仍需各自证据。

### 来源对照与整理说明

K12/K23 将企业资金单列为下一期；K24/K36 已进入企业资金架构。K31/K34 的通用 Query-first 与首次发送原则须受各业务专用恢复协议约束，不能覆盖同步终态结算或已删除的开票投影。K00 是发布门禁候选，仅提取证据分层，不复制旧未完成清单。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [MerchantTaskEnterpriseFundAppService.java:183](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/merchant/task/MerchantTaskEnterpriseFundAppService.java:183>)：当前结算持本地账户行锁并在 TransactionTemplate 内调用 doSettle，是通用事务外外调表述的例外。
  - SHA-256：`8901849e543be4e6fde2120554f6f567bfd90229dee94bcabf497c27cdc954d3`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：企业资金权威边界与稳定请求身份
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0002：任务结算按参与人生成子单与本地聚合

### 来源信息

- 审核编号：REV-0002
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0003

来源原件（仓库外，仅只读引用）：

- **K33** · `MEMORY_VERSION` · [任务资金主单、百分数预付与参与人结算实施收口](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_percent_ratio_impl_20260817.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_percent_ratio_impl_20260817.md`
  - 原始字节 SHA-256：`707fe7ee6f683305a4d870bed74f5dbb5cdf0cc31ec360163db76523e7117b95`

- **K38** · `MEMORY_VERSION` · [任务资金主单、预付与参与人最终结算语义校正](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_task_settlement_semantics_20260817_v4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_task_settlement_semantics_20260817_v4.md`
  - 原始字节 SHA-256：`18c488418e777593145376a22fef346147d13ad0ba783cb02649d0614ae20f7a`

- **K42** · `MEMORY_VERSION` · [xm-ai-job MERCHANT 任务结算快照与编排决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_416679e86f23822e912ea82a/versions/mv_70cd9a938104113f937a5884.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_416679e86f23822e912ea82a/versions/mv_70cd9a938104113f937a5884.md`
  - 原始字节 SHA-256：`03bdf3c42512e54dfb1dd8a2234e864fa48a010e3bcab2676428eb230dd7ef27`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

MERCHANT 单次/日结任务的结算主单固定任务身份，参与人验收事件在同一本地事务固化不可变金额快照，创建学生尾款 Child 和一张企业参与人 Child。企业单次请求携带完整实际报酬、服务保障与合规保障，不把一次参与人验收拆成三次企业出账，也不在 Task 收口时再次外调。

预付单必须为明确 SUCCESS 或 FAILED 后才允许验收；只有成功预付计入已付金额，失败预付按 0 计算，未知态阻止验收。学生尾款为实际报酬减成功预付，企业承担完整报酬及费用。零尾款仅作显式兼容：不发零金额请求，快照保留无尾款外调证据，不增加伪成功资金单。

所有必要资金成功及最终快照齐备后，主单 CAS 到 CLOSING；最终收口另按既有流程执行。主单已存在但业务事件尚未生成所有子单是正常中间态，不能自动补创“缺单”。审核式发布的主单创建时点见资金预约条目，不能统一规定发布即建主单。

#### 原因与适用条件

参与人验收与资金请求一一对应，减少三单部分成功和重算快照的歧义；预付终态门禁避免尾款先算后变。适用于 MERCHANT 单次/日结，不能扩展到运营周期远程助理。

#### 验证边界

本次仅核验当前主单聚合门禁及同步结算调用；未重跑整条验收和数据库事务故障测试。预付比例按当前源码采用百分数并除以100，详见预付比例条目。

### 来源对照与整理说明

K42 的“企业三类资金单独立推进”与 K33/K38 的“一参与人一张企业 Child”冲突；建议使用后者的业务粒度。K33/K38 的比例互相冲突已拆出独立审核项。两者“发布即建 Master”的概括不适用于后续企业首次审核。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [MerchantTaskEnterpriseFundAppService.java:109](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/merchant/task/MerchantTaskEnterpriseFundAppService.java:109>)：当前检查 finalSettlementSnapshotJson、学生与企业资金成功，再 CAS 到 CLOSING。
  - SHA-256：`8901849e543be4e6fde2120554f6f567bfd90229dee94bcabf497c27cdc954d3`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：任务结算按参与人生成子单与本地聚合
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0003：预付比例统一使用百分数并除以100

### 来源信息

- 审核编号：REV-0003
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：必须将冲突集中供人判断，不能从互相矛盾的来源生成确定性资金规则。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0002

来源原件（仓库外，仅只读引用）：

- **K33** · `MEMORY_VERSION` · [任务资金主单、百分数预付与参与人结算实施收口](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_percent_ratio_impl_20260817.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_percent_ratio_impl_20260817.md`
  - 原始字节 SHA-256：`707fe7ee6f683305a4d870bed74f5dbb5cdf0cc31ec360163db76523e7117b95`

- **K38** · `MEMORY_VERSION` · [任务资金主单、预付与参与人最终结算语义校正](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_task_settlement_semantics_20260817_v4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_task_settlement_semantics_20260817_v4.md`
  - 原始字节 SHA-256：`18c488418e777593145376a22fef346147d13ad0ba783cb02649d0614ae20f7a`

- **D32** · `DOCUMENT` · [资金架构 Source → Target 提取矩阵](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/finance-architecture-source-target-extraction-matrix.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/finance-architecture-source-target-extraction-matrix.md`
  - 原始字节 SHA-256：`2c6dbc636037a5c6428b2a97c6e9bf305a28ab9c301e659c9079dd4b082f13f4`

- **D35** · `DOCUMENT` · [Phase 4～6 补充收口与 Human Gate 2](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/human-gate2-closeout.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/human-gate2-closeout.md`
  - 原始字节 SHA-256：`5ff1581e691babc2b1b44a0b7194fb96de0e2d75cc910329e85c12f6d202af6a`

### 拟保留的当前内容草稿

#### 当前结论

当前运营与企业预付统一使用百分数口径：`0 <= ratio < 100`，金额为 `基础奖励 × ratio ÷ 100`，保留两位小数，HALF_UP。配置 10 表示 10%，配置 0.1 表示 0.1%；基础奖励 100 时分别得到 10.00 和 0.10。

#### 适用条件与原因

适用于当前两条 calculatePrepaymentAmount 链和 elite_index.prepayment_ratio 的代码解释。单位混淆会造成100倍金额差异，因此知识和输入样例必须与实际计算一致。用户本次明确要求冲突以源码为准，旧“小数直接乘、不除100”口径被本条替代，不再作为待决目标。

#### 依据与验证边界

2026-09-07已读取运营、企业两条计算方法，二者范围与除数一致。未连接目标数据库核实已有配置值，也未运行发款；代码单位明确不等于数据库数据已经符合约定。本轮只修订迁移知识，不改业务代码或资金数据。

### 来源对照与整理说明

K33记录百分数实现，K38与D32/D35保留旧小数决定及其代码冲突。2026-09-07用户明确要求冲突以当前源码为准，本稿按两条现行计算方法修订为百分数；旧原件只用于追溯，不再形成并列业务口径。数据库实际配置值仍未核验。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [TaskPrepaymentAppService.java:260](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/finance/TaskPrepaymentAppService.java:260>)：运营链校验 <100 并除以100。
  - SHA-256：`ec31e840f2a7c119c7e2bc9409f995f0b6bfa2368eb2dcabfd1587f2962da5eb`

- [MerchantTaskPrepaymentAppService.java:182](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/merchant/task/MerchantTaskPrepaymentAppService.java:182>)：企业链同样校验 <100 并除以100。
  - SHA-256：`437fd4911ad50bf333664e00ec99bae1232a211b74414aaf319a93609dba870c`

### 用户决定

- 决定：REWRITE
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：预付比例统一使用百分数并除以100
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0004：企业参与人结算：响应归属是门禁，余额只是观测

### 来源信息

- 审核编号：REV-0004
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0012

来源原件（仓库外，仅只读引用）：

- **K29** · `MEMORY_VERSION` · [企业参与人结算终态门禁与剩余余额告警](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_emp_settle_remaining_warning_20260823.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_emp_settle_remaining_warning_20260823.md`
  - 原始字节 SHA-256：`0f31adf8bf642bd80140659c5d7ab294b5a70d23ca76bcba7ac736134bd18f20`

- **K30** · `MEMORY_VERSION` · [企业参与人结算同步终态与剩余余额核对](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_emp_settle_sync_terminal_20260820.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_emp_settle_sync_terminal_20260820.md`
  - 原始字节 SHA-256：`b26a46315233ba4521ad38034e7d583fdc4a7be47fb032bf6108a959dc6adbd6`

- **K35** · `MEMORY_VERSION` · [企业充值过期未支付终态与联调后的收口边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_recharge_closed_terminal_20260821.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_recharge_closed_terminal_20260821.md`
  - 原始字节 SHA-256：`e427be6bd2db7b3e8563b2383ee3b9cf59b78bfcc7fa2721a1c2db24cd00cbd5`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

当前 doSettle 被应用层作为同步终态处理。响应非空且 requestId、userId 与请求一致时归一为 SUCCEEDED；响应为空或归属不符为 UNKNOWN，进入人工处理。remainingAmount 是结算后外部剩余金额，不是本次支出金额。

本地仍锁定企业 FUND 账户，在同一事务内调用并应用结果。余额为空或“本地结算前现金总额－本次金额”与外部余额不一致时，当前代码记录 ERROR，但不阻断成功；不能恢复旧的余额相等强门禁。未知结算只能依当前授权链复用原 requestId，不因为缺少查询协议无限等待。

#### 原因与取舍

本地行锁不能锁住资金中台的充值等并发变化，两次余额不是同一事务快照。强制恒等式会把已完成的外部结算误判为未知；保留日志提供调查线索。持锁跨 RPC 会增加锁等待，应按实际时延、超时和容量重新评估。

#### 适用与验证边界

仅适用于企业参与人同步结算，不推广到充值、提现或开票。已核验当前 toCommandResult 与事务包裹；未验证中台真实同步终态、原号幂等和生产告警。

### 来源对照与整理说明

K30/K35 要求余额相等，K29 已撤销该门禁；当前代码支持撤销。K29 写差额 WARN，当前代码为 ERROR，草稿以实际代码表达日志等级，不声称远程语义已验收。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [MerchantTaskEnterpriseFundAppService.java:447](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/service/merchant/task/MerchantTaskEnterpriseFundAppService.java:447>)：归属检查后，余额缺失/不等都 log.error，随后 SUCCEEDED。
  - SHA-256：`8901849e543be4e6fde2120554f6f567bfd90229dee94bcabf497c27cdc954d3`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：企业参与人结算：响应归属是门禁，余额只是观测
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0005：企业首次审核资金预约按审核轮次闭合

### 来源信息

- 审核编号：REV-0005
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。；报名审核门禁、发布预付快照

来源原件（仓库外，仅只读引用）：

- **K20** · `MEMORY_VERSION` · [xm-ai-job 后台与企业端共享任务发布事务](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_292fa421f8ba1c495f179cd7/versions/mv_3773492d87ec0fc653b4d5f4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_292fa421f8ba1c495f179cd7/versions/mv_3773492d87ec0fc653b4d5f4.md`
  - 原始字节 SHA-256：`832c5642af180b69e0d6c54bde0ba6437bd4751335747529486814ee586d867e`

- **K27** · `MEMORY_VERSION` · [企业需求首次审核下的资金预约轮次](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_demand_audit_reservation_20260818.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_demand_audit_reservation_20260818.md`
  - 原始字节 SHA-256：`c71aa3da3a852e0afedf78c25c06ee06367a1a69e41d7839684b22e0144b1e64`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

企业首次发布提交时保存隐藏 Task、冻结 FUND 并创建 INITIAL_PUBLISH 审核单，以 auditId 作为该轮 FREEZE 的 biz_no，并记录 freeze_biz_no。驳回在同一本地事务释放本轮冻结；重提生成新 auditId，以原有合法报酬重新冻结，不复用已释放轮次。

审核通过只认当前有效轮次：存在匹配冻结且没有该轮释放；通过时才创建唯一结算主单并激活任务。报名截止已过不能通过，只能按规则驳回。内容修改审核不操作冻结与主单。旧 taskId 冻结和后台立即发布应按既有兼容路径处理，不倒推重建历史流水。

#### 原因与取舍

流水唯一约束包含业务号，继续用 taskId 会使第二次冻结冲突；以审核轮次区分才能证明本轮预约有效。驳回释放与最终结算释放使用不同业务身份，不能混算。

#### 与入口权限的关系

后台与企业复用发布执行器，但企业客户和身份由服务端推导，不信任请求 customerId。发布渠道与资金账套不同，短 Redis 锁只抑制并发重复，不等于跨时重试幂等。

#### 验证边界

当前 TaskPublishExecutor 有 executeForMerchantAudit 专用路径；本轮没有完整复验所有审核事务、存量流水和唯一索引，历史“设计已确认”不等于当前数据库验收。

### 来源对照与整理说明

K20 概括统一发布事务；K27 为企业首次审核增加分轮预约及延后建主单，二者在共享执行器层兼容，但不能据旧概括跳过审核轮次。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [TaskPublishExecutor.java:178](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/task/TaskPublishExecutor.java:178>)：当前有企业审核式发布入口，区别于立即发布。
  - SHA-256：`97bcf8de1326d0f26671f94400fa76d27b5aa085cba18cdfa06f2fb2df10638d`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：企业首次审核资金预约按审核轮次闭合
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0006：预付开关的入口权威与任务快照

### 来源信息

- 审核编号：REV-0006
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

- **K16** · `MEMORY_VERSION` · [xm-ai-job 开工节点预付金决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_176324988f4e83a68d51e269/versions/mv_ced6d5946e243b56a35aaadf.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_176324988f4e83a68d51e269/versions/mv_ced6d5946e243b56a35aaadf.md`
  - 原始字节 SHA-256：`ee5755ed02c0bdba47dcf7038e985cb45a38fc55dcb05774cf34db38a969139a`

- **K92** · `MEMORY_VERSION` · [任务预付设置的入站归属与发布快照边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_task_prepayment_ingress_snapshot_boundary/versions/mv_20260827_admin_prepayment_request_boundary.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_task_prepayment_ingress_snapshot_boundary/versions/mv_20260827_admin_prepayment_request_boundary.md`
  - 原始字节 SHA-256：`218c0b701be579b424846467c473b42896f82979b95df515c923bc9d0bb95a8e`

- **D31** · `DOCUMENT` · [第 31 条 Effective Memory 增量审查](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/effective-version-31-delta-audit.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/effective-version-31-delta-audit.md`
  - 原始字节 SHA-256：`d0987d6468ad24089185e585f605e62ffaaba0de1faa9058d797fe62800b932d`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

预付只在真正进入开工路径时判断和触发，不在展示、查询或发布时补发。运营端有权按任务显式选择预付设置，请求缺省才用模板；企业端由服务端按 customer.prepayment_enabled 最终覆盖并写入 reward_json 快照，企业请求值不能覆盖客户配置。

共享 TaskRewardReq 包含字段不代表所有入口都拥有决定权。任务发布之后读取已固化快照，不随客户或模板配置变化重算历史任务。普通任务实际预付与验收尾款的资金关系须遵守账套与终态门禁。

#### 原因与取舍

从共享 DTO 删除字段会误删运营端合法能力；只靠前端隐藏又无法保护企业配置权威。服务端最终覆盖使两种入口共用 DTO 时仍有明确所有权。若必须从企业 OpenAPI 完全隐藏字段，再单独评估拆分请求模型。

#### 验证边界

已核对当前 applyTemplatePrepaymentSetting 的空值兜底、snapshotMerchantPrepaymentSetting 的 MERCHANT 覆盖及调用顺序。未重新验证真实 HTTP、开工并发或目标数据库。

### 来源对照与整理说明

K16 提供开工触发原因，K92 纠正共享 DTO 误删；D31 是该纠正的历史审查，不导入其旧 Review/commit 当作新确认。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [TaskPublishExecutor.java:338](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/task/TaskPublishExecutor.java:338>)：请求为空才用模板。
  - SHA-256：`97bcf8de1326d0f26671f94400fa76d27b5aa085cba18cdfa06f2fb2df10638d`

- [TaskPublishExecutor.java:351](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-application/src/main/java/com/zdms/app/xm/job/application/executor/task/TaskPublishExecutor.java:351>)：MERCHANT 按客户配置覆盖。
  - SHA-256：`97bcf8de1326d0f26671f94400fa76d27b5aa085cba18cdfa06f2fb2df10638d`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：预付开关的入口权威与任务快照
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0007：资金账套路由不能由入口渠道替代

### 来源信息

- 审核编号：REV-0007
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：KEEP
- Codex 建议理由：独立且高风险的账套边界，来源聚焦，不能用发布渠道替代。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。

来源原件（仓库外，仅只读引用）：

- **K69** · `MEMORY_VERSION` · [xm-ai-job 任务资金账套路由规则](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_fff49dee84292dae65292d90/versions/mv_af6ed75ed601d330b170eebb.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_fff49dee84292dae65292d90/versions/mv_af6ed75ed601d330b170eebb.md`
  - 原始字节 SHA-256：`41e78de0e1a8faaeeee1bdc43feb1352986afd50d5487bc7ccee0da9bc7ce276`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

任务资金链先通过 task.customer_id 找到客户，再以 customer.customer_source 判定 OPERATOR 或 MERCHANT。publish_source 只表达入口渠道，company_id 是企业公共身份，都不能替代账套事实。后台代发企业任务仍须走真实客户对应的资金链。

#### 适用条件与原因

同一企业可有不同账套，错误路由会导致串账、错误冻结释放或调用错误资金服务。原资料限定 MERCHANT 任务结算为单次/日结，不能因场景同属 taskType=2 把普通远程助理或品牌大使纳入。

#### 验证边界

本轮保留历史路由约束，未完整重跑当前 Router 调用链和账户数据；企业远程助理已移出历史迭代的边界另列审核。

### 来源对照与整理说明

单独保留账套与入口两个身份的区别；它不是企业远程助理旧专项完整身份校验的替代品。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：资金账套路由不能由入口渠道替代
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0008：学生资金 MQ：先抢占发送权，SENT 不代表到账

### 来源信息

- 审核编号：REV-0008
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。；企业充值 MQ、人工恢复

来源原件（仓库外，仅只读引用）：

- **K19** · `MEMORY_VERSION` · [xm-ai-job 资金发放 CAS 规则](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_27df1b5ec82f55b493e639c3/versions/mv_78393224ea84f93b94e05f57.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_27df1b5ec82f55b493e639c3/versions/mv_78393224ea84f93b94e05f57.md`
  - 原始字节 SHA-256：`f8411a8a9b7e78606488d43298bbd1d3846eafea6aeb4cbb967af6e9b05e86c7`

- **K47** · `MEMORY_VERSION` · [xm-ai-job 资金 MQ 发送前 CAS 决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_7688c520cab718900703ae0f/versions/mv_4e0e0861f54aee0d912aaa9b.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_7688c520cab718900703ae0f/versions/mv_4e0e0861f54aee0d912aaa9b.md`
  - 原始字节 SHA-256：`3347f638dbb3e7479bd2312ed0e7d2e4b3e4a457240e3074ef35a61aa85695fc`

- **K58** · `MEMORY_VERSION` · [xm-ai-job 资金发放单与到账流水拆分决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_b344fae4e22aab279eabbff2/versions/mv_d5ad133ddc7d78bd030e13de.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_b344fae4e22aab279eabbff2/versions/mv_d5ad133ddc7d78bd030e13de.md`
  - 原始字节 SHA-256：`c17029e7f27574141a1aad3176b87d6c8447659eb7a7feffd6e3ec6a85f0c54f`

### 拟保留的当前内容草稿

#### 当前结论（拟保留）

学生资金发放在业务事务提交后进入统一发送服务，由新事务 CAS 抢占发送权，仅胜出者调用 producer。自动、人工和补偿入口都复用该路径。普通 MQ 方案接受本地 SENT 已提交但消息未发出的窗口，通过受控恢复处理；SENT 不是财务成功，也不证明 Exactly Once。

student_fund_order 保存请求与过程，student_account_transaction 只保存经财务结果核验的到账事实。收入等成功口径不能用发送次数替代；结果应用须幂等，不能用后续过程状态覆盖既有成功流水。

#### 原因与适用条件

先发消息后提交业务事务可能造成回滚后资金已发；先占权则把失败窗口限制为需要补偿的未确认发送。代价是需要真实消息和查询恢复证据，CAS 不能保证 broker 或外部资金系统恰好一次。

#### 验证边界

本条重述学生 MQ 的历史设计，不把企业 Dubbo 的 SENDING 状态机套入；本轮未重跑 MQ 或实时资金同步。

### 来源对照与整理说明

K19 是约束、K47 是反向窗口取舍、K58 是过程与到账拆分，聚合为同一发送到成功事实边界；企业充值 MQ 关联单独处理。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：学生资金 MQ：先抢占发送权，SENT 不代表到账
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

