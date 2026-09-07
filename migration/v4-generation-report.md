# 旧知识迁移结果报告

2026-09-07 · M00～M05 已完成；各阶段验证边界见下文。

共44项：40份候选（xm-ai-job 34，CodexMemoryOS 6），4项不迁入。正式确认40份。无覆盖、无旧ID/Usage迁移、旧源保留。

[审核总索引](v4-knowledge-review.md) · [逐源最终处置与双向引用](v4-source-inventory.json)

## 本次内容决策

用户接受全部xm-ai-job内容并要求冲突从当前源码；06/07按当前项目用途筛选。比例改为百分数除100，提现请求最低额改为当前统一2.03元，开票窗口记录当前每月21～27日。本次新增xm-ai-job Workspace映射到用户提供的仓库；不改变当前Task所属Workspace。

## 已确认正式Asset清单

用户已明确选择“接受清单中的全部候选入库”。确认前清单原始Hash为 `0105e061f1e402f8d36990d78415ff12f171dc3caad135eecb3f0813431eae5d`；40份内容Hash逐份复核后，依次调用现行单文件asset:confirm，全部退出0且ok=true。下面链接现指向正式原件，原始内容Hash保持不变。

### REV-0001 · xm-ai-job · 企业资金权威边界与稳定请求身份

- M02决定：KEEP；类型：MEMORY
- 正式原件：[企业资金权威边界与稳定请求身份](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/企业资金权威边界与稳定请求身份.md>)
- Asset ID：`ast301043636955143260534881894583770673343624692752690320061`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/企业资金权威边界与稳定请求身份.md`
- 原始字节SHA-256：`8de35b466839001f97c74b5eb65b3ebe38b3bde67cc50577c8721372d7fd90fa`
- 核心判断：资金中台拥有真实充值、结算、提现、外部余额和发票事实；xm-ai-job 拥有任务预算、业务预约、本地过程单和本地记账。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0002 · xm-ai-job · 任务结算按参与人生成子单与本地聚合

- M02决定：KEEP；类型：MEMORY
- 正式原件：[任务结算按参与人生成子单与本地聚合](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/任务结算按参与人生成子单与本地聚合.md>)
- Asset ID：`ast301043636955143260996184473573054312928956874691043277669`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/任务结算按参与人生成子单与本地聚合.md`
- 原始字节SHA-256：`9dcb39b7c90baf41224f3161ed59fe18a093d2fe09529cacf20cae2bdc552506`
- 核心判断：MERCHANT 单次/日结任务的结算主单固定任务身份，参与人验收事件在同一本地事务固化不可变金额快照，创建学生尾款 Child 和一张企业参与人 Child。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0003 · xm-ai-job · 预付比例统一使用百分数并除以100

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[预付比例统一使用百分数并除以100](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/预付比例统一使用百分数并除以100.md>)
- Asset ID：`ast301043636955143261327345120972237946901141066293860822056`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/预付比例统一使用百分数并除以100.md`
- 原始字节SHA-256：`a5670d719fce7d1199587371750bc260fdace970daa9f9429e4f7b97fddf368b`
- 核心判断：当前运营与企业预付统一使用百分数口径：`0 <= ratio < 100`，金额为 `基础奖励 × ratio ÷ 100`，保留两位小数，HALF_UP。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0004 · xm-ai-job · 企业参与人结算：响应归属是门禁，余额只是观测

- M02决定：KEEP；类型：MEMORY
- 正式原件：[企业参与人结算：响应归属是门禁，余额只是观测](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/企业参与人结算：响应归属是门禁，余额只是观测.md>)
- Asset ID：`ast301043636955143261583587748727069094417358626116215453880`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/企业参与人结算：响应归属是门禁，余额只是观测.md`
- 原始字节SHA-256：`b1080b282f9f6a1b2d139129d7504fb13746ec47e7c4c96aeeda19b4a12e9c94`
- 核心判断：当前 doSettle 被应用层作为同步终态处理。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0005 · xm-ai-job · 企业首次审核资金预约按审核轮次闭合

