# 双版确认与 Diff 验证

日期：2026-09-06。对象：本工作区 [Native Memories 协同与知识变更设计](../设计方案/04-Native-Memories协同与知识变更设计.md) 的 A、B 实现。未提交 Git；不改历史 Desktop 验收结论或本地 GO 范围。

## 实现范围

- 建立唯一 [知识内容模型](../../工程约定/知识内容模型.md)，README 和项目规则链接同一入口；旧 Asset 不新增正文标题资格要求。
- `asset_content_version` 保存 CURRENT/PREVIOUS 原字节、SHA-256 和登记时间，无 Catalog 级联；同内容及完成重试不轮换。
- confirm 新增要求数据库配置；更新显式绑定目标 ID、正式基线 Hash 和候选 Hash，同路径/类型/Scope/Workspace。保留新增 no-clobber 及普通 Inbox 冲突规则。
- SQLite 写锁协调确认进程；短暂恢复文件保存本次输入与两侧原字节。跨存储顺序、恢复判定和支持边界见设计 §10。
- `GET /api/assets/:assetId/diff` 为只读 Hub 接口，沿用当前资格、Host/Origin 和 REST 错误外壳。无新 MCP 工具，无历史检索，无 Usage 副作用，无前端适配。

## 执行环境与结果

本机 macOS ARM、本地临时目录、临时 SQLite、回环 HTTP；Node 22.16.0 / pnpm 11.1.3。命令均从仓库根通过 `npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm ...` 执行。

| 检查 | 实际结果 |
|---|---|
| 全仓 `typecheck`，后续 Server 定向 `typecheck` | 通过；Hub、ID 包检查后未改其源码 |
| 全仓 `test` | Hub 43、ID 包 5、当时 Server 198 项通过 |
| 最终 `--filter @codex-memory-os/server test` | 200/200 通过，包含新增专项 16 项 |
| 全仓 `build`，最终 Server `build` | 通过 |
| `smoke:asset-confirm:build` | 通过：编译 CLI 新增、显式更新、同调用重试，真实文件及双版字节核对 |
| `smoke:rest:build` | 通过，包含编译后 Diff UNTRACKED 路由 |
| `smoke:mcp:build` | 通过，仍为六个原有工具 |
| `exec node test-support/frontmatter-security-build-smoke.mjs` | 通过，配置隔离数据库，执行标记未生成 |
| `git diff --check` 与本次文档链接检查 | 通过 |

新增测试位于 `apps/server/test/content-version.test.ts`；原确认和三个相关构建 fixture 同步新命令依赖。没有修改测试以放宽 no-clobber 或资格约束；原来“重复执行拒绝”的断言按新设计改为“成功识别已完成且不覆盖”，执行中源变化的错误断言改为显式保留恢复材料的部分写入分类。

## 关键反例

- A→B→C 后只剩 B/C，PREVIOUS 继承原登记时间；首次只有 CURRENT。无变化及相同确认重试不再轮换。
- 错误候选 Hash、漂移基线、非法类型及同基线并发均拒绝；原字节、正式文件和版本槽核对。普通文件读取兼容旧正文。
- 在已有 A/B 双版时，用真实 SQLite trigger 令 C 的写入失败，验证删除/移动/插入整组 SQL 回滚；正式文件可能已经是 C，返回部分写入，保留恢复字节；移除测试 trigger 后用同一输入补完为 B/C。
- 新增和更新各运行真实子进程，在 prepared、file-written、database-committed 三阶段直接退出，共六种中断；重新运行原调用核对文件、数据库及重复调用，不以 mock 代替落盘结果。
- SQLite 读事务在文件写入后阻塞提交：返回 CONFIRM_PARTIAL_WRITE；释放读锁后同调用恢复。写入前锁忙与提交失败不混为一类。
- 恢复期间改用另一调用、外部写入 C 或替换为 Symlink：保留原恢复材料和后来内容，拒绝自动覆盖。
- Catalog 的真实 rebuild 保留双版；丢失版本表、错误原字节 Hash 明确报错，不能伪装成未登记。
- 当前文件外部编辑并完成索引同步后 Diff 返回 CONTENT_MISMATCH；当前资格丢失则按详情拒绝。合法未登记 Asset 为 UNTRACKED，只有 CURRENT 为 NO_PREVIOUS_VERSION。
- 两侧由 hunks 重建，覆盖 CRLF→LF、混合 LF/CRLF/CR、末尾换行、BOM 增删、组合 Unicode、空输入；非法 UTF-8、超多短行、单侧超过 1 MiB、JSON 高转义开销、输出行预算均有明确非成功状态。
- 重复及几乎完全不同的 990 行样本在 1,000,000 工作单位内完成；2,000 行两侧样本在分配 DP 前拒绝。最后一次运行中，20 次上限拒绝加两个近上限比较合计约 16.5ms。
- 真实回环 Server 同时处理 12 个超过计算预算的 Diff、普通 REST 列表和 MCP asset_read，最后一次约 21.8ms 全部完成。版本数量保持 2，Usage 只有显式 asset_read 的记录，MCP 无历史正文。连接、SQLite 和临时文件均由 fixture 关闭/清理。

时间是本机样本观察，不是端到端 SLA 或任意机器的时限保证。Diff 的确定约束是字节/行数/工作单位/JSON 预算；同步定时器不是中止机制。

## 未执行与边界

未修改、确认、迁移或初始化真实知识，未修改个人配置/技能或 Native Memories，未部署、重启实际服务或执行 commit/push。实际知识示例 C、旧 Asset 基线采集、外部编辑纳入 confirm、前端和真实 Desktop 新能力验收均未执行。

进程退出恢复不等于断电、硬件故障或网络文件系统证明。SQLite 锁只协调配置同一数据库的确认进程，不是外部编辑器的文件锁；当前路径核验与 rename 仍存在非协作写入窗口。对已检测到的未知内容状态停止并保留材料，不自动回滚文件。恢复材料截断或身份不明需人工检查，不能仅据本报告宣称跨存储具有一般原子性。
