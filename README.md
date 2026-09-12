# CodexMemoryOS

CodexMemoryOS 是一个个人、本地、Codex 专用的知识运行时。Markdown 文件是 Asset 正文来源；`inbox/` 保存待人工确认候选，只有 `assets/` 下的文件才是正式 Asset。SQLite 保存可重建的 Catalog/FTS、WorkspaceCapability 与 Recall/Read/Used 操作事实，以及不可从当前 Markdown 重建的 CURRENT/PREVIOUS 内容快照；索引修复必须保留运行数据和内容快照。

Native Memories 提供客户端历史背景，本服务维护经人工确认、需要明确维护的工程知识；两者各自参与任务，不自动同步会话摘要、不扫描 Native 存储、不合并计数。始终适用的指导放在 AGENTS.md 或版本化文档。知识正文与模板统一见 [知识内容模型](工程约定/知识内容模型.md)。

当前 2.4 提供多表达召回、显式多 Workspace 能力选择、Recall/Read/Used、只读 Hub/REST、HTTP MCP 和单文件人工确认命令，本机已完成 2.4 切换。工程交付另有知识评估短记录与 Stop 非阻断提醒，见下文。它不依赖模型 API、MemoryProxy、Obsidian 或团队服务，也不会由 Hook 自动捕获、自动确认或批量确认知识。Hub 只读，不提供确认、编辑、移动或删除操作。

## 项目文档

设计方案、工程约定、审查与验证记录统一见 [项目文档索引](项目文档/文档索引.md)。新增或整理文档时遵循 [文档约定](工程约定/文档约定.md)，Agent 工作规则见 [AGENTS.md](AGENTS.md)。

## 环境与安装

固定运行基线：

- Node.js `22.16.0`
- pnpm `11.1.3`
- `better-sqlite3@12.11.1`

当前原生 SQLite 驱动只在目标 macOS ARM 本机完成验证；网络文件系统、其他操作系统和其他 CPU 架构未验证。不要用主机上的其他 Node ABI 复用已安装的原生模块。

从仓库根目录安装并验证：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm install --frozen-lockfile
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm typecheck
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm test
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm build
```

`--frozen-lockfile` 失败时不要重写 lockfile 来绕过错误；先确认 Node/pnpm 版本、仓库根目录和 `package.json`/`pnpm-lock.yaml` 是否匹配。

## Asset Repository

最小目录结构：

```text
/absolute/asset-repository/
├── assets/
│   ├── global/
│   │   ├── memories/
│   │   ├── documents/
│   │   └── skills/
│   └── workspaces/
│       └── example-project/
│           ├── memories/
│           ├── documents/
│           └── skills/
└── inbox/
    ├── global/
    │   ├── memories/
    │   ├── documents/
    │   └── skills/
    └── workspaces/
        └── example-project/
            ├── memories/
            ├── documents/
            └── skills/