- M02决定：KEEP；类型：MEMORY
- 正式原件：[企业首次审核资金预约按审核轮次闭合](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/企业首次审核资金预约按审核轮次闭合.md>)
- Asset ID：`ast301043636955143261986583410519931932782621466489340593229`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/企业首次审核资金预约按审核轮次闭合.md`
- 原始字节SHA-256：`04de682a16e614d90bce4a7994573f1eb01a385bbddc86f2f016fdd0b434c0f4`
- 核心判断：企业首次发布提交时保存隐藏 Task、冻结 FUND 并创建 INITIAL_PUBLISH 审核单，以 auditId 作为该轮 FREEZE 的 biz_no，并记录 freeze_biz_no。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0006 · xm-ai-job · 预付开关的入口权威与任务快照

- M02决定：KEEP；类型：MEMORY
- 正式原件：[预付开关的入口权威与任务快照](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/预付开关的入口权威与任务快照.md>)
- Asset ID：`ast301043636955143262104400007714308788077946110609371487665`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/预付开关的入口权威与任务快照.md`
- 原始字节SHA-256：`ecd6ec7eeccd9f8bc2ae37d60604074cf7dff72b97e9e841ba856f38b265a5f2`
- 核心判断：预付只在真正进入开工路径时判断和触发，不在展示、查询或发布时补发。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0007 · xm-ai-job · 资金账套路由不能由入口渠道替代

- M02决定：KEEP；类型：MEMORY
- 正式原件：[资金账套路由不能由入口渠道替代](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/资金账套路由不能由入口渠道替代.md>)
- Asset ID：`ast301043636955143262502588636249454351197571315181033413916`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/资金账套路由不能由入口渠道替代.md`
- 原始字节SHA-256：`680c0c101d1b2615fe1fc250af641c1389bc5a7a8f403b25dfcc73bc352032dd`
- 核心判断：任务资金链先通过 task.customer_id 找到客户，再以 customer.customer_source 判定 OPERATOR 或 MERCHANT。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0008 · xm-ai-job · 学生资金 MQ：先抢占发送权，SENT 不代表到账

- M02决定：KEEP；类型：MEMORY
- 正式原件：[学生资金 MQ：先抢占发送权，SENT 不代表到账](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/学生资金 MQ：先抢占发送权，SENT 不代表到账.md>)
- Asset ID：`ast301043636955143262794406950653414391354135131820382173054`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/学生资金 MQ：先抢占发送权，SENT 不代表到账.md`
- 原始字节SHA-256：`6644273d1f32776113ef7188164d509d779005597d7407817716bfe5c4c7933a`
- 核心判断：学生资金发放在业务事务提交后进入统一发送服务，由新事务 CAS 抢占发送权，仅胜出者调用 producer。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0009 · xm-ai-job · 未知外部结果、强关联与人工动作边界

- M02决定：KEEP；类型：MEMORY
- 正式原件：[未知外部结果、强关联与人工动作边界](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/未知外部结果、强关联与人工动作边界.md>)
- Asset ID：`ast301043636955143263258067166122755036805409100341632626997`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/未知外部结果、强关联与人工动作边界.md`
- 原始字节SHA-256：`0c4726b45b2f6fca400901b94998e4343745a06db35899e509fda3481faf47f4`
- 核心判断：缺单号、空结果和超时只是本地观测缺失，不能推出中台未受理。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0010 · xm-ai-job · 人工资金恢复按业务模式分派，避免策略类机械膨胀

- M02决定：KEEP；类型：MEMORY
- 正式原件：[人工资金恢复按业务模式分派，避免策略类机械膨胀](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/人工资金恢复按业务模式分派，避免策略类机械膨胀.md>)
- Asset ID：`ast301043636955143263565978675744295448380626246088760197298`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/人工资金恢复按业务模式分派，避免策略类机械膨胀.md`
- 原始字节SHA-256：`9ac01e49cb0e1fc5f3bdc2013f6d146048a5f456d5f5e0310c9a54ae361f5407`
- 核心判断：人工批量入口按 bizType + action 选择唯一模式执行器，再由执行器声明 bizIds 或 bindings 参数形态；模式合法性和执行选择应集中，批量层不散落资金动作分支。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0011 · xm-ai-job · 生产告警后只读定位与显式人工隔离

