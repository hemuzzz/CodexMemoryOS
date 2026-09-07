# 查询、同步与工程方法：M01 审核批次

> 2026-09-07；本文件是普通审核稿，尚非 Inbox 候选或正式 Asset。用户已完成批量内容决策；候选正式确认另绑定生成文件及Hash。

[返回审核总索引](../v4-knowledge-review.md)

旧来源项目主要为 xm-ai-job；建议目标为 WORKSPACE / xm-ai-job，本轮配置映射到用户提供的代码库。

各条正文中的历史判断与本次源码核验分开。未列当前代码证据的业务细节不代表已验证当前实现。原状态仅为历史参考；精确字节重复组均为单文件。来源别名只用于本次阅读，不是新系统字段。

## REV-0024：分页查询批量装配，缺失扩展值不伪造主数据

### 来源信息

- 审核编号：REV-0024
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

- **K14** · `MEMORY_VERSION` · [xm-ai-job 参与列表缺失学生档案经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_14f07a58c70ddf224b5f068d/versions/mv_7249ebf9798caf93d7e72d8e.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_14f07a58c70ddf224b5f068d/versions/mv_7249ebf9798caf93d7e72d8e.md`
  - 原始字节 SHA-256：`717e5a5c3dc0e15ab5f887bcb3e2b6bf156ef279d53941a4e5f7fc19489c1831`

- **K46** · `MEMORY_VERSION` · [xm-ai-job 运营端任务分页补齐](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_735eb1dcb01426e01895caca/versions/mv_b1dc0b17b1c0b96cb8b3876b.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_735eb1dcb01426e01895caca/versions/mv_b1dc0b17b1c0b96cb8b3876b.md`
  - 原始字节 SHA-256：`78eaf5effcad6ed8d50f3b9f88c7043aeac7c31ce025bd45e5151f6478d8e36b`

- **K68** · `MEMORY_VERSION` · [xm-ai-job 任务列表 N+1 收敛经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_f72f3d31569f88a02f55e246/versions/mv_c6e6f3c0c94bc558a851db07.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_f72f3d31569f88a02f55e246/versions/mv_c6e6f3c0c94bc558a851db07.md`
  - 原始字节 SHA-256：`08a3668989dc432b3f968eed9bac3e4695e3bd6e75f38319b49433f55a5cd7e6`

### 拟保留的当前内容草稿

#### 拟保留的判断

分页先取得当前页主键集合，再批量查询关联信息和分组计数并装配，避免每行重复查相同关系。总数和分组计数应与真实业务集合一致，不能因为性能优化漏掉审核中或某类参与人。

student_info 缺失时，允许对已明确可选的本地扩展字段采取约定默认值，例如历史 elite 数值默认 0；不据此伪造外部学生存在，也不将所有业务字段的 null 无条件转成 0。远程助理 unread 或审核字段为空，不足以证明该场景“无需审核”。

#### 原因与验证边界

批量装配降低随页大小线性增长的往返，默认值限定在可选展示扩展。K68 的当时索引已满足任务节点查询，是避免无依据加索引的实例；本轮没有运行执行计划，不能承诺当前索引与延迟。旧 SQL/类名仅供定位，不逐份迁入。

### 来源对照与整理说明

K46/K68近重复性能判断，K14补充空扩展边界；不保留历史性能数字。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：分页查询批量装配，缺失扩展值不伪造主数据
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0025：讨论统计与已读游标分别定义，游标只能单调推进

### 来源信息

- 审核编号：REV-0025
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

- **K71** · `MEMORY_VERSION` · [企业讨论物理 ID 与阅读游标统一 Integer 的边界演进](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_demand_discussion_read_cursor/versions/mv_20260831_merchant_demand_discussion_integer_cursor_v3.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_demand_discussion_read_cursor/versions/mv_20260831_merchant_demand_discussion_integer_cursor_v3.md`
  - 原始字节 SHA-256：`787cdeb83f6ac53efd9130e90515109532c8cd60ac2b801b5e5e559601a6c571`

- **K72** · `MEMORY_VERSION` · [企业需求统计与讨论阅读游标边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_demand_discussion_read_cursor/versions/mv_20260831_merchant_demand_discussion_read_cursor_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_demand_discussion_read_cursor/versions/mv_20260831_merchant_demand_discussion_read_cursor_v1.md`
  - 原始字节 SHA-256：`52190c684450f252cbecfd257e36e3381ef5c1ecb551e78e7a4ba6126f33c85a`

- **K73** · `MEMORY_VERSION` · [运营特殊租户与企业租户的任务讨论阅读边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_demand_discussion_read_cursor/versions/mv_20260903_task_publisher_shared_discussion_cursor_v4.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_merchant_demand_discussion_read_cursor/versions/mv_20260903_task_publisher_shared_discussion_cursor_v4.md`
  - 原始字节 SHA-256：`39de5e5b42d3f985df424188622f520853a665f6a4269997d92de0b588eed7fa`

- **K80** · `MEMORY_VERSION` · [企业需求统计与提问未读的唯一真相源](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_merchant_demand_count_and_unread_truth_sources/versions/mv_20260831_merchant_demand_draft_count_unread_watermark_v1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_xm_ai_job_merchant_demand_count_and_unread_truth_sources/versions/mv_20260831_merchant_demand_draft_count_unread_watermark_v1.md`
  - 原始字节 SHA-256：`733fcfed9d22e007d9d42762d78361e3f189ea8c60e7d597d7e560b8d44b565e`

### 拟保留的当前内容草稿

#### 拟保留的判断

草稿与已发布任务的讨论统计先确定各自真实来源，再按业务身份归属，不能为了复用查询把两类总数混在一起。任务已读游标是共享的当前最大已读 ID；更新须校验合法查看者并单调推进，避免旧页面请求覆盖更大的游标。影响行数为 0 要区分无变化和无权限/目标不存在，必要时回读，而非一律成功。

没有游标的首次查看可按既定分页处理；有游标后通过更大 ID 判断新增。特殊运营主体内可共享运营任务已读状态，但必须与企业任务保持创建者类型和归属隔离，不能因租户特殊而跨企业合并。

#### 类型演进与当前事实

K72/K80 的早期 Long 设计后改为 K71/K73 的 Integer 选择。当前 TaskDiscussion.id 与 Task.lastReadDiscussionId 为 Integer。MySQL unsigned 若超出有符号 Integer 范围仍有溢出风险；该旧取舍不证明数据永不会触顶，也不授权本轮改型。尚未核验全部 SQL 的 GREATEST 和权限分支，原则与当前字段事实分开记录。

### 来源对照与整理说明

两份统计/水位知识近重复；保留 Long→Integer 的后续选择与代价，不能按旧文重建Long。

### 本次定向源码核验

核验日期：2026-09-07；仅源码读取，未运行业务测试或真实资金操作。源码原始字节 Hash 绑定本次观察，不冒充历史提交证据。

- [TaskDiscussion.java:24](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-infrastructure/src/main/java/com/zdms/app/xm/job/infrastructure/db/entity/TaskDiscussion.java:24>)：当前讨论ID字段为Integer。
  - SHA-256：`6701d518c4472a191d9bfccb4fe207f4e427bc1a6bb510641cb2d08da54dc47d`

- [Task.java:178](</Users/hemu/Desktop/workSpace/xm-ai-job/xm-ai-job-infrastructure/src/main/java/com/zdms/app/xm/job/infrastructure/db/entity/Task.java:178>)：当前已读游标字段为Integer。
  - SHA-256：`e7d69c37ba3bf3e94e91e01a64b9f733786dca8502bb4d21b5126e0fc20b2133`

### 用户决定

- 决定：KEEP
- 目标类型：DOCUMENT
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：讨论统计与已读游标分别定义，游标只能单调推进
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0026：外部流水分页即处理，窗口重叠依靠唯一身份去重

### 来源信息

- 审核编号：REV-0026
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

- **K11** · `MEMORY_VERSION` · [xm-ai-job 外部流水同步分页去重经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_065dc4553af5f0be42f48449/versions/mv_be094cd5b5d1013155e18977.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_065dc4553af5f0be42f48449/versions/mv_be094cd5b5d1013155e18977.md`
  - 原始字节 SHA-256：`8703d179ecd81993d71ae03372a8125d56614df181fa9083a8cde487b1f7401c`

- **K49** · `MEMORY_VERSION` · [xm-ai-job 学生外部资金流水同步](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_86d6c7d5bda10193e5a3317e/versions/mv_1794653e8c45caf839bc1f75.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_86d6c7d5bda10193e5a3317e/versions/mv_1794653e8c45caf839bc1f75.md`
  - 原始字节 SHA-256：`9a04ce4dbf5dda51676848754e29e51e2f3fe9bba2f8762d8540883cf46fc14a`

- **K66** · `MEMORY_VERSION` · [xm-ai-job 外部流水分页窗口决策](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_e256d806f5fc8c717ef59a01/versions/mv_28b79096853f97e1dff667a8.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_e256d806f5fc8c717ef59a01/versions/mv_28b79096853f97e1dff667a8.md`
  - 原始字节 SHA-256：`90af28100b54d06504722e33ee818f28932531ae3613e95be53aa3cb5e74dc65`

- **K17** · `MEMORY_VERSION` · [xm-ai-job 财务查询时间偏移经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_199fa7ff7f000c8fd780aad7/versions/mv_8683de9201150b4d7c7fcce7.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_199fa7ff7f000c8fd780aad7/versions/mv_8683de9201150b4d7c7fcce7.md`
  - 原始字节 SHA-256：`405c0a1020cd3197a6f1f56e70d93b57bb5c5ed7c8d0050598e3e1ddba794e72`

### 拟保留的当前内容草稿

#### 拟保留的判断

同步外部资金流水时逐页读取并处理，不把全部页面积压到内存后统一落库。跨页和跨次重叠依靠外部 finance_stream_id 的本地唯一约束/幂等写入消除，窗口重叠只缓冲迟到数据，不替代去重。

窗口计算明确业务时区，上海自然日等边界不能依赖服务器默认时区；LocalDateTime 转 Date 时显式选择 Asia/Shanghai。分页结束按接口真实 hasNext/total 契约判断，不能凭当前页不足某个猜测数量就提前截断。

#### 操作与验证边界

历史回看120分钟、安全延迟5分钟、每页200条是旧配置实例，需核验现行客户端与调度配置后才能执行。Nacos/XXL-JOB 中的示例参数不是生产配置事实。本轮未查询外部流水或运行同步；唯一约束是否部署、迟到上界及数据库时区都需要真实环境证据。

### 来源对照与整理说明

K11/K49/K66同主题的分页、重叠与幂等；K17补充时间转换条件，不保存演示配置为现行值。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：外部流水分页即处理，窗口重叠依靠唯一身份去重
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0027：批处理逐项隔离故障，提交后通知保留配置边界

### 来源信息

- 审核编号：REV-0027
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

- **K52** · `MEMORY_VERSION` · [xm-ai-job 调度任务与配置](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_92259c79ef06c34f3f9f91b9/versions/mv_eeeb84d25f3ea60f7442ad74.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_92259c79ef06c34f3f9f91b9/versions/mv_eeeb84d25f3ea60f7442ad74.md`
  - 原始字节 SHA-256：`dd94f306bd2f5716f111dce5707baeeba3410db881263c1ff916468c8808e64d`

- **K55** · `MEMORY_VERSION` · [xm-ai-job 学生任务通知投递](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_a8e175b8bbe9bbca605df2d9/versions/mv_0966aeabe45c1d906c530385.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_a8e175b8bbe9bbca605df2d9/versions/mv_0966aeabe45c1d906c530385.md`
  - 原始字节 SHA-256：`fba7ea8123b172d151f662c4e58a97b2403e25de82034ca2270c64eb6bfab9c2`

- **K59** · `MEMORY_VERSION` · [xm-ai-job 报名截止部分失败经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_c2e657aecc83cc50921ccbe8/versions/mv_a2de7eea4ddd4d35887df9ac.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_c2e657aecc83cc50921ccbe8/versions/mv_a2de7eea4ddd4d35887df9ac.md`
  - 原始字节 SHA-256：`63f4344f3c4bd688c612816bf3a722cb5d981c98c9039f678b06ef26d3bbe867`

- **K62** · `MEMORY_VERSION` · [xm-ai-job 调度部分失败隔离规则](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d31670d672c1f3ad375fbb20/versions/mv_56c0d2fbfba198d504d6b336.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d31670d672c1f3ad375fbb20/versions/mv_56c0d2fbfba198d504d6b336.md`
  - 原始字节 SHA-256：`ecdc07fc1ab09f52fb105852deb6318762b1c25bd12447ab3e2439b6612516dc`

### 拟保留的当前内容草稿

#### 拟保留的判断

已按单个业务对象隔离事务、且其他对象可安全独立执行的批任务，应记录失败项并继续，避免一个重复失败对象阻断整个批次。应用服务若已返回失败 ID 集合，Job Handler 不应无条件再把整批抛成失败，制造全部重试；但批级基础设施失败或共享不变量破坏仍应失败，不一概吞异常。

业务通知在事务提交后触发，避免回滚事务却已向外通知成功。通知投递是否重试、失败是否影响任务结果按具体链决定，不能用此原则推翻日报的明确 best-effort 约定。

#### 验证边界

K52 的 Job/Handler 数量、K55 的模板和配置样例只描述历史实现，不迁作当前部署清单。应用本地声明、配置中心生效、外部消息成功是不同证据。本轮不运行任务、加载远程配置或发送通知。

### 来源对照与整理说明

K59/K62近重复；K52/K55仅补充调度和配置验证边界，具体表格不迁。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：批处理逐项隔离故障，提交后通知保留配置边界
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0028：数据库真实结构优先于脚本和执行口述

### 来源信息

- 审核编号：REV-0028
- Workspace 聚类：xm-ai-job
- 建议目标类型：MEMORY
- Codex 建议：KEEP
- Codex 建议理由：提取可独立复用的判断，合并来源重叠并显式保留演进和验证边界。
- 原状态参考：只描述旧时点，不继承为本次确认。
- Exact Hash 重复来源：无；下列每份文件均有不同原字节 Hash。
- 冲突或待核实差异：见完整草稿与来源对照；未核验的现状明确保留边界。
- 可拆分内容：已按独立判断拆分；同一来源可对应多个审核项。

- 与其他审核项的互补关系：REV-0001

来源原件（仓库外，仅只读引用）：

- **K09** · `MEMORY_VERSION` · [xm-ai-job 数据结构变更核验规则](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_05fcb825f5716abfc47310d5/versions/mv_16f149a716bc51cf216f0b2a.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_05fcb825f5716abfc47310d5/versions/mv_16f149a716bc51cf216f0b2a.md`
  - 原始字节 SHA-256：`08aafd98fadd18935509cfdd39c727b884ec0b1171b387749832657dc9af971a`

- **K34** · `MEMORY_VERSION` · [企业资金第一阶段实现后的恢复与发布边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_phase1_recovery_boundaries_20260816.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_phase1_recovery_boundaries_20260816.md`
  - 原始字节 SHA-256：`2cdbf7432b51f03fbeb2a0ecad09d776d1dc63aa824fc5f0a2b7ae8f22e35db8`

- **K37** · `MEMORY_VERSION` · [迭代 2.2 SQL 执行后的数据库门禁演进](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_sql_executed_20260817.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_sql_executed_20260817.md`
  - 原始字节 SHA-256：`41b7b91e20f54ea55ef5ab07e6ae0a74bcb2ab201fdaae34e64b9e2d1d81ec89`

### 拟保留的当前内容草稿

#### 拟保留的判断

判断目标库是否具备字段、索引和约束，应查看目标环境的真实结构与必要数据；仓库 DDL、兼容开关或“已执行”口述只能证明各自范围。一次性 SQL 不能因为缺少验收截图再次串行执行全部历史脚本，必须先核验当前结构并只处理实际缺口。

涉及软删除的唯一性，需同时检查约束列与业务查询/恢复路径，不把逻辑删除自动当作可复用唯一键。数据回填成功也不等同于应用契约或外部联调通过。

#### 历史证据

K37 记载某次 SQL 已执行是用户确认，但当时仍缺执行后结构和数据验证；不把该日期状态写成今天的发布结论。K34 的 schema flag 不承担数据库兼容转换。迁移审核不连接数据库、不重跑 DDL，具体部署核验仍需目标库证据。

### 来源对照与整理说明

三个来源互补证据层次；保留不可重复执行的原因，移除旧发布阻断清单。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：数据库真实结构优先于脚本和执行口述
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0029：单实现外部调用复用 Wrapper，不机械增加 Gateway

### 来源信息

- 审核编号：REV-0029
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

- **K13** · `MEMORY_VERSION` · [xm-ai-job 分层边界](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_082bc9c4e62770e986dfe473/versions/mv_fece63261aca804ca07ee3b3.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_082bc9c4e62770e986dfe473/versions/mv_fece63261aca804ca07ee3b3.md`
  - 原始字节 SHA-256：`87787894484ec765aea800cebac4490ff2828a2d26e82313717d34cb2a1f4ab6`

- **K28** · `MEMORY_VERSION` · [application 直接调用 infrastructure Wrapper 的边界演进](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_direct_wrapper_20260817.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_33704096e119b2f6c4678e86/versions/mv_fund_architecture_direct_wrapper_20260817.md`
  - 原始字节 SHA-256：`2313987c55eb77f7e4573132e9083f5ac35d5568409538b1d831316ae314564a`

- **K44** · `MEMORY_VERSION` · [xm-ai-job 架构概览](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_656638278f4b53697a8ca918/versions/mv_57fdd5ce38ff7374945483a6.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_656638278f4b53697a8ca918/versions/mv_57fdd5ce38ff7374945483a6.md`
  - 原始字节 SHA-256：`bbae657895f3a52d93ed167d7e7a7af3d1c0e985ad323201eccc2f20cd5ad85c`

- **K51** · `MEMORY_VERSION` · [xm-ai-job 模块结构](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_8c719807bc009bf7c5803791/versions/mv_bea03891b3726e7ee8422179.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_8c719807bc009bf7c5803791/versions/mv_bea03891b3726e7ee8422179.md`
  - 原始字节 SHA-256：`75e46a874d8adde1a8f5c9a2b0d355f5037e124f7496d68b7bb9da69a09a7094`

### 拟保留的当前内容草稿

#### 拟保留的判断

在现有 app/biz/infra 职责内复用实际 Wrapper：应用层编排用例，业务层承载领域规则，基础设施封装外部协议。只有一个稳定实现时，不为一次调用增加仅透传的 Gateway 接口及实现；多实现切换、独立契约或真实隔离需求出现时再评估抽象。

#### 取舍与现状

少一层转发降低定位和维护成本，同时保留外部协议不扩散的边界。不是所有调用都应穿过同样数量的层，也不是禁止未来出现 Gateway。旧概览的模块数量和“AGENTS 未包含 merchant”已过时；当前项目规则和源码应作为导航，本轮不重写其架构。

#### 验证边界

该条保留旧明确取舍，当前 AGENTS 已包括 merchant 并延续不新增 biz.gateway 的约定。具体受影响入口仍需按当前调用链核验，不把旧全模块地图复制为长期知识。

### 来源对照与整理说明

K13/K28为原因，K44/K51为可恢复概览；只留前者的约束与后者漂移提醒。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：单实现外部调用复用 Wrapper，不机械增加 Gateway
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

## REV-0030：依赖声明支持某枚举，不等于 DTO 和调用链可用

### 来源信息

- 审核编号：REV-0030
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

- **K64** · `MEMORY_VERSION` · [xm-ai-job 自定义表单文档字段限制经验](</Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d653247a63c1f754bd7cdba2/versions/mv_df38dfb14d8fca566be8aed1.md>)
  - 路径：`/Users/hemu/Desktop/github/obsidian-notes/Memory/xm-ai-job/mem_d653247a63c1f754bd7cdba2/versions/mv_df38dfb14d8fca566be8aed1.md`
  - 原始字节 SHA-256：`501a5f91d90732d8b44864009198c917568c17edaef2bc16f87937279da5e31f`

### 拟保留的当前内容草稿

#### 拟保留的判断

接入第三方/内部组件新字段时，要用当前解析到的依赖版本验证枚举、DTO、序列化和实际调用入口。文档或枚举已列出一个字段，不证明当前 SDK 的请求对象能够携带它，也不证明服务端已支持。

#### 验证步骤

确认实际依赖解析版本；读取对应 DTO/方法签名；构造最小编译检查与序列化样例；必要时再核验目标环境契约。不要仅为绕过缺失字段引入反射或自行拼接未知协议。

#### 历史边界

来源曾在 foundation-custom-form 4.0.3 上观察到枚举值与 DTO 能力不一致，旧版本和具体缺失字段只作历史示例。本轮未解析当前依赖、未运行 Maven；不将旧不支持结论当作当前库限制。

### 来源对照与整理说明

独立失败机制，可从旧版本个案提炼；保留验证层次。

### 用户决定

- 决定：KEEP
- 目标类型：MEMORY
- 目标 Scope：WORKSPACE
- 目标 Workspace：xm-ai-job
- 目标标题：依赖声明支持某枚举，不等于 DTO 和调用链可用
- 合并到：无
- 改写要求：冲突以当前源码为准；保留生产/运行证据的未验证边界。
- 补充说明：2026-09-07，用户已接受xm-ai-job全部审核内容；冲突按当前源码修订。 这是M02内容决策，不冒充生成后文件Hash的M04确认。