```

`workspaces.json` 使用严格的 `schemaVersion=1`：

```json
{
  "schemaVersion": 1,
  "workspaces": [
    {
      "name": "example-project",
      "paths": [
        "/absolute/workspaces/example-project"
      ],
      "aliases": ["示例项目"],
      "description": "用于识别业务范围的简短项目说明",
      "knowledgeAccess": "HOST_ONLY"
    }
  ]
}
```

本机迁移实例（2026-09-07）：`knowledge-base/config/workspaces.json` 已配置 CodexMemoryOS 和 xm-ai-job 两个 Workspace；本次确认入库分别为 6 份治理知识和 34 份业务知识。旧系统由用户确认已停用，旧源保留。正式清单、Hash 及验证边界见[旧知识迁移结果](migration/v4-generation-report.md)；这是旧版迁移记录；新版跨项目访问须取得该项目的可信能力，不借人工浏览接口绕过。

Hook 按路径段边界执行最长路径匹配，并合并用户明确配置 `knowledgeAccess: "PREAUTHORIZED"` 的项目。省略该字段或 `HOST_ONLY` 保留仅按宿主cwd签发的行为；仅有路径或别名不授权。PREAUTHORIZED允许该可信宿主的任务跨目录取得项目知识能力，启用前须得到用户授权；未匹配cwd且没有预授权时交付空能力集合，仅能显式访问GLOBAL。

`aliases` 可选、最多4个，每个1–40字符；`description` 可选、1–160字符，均不含控制字符，仅帮助模型识别，不改变权限或授权Hash。别名有歧义时由模型澄清。每次Hook最多交付8个不同项目（cwd与预授权并集），超限报告 `WORKSPACE_CAPABILITY_LIMIT`，整批不签发。Hook配置的 `additionalContextLimit` 使用8000，容纳有界项目目录，Recall的5000字符预算保持不变。

两项目配置 [workspaces.preauthorized.json](integrations/codex/workspaces.preauthorized.json) 包含“用工项目/用工系统”→`xm-ai-job`，已于2026-09-09在本机安装并完成人工验收。其他环境使用前仍须确认当地授权与配置。切换步骤与验收见[实施记录](项目文档/验证记录/04-设计2.2实现与人工切换.md#2026-09-09-人工验收与用户确认)。

每个 Asset 是一个普通 Markdown 文件：

```markdown
---
id: ast2034512345678901248
type: MEMORY
scope: WORKSPACE
workspace: example-project
title: 回调幂等规则
summary: 重复回调不得重复入账
---

# 回调幂等规则

完整正文。
```

约束：

- `id` 必须是当前 IdGenerator 可接受的 `ast` 加十进制数字；不得手工建立另一套 ID 格式。
- `type` 只能是 `MEMORY`、`DOCUMENT` 或 `SKILL`。
- `scope=GLOBAL` 时不得有 `workspace`；`scope=WORKSPACE` 时必须填写配置中存在的 Workspace。
- Frontmatter、目录中的 Scope/Workspace/类型必须一致。
- `contentHash` 是当前 Markdown 实际字节的 SHA-256；不规范化换行、Unicode 或 YAML 顺序。
- Symlink、目录 Asset、非 Markdown 文件、未知 Workspace、重复 ID 和路径/Frontmatter 冲突均 fail closed，不进入 Catalog/FTS。
- Scanner 只索引 `assets/`；`inbox/` 候选不会被默认 Search/Read 命中。

在 macOS 上可计算待确认文件的实际 Hash：

```bash
shasum -a 256 '/absolute/asset-repository/inbox/workspaces/example-project/memories/example.md'
```

## 配置

| 环境变量 | 使用方 | 含义 |
|---|---|---|
| `CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH` | Server、Hook、`asset:confirm` | Asset Repository 绝对路径；新版Hook仅需数据库与Workspace配置 |
| `CODEX_MEMORY_OS_DATABASE_PATH` | Server、Hook、`asset:confirm` | SQLite 绝对路径 |
| `CODEX_MEMORY_OS_WORKSPACES_PATH` | Server、Hook、`asset:confirm` | `workspaces.json` 绝对路径 |
| `CODEX_MEMORY_OS_LOG_PATH` | Server、Hook | 日志文件；建议显式配置绝对路径 |
| `PORT` | Node Server | 监听端口，默认 `3000` |
| `CODEX_MEMORY_OS_SERVER_PORT` | Vite 开发服务器 | `/api` 代理目标端口，默认 `3000`；不改变 Node Server 端口 |

Server 的 Asset Repository、SQLite 和 Workspace 配置三条核心路径必须是绝对路径。`asset:confirm` 同样需要这三条核心路径，以登记已确认内容快照。

以下示例仅使用占位绝对路径：

```bash
export CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH='/absolute/asset-repository'
export CODEX_MEMORY_OS_DATABASE_PATH='/absolute/runtime/codex-memory.sqlite'
export CODEX_MEMORY_OS_WORKSPACES_PATH='/absolute/config/workspaces.json'
export CODEX_MEMORY_OS_LOG_PATH='/absolute/logs/codex-memory-os.log'
export PORT='3000'
```

## 启动与停止

### 开发模式

先启动 Server：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/server dev
```

另一个终端启动 Hub，并让 Vite 代理指向同一个 Node Server 端口：