- M02决定：KEEP；类型：MEMORY
- 正式原件：[生产告警后只读定位与显式人工隔离](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/生产告警后只读定位与显式人工隔离.md>)
- Asset ID：`ast301043636955143264023289240433135685212153639071880748076`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/生产告警后只读定位与显式人工隔离.md`
- 原始字节SHA-256：`7d013dfbb0270a39b20910a98e1244aff8d89ed1cd64c9762777b9d583c4b2ab`
- 核心判断：异常告警只提供调查入口，不能证明外部未受理或授权资金恢复。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0012 · xm-ai-job · 企业充值的强关联、支付编码与保守终态

- M02决定：KEEP；类型：MEMORY
- 正式原件：[企业充值的强关联、支付编码与保守终态](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/企业充值的强关联、支付编码与保守终态.md>)
- Asset ID：`ast301043636955143264298402952263427145622299094866201215852`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/企业充值的强关联、支付编码与保守终态.md`
- 原始字节SHA-256：`529742b41fec6a0325698b142bf2903ad6d2451b1f09d6d42f21979771a296e9`
- 核心判断：充值 Query 与支付 MQ 复用同一结果服务，在一次事务内应用订单终态、会员权益/FUND 入账和流水。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0013 · xm-ai-job · 提现先冻结，强关联查询与预计费用分离

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[提现先冻结，强关联查询与预计费用分离](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/提现先冻结，强关联查询与预计费用分离.md>)
- Asset ID：`ast301043636955143264656246696262832854338056419327989474767`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/提现先冻结，强关联查询与预计费用分离.md`
- 原始字节SHA-256：`bbaafecbf7d8dcc5c94caff0ae4fe9fd1ecb2f43af63176f1f1be3ac89aeadca`
- 核心判断：提现先在本地冻结请求总额并创建资金单，再以稳定本地订单身份提交。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0014 · xm-ai-job · 开票外部页面拥有最终事实，本地保存提交审计

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[开票外部页面拥有最终事实，本地保存提交审计](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/开票外部页面拥有最终事实，本地保存提交审计.md>)
- Asset ID：`ast301043636955143264920720032034927676697154755050494201882`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/开票外部页面拥有最终事实，本地保存提交审计.md`
- 原始字节SHA-256：`dfae041428ff485bd7f7af53945550d28c7dea23558461545cf58f28ee060e7a`
- 核心判断：待开票订单与发票最终结果由资金中台提供；pageInvoiceOrder/pageInvoice 展示外部事实，本地 customer_invoice_application 只记提交审计、稳定请求身份、脱敏快照和同步受理结果，不维护另一套最终发票状态。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0015 · xm-ai-job · 企业余额核对采用单次全量观测，不自动归因或调账

- M02决定：KEEP；类型：MEMORY
- 正式原件：[企业余额核对采用单次全量观测，不自动归因或调账](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/企业余额核对采用单次全量观测，不自动归因或调账.md>)
- Asset ID：`ast301043636955143265223748442945914932651147395046732141126`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/企业余额核对采用单次全量观测，不自动归因或调账.md`
- 原始字节SHA-256：`1575556806997576756ac1db93b4b388270c34e81763d46226119dc0fbf41a92`
- 核心判断：余额核对扫描普通 MERCHANT FUND 账户，排除无中台企业钱包的固定平台内部账户。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0016 · xm-ai-job · 日报以完整数据库留痕为成功边界

- M02决定：KEEP；类型：MEMORY
- 正式原件：[日报以完整数据库留痕为成功边界](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/日报以完整数据库留痕为成功边界.md>)
- Asset ID：`ast301043636955143265724181953015531609700622991324754405491`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/日报以完整数据库留痕为成功边界.md`
- 原始字节SHA-256：`65eb39aaa8cbffc0f73d09d77211ba3b60a3d683e35aac29f44785e3dfe7e19d`
- 核心判断：用工指标只生成触发日的上海时区 T-1 自然日报，窗口左闭右开；不支持历史日期、单企业或周月报 JobParam。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0017 · xm-ai-job · 学生预付违约按周期累积，回收不跨周期结转

