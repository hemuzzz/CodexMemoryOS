# 业务演进与设计参考：M01 审核批次

> 2026-09-07；本文件是普通审核稿，尚非 Inbox 候选或正式 Asset。用户已完成批量内容决策；候选正式确认另绑定生成文件及Hash。

[返回审核总索引](../v4-knowledge-review.md)

旧来源项目主要为 xm-ai-job；建议目标为 WORKSPACE / xm-ai-job，本轮配置映射到用户提供的代码库。

各条正文中的历史判断与本次源码核验分开。未列当前代码证据的业务细节不代表已验证当前实现。原状态仅为历史参考；精确字节重复组均为单文件。来源别名只用于本次阅读，不是新系统字段。

## REV-0031：运营远程助理与已撤回的企业远程助理分开

### 来源信息

- 审核编号：REV-0031
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

- **K03** · `CANDIDATE` · [xm-ai-job 远程助理周期验收与结算边界](</Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_87821e44bfd2bc8ef98953e6.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory-Candidates/xm-ai-job/candidate_87821e44bfd2bc8ef98953e6.md`
  - 原始字节 SHA-256：`29e2e64c0852c5a4006fcf47f7dbb301278866bd178e09d6d03ca39a3b42853d`

- **K74** · `MEMORY_VERSION` · [企业远程助理 V1 的场景隔离与版本演进边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_remote_assistant_v1_model/versions/mv_20260818_merchant_remote_assistant_v1_model.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_remote_assistant_v1_model/versions/mv_20260818_merchant_remote_assistant_v1_model.md`
  - 原始字节 SHA-256：`a117e527510904937189e39898dadbcb22f09970b02a035fbc8e1edfd7e55119`

- **K75** · `MEMORY_VERSION` · [企业远程助理整体移出迭代 2.2](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_remote_assistant_v1_model/versions/mv_20260826_merchant_remote_assistant_removed_from_iteration_2_2.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_remote_assistant_v1_model/versions/mv_20260826_merchant_remote_assistant_removed_from_iteration_2_2.md`
  - 原始字节 SHA-256：`bd5b42620ec73cb71ab4f0873053228b2d69237bc2cfcb9f59ecda6d03dc34ac`

- **D30** · `DOCUMENT` · [Candidate Draft — 企业远程助理范围决策时间语义修正](</Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/candidate-merchant-remote-assistant-time-correction.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/docs/engineering-memory-v4-phase4-6/candidate-merchant-remote-assistant-time-correction.md`
  - 原始字节 SHA-256：`35b5b478713a18ff264fb43a2cac69d7f444047d0173be549b5d18861d25ac43`

### 拟保留的当前内容草稿

#### 拟保留的判断

OPERATOR 远程助理的周期结算和特殊去重规则有独立适用范围，不套入 MERCHANT 单次/日结参与人结算。企业远程助理曾计划新增场景并限制为 MERCHANT、发布类型2、任务类型2、版本1；之后在迭代2.2范围中撤回，不应把早期设计迁成当前已支持能力。

当前 TaskSceneEnum 包含 REMOTE_ASSISTANT，但没有 MERCHANT_REMOTE_ASSISTANT；本轮在相关 main 源码中也未找到后者。该核验只支持“早期企业专用场景不在当前实现”，不代表未来永久禁止重新设计。

#### 时间与来源

D30 指出撤回事件正文为8月26日，而旧元数据 created_at 为8月18日。事件时间、记录时间和迁移核验时间不同，不能按 created_at 简单选最新覆盖。K03 是旧候选，运营周期协议尚未在本轮逐入口核验，不能替其补造验收。

### 来源对照与整理说明

K74→K75是方向撤回；D30修正时序；K03明确另一个业务域，不混成同一删除范围。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [TaskSceneEnum.java:20](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-biz/src/main/java/com/zdms/app/xm/job/biz/enums/task/TaskSceneEnum.java:20>)：当前存在运营远程助理枚举，没有企业专用场景。
  - SHA-256：`545a473e2c54884fb811134179e858c47588d9bccd3e143e2ae7377c1a1788a3`

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：运营远程助理与已撤回的企业远程助理分开
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0032：老企业免费会员只以明确白名单为准

### 来源信息

- 审核编号：REV-0032
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

- **K76** · `MEMORY_VERSION` · [老客福利免费会员仅按企业白名单准入](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_old_customer_benefit_eligibility/versions/mv_20260902_whitelist_only.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_old_customer_benefit_eligibility/versions/mv_20260902_whitelist_only.md`
  - 原始字节 SHA-256：`ff8053cfe8b1c93414970d7cd791a2bf8506e6c167c35edf78fc3b00b279f2ed`

### 拟保留的当前内容草稿

#### 拟保留的判断

历史决定将老企业免费会员资格限制在明确白名单，不叠加模糊“老用户”条件，也不擅自用 AND/OR 拼接扩大或缩小资格。移出白名单意味着不再按该入口新授予，不能自动撤销已经发放的历史会员。

#### 原因与边界

资格入口与既得会员状态分别管理，避免维护名单时产生隐式撤权。此处保留旧业务决定；本轮未读取当前会员全部入口和名单配置，名单内容及已发放数据不复制入库。若要改变既得权益，需新的明确业务决定及数据影响核验。

### 来源对照与整理说明

单一业务决定，适用范围清晰；当前配置未核验。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：老企业免费会员只以明确白名单为准
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0033：参与工作以发生事实计数，缺失历史事实不按状态猜补

### 来源信息

- 审核编号：REV-0033
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

- **K85** · `MEMORY_VERSION` · [学生指定任务场景参与判定](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_public_dubbo_contract_boundary/versions/mv_20260831_student_scene_participation_semantics_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_public_dubbo_contract_boundary/versions/mv_20260831_student_scene_participation_semantics_v1.md`
  - 原始字节 SHA-256：`56964302e5818d3f7a57eb6b73aba425304f0e783f5888cc3fe501394884abb7`

### 拟保留的当前内容草稿

#### 拟保留的判断

“曾参与工作”以 work_start_time 等明确发生事实为准；一旦开始，后续成功、终止或放弃不抹掉已参与事实。只统计当前成功状态会漏掉真实开始后终止的人员。

缺失历史开始标记不能未经授权按当前状态推断补齐；旧数据不完备应暴露口径限制。需求类型与 taskScene 是不同维度，筛选参数应沿实际入口和查询核验，不能按命名相似直接互换。

#### 验证边界

该条保留旧统计口径理由；本轮未核验所有参与统计 SQL、历史回填覆盖和 taskScene 参数链，不宣称当前统计准确率或生产已修复。

### 来源对照与整理说明

保留不可从字段名恢复的口径与回填边界，删除单次改动清单。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：参与工作以发生事实计数，缺失历史事实不按状态猜补
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0034：对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始

### 来源信息

- 审核编号：REV-0034
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

- **K86** · `MEMORY_VERSION` · [xm-ai-job 对外 Dubbo 契约与单一 Provider 边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_public_dubbo_contract_boundary/versions/mv_20260831_xm_ai_job_public_dubbo_contract_boundary_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_public_dubbo_contract_boundary/versions/mv_20260831_xm_ai_job_public_dubbo_contract_boundary_v1.md`
  - 原始字节 SHA-256：`77bc78d30bbe2f6ee7c4beb81104a546796bbd44b6c2eaaf9dc5433e5aa8f83a`

### 拟保留的当前内容草稿

#### 拟保留的设计方向

需要暴露公共 Dubbo 能力时，先定义调用方必须知道的最小 client 契约，通过明确 Provider 入口调用现有应用服务；不将整个 app 依赖传给客户端，也不扩大组件扫描到多个应用入口。无需 HTTP 上下文的 RPC 不依赖 WebContext。

#### 取舍与验证边界

最小依赖减少内部实现泄露、启动冲突和循环依赖。但这是一份旧计划，本轮未证实已实施；不能把拟议模块、扫描设置或 RPC 测试写成现行运行方式。后续若有实际调用需求，应先核验当前工程和注册中心约束。没有现时需求时，不为迁移额外生成模块、Provider 或测试。

### 来源对照与整理说明

来源明确尚在方案阶段，保留为 DOCUMENT 设计参考，不升级为已落地MEMORY或可执行Skill。

### 用户决定

- 决定：KEEP
- 目标类型：DOCUMENT
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