```bash
CODEX_MEMORY_OS_SERVER_PORT='3000' \
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/hub dev
```

### 生产构建产物

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm build
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/server start
```

单个 Node Server 同时提供：

- Hub：`http://127.0.0.1:3000/`
- 健康检查：`http://127.0.0.1:3000/health`
- MCP：`http://127.0.0.1:3000/mcp`
- 只读 REST：
  - `GET /api/assets`
  - `GET /api/assets/:assetId`
  - `GET /api/inbox`
  - `GET /api/workspaces`
  - `GET /api/recalls`
  - `GET /api/recalls/:recallId`
  - `GET /api/usage`
  - `GET /api/system/status`

未知 API、静态资源和页面返回 404，不回退到 Hub 首页。上述 REST 路径的 `POST`、`PUT`、`PATCH`、`DELETE` 返回 405。

使用 `Ctrl-C`（SIGINT）停止前台进程；进程管理器也可发送 SIGTERM。Server 会关闭 HTTP 连接、Watcher 和 SQLite 连接。应先启动 Server，再启动依赖它的 Codex MCP Client；不要为此项目额外建设守护进程或服务管理平台。

### macOS 独立 App（个人本机）

桌面源码位于 `apps/desktop/`，使用 Electron 44.3.0 管理窗口与普通 Node 子进程。后端继续使用本机 Node 22.16.0，知识、SQLite 和授权配置留在原处。关闭窗口保留 MCP，点击 Dock 恢复窗口；菜单退出或 `Cmd+Q` 等待后端正常结束。正式使用前正常停止占用同一端口的旧开发服务。

桌面端点击知识正文中的本地源码链接时，会剥离 `:行号` / `:行号:列号` 或 `#L行号` 定位后缀，用系统默认文本编辑器打开文件；暂不自动定位到指定行。支持 `/Users/`、`/Volumes/`、`/private/`、`/tmp/`、`/var/`、`/opt/` 下的绝对路径和本地 `file:` 链接（仅对已渲染为链接的内容生效）。外部 HTTP(S) 链接仍由用户选择后交给系统浏览器。不存在的文件、未知站内路径及打开失败会在当前窗口显示错误，保留阅读页面；不会将 API 或源码路径加载为主页面。浏览器版 Hub 不具备桌面文件打开能力。

从 0.2.0 开始，安装在 `/Applications/CodexMemoryOS.app` 的应用可通过菜单 **CodexMemoryOS → 检查更新** 查询公开仓库 `hemuzzz/CodexMemoryOS` 的最新稳定 GitHub Release。选择下载后，应用校验大小、SHA-256、版本、架构与应用身份，再由用户点击“安装并重启”。独立安装器复用原有正常退出、替换和启动检查，保留已安装应用的本机配置；知识文件和数据库不打入发布包，也不随升级迁移。下载失败不会替换应用；替换后启动失败保留旧程序备份并提示日志，不自动降级数据库。版本与当前相同或更低时不重复安装。

这是无 Apple 签名证书的个人自用更新实现，依赖固定 GitHub 仓库的 HTTPS 发布信息和包校验，不代表 Apple 签名或公证。当前不做后台自动检查；关闭窗口继续保留服务，检查更新及错误提示使用原生应用菜单和对话框。原有 0.1.0 需要先手动安装一次带更新入口的本机安装包。

首次准备：复制 [本机配置示例](apps/desktop/local-runtime.example.json) 到根目录 `.desktop-local.json`，填写真实 Node 绝对路径、现有数据/配置/日志路径与端口；该文件已忽略，不提交。Finder 启动不依赖终端 PATH。App 中保存配置快照；本机路径变化后需重新构建更新。

只构建 App，不安装或启动真实服务：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm install --frozen-lockfile
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm build
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/desktop package:mac
```

输出位于 `dist/desktop/<本次输出目录>/CodexMemoryOS.app`。使用以下命令在临时数据和临时端口上验证指定产物的 Node/HTTP MCP 链路，不连接真实库：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/desktop smoke:package '/绝对路径/CodexMemoryOS.app'
```