- M02决定：KEEP；类型：MEMORY
- 正式原件：[学生预付违约按周期累积，回收不跨周期结转](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/学生预付违约按周期累积，回收不跨周期结转.md>)
- Asset ID：`ast301043636955143266063154452364336489465387853909098232729`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/学生预付违约按周期累积，回收不跨周期结转.md`
- 原始字节SHA-256：`a73c9d3092d484691307c19c9a7cb86c2bed02b3b82dd94826e213c8e5cac53f`
- 核心判断：诊断“未生成预付单”应先检查资格与风控门禁，再看发送链。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0018 · xm-ai-job · 任务关闭、参与人结束与资金收口是不同事实

- M02决定：KEEP；类型：MEMORY
- 正式原件：[任务关闭、参与人结束与资金收口是不同事实](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/任务关闭、参与人结束与资金收口是不同事实.md>)
- Asset ID：`ast301043636955143266435454682979325817089182611550635841040`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/任务关闭、参与人结束与资金收口是不同事实.md`
- 原始字节SHA-256：`f86bbfa0a06cd697b41226381d5492fff1b647d5f427ff42592b8702726405b4`
- 核心判断：任务招募生命周期、参与人的工作生命周期、资金单终态分别建模。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0019 · xm-ai-job · 参与人当前态与每次尝试快照分离

- M02决定：KEEP；类型：MEMORY
- 正式原件：[参与人当前态与每次尝试快照分离](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/参与人当前态与每次尝试快照分离.md>)
- Asset ID：`ast301043636955143266496607610047645033015192872460017737209`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/参与人当前态与每次尝试快照分离.md`
- 原始字节SHA-256：`a04801fde54a5b51129bbbaf47c385402942e7e8d8a0c1c0003b3fdee0b1e484`
- 核心判断：参与人表用于当前关系和状态；报名、工作、交付的多次尝试通过独立历史记录保存。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0020 · xm-ai-job · 报名审核状态由当次流程决定

- M02决定：KEEP；类型：MEMORY
- 正式原件：[报名审核状态由当次流程决定](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/报名审核状态由当次流程决定.md>)
- Asset ID：`ast301043636955143266881256635768171712176875959932182178006`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/报名审核状态由当次流程决定.md`
- 原始字节SHA-256：`d9c2303956f7b95b834bf543ee579bac96d37251498e6770f078d2a96bac40d1`
- 核心判断：报名是否处于 AUDITING 应由当次报名流程与真实审核事实决定，不能事后仅凭任务“需要审核”开关推导所有参与人状态。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0021 · xm-ai-job · 场景与版本标识 JSON 协议，读取降级须按调用方区分

- M02决定：KEEP；类型：MEMORY
- 正式原件：[场景与版本标识 JSON 协议，读取降级须按调用方区分](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/场景与版本标识 JSON 协议，读取降级须按调用方区分.md>)
- Asset ID：`ast301043636955143267433818077141344799061665696566244440991`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/场景与版本标识 JSON 协议，读取降级须按调用方区分.md`
- 原始字节SHA-256：`9e8fb0db8a0c098139b8f5f01fddd05a22164c8aeccb16a6baeed23b5ec0709f`
- 核心判断：任务关系复用统一模型，场景与版本说明 reward_json、content_json 的解释协议。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0022 · xm-ai-job · 局部修改 JSON 应保留未修改字段，并验证真正落库

- M02决定：KEEP；类型：MEMORY
- 正式原件：[局部修改 JSON 应保留未修改字段，并验证真正落库](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/局部修改 JSON 应保留未修改字段，并验证真正落库.md>)
- Asset ID：`ast301043636955143267588452692950754237643343057724680475032`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/局部修改 JSON 应保留未修改字段，并验证真正落库.md`
- 原始字节SHA-256：`cbda79a17a8466954d166422987b3832d8ed1f534733e916e927bbe756e1d1e1`
- 核心判断：只修改 reward_json 中 settlementUnit 时，应保留其他已知和未知字段，避免用不完整 DTO 全量重序列化抹掉其他场景数据。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0023 · xm-ai-job · 任务、岗位与外部主数据保持各自权威边界

