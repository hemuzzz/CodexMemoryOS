# F02：当前文件路径资格修复记录

日期：2026-09-05

状态：**已实施、自动验证通过，等待用户复核**。整体 **NO-GO 保留**，N00–N13 仍为实现完成。本轮到此停止，不进入 F03；F01/S01 的“等待用户独立复核”状态不变。

## 1. 本轮基线与授权

依据当前 V2 第 3、10、14、16 节、原审计 F02、W01 启动核查、F01/S01 修复记录及本轮明确授权。W01 保持 SINGLE_ONLY，不增加多 Workspace 或调整 Loadout/存储模型。

分支 `main`，HEAD `7f359aa8b41ca97817d1d9d86938d784c380893f`。开始时已有 `.idea/CoolRequestCommonStatePersistent.xml` 暂存项、F01 的 Scanner 修改、YAML helper、F01 正式测试及构建烟测、既有 docs、V2 方案和 `pelican-bicycle.html`。未将这些当成本轮新增。

本轮重新采集 **124 个** tracked / 非忽略 untracked 文件的 SHA-256 清单；不沿用 F01 的文件数量。测试命令使用已有 Node.js **22.16.0**、pnpm **11.1.3**，没有修改依赖、锁文件或个人环境配置。

## 2. 原因与修复

修复前全量 Scanner 对根和遍历目录执行 lstat/Symlink 检查；定向 `scanAssetFiles` 则只 lstat 最终文件，随后共用 `readCandidate`。末级 `O_NOFOLLOW` 不阻止中间目录链接；相同 ID、文件字节和 Hash 不能证明当前路径仍有资格。因此旧 Catalog 路径可通过内部父目录链接读取 Repository 外文件。

本轮只修改 `apps/server/src/asset/scanner.ts`：

- 在全量遍历上下文及两处候选读取调用中传递已经按现行 `resolve` 规则规范化的 Repository 根（当前行 `217,320,389,469,481`）。
- 所有候选在 `readCandidate:488`、打开文件之前执行同一 `validateCurrentFilePath:609`。正式扫描、Inbox 扫描和定向复核都使用这个入口；不另建 Search、MCP 或 Hub 专用的路径规则。
- 使用 `path.relative` 和路径段边界判断候选在配置根内；拒绝根本身、`..`、`../...` 或绝对相对结果，不使用宽松字符串前缀。
- lstat 配置根自身，拒绝根链接或非目录。只检查该根及其后代，**不向上扩展到系统所有祖先目录**。
- 从根逐段检查父目录和末级文件，任何 Symlink 都拒绝，包括指回仓库内的链接；中间节点必须是目录，末级必须是普通文件。
- 对根及最终文件分别 realpath，再通过 relative 核对物理路径边界。realpath 不用于赦免前面已发现的内部链接。
- 继续保留最终 `O_RDONLY | O_NOFOLLOW`、打开后的普通文件检查、原字节读取/Hash、F01 YAML-only helper、Zod、Workspace 和路径布局校验。

失败继续形成原有 REPOSITORY_UNAVAILABLE / SYMLINK / FILE_READ_ERROR / INVALID_ASSET_PATH / 文件类型诊断；候选不进入有效结果。调用方沿现有拒绝/过滤流程处理，没有修改异常映射或新增全局 catch。

全量扫描的根不可用仍是“不完整 Snapshot”，不能作为空 Snapshot 应用。定向扫描沿已有候选诊断方式剔除不可读路径；本补丁没有把定向错误转换成可用正文，也未改变索引整体恢复流程。

## 3. 正式反例与先红后绿

新增 `apps/server/test/path-security.test.ts`，先在保留 F01、尚未修复 F02 的代码上运行：

1. 同一 mkdtemp 根下创建 Repository、外部 sibling、独立配置及 SQLite。
2. 用正式 IndexManager 正常索引，不启动 watcher。
3. 将 `assets/global/memories/` 移到隔离 sibling，原位置建立 Symlink。
4. 对链接后的文件显式断言原字节、ID 和 SHA-256 不变。
5. 调用全量 Scanner、定向 Scanner、纯 Application Read、真实 SDK HTTP MCP Search/Read/Used 和真实 HTTP Hub Detail。

只通过已有 `refreshIndex` 注入点延迟索引更新，保持手动同步；没有 mock 文件系统、Scanner、资格判断或 MCP READY 状态。测试最后逐字段比较 Catalog，证明拒绝发生在旧 Catalog 仍存在时，不依赖 watcher、sleep 或“旧条目已被清除”。