准备在线发布时，先提升 `apps/desktop/package.json` 中的版本号，再构建并生成产物（此命令不上传或安装）：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm build
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm --filter @codex-memory-os/desktop release:mac
```

输出位于 `dist/desktop/release-*/`：

- `CodexMemoryOS-<版本>-<架构>-local-install.dmg`：本机首次安装包，含本机路径配置，**不得上传公开 Release**。
- `CodexMemoryOS-<版本>-<架构>-update.dmg` 和同名前缀的 `.json`：可发布的更新映像及校验信息；已移除本机配置和 pnpm 本机路径元数据。两者必须一起上传到标签为 `v<版本>` 的稳定 Release。
- 同目录 `.app` 也含本机配置，仅供本机使用，不上传。

涉及数据库 schema、已安装 Hook/Skill/MCP 配套或其他需要人工切换的版本，生成时显式指定本机配置绝对路径并加 `--manual-only`；应用只提示查看版本说明，不自动安装。发布前仍须核对源码、构建、配套兼容与实际验证边界；生成文件不等于获准公开发布，Git commit/push 另遵循用户约束。

临时 macOS 安装目录的 A→B 升级验证入口为 `pnpm --filter @codex-memory-os/desktop smoke:update:mac '/绝对路径/本机App'`（仍使用上文固定 Node/pnpm 包装）。它只启动独立测试 bundle 和临时知识库，不替换 `/Applications` 中的应用。

本机安装或更新入口如下；执行它会写入 `/Applications/CodexMemoryOS.app` 并启动真实配置对应的服务。先结束同库工程交付与 Hook/CLI 作业；更新期间不要重新打开旧 App。涉及数据库或协议变化时先按既有流程完成人工配套维护，本命令不执行迁移或覆盖个人配置。

```bash
./scripts/update-app.sh
# 也可传入本机配置文件路径：./scripts/update-app.sh /绝对路径/local-runtime.json
```

更新锁覆盖依赖准备、构建与替换；正式目标固定为 `local.codexmemoryos.desktop`。脚本在临时工作区组装依赖，验证 SQLite 与 MCP，正常请求旧 App 退出，再在同一安装父目录保留旧程序并换入新包；成功须满足目标 buildId 与就绪条件。关闭超时、构建失败或身份不符会停止；不自动强杀、修改端口或回退数据库。不可写的安装目录、遗留更新锁和 macOS 退出请求被拒绝会给出错误，由操作者处理后重试。

旧包仅作本次替换恢复，路径在更新结果中返回；更新成功不等于旧程序可兼容当前数据库。已安装 Hook/Skill/CLI 继续按实际变更人工维护，不因打包自动全量覆盖。当前实现与已验收/未验收边界见 [桌面实现验证记录](项目文档/验证记录/09-macOS桌面实现与隔离验证.md)。

## Codex Hook 与 MCP（2.4 源码）

新版源码取消业务Task、Session/Turn、Loadout依赖。Hook将真实cwd项目和明确预授权项目交付为持续能力，附项目名称、别名、说明；不解析Prompt、不自动执行Recall。Recall Skill自动识别项目业务、表/接口、故障与历史判断请求，先召回，再核对当前源码；每次只选择相关能力，不受会话cwd限制。2026-09-09已完成本机真实能力传递、别名选择、双项目召回与Used结算验收，用户确认本轮验收成功、无阻碍；模型路径参数不授予权限。

2.2历史安装过程见 [2.2 实施与人工切换](项目文档/验证记录/04-设计2.2实现与人工切换.md)。升级当前源码需执行下方2.4升级步骤；完整协议位于 `integrations/codex/`，不要只更新后端。

| 正常 MCP 工具 | 输入与行为 |
|---|---|
| knowledge_recall | capabilityIds[]、queries[]；项内AND、项间OR，Asset按最佳匹配去重并统一排序，所有表达共享最多8项、完整JSON最多5000 Unicode code points |
| asset_read | capabilityIds[] + recallItemId，或assetId + expectedContentHash可选；当前Hash契约，正文上限256000 UTF-8字节 |
| asset_mark_used | capabilityIds[] + recallItemId或readRef；实际影响才使用，来源幂等，允许内容演进后的合法旧引用 |

capabilityIds必填且最多8个，[]只访问GLOBAL；queries必填1–8项，每项1–256字符、不含控制字符，大小写/空白差异去重。旧query和其他未知输入拒绝。能力持久层只保存SHA-256摘要，无TTL；映射变化或明确撤销失效，不因时间、重启或无关配置变化失效。单个Workspace名称最多128字符、禁止控制字符。预授权关闭后，由预授权签发的额外能力失效；由真实cwd签发的能力仍按原映射校验。恢复同一预授权配置可能恢复其未撤销能力，永久失效仍须显式撤销摘要。

模型像搜索原生Memories一样提炼同义表达和有依据的中英文/代码名称；同目的已有适用表达直接复用，无需先调用原生检索。例：`queries: ["业务字典", "字典配置", "dictconfig", "sys_dict"]`。服务端复用现有文字/FTS匹配，不自动扩词、不把`a|b`解释为OR、不按同义命中次数加分。Recall记录与Hub保留本次完整表达数组。

Recall/Read事实写失败仍交付合格知识，usageRecorded=false、无本次稳定引用。Used失败明确报错。Usage按assetId跨内容累计，不按Hash分版本；旧引用Read遇内容更新仍返回CONTENT_CHANGED。正常MCP无asset_search和旧装配工具；Hub搜索保持纯检索。

MEMORY匹配分数达到现有阈值且预算允许时返回摘要，其他条目通过引用按需Read；DOCUMENT/SKILL保持引用交付。全部候选使用一个排序序列，不预留固定资料名额。

MCP仍使用本地回环 `/mcp` 和原有Host/Origin检查。注册示例见 `integrations/codex/mcp.toml.example`；注册本身不等于真实客户端已采用协议。

### 交付前知识评估与非阻断提醒

按[知识评估设计](项目文档/设计方案/06-知识评估标准与Stop兜底设计.md)，主 Agent 在工程交付前提炼要点、核对增量，并提交本轮短结果。判断标准及四种结果只在 `knowledge-capture` Skill 维护。项目文档已有内容不直接等于无增量；普通无工具交流无需记录。

- UserPromptSubmit 保持原能力交付，追加本轮 Session/Turn 标识和记录命令；不初始化记录、不预测后续工作。
- PostToolUse 匹配 `Bash|apply_patch`，同步创建一次活动标记。Stop 发现记录缺失、无效或 FAILED 时只返回 `systemMessage`；不阻断、不自动补跑，候选待确认静默结束。
- 两个新 Hook 使用 `integrations/codex/capture-hook.sh`，直接执行构建后的 CLI；仅依赖本地缓存，不访问知识数据库或 MCP。示例配置见 `integrations/codex/hooks.json.example`，超时 1 秒，CLI 内部 750 ms 降级。
- 记录命令从 Hook 上下文取得，通过 stdin 接收 JSON；手动安装时 `capture:assess` 等价于 `node apps/server/dist/hook/capture-cli.js --record`，须明确设置绝对路径 `CODEX_MEMORY_OS_CAPTURE_CACHE_PATH`。不要用包管理器启动每次活动 Hook。
- 本机包装脚本固定缓存为 `knowledge-base/runtime/capture/`，Session/Turn 摘要目录内最多有 `assessment.json`、`activity.flag`、`warned.flag`；评估最大 8 KiB，普通无活动回合不写缓存，无数据库迁移或历史报表。

安装时同步 capture Skill、全局知识规则、两个事件注册，以及版本化包装脚本。当前 `knowledge-base/user-prompt-submit.sh` 转发到 `integrations/codex/user-prompt-submit.sh`；其他机器需按本机路径调整固定 Node 22.16.0 位置，不能照抄本机绝对路径。配置变化后通过正常 `/hooks` 界面核对与信任精确定义；服务重启不等于 Desktop 已加载新 Hook。实际安装、测量和待验收项见[验证记录](项目文档/验证记录/08-知识评估Hook实现与安装验证.md)。

程序只证明本轮声明存在，不审核自然语言判断，不独立发现同轮记录过期。工具范围外的只读/纯对话工程交付仍由主 Agent 自主评估，可能漏提醒；缓存故障时仍允许结束且可能无法去重。验证命令：`pnpm --filter @codex-memory-os/server smoke:capture:build`（固定 Node/pnpm，先构建）。

### 召回存储升级（2.4）

本机已于2026-09-10获用户授权完成2.4真实切换；用户明确要求不创建新备份，真实数据保留与MCP/Hub结果见[切换验证记录](项目文档/验证记录/07-检索模型清理验证.md#2026-09-10-真实切换)。下面保留其他环境的升级步骤。需同时升级数据库、Server/Hub构建及`integrations/codex/`中的KNOWLEDGE、Recall、capture协议，再重载客户端；安装状态以manifest与实际文件Hash为准。

1. 停止服务及所有同库Hook/写入方，保留可恢复的数据库、构建产物与已安装协议备份。核对数据库绝对路径。当前knowledge:migrate对schema-1或全新环境直接初始化到5；已有schema-2/3/4运行下一步，无需重新初始化。
2. 构建当前源码后，显式离线升级到schema-5：

   ```bash
   CODEX_MEMORY_OS_DATABASE_PATH='/absolute/data/codex-memory.sqlite' \
   npx -y -p node@22.16.0 -p pnpm@11.1.3 \
     pnpm --filter @codex-memory-os/server recall:migrate --offline
   ```

   该命令把schema-2/3历史query原样包成单元素JSON数组，保留schema-4的原数组，裁剪退役配置列、来源分桶字段及相应诊断；保留操作/条目ID、时间、范围、Hash、Read/Used引用、能力、Catalog/FTS与正文双版。失败整笔回滚，可幂等重试。不会清空操作记录或代替旧Task表退役。新服务遇旧Schema明确要求迁移，不在启动时自动修改。
3. 按manifest核对待安装文件与当前基线，完成协议安装、启动服务、重载Codex。检查MCP仅发布Recall/Read/Used三个工具，Recall只接收capabilityIds与queries；实际用多表达召回，核对Hub列表/详情与旧记录、完整5000字符预算、Read/Used和真实Hook能力传递。单纯构建或SDK测试不能代替此步。

若需要恢复旧版，应在停止所有写入后恢复同批数据库、构建和协议备份，不能仅降级程序读取schema-5。

## 单文件人工确认

确认前先由人检查文件内容并取得当前实际 SHA-256。一次只确认一个 `inbox/` 文件：

```bash
CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH='/absolute/asset-repository' \
CODEX_MEMORY_OS_DATABASE_PATH='/absolute/data/codex-memory.sqlite' \
CODEX_MEMORY_OS_WORKSPACES_PATH='/absolute/workspaces.json' \
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/server asset:confirm -- \
  --relative-path 'inbox/workspaces/example-project/memories/example.md' \
  --expected-content-hash '<64位小写sha256>'