- M02决定：KEEP；类型：DOCUMENT
- 正式原件：[任务、岗位与外部主数据保持各自权威边界](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/documents/任务、岗位与外部主数据保持各自权威边界.md>)
- Asset ID：`ast301043636955143268156005367493399791317896036196201396544`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/documents/任务、岗位与外部主数据保持各自权威边界.md`
- 原始字节SHA-256：`0e4a2727875dbdeaf94307cd0180d7046a20a83ea75df7fa266e83ca8469514c`
- 核心判断：任务和岗位具有不同的生命周期与业务关系；不为了共享字段机械增加需求主实体，除非真实业务需要跨两者统一身份。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0024 · xm-ai-job · 分页查询批量装配，缺失扩展值不伪造主数据

- M02决定：KEEP；类型：MEMORY
- 正式原件：[分页查询批量装配，缺失扩展值不伪造主数据](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/分页查询批量装配，缺失扩展值不伪造主数据.md>)
- Asset ID：`ast301043636955143268254820838905730359197612735405718178095`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/分页查询批量装配，缺失扩展值不伪造主数据.md`
- 原始字节SHA-256：`21214f7875668caa5ca4574f6e8f945cf940979abdf382d8d32ff77e79fe85d8`
- 核心判断：分页先取得当前页主键集合，再批量查询关联信息和分组计数并装配，避免每行重复查相同关系。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0025 · xm-ai-job · 讨论统计与已读游标分别定义，游标只能单调推进

- M02决定：KEEP；类型：DOCUMENT
- 正式原件：[讨论统计与已读游标分别定义，游标只能单调推进](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/documents/讨论统计与已读游标分别定义，游标只能单调推进.md>)
- Asset ID：`ast301043636955143268534968602532234793130088452580646181996`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/documents/讨论统计与已读游标分别定义，游标只能单调推进.md`
- 原始字节SHA-256：`d87d180f8f706deb90b4117294b10349be12e17a8a1ba687c03a50d4750b9991`
- 核心判断：草稿与已发布任务的讨论统计先确定各自真实来源，再按业务身份归属，不能为了复用查询把两类总数混在一起。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0026 · xm-ai-job · 外部流水分页即处理，窗口重叠依靠唯一身份去重

- M02决定：KEEP；类型：MEMORY
- 正式原件：[外部流水分页即处理，窗口重叠依靠唯一身份去重](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/外部流水分页即处理，窗口重叠依靠唯一身份去重.md>)
- Asset ID：`ast301043636955143269103186803508783806740891598593381824588`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/外部流水分页即处理，窗口重叠依靠唯一身份去重.md`
- 原始字节SHA-256：`9b8e565535c9d52f3a77d40b0d11c2a2e2a232e12945cf6f29a294c9bfb4a7f5`
- 核心判断：同步外部资金流水时逐页读取并处理，不把全部页面积压到内存后统一落库。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0027 · xm-ai-job · 批处理逐项隔离故障，提交后通知保留配置边界

