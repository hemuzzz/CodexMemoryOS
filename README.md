# CodexMemoryOS

CodexMemoryOS 是一个个人、本地、Codex 专用的知识运行时。Markdown 文件是 Asset 正文来源；`inbox/` 保存待人工确认候选，只有 `assets/` 下的文件才是正式 Asset。SQLite 保存可重建的 Catalog/FTS，以及独立的 Task/Usage 运行数据；索引修复必须保留运行数据。

当前 MVP 提供 Workspace 隔离的 Search/Read、显式 Task Loadout、Usage、只读 Hub/REST、HTTP MCP 和单文件人工确认命令。它不依赖模型 API、MemoryProxy、Obsidian 或团队服务，也不会自动捕获、自动确认或批量确认知识。Hub 只读，不提供确认、编辑、移动或删除操作。

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
      ]
    }
  ]
}
```

Hook 按路径段边界执行最长路径匹配。没有匹配的 cwd 得到 `workspace=null`，只能访问 GLOBAL Asset；同等最长路径同时属于不同 Workspace 时拒绝继续。

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
| `CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH` | Server、Hook、`asset:confirm` | Asset Repository 绝对路径；Hook 投影非空 Loadout 时必须配置 |
| `CODEX_MEMORY_OS_DATABASE_PATH` | Server、Hook | SQLite 绝对路径 |
| `CODEX_MEMORY_OS_WORKSPACES_PATH` | Server、Hook、`asset:confirm` | `workspaces.json` 绝对路径 |
| `CODEX_MEMORY_OS_LOG_PATH` | Server、Hook | 日志文件；建议显式配置绝对路径 |
| `PORT` | Node Server | 监听端口，默认 `3000` |
| `CODEX_MEMORY_OS_SERVER_PORT` | Vite 开发服务器 | `/api` 代理目标端口，默认 `3000`；不改变 Node Server 端口 |

Server 的 Asset Repository、SQLite 和 Workspace 配置三条核心路径必须是绝对路径。`asset:confirm` 只需要 Asset Repository 与 Workspace 配置，不需要 SQLite。

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
- 七个只读 REST：
  - `GET /api/assets`
  - `GET /api/assets/:assetId`
  - `GET /api/inbox`
  - `GET /api/task-loadouts`
  - `GET /api/task-loadouts/:taskId`
  - `GET /api/usages`
  - `GET /api/system/status`

未知 API、静态资源和页面返回 404，不回退到 Hub 首页。上述 REST 路径的 `POST`、`PUT`、`PATCH`、`DELETE` 返回 405。

使用 `Ctrl-C`（SIGINT）停止前台进程；进程管理器也可发送 SIGTERM。Server 会关闭 HTTP 连接、Watcher 和 SQLite 连接。应先启动 Server，再启动依赖它的 Codex MCP Client；不要为此项目额外建设守护进程或服务管理平台。

## Codex Hook

构建后入口：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/server hook:user-prompt-submit
```

该命令从 stdin 接收 Codex Hook JSON，并在 stdout 返回 `hookSpecificOutput.additionalContext`。它只做可信 cwd→Workspace、Task 创建/复用/显式 attach 和已保存 Loadout 的读取；首次 Hook 不自动 Resolve，后续 Turn 也不自动刷新 Loadout。Stop、Interrupt、SessionEnd 输入当前为无输出 no-op，不会推导 Task 终态。

同一 Session 只在同 Workspace 中存在唯一 RUNNING Task 时复用。跨 Session 必须在提示中显式携带 `taskId: tsk...` 或 `taskId=tsk...`；Workspace 不一致、终态 Task 或同 Session 候选歧义时 fail closed。