```

新增命令接受 Inbox 源路径和必填 Hash，不接受目标路径。目标由 `inbox/...` 机械映射到 `assets/...`；使用 no-clobber 复制，不覆盖已有目标，并在删除源前后复核实际字节和 Scanner 资格。

成功退出码为 `0`，stdout 为稳定 JSON：

```json
{
  "ok": true,
  "assetId": "ast2034512345678901248",
  "sourceRelativePath": "inbox/workspaces/example-project/memories/example.md",
  "targetRelativePath": "assets/workspaces/example-project/memories/example.md",
  "contentHash": "<64位小写sha256>"
}
```

输入、Hash、资格、ID 或目标冲突等安全拒绝退出 `2`；复制、源删除或移动后校验等运行失败退出 `1`。stderr JSON 的 `error.code` 是稳定判定字段，包括 `CONTENT_HASH_MISMATCH`、`TARGET_ALREADY_EXISTS`、`ASSET_ID_CONFLICT`、`SOURCE_REMOVE_FAILED` 和 `POST_MOVE_VALIDATION_FAILED`。

更新已有内容时，在上述命令后增加 `--update-asset-id '<ast ID>' --expected-baseline-hash '<正式文件当前 SHA-256>'`。须先人工查看完整新稿和差异，确认新稿 Hash 与正式基线 Hash。候选保持同 ID、同类型、同 Scope/Workspace、同文件相对路径（仅根从 assets 换为 inbox）；更新目标从合法正式 Asset 解析。普通 Inbox 列表仍排除同 ID 冲突，不自动把新增变成覆盖。未登记基线的旧 Asset 不能直接通过更新命令初始化。

确认需要同一仓库的各进程配置同一数据库。新增只写 CURRENT；更新 A→B→C 后仅保留 B/C，时间随原 CURRENT 一起转为 PREVIOUS；无变化及已完成调用重试不再轮换。SQLite 写锁忙返回 `CONFIRM_BUSY`。`BASELINE_MISMATCH` 表示正式文件或 CURRENT 已偏离确认基线，需重新核对，不能复用旧确认。

`CONFIRM_PARTIAL_WRITE` 表示操作可能部分生效，仓库根 `.asset-confirm-recovery.json` 保留原字节及输入身份。先检查正式文件、CURRENT 和候选；仅用完全相同的路径、Asset ID 和两侧 Hash 重试，程序会按身份补完或识别已完成，不盲目轮换。恢复材料损坏、调用不符或后来内容改变时停止并报 `CONFIRM_RECOVERY_REQUIRED` 或 `CONFIRM_PARTIAL_WRITE`，不覆盖后来编辑。勿手工清空恢复文件来绕过诊断。只有可证明尚未生效的失败才清理本次恢复材料。

`GET /api/assets/:assetId/diff` 是 Hub 个人本地只读接口，成功外壳为 `{ok:true,data:{diff:...}}`。两版可比较时 `status=AVAILABLE`，返回 Hash、时间、BOM 标记和完整行级 hunks；当前资格拒绝沿用详情错误。其他状态包括 `UNTRACKED`、`NO_PREVIOUS_VERSION`、`CONTENT_MISMATCH`、`UNSUPPORTED_ENCODING` 及 INPUT/WORK/OUTPUT_LIMIT_EXCEEDED，不返回部分 hunks 或假称无变化。接口不接受路径、Git ref 或历史版本参数，不增加 MCP 工具，不写 Usage；前端适配留待整体重做。

备份应在停止 Server、Hook 写入及确认操作后，同时保存 Markdown、SQLite 及尚存的恢复材料；若启用了 SQLite WAL，也要使用一致的 SQLite 备份方式而非遗漏 WAL 的文件复制。CURRENT/PREVIOUS 是持久数据，重建索引不能恢复 PREVIOUS。丢库后不自动补造历史；旧 Asset 读取继续可用、Diff 保持 UNTRACKED，真实基线采集另行授权。直接编辑正式文件仍生效，但不自动登记版本，Diff 会报告与最近一次 confirm 快照不一致。

## 排错

### 版本、安装和原生模块

- Node/pnpm 不匹配：只使用文档中的固定 `npx -y -p node@22.16.0 -p pnpm@11.1.3` 入口。
- frozen-lock 失败：确认在仓库根目录、lockfile 未被其他安装过程改写；不要改成非 frozen 安装来掩盖差异。
- `better-sqlite3` 加载失败：确认 Node 为 `22.16.0`，重新执行 frozen 安装与 Server typecheck/test/build；其他平台仍属于未验证边界。

### 配置、Scanner 和索引

- `SERVER_CONFIGURATION_INVALID`：确认三条核心路径均为绝对路径且对应对象存在，`PORT` 为 `1..65535` 的整数。
- `workspaces.json` 无效：检查 `schemaVersion=1`、唯一 Workspace 名、绝对 paths 和 JSON 语法。无效配置不会应用空 Snapshot。
- Repository/Scanner Snapshot 不完整：查看 `/api/system/status` 的 `readiness`、`indexState` 和 diagnostics；修复仓库可读性或配置后等待下一次完整扫描。
- 重复 Asset ID、Frontmatter/路径/Workspace 冲突：按 diagnostics 中的仓库相对路径修复全部冲突；冲突项会退出 Catalog/FTS。
- `DEGRADED`：最后一致 Catalog 可能仍保留，但 Search/Read 会在无法重新确认资格时 fail closed。修复原因后等待 Watcher 同步或重启 Server。
- `REBUILD_REQUIRED`：停止 Server 后按下一节重建；不要在线移动 SQLite 文件。
- Watcher 不更新：确认修改发生在 `assets/` 的普通 Markdown 或确切 `workspaces.json`，查看 Watcher diagnostics；`inbox/` 本来不会触发正式索引。修复后重启 Server 可执行一次启动全量扫描。
- Search/Read stale：检查文件仍是合格普通 Markdown、路径与 Frontmatter 一致，再查看 diagnostics；当前读取不会用旧 FTS 正文代替 Markdown。

### 离线重建派生索引

`REBUILD_REQUIRED` 应优先修复 Catalog/FTS，不能通过移走整库处理。停掉 Server 和所有使用同一数据库的 Hook/写进程后，保留原有三条绝对路径配置，执行：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm --filter @codex-memory-os/server rebuild-index --offline
```