原父目录反例的实测结果（无 Usage / 已有 Usage 两种情况相同）：

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 全量 Scanner | 拒绝，SYMLINK | 拒绝，SYMLINK |
| 定向 Scanner | 错误接受，无诊断 | 拒绝，SYMLINK |
| Application Read | 返回 F02_PRIVATE_BODY | 拒绝，无正文 |
| MCP Read / Mark Used | 两者错误成功 | 两者均返回错误 |
| MCP Search | 返回非法内容 | 不返回非法 Asset ID 或正文 |
| Hub Detail | HTTP 200，返回正文 | HTTP 409，不返回正文 |
| Usage 全字段 | 新增或更新 | 保持原样 |

修复前命令 exit **1**：**20 项，8 pass / 12 fail**。根、assets 父目录、global 父目录、仓库外父目录、仓库内父目录、相似前缀 sibling 六类，各在无 Usage/已有 Usage 状态失败；失败安全断言为 `Current Application Read must reject a path rejected by the full Scanner`，actual=true。末级文件链接、目录/根消失等原本能够安全拒绝的对照没有被算作新漏洞。

修复后同一测试 **20/20 PASS**。保留原反例及其安全断言，补充了“不返回非法 Asset ID”和每次 MCP 调用后立即比较 Usage 的断言；加强后重新运行定向和全量测试，未弱化旧测试。

## 4. 路径与入口矩阵

以下矩阵在源码和构建产物模式中均通过：

| 场景 | 覆盖与结果 |
|---|---|
| A 根自身替换为 Symlink | 全量拒绝，定向/Read/Used/Hub 同样拒绝；旧 Catalog 保留。 |
| B 父目录链接到仓库外 | 分别替换 assets、global、memories 各层，均拒绝。 |
| C 父目录链接到仓库内 | 链接指向 Repository 内 held-parent，仍拒绝，未因 realpath 在根内而放行。 |
| D 最终文件 Symlink | 继续拒绝，原有安全边界无回归。 |
| E 修改、删除、移动 | 正常编辑立即返回当前内容和原字节 Hash；删除拒绝；旧路径移动后在手动同步前拒绝、同步后合法新路径可读。 |
| F 相似前缀 | `repository-outside` sibling 链接拒绝；`../repository-outside/...`、带上跳的 assets 路径和外部绝对路径也拒绝。 |
| 补充：根/父目录消失 | 不返回旧内容，失败操作不改变 Usage。 |
| 补充：根上方的路径别名 | 在临时父目录建立 alias，配置 alias 下的常规 Repository；全量及定向扫描均正常，未把系统祖先链接纳入禁止范围。 |
| 合法兄弟文件 | 不受被替换中间目录影响的 Workspace 文件仍按现有资格可读；未改变 Hub 人工全库管理权限。 |

18 项不合格场景（9 类 × 2 种 Usage 初始状态）均实际运行 Application、MCP 和 Hub 路径。另两项覆盖合法修改/删除/移动/祖先别名，以及词法边界。物理路径逃逸的最终 realpath 检查同时由源码核对；没有声称测试穷尽所有检查期间的并发替换交错。

## 5. Usage 无副作用证明

每个场景分别以空 Usage 表及预先写入一条有效 Read 记录作为基线。MCP `asset_mark_used` 保持现有链路：Task → READY gate → 当前 Application Read → Usage 写入，没有改动 tools/service/repository。

测试实际执行 Read、Used、Search，并在**每次返回后**查询 `SELECT * FROM task_asset_usage ORDER BY usage_id` 与基线深比较；最后再次比较。覆盖 ID、Task/Asset 关联、Read/Recall 计数、Used 标记以及所有时间字段，既验证不新增，也验证不更新已有记录。所有不合格场景通过；Hub 同样没有增加 Usage。

## 6. 实际命令和结果

除构建测试额外设置下述变量外，命令均使用当前进程 PATH 前缀：

```sh
PATH=/Users/hemu/.npm/_npx/78120b5db7e8f750/node_modules/node/bin:$PATH
```