- M02决定：KEEP；类型：MEMORY
- 正式原件：[批处理逐项隔离故障，提交后通知保留配置边界](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/批处理逐项隔离故障，提交后通知保留配置边界.md>)
- Asset ID：`ast301043636955143269358763242709845984775496397440316746557`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/批处理逐项隔离故障，提交后通知保留配置边界.md`
- 原始字节SHA-256：`2a017b6cb05a2cef81568f3bb7dc26ecd926ad9252889bd2d13859657d690d14`
- 核心判断：已按单个业务对象隔离事务、且其他对象可安全独立执行的批任务，应记录失败项并继续，避免一个重复失败对象阻断整个批次。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0028 · xm-ai-job · 数据库真实结构优先于脚本和执行口述

- M02决定：KEEP；类型：MEMORY
- 正式原件：[数据库真实结构优先于脚本和执行口述](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/数据库真实结构优先于脚本和执行口述.md>)
- Asset ID：`ast301043636955143269564246405903509260447231545877285619563`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/数据库真实结构优先于脚本和执行口述.md`
- 原始字节SHA-256：`6007885fe9abc65cb41c315e8d3457632059606a16eae901b1f5e6c849343b69`
- 核心判断：判断目标库是否具备字段、索引和约束，应查看目标环境的真实结构与必要数据；仓库 DDL、兼容开关或“已执行”口述只能证明各自范围。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0029 · xm-ai-job · 单实现外部调用复用 Wrapper，不机械增加 Gateway

- M02决定：KEEP；类型：MEMORY
- 正式原件：[单实现外部调用复用 Wrapper，不机械增加 Gateway](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/单实现外部调用复用 Wrapper，不机械增加 Gateway.md>)
- Asset ID：`ast301043636955143270183562164073101073938771671136070095195`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/单实现外部调用复用 Wrapper，不机械增加 Gateway.md`
- 原始字节SHA-256：`39b690dc7c1fff97d59780fd3642fe8a98255c90d4684b6ba10ec054a62da4a8`
- 核心判断：在现有 app/biz/infra 职责内复用实际 Wrapper：应用层编排用例，业务层承载领域规则，基础设施封装外部协议。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0030 · xm-ai-job · 依赖声明支持某枚举，不等于 DTO 和调用链可用

- M02决定：KEEP；类型：MEMORY
- 正式原件：[依赖声明支持某枚举，不等于 DTO 和调用链可用](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/依赖声明支持某枚举，不等于 DTO 和调用链可用.md>)
- Asset ID：`ast301043636955143270513653728095815685985207158962682889144`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/依赖声明支持某枚举，不等于 DTO 和调用链可用.md`
- 原始字节SHA-256：`61b896ffb103812ef2f5b179bf1f9f6f6e1aef4267cad808fea963009c5976c6`
- 核心判断：接入第三方/内部组件新字段时，要用当前解析到的依赖版本验证枚举、DTO、序列化和实际调用入口。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0031 · xm-ai-job · 运营远程助理与已撤回的企业远程助理分开

- M02决定：KEEP；类型：MEMORY
- 正式原件：[运营远程助理与已撤回的企业远程助理分开](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/运营远程助理与已撤回的企业远程助理分开.md>)
- Asset ID：`ast301043636955143270781605928579666128496246754303404428451`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/运营远程助理与已撤回的企业远程助理分开.md`
- 原始字节SHA-256：`731ca971ed0244ccc2ab31a87f263afca2f791b1f82218f60eea157ff92f11d3`
- 核心判断：OPERATOR 远程助理的周期结算和特殊去重规则有独立适用范围，不套入 MERCHANT 单次/日结参与人结算。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0032 · xm-ai-job · 老企业免费会员只以明确白名单为准

- M02决定：KEEP；类型：MEMORY
- 正式原件：[老企业免费会员只以明确白名单为准](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/老企业免费会员只以明确白名单为准.md>)
- Asset ID：`ast301043636955143271115910879105005093301610817107466278919`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/老企业免费会员只以明确白名单为准.md`
- 原始字节SHA-256：`cf1e9e649cff1823919b9d70a06ea4870520034f29fcbf11444abe7ba166e308`
- 核心判断：历史决定将老企业免费会员资格限制在明确白名单，不叠加模糊“老用户”条件，也不擅自用 AND/OR 拼接扩大或缩小资格。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0033 · xm-ai-job · 参与工作以发生事实计数，缺失历史事实不按状态猜补