`--offline` 是操作人确认所有写进程已停止；命令不会停止进程，也不证明不存在其他空闲写进程。命令先获得完整 Scanner Snapshot，再打开已存在数据库，在单个 EXCLUSIVE 事务里重建 Catalog/FTS 及其索引，保留能力、操作事实、内容双版和其他非派生表。失败回滚并退出 1；不完整扫描、缺失/损坏数据库或锁冲突不会被伪装成空库成功。成功退出 0 后重新启动 Server，检查 `/api/system/status` READY 和实际 Search/Read。服务启动会等待 Watcher ready 后再完整复核一次，才对外报告 READY。

**数据库整体丢失或文件损坏是另一种恢复边界。** 本命令不能恢复能力/操作事实，也不自动新建整库、覆盖备份或执行重置。只能在另行明确接受运行历史损失后安排整库恢复，不能以这种方式代替派生索引修复。

### HTTP、MCP、Vite 和确认命令

- MCP 离线：先验证 `/health`，再确认 URL 为 `http://127.0.0.1:<PORT>/mcp`。`required=false` 只保证普通 Codex 不被阻断，不会让工具离线时仍可调用。
- Host/Origin 拒绝：必须使用配置端口上的 `127.0.0.1` 同源地址；服务故意拒绝外部 Host/Origin。
- 端口占用：选择未占用端口并同步调整 `PORT`、MCP URL 和 Vite 的 `CODEX_MEMORY_OS_SERVER_PORT`。
- Vite `/api` 失败：`CODEX_MEMORY_OS_SERVER_PORT` 必须指向 Node Server，不是 Vite 自身端口。
- `asset:confirm` Hash 错误：重新读取当前文件并重新进行人工确认，不要复用旧 Hash。
- 目标冲突或 ID 冲突：分别检查候选映射后的目标和所有正式/候选同 ID 文件；命令不会覆盖或自动合并。
- 源删除或移动后校验失败：停止重复执行，按 stderr JSON 的相对路径核对两端实际文件和 Hash。
- 日志：使用 `CODEX_MEMORY_OS_LOG_PATH` 找到文件。日志不记录完整 Markdown，但可能包含内部错误消息和 stack，只应保存在受控本地路径。

## 已知边界

- 2026-09-09本机2.2及自动项目识别修订已获用户验收确认，无本轮阻碍；实际检查与范围裁定见实施记录，不将人工验收等同于全仓自动测试通过。
- 旧协议自动测试与smoke仍保留历史用例，尚未适配新契约；不能作为新版验收依据。现有typecheck包含这些旧测试，源码检查请用typecheck:source，未修改原测试命令或削弱断言。
- 2.4本地构建、schema-5迁移、协议安装及真实MCP/Hub验证已完成；当前任务使用宿主已交付的有效能力验证，新用户轮次的自动Hook/Skill触发未在本轮重演，不能用SDK工具发现代替该项。
- 手动迁移与启动步骤、数据保留边界及验收清单见 [2.2 实施与人工切换](项目文档/验证记录/04-设计2.2实现与人工切换.md)。
