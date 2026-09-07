# 预付风控、任务流程与数据语义：M01 审核批次

> 2026-09-07；本文件是普通审核稿，尚非 Inbox 候选或正式 Asset。用户已完成批量内容决策；候选正式确认另绑定生成文件及Hash。

[返回审核总索引](../v4-knowledge-review.md)

旧来源项目主要为 xm-ai-job；建议目标为 WORKSPACE / xm-ai-job，本轮配置映射到用户提供的代码库。

各条正文中的历史判断与本次源码核验分开。未列当前代码证据的业务细节不代表已验证当前实现。原状态仅为历史参考；精确字节重复组均为单文件。来源别名只用于本次阅读，不是新系统字段。

## REV-0017：学生预付违约按周期累积，回收不跨周期结转

### 来源信息

- 审核编号：REV-0017
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

- **K87** · `MEMORY_VERSION` · [学生预付未履约风控门禁与跨账套影响](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_student_prepayment_risk_gate/versions/mv_20260821_enterprise_prepayment_global_gate_diag.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_student_prepayment_risk_gate/versions/mv_20260821_enterprise_prepayment_global_gate_diag.md`
  - 原始字节 SHA-256：`d11324ffabe4e08839a6fcd956e572f843b8c932037ab703ba97a78e7e7fc26a`

- **K88** · `MEMORY_VERSION` · [学生预付违约的五倍履约恢复周期](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_student_prepayment_risk_gate/versions/mv_20260821_prepayment_five_times_recovery_cycle.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_student_prepayment_risk_gate/versions/mv_20260821_prepayment_five_times_recovery_cycle.md`
  - 原始字节 SHA-256：`b962026be54f636273b5a74d6a3670f096cbd076a6cddcf3995dfdaf89583732`

### 拟保留的当前内容草稿

#### 拟保留的业务判断

诊断“未生成预付单”应先检查资格与风控门禁，再看发送链。尚未创建资金单与已创建但 MQ 未发出是两个问题，不能直接手工补发。旧 K87 的 1:1 回收口径被 K88 的 5 倍规则替代；特定学生和历史风险余额仅为当时排查样本。

一个回收周期的目标是该周期累计违约预付金额的 5 倍；前一周期完成后，后续违约另起周期，超额完成不带入新周期。同周期多次违约累加，不取最大一笔。成功工作产生的有效回收按既定终态事实计算；不能将 WORK_ABANDONED 本身算作成功工作。旧设计复用 work_abandon_time 承载违约发生时刻，现金与赠金账套均由平台付款。

#### 原因与边界

周期隔离避免历史超额劳动抵消未来违约；累计避免连续违约只承担最大一笔。当前 StudentPrepaymentRiskBizService 仍含 5 倍常量、顺序归集和周期剩余量计算，属于代码支持的现状。哪些具体业务事件进入输入、历史字段补全和学生级并发保护本轮未完整核验；不把旧并发风险记为当前已复现缺陷，不把局部计算核验等同于完整风控验收。

### 来源对照与整理说明

K87 是原因定位与旧倍率，K88 是后续业务决定。保留诊断分层与周期原因，删除旧样本数值和待办。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [StudentPrepaymentRiskBizService.java:27](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-biz/src/main/java/com/zdms/app/xm/job/biz/service/finance/StudentPrepaymentRiskBizService.java:27>)：当前回收倍率及周期归集实现。
  - SHA-256：`700f75542b4c8a7efd766d327ed9fc9cb3ffafcd95a403b39cc2b413d98927be`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：学生预付违约按周期累积，回收不跨周期结转
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0018：任务关闭、参与人结束与资金收口是不同事实

### 来源信息

- 审核编号：REV-0018
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

- **K15** · `MEMORY_VERSION` · [xm-ai-job 任务终态收口的资金风险](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_168f1f4eaaae753b1074569e/versions/mv_9ffa221086b5bad47131b526.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_168f1f4eaaae753b1074569e/versions/mv_9ffa221086b5bad47131b526.md`
  - 原始字节 SHA-256：`debf6f0172fdef89ee3ec7030f69fef31f202265344bf58e3c3bb0a76ff1a0f1`

- **K18** · `MEMORY_VERSION` · [xm-ai-job 任务参与生命周期](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_21757dfe3bc64c3d7c106ffd/versions/mv_8138e2b6a19b04276d3594c5.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_21757dfe3bc64c3d7c106ffd/versions/mv_8138e2b6a19b04276d3594c5.md`
  - 原始字节 SHA-256：`bb49d9f6b1b9a12a0b2f2e0b411bae6066354bc89f8a92e91fc50f11cdd50a98`

- **K54** · `MEMORY_VERSION` · [xm-ai-job 任务参与架构](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_987120c866846cf5d4427114/versions/mv_45f2976f7558eda286fe0ce4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_987120c866846cf5d4427114/versions/mv_45f2976f7558eda286fe0ce4.md`
  - 原始字节 SHA-256：`38f384f048e8e50d8d6901a0458fcdd26d788cb0e8b9b2bbf6012515742e4f4e`

- **K56** · `MEMORY_VERSION` · [xm-ai-job 未招满任务提前完成经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_b1311ef46cbb90879ff878f0/versions/mv_18f1944b4c12bbfc650575e4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_b1311ef46cbb90879ff878f0/versions/mv_18f1944b4c12bbfc650575e4.md`
  - 原始字节 SHA-256：`9f74731304547ac67d9759af57286d684fef51803465ad5f1b0e95567ebc4080`

### 拟保留的当前内容草稿

#### 拟保留的判断

任务招募生命周期、参与人的工作生命周期、资金单终态分别建模。已报名的参与人全部完成，不一定满足任务招募结束：例如目标招募 5 人，仅 2 人报名并完成，任务仍可能继续招募。结束原因写入终止业务字段，不能借审核拒绝原因承载所有终态。

结算/释放不能只按名字含“完成”的状态枚举决定。公司、平台、系统终止也需要按该路径的业务规则处理预约和冻结，不能因为它们不是 COMPLETED 就永久遗漏。但终止是否应付款、付多少、是否释放仍需各自事实，不可统一改成所有终态自动结算。

#### 历史与当前边界

K15 记录 2026-08 的“只处理 COMPLETED”冻结风险，是历史缺口证据；本轮没有重现该问题，不作为当前缺陷或迁移后 Todo。K18/K54 中 OPERATOR 远程助理的周期结算与普通任务不同，不扩大到已取消的企业远程助理。当前终态映射、所有关闭入口和恢复链仍需专项源码/测试核验后才能充当操作手册。

### 来源对照与整理说明

招募关闭、参与人终态和结算链互补；不把旧缺陷固化为新业务规则。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：任务关闭、参与人结束与资金收口是不同事实
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0019：参与人当前态与每次尝试快照分离

### 来源信息

- 审核编号：REV-0019
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0020

来源原件（仓库外，仅只读引用）：

- **K43** · `MEMORY_VERSION` · [xm-ai-job 参与当前态与历史拆分决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_4246d5a5d84cce3c3b79322a/versions/mv_6ceb218b9a07b644b879d2e4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_4246d5a5d84cce3c3b79322a/versions/mv_6ceb218b9a07b644b879d2e4.md`
  - 原始字节 SHA-256：`8d96525544a9623dc0a90797532f98d1bddacb01c8a8c721fe9594574ad8928a`

- **K48** · `MEMORY_VERSION` · [xm-ai-job 参与记录快照与历史模型](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_85b0a3a3089f06fe9f205628/versions/mv_e7dbaf5ec852f3901492abf1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_85b0a3a3089f06fe9f205628/versions/mv_e7dbaf5ec852f3901492abf1.md`
  - 原始字节 SHA-256：`3202615b303408929d308dc848a47042006e1d3716eef9599f121fa480ccd42e`

- **K77** · `MEMORY_VERSION` · [企业需求审核的报名状态与交付快照归属](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_demand_audit_state_and_delivery_snapshot/versions/mv_xm_ai_job_demand_audit_state_delivery_snapshot_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_demand_audit_state_and_delivery_snapshot/versions/mv_xm_ai_job_demand_audit_state_delivery_snapshot_v1.md`
  - 原始字节 SHA-256：`7737ae6dea329fba4ad6e9bcd5eff7211703c87c25a5f5fca7db862b1f114ad0`

### 拟保留的当前内容草稿

#### 拟保留的判断

参与人表用于当前关系和状态；报名、工作、交付的多次尝试通过独立历史记录保存。重试或重新报名不能覆盖上一次尝试的关键事实；展示历史时不应从当前可变任务配置重新推导旧报酬、交付要求和验收条件。

交付与验收采用当次尝试确定的快照。任务后续修改不能悄悄改变已交付尝试的判定依据，历史快照也不能被当作下一次尝试的新配置。快照解决“当时按什么接受”的问题，当前主记录解决“现在处于什么状态”的问题。

#### 原因与边界

历史可解释性需要独立事实，单一状态字段和覆盖式修改会丢失失败、重报和重验收的原因。这里保留的是历史设计判断；本轮未逐表核验快照字段、回填范围和所有写入入口，不能声称已有存量全部具备完整快照。报名是否进入 AUDITING 是另一条审核语义，不与快照结构混为一条开关规则。

### 来源对照与整理说明

K43/K48 重复当前态与尝试历史的分工；K77 增补交付验收快照原因，审核开关另拆。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：参与人当前态与每次尝试快照分离
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0020：报名审核状态由当次流程决定

### 来源信息

- 审核编号：REV-0020
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0019

来源原件（仓库外，仅只读引用）：

- **K77** · `MEMORY_VERSION` · [企业需求审核的报名状态与交付快照归属](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_demand_audit_state_and_delivery_snapshot/versions/mv_xm_ai_job_demand_audit_state_delivery_snapshot_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_demand_audit_state_and_delivery_snapshot/versions/mv_xm_ai_job_demand_audit_state_delivery_snapshot_v1.md`
  - 原始字节 SHA-256：`7737ae6dea329fba4ad6e9bcd5eff7211703c87c25a5f5fca7db862b1f114ad0`

### 拟保留的当前内容草稿

#### 拟保留的判断

报名是否处于 AUDITING 应由当次报名流程与真实审核事实决定，不能事后仅凭任务“需要审核”开关推导所有参与人状态。配置表达是否需要审核，流程状态表达审核进行到哪里；任务配置改变后，历史报名的审核事实仍需保留。

#### 适用与验证边界

适用于需要人工审核报名的任务入口以及审核中、通过、拒绝的转换。不要用该原则将免审核任务强行增加审核步骤，也不要将“无需审核”解释成缺失审核记录的统一修补方案。来源是旧设计知识，本轮未遍历所有报名和审核入口，具体状态转换仍以当前业务和源码核验为准。

### 来源对照与整理说明

从 K77 的多主题正文中拆出，与尝试快照互补。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：报名审核状态由当次流程决定
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0021：场景与版本标识 JSON 协议，读取降级须按调用方区分

### 来源信息

- 审核编号：REV-0021
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

- **K10** · `MEMORY_VERSION` · [xm-ai-job 场景化任务内容决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_06552d8671ec7b23330569ec/versions/mv_c6a00d32b8472cef9714c701.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_06552d8671ec7b23330569ec/versions/mv_c6a00d32b8472cef9714c701.md`
  - 原始字节 SHA-256：`5bbaaddbb128916e80fd7eebfbd22a4ac1029ede21b54190e164d73826f97754`

- **K53** · `MEMORY_VERSION` · [xm-ai-job 任务存储与内容协议](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_96346c83c9f558589d87e00b/versions/mv_5cbdb907a56fa098dcab679b.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_96346c83c9f558589d87e00b/versions/mv_5cbdb907a56fa098dcab679b.md`
  - 原始字节 SHA-256：`d332155a44a3cce82f9867eba6f7b72811888197aeae9401afb4d3abe9c4602a`

- **K57** · `MEMORY_VERSION` · [xm-ai-job C 端任务内容解析降级决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_b2119912f69ec1cb9aa5913f/versions/mv_c5f9abcb106b9a60cebd4e62.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_b2119912f69ec1cb9aa5913f/versions/mv_c5f9abcb106b9a60cebd4e62.md`
  - 原始字节 SHA-256：`7a5f1677c973b44ac6d15e148b6ec60082ccaf7e219697f1acc8998b728a1f0a`

### 拟保留的当前内容草稿

#### 拟保留的判断

任务关系复用统一模型，场景与版本说明 reward_json、content_json 的解释协议。新增场景不能只扩一份 JSON 然后让所有旧入口按新结构解释；读取与写入必须使用相同的场景版本约束。

历史 C 端查询决定对无法解析的 JSON 记录日志并返回空的展示结果，避免单个坏记录拖垮列表。这是展示可用性的局部选择，不代表审核、结算等业务可以把解析失败当作真实空配置继续执行；管理端是否拒绝需另按流程判断。

#### 原因与边界

结构版本防止跨场景误读，局部降级保护查询可用性。不能把每个未知值都静默默认，也不能为迁移补造缺失版本。旧 version=1 和历史类名属于旧时点实现，本轮未验全量 JSON 或调用方；新协议和坏数据修复仍需按当前代码验证。

### 来源对照与整理说明

K10/K53 重复协议结构，K57补充消费端差异；保留原因，不复制字段目录。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：场景与版本标识 JSON 协议，读取降级须按调用方区分
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0022：局部修改 JSON 应保留未修改字段，并验证真正落库

### 来源信息

- 审核编号：REV-0022
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：KEEP
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。

来源原件（仓库外，仅只读引用）：

- **K63** · `MEMORY_VERSION` · [xm-ai-job 任务报酬 JSON 单字段编辑决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d4fb454291c6847f23cf6584/versions/mv_c73829d9ab36526c48e39702.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d4fb454291c6847f23cf6584/versions/mv_c73829d9ab36526c48e39702.md`
  - 原始字节 SHA-256：`5bbf6d83a0d7e2e7095ae9c24cec9f38945b97ff456259c3c672f28a88e4745a`

### 拟保留的当前内容草稿

#### 拟保留的判断

只修改 reward_json 中 settlementUnit 时，应保留其他已知和未知字段，避免用不完整 DTO 全量重序列化抹掉其他场景数据。构造新对象、调用更新方法并不证明 JSON 已落库；Repository 的显式更新列必须覆盖该字段。

#### 复用步骤

先界定只允许修改的键；读取现值并执行最小字段修改；检查真实 SQL/update 列；回读或用能捕捉字段丢失的测试验证其他键仍在。解析失败不能被当作空对象覆盖原数据，底层技术异常由应用入口映射为可理解的业务失败。

#### 来源边界

旧任务曾发现更新方法未包含 reward_json；这是历史缺陷示例，不代表当前还存在。该判断适用于局部 JSON 编辑，不要求所有领域对象都改成无类型 Map，也不授权本轮修复业务代码。

### 来源对照与整理说明

独立主题，保留历史失败机制和验证方法。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：局部修改 JSON 应保留未修改字段，并验证真正落库
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0023：任务、岗位与外部主数据保持各自权威边界

### 来源信息

- 审核编号：REV-0023
- Workspace 聚类：xm-ai-job
- 建议目标类型：DOCUMENT
- Codex 建议：REWRITE
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：无共享来源；主题联系见正文。

来源原件（仓库外，仅只读引用）：

- **K04** · `CANDIDATE` · [xm-ai-job 品牌大使报名后生命周期边界](</Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_9a6453ed3479a5ff53b439a1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_9a6453ed3479a5ff53b439a1.md`
  - 原始字节 SHA-256：`4f46e553a0e1cda05feba98a89568f1cbd7d1041c135cdc1378dbd4f421289d8`

- **K45** · `MEMORY_VERSION` · [xm-ai-job 客户运营模型](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_70c4c511c1f825142d32f9d1/versions/mv_8a9252ffc617d4be09c59840.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_70c4c511c1f825142d32f9d1/versions/mv_8a9252ffc617d4be09c59840.md`
  - 原始字节 SHA-256：`b214e838428e629003b1af0d03845cee3a562e141300f13b81d55a27f7ffc481`

- **K50** · `MEMORY_VERSION` · [xm-ai-job 任务与职位拆分决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_890e30ee20c24b3032bc1291/versions/mv_9cdec1e13ee1eda0914642fd.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_890e30ee20c24b3032bc1291/versions/mv_9cdec1e13ee1eda0914642fd.md`
  - 原始字节 SHA-256：`536410e3648bb4f8b66519a7c4cf5b298ef14e2003ccb88acb359e41c1b1376a`

- **K61** · `MEMORY_VERSION` · [xm-ai-job 外部集成地图](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d1d46acfab0e4e32f38f1e69/versions/mv_63ba17e551406d01cfa864a7.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d1d46acfab0e4e32f38f1e69/versions/mv_63ba17e551406d01cfa864a7.md`
  - 原始字节 SHA-256：`9b916e933cbc740f167a5cd7c9c64fcbd159eb1e098622facebde8520a66d1f4`

- **K65** · `MEMORY_VERSION` · [xm-ai-job 学生支撑与互动模型](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_e078154ea65a25289ab5411c/versions/mv_451a4559c59705d1265c17d1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_e078154ea65a25289ab5411c/versions/mv_451a4559c59705d1265c17d1.md`
  - 原始字节 SHA-256：`8e5f330f305cb5b94bef327702c2165c1fef7900bada504ec889c241cc87dc03`

- **K67** · `MEMORY_VERSION` · [xm-ai-job 业务域架构](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_ed00c6fb95e0fe05409f0fd6/versions/mv_83e0ed5aef0acc29f5ba20c1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_ed00c6fb95e0fe05409f0fd6/versions/mv_83e0ed5aef0acc29f5ba20c1.md`
  - 原始字节 SHA-256：`e9894eedbbec96fa91239fed2ff5e427fa289b8a4e50f9137b623b6d28511956`

### 拟保留的当前内容草稿

#### 拟保留的判断

任务和岗位具有不同的生命周期与业务关系；不为了共享字段机械增加需求主实体，除非真实业务需要跨两者统一身份。student_info 是本地扩展，外部学生主数据仍由外部系统维护；本地扩展缺失与外部学生不存在不能等同。

外部系统拥有的品牌大使履约事实不能因为本地沿用普通参与人报名入口就变成本地权威。旧候选说明品牌大使报名后业务归外部系统，但当时入口仍复用普通参与人流程；该差异保留为历史边界，不迁成自动改造命令。

#### 历史与验证边界

K45/K61/K67 的类清单、Wrapper 清单和“企业端尚未实现”是当时的架构概览，易从代码恢复且已经漂移，不作为当前知识。这里只保留主数据与生命周期分工；本轮未核验所有岗位、品牌大使和学生外部接口，后续操作必须重新确认现状。

### 来源对照与整理说明

多份架构概览合并为权威边界；K04为未确认旧候选，不能继承为已验收实现。

### 用户决定

- 决定：KEEP
- 目标类型：DOCUMENT
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：任务、岗位与外部主数据保持各自权威边界
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