- M02决定：KEEP；类型：MEMORY
- 正式原件：[参与工作以发生事实计数，缺失历史事实不按状态猜补](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/memories/参与工作以发生事实计数，缺失历史事实不按状态猜补.md>)
- Asset ID：`ast301043636955143271478706794201102711853042967460977782955`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/memories/参与工作以发生事实计数，缺失历史事实不按状态猜补.md`
- 原始字节SHA-256：`be51e86754f8a190646f29a8d977c2eb791fbaae9c95beec253d18911c83690d`
- 核心判断：“曾参与工作”以 work_start_time 等明确发生事实为准；一旦开始，后续成功、终止或放弃不抹掉已参与事实。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0034 · xm-ai-job · 对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始

- M02决定：KEEP；类型：DOCUMENT
- 正式原件：[对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/xm-ai-job/documents/对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始.md>)
- Asset ID：`ast301043636955143271850570550369896178392574669862608446115`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/xm-ai-job/documents/对外 Dubbo 能力从最小客户端契约和单 Provider 入口开始.md`
- 原始字节SHA-256：`9b73d8173f16c0467bd7d6242c2b75a500251cfc087e1d127bd52106b013af5a`
- 核心判断：需要暴露公共 Dubbo 能力时，先定义调用方必须知道的最小 client 契约，通过明确 Provider 入口调用现有应用服务；不将整个 app 依赖传给客户端，也不扩大组件扫描到多个应用入口。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0036 · CodexMemoryOS · 知识确认应绑定完整内容，不能用状态或使用量替代

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[知识确认应绑定完整内容，不能用状态或使用量替代](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/CodexMemoryOS/memories/知识确认应绑定完整内容，不能用状态或使用量替代.md>)
- Asset ID：`ast301043636955143271918711447112727059622430992474448292935`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/CodexMemoryOS/memories/知识确认应绑定完整内容，不能用状态或使用量替代.md`
- 原始字节SHA-256：`d8bd4079b3407a913d3341ce8ff14bc87767a95ca14578162649cc9fee902af1`
- 核心判断：人工确认针对人实际看过的确切内容。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0037 · CodexMemoryOS · 来源、快照和验证时点分别说明，不能补造历史证据

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[来源、快照和验证时点分别说明，不能补造历史证据](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/CodexMemoryOS/memories/来源、快照和验证时点分别说明，不能补造历史证据.md>)
- Asset ID：`ast301043636955143272323562765170865082162857083834910670206`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/CodexMemoryOS/memories/来源、快照和验证时点分别说明，不能补造历史证据.md`
- 原始字节SHA-256：`49f9793bcea1eb67e25b51a49dc10d667560ee7e3b2d2800a82b56afece6055f`
- 核心判断：来源说明信息从哪里来，快照保存某次所见内容，Hash 识别该次字节，路径只是定位符。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0038 · CodexMemoryOS · 私有工程资料需校验实际交付边界

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[私有工程资料需校验实际交付边界](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/CodexMemoryOS/memories/私有工程资料需校验实际交付边界.md>)
- Asset ID：`ast301043636955143272752721776132960757114337103578830840961`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/CodexMemoryOS/memories/私有工程资料需校验实际交付边界.md`
- 原始字节SHA-256：`958f0375a35235f6e2bc575c49d548ef51bf416f85d8ef5877cc29a9dacd4207`
- 核心判断：.gitignore 控制 Git 跟踪，不自动控制 Docker build context、打包、同步、备份或运行时可访问范围。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0039 · CodexMemoryOS · 知识质量审核以独立可复用判断为单位

- M02决定：REWRITE；类型：SKILL
- 正式原件：[知识质量审核以独立可复用判断为单位](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/CodexMemoryOS/skills/知识质量审核以独立可复用判断为单位.md>)
- Asset ID：`ast301043636955143273016997217835854174600874740869184941378`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/CodexMemoryOS/skills/知识质量审核以独立可复用判断为单位.md`
- 原始字节SHA-256：`eb44aa2f68844b2aadc9c2a00a2439180222764f915ca306ec39d650c39049f8`
- 核心判断：触发条件：明确进行历史知识整理或知识质量审查。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0040 · CodexMemoryOS · 运行审计区分代码证明、隔离实验和真实使用验收