| 命令 | 结果 |
|---|---|
| `pnpm --filter @codex-memory-os/server exec tsx --test --test-concurrency=1 test/path-security.test.ts`（修复前） | exit 1；20 项，8 pass / 12 fail。 |
| 同一 F02 定向命令（修复后及加强断言后） | exit 0；20/20，0 skipped。 |
| `pnpm --filter @codex-memory-os/server exec tsx --test --test-concurrency=1 test/frontmatter-security.test.ts` | exit 0；F01/S01 42/42，0 skipped。 |
| `pnpm --filter @codex-memory-os/server exec tsx --test --test-concurrency=1 test/asset-scanner.test.ts test/asset-search.test.ts test/mcp.test.ts test/rest.test.ts test/asset-confirmation.test.ts` | exit 0；41/41，0 skipped。 |
| `pnpm test` | exit 0；Server 143、Hub 43、ID 4，共 **190/190**。首轮通过后加强 F02 断言，重新运行仍全部通过；Server/ID 0 skipped。 |
| `pnpm typecheck` | exit 0；全部 workspace 包通过。 |
| `pnpm build` | exit 0；Server、Hub、ID 构建通过。 |
| `CODEX_MEMORY_OS_TEST_DIST=1 pnpm --filter @codex-memory-os/server exec tsx --test --test-concurrency=1 test/path-security.test.ts` | exit 0；20/20。日志明确输出 `F02_PRODUCTION_MODULE_ROOT …/apps/server/dist/`；生产 Scanner、Search、MCP、REST、Task/Usage 等均导入 dist，测试 harness 仍由 tsx 运行。真实 socket/SDK 调用，不是仅测试源码 helper。 |
| `pnpm --filter @codex-memory-os/server exec node test-support/frontmatter-security-build-smoke.mjs` | exit 0；F01_BUILD_SMOKE status=ok，markerExists=false。 |
| `pnpm --filter @codex-memory-os/server smoke:mcp:build` | exit 0；N08_BUILD_SMOKE status=ok，六工具正常主链路。 |
| `pnpm --filter @codex-memory-os/server smoke:asset-confirm:build` | exit 0；N12_ASSET_CONFIRM_BUILD_SMOKE status=ok，合法隔离样本确认。 |
| `git diff --check`、新增文件空白检查和基线 SHA-256 比较 | 结果见下节最终核验。 |

顺序为 F02 定向 → F01 安全 → 相关路径 → 全量 → typecheck → build → 构建后测试。没有并行委派 Agent；包内部沿用仓库现有测试脚本调度。

原始日志在 `/var/folders/3k/g7_mt00n1rdfxx__dj6vnnk00000gn/T/codex-f02-remediation-aehwpya8/`：`before.log`、`targeted.log`、`f01-regression.log`、`related.log`、`full-test.log`、`full-test-final.log`、`typecheck.log`、`build.log`、`dist-path-security.log` 及三个 build-smoke 日志。长期复现使用正式 `path-security.test.ts`，不依赖原审计临时脚本。

## 7. 文件范围、保护与限制

本轮只修改一个生产文件 `apps/server/src/asset/scanner.ts`，新增 `apps/server/test/path-security.test.ts` 和本记录。测试文件既承担源码回归，也可切换到 dist 执行相同断言，不新增生产配置项或修改 package scripts。

F01 helper、正式安全测试、构建烟测、原审计、V2、启动核查和 F01 修复记录全部保留。Scanner 中 F01 的共享解析调用与原字节 Hash 保留，并经过 F01/S01 源码及构建回归；不把测试通过写成用户已确认 F01。

最终核验：本轮 124 个基线文件中，仅 Scanner 发生授权内修改，其他 **123 个文件原字节不变**；新增文件恰为 F02 正式测试和本记录。`git diff --check` 通过，两个新增文件无尾随空白且以换行结束。基线清单不包含 ignored 构建产物或仓库外目录，不声称完成真实数据目录的逐字节核验。

所有文件系统、数据库、HTTP/MCP 操作仅使用本轮自行创建的临时根，测试关闭连接和服务后清理这些根。未操作真实知识 Repository、运行数据库或个人 Codex/MCP/Hook 配置；未执行 commit/push/reset/clean/stash、依赖升级或锁文件修改。

保障范围是每次读取前对当时可观察路径的资格复核。lstat、realpath、open 之间仍存在 TOCTOU 时间窗口，O_NOFOLLOW 只保护最终打开节点；没有目录句柄逐层打开/原子路径解析保证，不能声称抵御拥有完整本机权限的操作者持续并发替换。此限制按本轮约束保留，不引入新文件访问平台。

未运行真实 Codex 生命周期、浏览器视觉验收、网络盘/其他 OS 或极端规模测试，未验证或修复 F03–F07 和 U02/U03。整体 NO-GO 不变。

Memory Capture: NOOP — 路径规则、反例和保障边界均已在源码、正式测试及本记录中可恢复，不新增记忆副本。