项目只提供以下 `hooks.json` 形状，不会创建或修改用户配置：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH='/absolute/asset-repository' CODEX_MEMORY_OS_DATABASE_PATH='/absolute/runtime/codex-memory.sqlite' CODEX_MEMORY_OS_WORKSPACES_PATH='/absolute/config/workspaces.json' CODEX_MEMORY_OS_LOG_PATH='/absolute/logs/codex-memory-os.log' npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm --dir '/absolute/CodexMemoryOS' --filter @codex-memory-os/server hook:user-prompt-submit",
            "timeout": 10,
            "additionalContextLimit": 3000
          }
        ]
      }
    ]
  }
}
```

Codex 会从用户级或受信任项目级配置层读取 Hook；新增或变更的非托管 Hook 需要用户自行检查并信任。参见 [OpenAI Codex Hooks 文档](https://developers.openai.com/codex/hooks)。

知识 Hook 的预期配置、Task/Workspace 和依赖故障返回 exit 0、空 stdout，并向 stderr/本地日志留下诊断；非预期内部故障返回 exit 1 并记录错误。本机 CLI 已验证两者均不阻断 Prompt，知识读取仍拒绝非法资格。Hook 的 Task 连接和纯 Asset 读取连接采用 100ms SQLite busy timeout；这是每次数据库锁等待上限，不是整个文件扫描或 Hook 的总时限。

当前内容超过 3000 Unicode 字符预算时，只对已通过 F01/F02/F03 资格检查的投影降级：DIRECT 改为按需引用，仍超预算则整项省略，极端情况下仅输出可用性提示。不会截断摘要、重写保存的 Loadout、重新 Resolve 或增加 Usage。

## 显式结束 Task

先配置确切的 `CODEX_MEMORY_OS_DATABASE_PATH`，使用现有 Task ID：

```bash
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm --filter @codex-memory-os/server task:complete --task-id 'tsk123'
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm --filter @codex-memory-os/server task:cancel --task-id 'tsk123'
```

两者是互斥选择。只有 RUNNING 可以转换到 COMPLETED/CANCELLED；终态重复操作和跨终态转换按既有契约返回 `INVALID_TASK_TRANSITION`，不会重新写入。成功退出 0，失败退出 1，stderr JSON 保留 Task 错误码。命令不创建缺失数据库，不修改 Loadout/Usage/Binding，也不增加 MCP 工具或 Hub 写能力。

## MCP

Codex 的 Streamable HTTP 配置示例：

```toml
[mcp_servers.codex_memory_os]
url = "http://127.0.0.1:3000/mcp"
required = false
```

`required=false` 使本地知识服务初始化失败时不阻断普通 Codex 启动；参见 [OpenAI Codex MCP 文档](https://developers.openai.com/codex/mcp)。本项目不会修改用户全局 MCP 配置。当前 Desktop 中已经存在的任务不保证热加载新增 MCP 配置，配置后应新建任务验证。

六个工具：

| 工具 | 边界 |
|---|---|
| `asset_search` | 按 `taskId` 取得可信 Workspace；返回实际 Asset，并 best-effort 写 Recall Usage |
| `asset_read` | 按 `taskId + assetId` 读取当前 Markdown，并 best-effort 写 Read Usage |
| `asset_mark_used` | 校验相同 Workspace 资格后显式、幂等写 Used Usage |
| `task_loadout_resolve` | 仅显式调用；用 Task 初始 request/可信 Workspace 整体覆盖 RUNNING Task 的 Loadout |
| `task_loadout_get` | 读取一个 Task、冻结 Loadout 和按 `taskId + assetId` 关联的 Usage |
| `task_loadout_list` | 只读列出 Task Loadout 摘要 |

MCP 参数不能覆盖 Workspace，也不能提交任意路径。`task_loadout_resolve` 只用于已经取得人工确认的显式动作；Hook 不会自动调用它。当前没有 Asset 确认或移动 MCP 工具。

## 单文件人工确认

确认前先由人检查文件内容并取得当前实际 SHA-256。一次只确认一个 `inbox/` 文件：

```bash
CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH='/absolute/asset-repository' \
CODEX_MEMORY_OS_WORKSPACES_PATH='/absolute/workspaces.json' \
npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/server asset:confirm -- \
  --relative-path 'inbox/workspaces/example-project/memories/example.md' \
  --expected-content-hash '<64位小写sha256>'
```

命令只接受 Inbox 源路径和必填 Hash，不接受目标路径。目标由 `inbox/...` 机械映射到 `assets/...`；使用 no-clobber 复制，不覆盖已有目标，并在删除源前后复核实际字节和 Scanner 资格。

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

源删除前失败时，命令只清理由本次创建且身份未变的目标，保留源。若源已删除后目标被命令外部修改或删除，命令会报 `POST_MOVE_VALIDATION_FAILED`，不会自动重建源；按返回的两个仓库相对路径人工核对，不要盲目重试。

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

`--offline` 是操作人确认所有写进程已停止；命令不会停止进程，也不证明不存在其他空闲写进程。命令先获得完整 Scanner Snapshot，再打开已存在数据库，在单个 EXCLUSIVE 事务里重建 Catalog/FTS 及其索引，保留 Task、Loadout、Binding、Usage 和其他非派生表。失败回滚并退出 1；不完整扫描、缺失/损坏数据库或锁冲突不会被伪装成空库成功。成功退出 0 后重新启动 Server，检查 `/api/system/status` READY 和实际 Search/Read。服务启动会等待 Watcher ready 后再完整复核一次，才对外报告 READY。

**数据库整体丢失或文件损坏是另一种恢复边界。** 本命令不能恢复 Task/Usage，也不自动新建整库、覆盖备份或执行重置。只能在另行明确接受运行历史损失后安排整库恢复，不能以这种方式代替派生索引修复。

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

- 只验证目标 macOS ARM 本机环境；网络文件系统、其他操作系统和其他架构未验证。
- ID 保留 `ast/tsk/usg` 加十进制数字的字符串契约，兼容旧 ID；新 ID 在 Snowflake 后组合 128 位随机量，避免多个独立进程固定 node=0、同毫秒同序列的确定性冲突。长度增加，不应转为 JavaScript Number；随机碰撞概率极低但不构成绝对唯一证明，SQLite 唯一约束继续保留。
- Loadout 的 `200/300` 分数阈值、`3000` Unicode 字符和最多 `8` 个 Asset 只完成确定性 fixture 消融，不是长期质量结论。
- Task 终态不从 Stop、Interrupt 或 SessionEnd 自动推导。
- 不自动捕获、确认、批量移动或长期评估知识。
- Hub 与七个 REST API 只读；MCP 只有 Usage 和显式 Loadout Resolve 的受限写入。
- M00～M05 旧知识人工整理尚未开始；只验证了合成 M03/M04 接入契约，没有读取或迁移正式旧知识。
- N13 的 `scenarioAssumptions.estimatedExplicitReads` 是场景假设，不是实际 Read 次数测量，也不证明质量提升。
- 本轮真实 Codex CLI 使用隔离配置和脚本化本地 Responses 端点验证 Hook/MCP；没有调用真实模型或验收 Desktop 人工信任/多窗口。
- 没有正式长期数据验收，也没有修改用户全局 Codex/MCP/Hook 配置。
- N12 在源删除后若遭遇命令外部的目标破坏，需要人工核对，不提供恢复平台或分布式锁。