- M02决定：REWRITE；类型：SKILL
- 正式原件：[运行审计区分代码证明、隔离实验和真实使用验收](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/CodexMemoryOS/skills/运行审计区分代码证明、隔离实验和真实使用验收.md>)
- Asset ID：`ast301043636955143273351923845024296115400872531499266811936`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/CodexMemoryOS/skills/运行审计区分代码证明、隔离实验和真实使用验收.md`
- 原始字节SHA-256：`1a578dd69001d65285af00f3377097fd3e54fabcf240979c6f5673cfa3198629`
- 核心判断：触发条件：需要判断跨文件、数据库、Hook 或 MCP 的真实行为是否满足已确认边界。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

### REV-0041 · CodexMemoryOS · 使用次数是行为遥测，不能自动决定知识质量与晋升

- M02决定：REWRITE；类型：MEMORY
- 正式原件：[使用次数是行为遥测，不能自动决定知识质量与晋升](</Users/hemu/Desktop/github/CodexMemoryOS/knowledge-base/repository/assets/workspaces/CodexMemoryOS/memories/使用次数是行为遥测，不能自动决定知识质量与晋升.md>)
- Asset ID：`ast301043636955143273904209787819415786056387948281424284634`
- 原Inbox相对路径（确认命令已迁出）：`inbox/workspaces/CodexMemoryOS/memories/使用次数是行为遥测，不能自动决定知识质量与晋升.md`
- 原始字节SHA-256：`263986678ae71096afaf9dd06d085bb220c6c710f3126e7dcff563ee4fd40d25`
- 核心判断：Recall 表示检索返回，Read 表示读取，Used 表示对当前工作产生实际影响的显式标记。
- 确认状态：CONFIRMED；正式文件、CURRENT快照及Catalog Hash一致。

## 不迁入项

- REV-0035 知识系统减少治理对象，把维护成本用于内容质量：旧Engineering Memory架构历程主要用于旧项目追溯；当前架构由本项目文档维护，可复用方法已独立保留，不单独迁入。

- REV-0042 可视化投影保持可重建，不能反向充当知识原件：当前项目没有该旧Relation/Obsidian图能力；原件与投影边界已由现行文档覆盖，不保留旧图机制知识。

- REV-0043 旧系统运行指南与执行审计记录保留原地，不作为现行知识整体迁入：已停用系统运行指南、账本和执行审计报告无需整体迁入；保留原文件。

- REV-0044 旧架构与结算流程图作为历史附件留存：旧图源、导出图及视觉检查附件对当前知识运行无直接用途；保留原文件，不迁入。

## 验证与边界

- 40次单文件确认成功，正式文件均与用户接受Hash一致；原Inbox文件由确认命令移除，未手工搬移替代确认。
- 40份CURRENT快照的原始字节和Hash一致，每个新Asset仅有CURRENT、无PREVIOUS；40条Catalog的Workspace/Hash与正式内容一致。
- 当前真实Task属于CodexMemoryOS：Search“迁移来源”返回本次6份治理Asset，Read REV-0037正文成功且Hash一致。对本次xm-ai-job Asset的Read按预期返回ASSET_NOT_ACCESSIBLE，验证当前Task不会越权。
- xm-ai-job 34份已验证正式文件、CURRENT与Catalog；尚未在xm-ai-job真实Task中进行正向MCP Search/Read，不把当前Task隔离拒绝当作该项目读取失败。没有自行新建/借用Task或绕过访问范围。
- 未安装库内SKILL为Codex可执行Skill；验收Read未标为知识实际Used。旧Usage和旧确认状态均未导入。
- 旧系统停用采用用户已确认事实，本轮未启动或调用旧工具、不重复修改Hook/MCP注册，不物理删除旧目录。旧源794份Hash仍一致，业务代码未改动。
- M05仅完成本次停用范围内收口，不代表全局残留注册清查。当前迁移配置、正式知识和运行SQLite位于本项目被Git忽略的knowledge-base/，本次无commit/push。
