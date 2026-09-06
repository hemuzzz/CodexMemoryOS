# 最终契约核对与 Desktop 验收清单

日期：2026-09-06。性质：**定向契约核对及验收准备完成；真实 Desktop 验收尚未执行。** 本文中的配置和操作均为待批准草案，没有应用到客户端。

当前状态以 [最新合并记录顶部及 R1–R10](07-F04-快照差异与组合移动修复记录.md) 为准：F04 已由用户复核；F05/U04、F06、F07、U02、U03 已实施并通过自动验证，等待用户复核；F01/S01、F02、F03 原人工复核状态不变。U05 已完成本机浏览器检查。U01 已完成真实 CLI＋脚本模型的隔离验证，正常 Desktop 信任、配置生效、多窗口和真实模型仍待验收。N00–N13 保持实现完成，**整体 NO-GO 保留**。

## 1. 本轮范围与证据基线

- 单 Agent 串行，只新增本文。不修改业务源码、测试、依赖、锁文件、现行设计、个人配置、持久信任、真实知识或运行数据库；不执行确认、迁移、重建、Task 终态或 Git 写操作。
- 当前 HEAD：`de5e332b82de40ac014037812ceca913e722cb75`。开始时重新采集 **142 个 tracked／非忽略 untracked 文件**的 SHA-256；已有 **26 项工作区变更**，不沿用上一轮 135 文件基线。
- 已读项目 `AGENTS.md`、文档／数据与行为／验证约定、README、主设计 §7 与 §21.17、合并记录及必要源码、正式测试。CodeGraph 仅辅助定位生成器和消费者，结论回到当前源码核验，未刷新图索引。
- 项目规则通常要求新文档更新索引；本轮“只允许新增一份清单”的明确范围优先，因此不改索引。本文使用当前源码行号，不沿用旧报告行号。

## 2. U03 当前契约结论

### 2.1 实际生成与兼容含义

当前实现确为：

```text
S = snowflake.io 生成的整数（node=0，clockSkewHandler="throw"）
R = node:crypto.randomBytes(16) 表示的无符号 128 位随机量
ID = prefix + decimal((BigInt(S) << 128n) | R)
prefix ∈ { ast, tsk, usg }
```

证据：`packages/id-generator/src/index.ts:13`、`:15`、`:25`、`:26`、`:27`、`:30`。这里是整数位组合后转十进制，**不是将两个十进制字符串拼接，也不是原始 Snowflake 数值**。业务接口输出 `string`，`bigint` 留在生成器内部。

新旧格式共同经过 `^(ast|tsk|usg)[0-9]+$` 及可选 expectedPrefix 校验。验证器没有固定数字位数、生成年代标志、Snowflake 位布局或取值范围检查；它不证明某个字符串确由生成器产生。旧 ID 不补位、不重新编号，不迁移 Loadout／Usage 关联；长复合 ID 仍按原字符串通过各入口。这里能确认的是**格式、存储与现有消费者兼容**，不能扩张为“所有旧数值语义完全兼容”。

### 2.2 A／B／C／D 分类

| 分类 | 本轮结论 | 当前证据及证明边界 |
|---|---|---|
| A：已有实现和正式验证 | 复合公式、三种前缀、JSON 字符串、原回退拒绝规则已落地 | 生成器上述行号；`packages/id-generator/test/id-generator.test.ts:6`、`:36`、`:44`。公式来自源码，测试没有逐位解码证明公式，不能混称 |
| A：多进程原反例 | 8 个固定同毫秒真实子进程的三种前缀不再出现原确定性碰撞；共享 SQLite 的 8 个 Task／Usage 写入通过 | `packages/id-generator/test/multiprocess.test.ts:5`、`:20`；`apps/server/test/multiprocess-identity.test.ts:24`、`:35`。历史先红后绿和 src／dist 结果见合并记录 R5、R8；有限样本不证明绝对唯一 |
| A：字符串通路 | Markdown、Catalog、Task、Loadout、Usage、HTTP／MCP／Hub 按字符串传递；既有旧短 ID 样本和新生成 ID 在回归中使用 | 下节消费者表；如 `multiprocess-identity.test.ts:27` 使用旧 `ast301`，新 Task／Usage 同时真实落库；综合结果复用 R8，不把每一语义均宣称有独立专项测试 |
| B：最新说明基本准确但不完整 | README 与 §21.17 已明确“组合 128 位随机量”，没有继续把新数字部分单独定义为原始 Snowflake；仍缺精确公式和“兼容”的边界 | `README.md:331`；主设计 `:1777`。README 已说明长度增加、不能转 JS Number、随机碰撞非绝对不可能 |
| B：历史正文衔接缺口 | §7.1 仍写“前缀＋Snowflake 十进制字符串”；§7.3 仍写“单个 Node 主服务负责生成 ID” | 主设计 `:331`、`:397`；独立 Hook 实际在 `apps/server/src/hook/user-prompt-submit.ts:119` 建生成器，经 `task/service.ts:56` 生成 Task。§21.17 已解释多进程修订，但宜明确旧段落由其补充取代 |
| B：测试名称与当前含义 | 旧测试名中的 underlying Snowflake values 实际已指去前缀的复合数字串 | `id-generator.test.ts:23`、`:31`、`:33`；证明 20,000 个复合值唯一，没有解码旧 Snowflake。本轮不改测试标题 |
| C：有消费者证据的兼容问题 | **本轮核对范围内未发现依赖旧 Snowflake 数值而失效的具体生产消费者** | 下表列出实际数值转换和 ID 排序，未以“正则匹配”代替消费者核查。仓库外脚本或下游系统未调查，不虚构缺陷，也不为其承诺兼容 |
| D：需用户确认的契约选择 | 是否正式接受“复合且不透明的字符串身份；兼容旧值，但不承诺原始 Snowflake 解码／时间／数值排序语义”的补充文字 | 默认保留当前实现。下方仅给候选文本，未修改设计、README，未视作用户批准 U03 |

### 2.3 实际消费者核对

下表的 Server 路径均从 `apps/server/src/` 起；Hub 路径从 `apps/hub/src/` 起。核对范围是现有生产入口及相关正式测试，不包括未知外部消费者。

| 消费面 | 当前源码与行号 | 结论 |
|---|---|---|
| Frontmatter／文件进入系统 | `asset/schema.ts:14`；`asset/scanner.ts:91`、`:109`；`asset/confirmation.ts:256`、`:431` | ID 字符串验证、原字节 Hash、确认后身份相等检查；不会从 ID 解码时间或重新生成旧身份。Confirm 仅阅读源码，本轮未执行 |
| 长期派生和运行数据 | `asset/catalog.ts:7`；`task/repository.ts:15`、`:19`、`:27`；`usage/repository.ts:13`、`:24` | ID 为 SQLite TEXT；Loadout 为 JSON TEXT；无固定 ID 位数列。资产身份、Task、Usage 各自保留，不按数字转换或路径转移关联 |
| 冻结 Loadout | `loadout/policy.ts:29`；`loadout/service.ts:111`、`:266`、`:297` | assetId 正则无数字长度要求，数组按 JSON 保存。解析／展示保留字符串，不通过 ID 恢复时间；长 ID 计入真实渲染预算 |
| Task 取得与 attach | `task/service.ts:44`、`:56`、`:73`；`hook/user-prompt-submit.ts:225`、`:241` | 提取并验证完整 tsk 字符串；按精确字符串查库；没有固定长度切片或旧 Snowflake 解码 |
| HTTP／MCP | `http/contracts/index.ts:75`；`mcp/tools.ts:39`、`:52`、`:60` | 路径及工具参数用字符串，不接收数值 ID；Workspace 从 Task 取值。MCP get/list 返回已有 DTO，不能把只读 DTO 当成新身份生成器 |
| Hub URL、展示、Raw JSON | `apps/hub/src/api/client.ts:41`、`:56`；`views/TaskLoadoutsView.vue:53`、`:274`、`:307`、`:342`、`:362`；`styles.css:186`、`:211`、`:223`、`:276` | URL encodeURIComponent、Vue 字符串绑定、JSON.stringify；长值换行／显示省略不改变实际值。序号函数 `TaskLoadoutsView.vue:194` 接收数组 index，不是 ID 数值 |
| 真正的 ID 排序 | `asset/search.ts:799`、`:883`、`:888`；`task/repository.ts:164`、`:184`、`:437`；`usage/repository.ts:177`、`:217` | Search 的 ID 是同分兜底；资产列表先按 modifiedAt 或 score；Task／Usage 列表先按 updated_at 再按 TEXT ID；Session 候选按 ID 排序，但多候选会报歧义，不取“最大 ID”作为最近 Task。Usage 按 asset_id 排序也是展示顺序 |
| 实际数值转换 | `runtime.ts:79`；`task/repository.ts:131`；`usage/repository.ts:101`；`asset/catalog.ts:318`；`asset/search.ts:818` | 分别是端口、外键 PRAGMA、SQLite 派生 rowid 和 score；**不是业务 ID**。生产 BigInt 位操作仅在统一生成器中发现 |
| 导入／导出边界 | README 的 Markdown／Confirm、七个只读 REST 与六个 MCP 工具；`apps/server/package.json` 的现有命令 | 当前是文件读取／人工维护、JSON DTO 和原始 Markdown 展示，无另一个已实现的通用迁移或数值 ID 导入导出平台。上述现有入口没有旧数值语义依赖；未执行真实迁移、备份还原或仓库外 CSV／脚本验证 |

**排序兼容的准确界限：** 旧、新 ID 混合时，十进制字符串字典序不等于数值序或创建时间序；同一个 Snowflake 高位下，随机低位也不表达跨进程先后。当前排名相同时，ID 兜底可能影响相对顺序及 limit 截点。这是已存在的“按 ID 确定顺序”消费者，不能写成“没有 ID 排序”；但没有证据表明其契约承诺按 Snowflake 业务时间排序。本轮不改变排名、分页或时间字段。

**随机性与唯一约束：** 每次调用取 Node crypto 的 16 字节随机量，不是每进程一次小范围 worker 抽签。两个 ID 要完全碰撞，需要前缀、高位 Snowflake 和随机低位同时相同；在独立均匀随机假设下，给定相同前缀及高位的一对 ID，低位相等概率为 `2^-128`。数据库 PRIMARY KEY／UNIQUE 保留，碰撞会按现有约束失败，不会静默覆盖；数据库只约束本库，不提供不同 Repository 之间的全局注册。现有测试没有人为注入随机源失败，也不证明跨重启时钟水位或无限运行无碰撞。README:331 与 R5 的“极低概率、非绝对唯一”说明准确。

### 2.4 最小候选补充文本（未批准、未应用）

建议将来只补 §21.17／README，并让 §7 指向该补充，不重写历史实现记录：

> 当前新 ID 为三位业务前缀，加整数 `((Snowflake << 128) | R)` 的十进制字符串，其中 R 为每次生成取得的 128 位随机量。数字部分是复合身份，不是原始 Snowflake；ID 在业务接口、Markdown、JSON、SQLite 和 UI 中均视作不透明字符串。旧合法 ID 保持原值和关联，不补位、不重编号。兼容范围为现有字符串验证、保存和传递，不承诺固定长度、原始 Snowflake 解码、由 ID 推导业务时间或按 ID 获得时间顺序；时间使用显式时间字段，已有 ID 同分排序仅用于确定顺序。统一生成器可由同机主服务和独立 Hook 使用；保留进程内时钟回退拒绝及数据库唯一约束，不承诺绝对无随机碰撞或跨重启全局时间水位。

需用户确认的是该生成及消费契约的正式表述，不是再次授权实现 U03。没有证据要求换 UUID／ULID、分配 worker 或改 Hook 进程边界。

## 3. Desktop 验收环境与配置草案

### 3.1 当前可确认与不可确认的环境

本轮只读核验：macOS 26.6.2 arm64；`/opt/homebrew/bin/codex --version` 为 **0.153.2**；`npx` 路径为 `/opt/homebrew/bin/npx`。运行进程位于 `/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/...`；应用 Info.plist 为 `CFBundleIdentifier=com.openai.codex`、版本 **26.901.41123**、build **7942**。不能把 CLI 版本当成 Desktop 版本。

没有读取个人配置／认证值，没有操作 Desktop 设置、信任或测试窗口；当前可用真实模型、项目配置实际加载、Hook 信任 UI 和 MCP 连接状态均待现场确认。验收时再次记录版本和用户在界面选择的实际模型，不指定一个猜测的模型名。

官方当前资料确认项目 `.codex/config.toml` 和 `.codex/hooks.json` 的配置方式，项目层需要信任；不同层的 Hook 会合并，项目配置不能自动覆盖掉已有全局 Hook。非托管 Hook 按当前定义的 hash 信任，修改后需要重新审查。官方明确的 `/hooks` 审查命令属于 CLI；**本文未确认本机 Desktop 有同名按钮或斜杠入口**。正式操作由用户在实际 Desktop 提示／设置中审查；如果该版本没有正常信任入口，记录具体阻碍，保留该项未通过，不能用信任绕过替代。[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)

官方 MCP 文档提供项目配置、Streamable HTTP `url`、`required`，并说明本机客户端共享同一 host 的配置。设置变更后应重启相应连接／新建任务验证，不能假定当前任务热加载。以下采用项目文件草案，不调用可能写用户级配置的 `codex mcp add`。实际工具名以客户端显示的命名空间元数据为准，不手拼命名空间。[官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

### 3.2 待批准的最小写入范围

未来只在新建 `/private/tmp/codex-memory-desktop-XXXXXX/` 下准备：

```text
alpha/.codex/config.toml       beta/.codex/config.toml
alpha/.codex/hooks.json        beta/.codex/hooks.json
repository/assets/{global,workspaces/alpha,workspaces/beta}/memories/
config/workspaces.json        runtime/desktop.sqlite（由项目程序初始化）
logs/                         evidence/manifest.json
hook-observe.mjs               evidence/hook-<唯一值>.json
```

两个窗口分别打开 alpha、beta **本地目录**，不使用会改变 cwd 的 worktree。Repository、DB、观察证据放在两个项目目录之外，且全部为合成样本。每个 Asset 仍为 SINGLE_ONLY；两个测试 Workspace 不改变 W01 模型。

拟新增两个项目的 MCP 名均为 `codex_memory_os_desktop_check`，只在各自项目生效。MCP 表仅含 loopback URL、`required=false`；Hook 只注册 UserPromptSubmit，显式指定四条测试路径、Node 路径和已构建入口。**不修改 `~/.codex/config.toml`、`~/.codex/hooks.json`、模型／认证／沙箱全局选项。** 用户正常项目／Hook 信任可能由客户端写入该 host 的信任记录，这一必要持久变化仍须本轮结束后的明确确认，不能声称“项目文件局部所以完全没有个人状态变化”。

应用前由用户展示当前有效 Hook 来源及同名 MCP 项，Codex 只核对相关条目，避免完整环境／配置输出。若已有全局 Hook 会接触真实库，或存在同名服务、管理员禁止项目 Hook，暂停受影响步骤；项目层合并不能隔离这些副作用，本文不授权禁用其他 Hook 或扩大配置修改。

### 3.3 可执行准备命令草案——批准后才执行

下面的脚本是**尚未运行的验收夹具草案**，不是本轮交付的新生产脚本。使用现有 dist 和锁定 Node／pnpm；缺失产物、版本或原生 SQLite ABI 不匹配时先记录，不自动 install／升级／修改锁文件。正式启动与 Hook 命令来自 `README.md:153`、`:181` 和 `apps/server/package.json`。

先在操作终端设置本次变量并创建唯一测试根；不要改 HOME／CODEX_HOME：

```bash
export CM_REPO='/Users/hemu/Desktop/github/CodexMemoryOS'
export CM_RUN="$(mktemp -d /private/tmp/codex-memory-desktop-XXXXXX)"
cd "$CM_REPO"
/opt/homebrew/bin/npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --filter @codex-memory-os/server exec node --input-type=module <<'JS'
import { mkdir, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
const root = await realpath(process.env.CM_RUN);
const repo = await realpath(process.env.CM_REPO);
const { SnowflakeIdGenerator } = await import(pathToFileURL(join(repo, 'packages/id-generator/dist/index.js')));
const generator = new SnowflakeIdGenerator();
for (const p of ['alpha/.codex', 'beta/.codex', 'config', 'runtime', 'logs', 'evidence']) {
  await mkdir(join(root, p), { recursive: true });
}
const workspaces = ['alpha', 'beta'].map(name => ({ name, paths: [join(root, name)] }));
await writeFile(join(root, 'config/workspaces.json'), JSON.stringify({ schemaVersion: 1, workspaces }, null, 2));
const samples = [];
for (const scope of ['global', 'alpha', 'beta']) {
  const id = generator.next('ast');
  const value = randomBytes(12).toString('hex');
  const folder = join(root, 'repository/assets', scope === 'global' ? 'global' : `workspaces/${scope}`, 'memories');
  await mkdir(folder, { recursive: true });
  const fields = [`id: ${id}`, 'type: MEMORY', `scope: ${scope === 'global' ? 'GLOBAL' : 'WORKSPACE'}`];
  if (scope !== 'global') fields.push(`workspace: ${scope}`);
  fields.push(`title: desktopfixture ${scope}`, `summary: DESKTOP_${scope.toUpperCase()}_SUMMARY 合成验收知识`);
  const file = join(folder, `${scope}.md`);
  await writeFile(file, `---\n${fields.join('\n')}\n---\n\n验收值：${value}\n`);
  samples.push({ scope, id, file, value });
}
const probe = createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const manifest = { root, repo, node: process.execPath, nodeVersion: process.version, port, samples };
await writeFile(join(root, 'evidence/manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ root, port, node: process.execPath, nodeVersion: process.version }));
JS
```

端口探测只分配候选值，关闭探测到 Server bind 之间仍可能被占用。若启动失败，重新选择空闲端口并更新**本次两个草案文件**后再信任；不使用 `PORT=0`，不假定固定端口空闲。生成的新 ID 使用正式 dist 生成器，合成文件直接位于隔离 assets，不调用资产确认或迁移。

观察实际 Desktop Hook 子进程需要保留它的真实输入标识与输出。以下测试侧包装只把 stdin 原字节传给正式 dist Hook，并原样转发 stdout／stderr；不伪造事件、不自建 Task／Loadout、不增加 watcher，不打印完整环境或认证值。正式验收使用这个已审查包装，CLI 手工喂事件不能替代 Desktop 触发。

将以下内容保存到 `$CM_RUN/hook-observe.mjs`（同样待批准）：

```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const root = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(root, 'evidence/manifest.json'), 'utf8'));
const input = readFileSync(0);
const event = JSON.parse(input.toString('utf8'));
const selected = {
  CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: join(root, 'repository'),
  CODEX_MEMORY_OS_DATABASE_PATH: join(root, 'runtime/desktop.sqlite'),
  CODEX_MEMORY_OS_WORKSPACES_PATH: join(root, 'config/workspaces.json'),
  CODEX_MEMORY_OS_LOG_PATH: join(root, 'logs/hook.log'),
};
const child = spawnSync(m.node, [join(m.repo, 'apps/server/dist/hook/user-prompt-submit.js')], {
  input, env: { ...process.env, ...selected }, maxBuffer: 1024 * 1024,
});
const evidence = {
  sessionId: event.session_id, turnId: event.turn_id, cwd: event.cwd,
  event: event.hook_event_name, node: m.node, nodeVersion: process.version,
  selected, status: child.status, signal: child.signal,
  error: child.error?.message, stdout: child.stdout?.toString(), stderr: child.stderr?.toString(),
};
try { writeFileSync(join(root, 'evidence', `hook-${randomUUID()}.json`), JSON.stringify(evidence, null, 2)); }
catch (error) { process.stderr.write(`DESKTOP_OBSERVER_FAILED: ${error.message}\n`); }
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exitCode = child.status ?? 1;
```

观察器自身异常／缺日志须使本项验收失败，不能当成生产 Hook 故障证明。记录只含测试路径、标识和合成输出；不读取 transcript_path、不保存真实用户 Prompt。验收期间不在测试项目里提问真实业务内容。

批准后生成两个项目配置，command 使用已确认的 Node 绝对路径，避免 GUI PATH／npx 缓存启动延迟。它执行的正式模块正是 `hook:user-prompt-submit` 脚本指向的文件：

```bash
/opt/homebrew/bin/npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --dir "$CM_REPO" --filter @codex-memory-os/server exec node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const m = JSON.parse(await readFile(join(process.env.CM_RUN, 'evidence/manifest.json'), 'utf8'));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const command = `${quote(m.node)} ${quote(join(m.root, 'hook-observe.mjs'))}`;
const hooks = { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command, timeout: 10, additionalContextLimit: 3000 }] }] } };
for (const project of ['alpha', 'beta']) {
  await writeFile(join(m.root, project, '.codex/hooks.json'), JSON.stringify(hooks, null, 2), { flag: 'wx' });
  await writeFile(join(m.root, project, '.codex/config.toml'), `[mcp_servers.codex_memory_os_desktop_check]\nurl = "http://127.0.0.1:${m.port}/mcp"\nrequired = false\n`, { flag: 'wx' });
}
JS
```

不额外注册同一 Hook 的 inline TOML 版本。`additionalContextLimit` 是客户端输出处理配置；项目 Renderer 的 3000 Unicode 字符预算是另一层规则，不将两者当成相同计量单位。

启动终端从 manifest 读取并核对实际端口后运行正式命令；`<manifest.port>` 必须替换为真实数字：

```bash
export CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH="$CM_RUN/repository"
export CODEX_MEMORY_OS_DATABASE_PATH="$CM_RUN/runtime/desktop.sqlite"
export CODEX_MEMORY_OS_WORKSPACES_PATH="$CM_RUN/config/workspaces.json"
export CODEX_MEMORY_OS_LOG_PATH="$CM_RUN/logs/server.log"
export PORT='<manifest.port>'
/opt/homebrew/bin/npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --dir "$CM_REPO" --filter @codex-memory-os/server start
```

保留前台终端和启动 PID／时间，用 Ctrl-C 停止本次进程。不要用按进程名批量 kill，也不要启动第二套 watcher。没有必要启动 Vite；构建 Server 已提供 Hub。

### 3.4 分别确认服务和 Hook 的配置生效

| 对象 | Codex 观察步骤（批准后） | 通过标准 |
|---|---|---|
| 主服务 | 记录启动终端明确传入的四路径与 PORT；GET `http://127.0.0.1:<PORT>/health`、`/api/system/status`；在隔离 DB 只读查询 Catalog | HTTP 正常，status 的 `service.readiness`、`index.indexState` 均 READY，watcher RUNNING，`repository.assetRepositoryPath` 等于测试根，3 个正式 Asset／3 条 Catalog／FTS；两个 Workspace 配置有效，无扫描诊断 |
| 主服务 DB／Workspace | 检查只读 Catalog 中 manifest 的三组 ID／scope／workspace／路径，再看实际 Task／Usage 写入的测试 DB | 不以 `/health` 成功代替路径证明。Status 不暴露完整 DB 路径，不能虚构响应字段；用启动环境和数据库实际效果交叉核验（`http/service.ts:204`） |
| 实际 Hook 子进程 | 用户真实发 Turn 后读本次 `hook-*.json`，检查 selected 四路径、node、cwd、sessionId／turnId、status 和 stdout | 不是 Server 环境的推测；alpha／beta cwd 映射与 DB 的 task.workspace 一致。stdout 是正式 Hook 的 JSON；后续非空 Loadout 输出包含允许的摘要 |
| Desktop MCP | 用户重启相关连接／新建本地任务，展开有效服务列表和一次工具调用详情 | URL 是本次端口，六工具可见；真实调用返回项目 structuredContent。配置文件存在、CLI 能连接或模型口头说可用均不足 |

## 4. 真实 Desktop 验收步骤与观察标准

**以下各项当前状态全部为 NOT_EXECUTED，不是 PASS。** Codex 负责夹具、启动、只读证据采集和对照；用户负责批准配置范围、正常信任、连接重载、新建／打开两个真实 Desktop 窗口、选取真实模型及发出指定操作。实际模型调用会使用用户正常模型服务，只有合成样本进入模型；不替换 model_provider、不启动脚本 Responses 服务。

### 4.1 执行顺序

| 步骤 | 操作者和动作 | 通过标准／应保存的证据 | 恢复或失败处理 |
|---|---|---|---|
| D0 范围确认 | 用户确认 §2.4 契约候选及 §3 的局部配置／正常信任方案；Codex 再记录执行时版本和原有效相关配置 | 变更清单只覆盖两测试项目及对应信任；真实知识 Hook 没有叠加执行 | 未确认不创建夹具／改配置；配置冲突不擅自覆盖 |
| D1 隔离服务 | Codex 按 §3 准备、启动，核对 READY 和三个真实文件／ID／Hash | 保存 manifest、启动参数、status JSON 和初始只读数据库快照；所有路径在本次根下 | 端口冲突换本次端口；启动失败保留真实诊断，不 rebuild 或移走 DB |
| D2 正常信任 | 用户在 Desktop 添加 alpha 本地项目，审查项目层及 Hook 当前定义并正常信任；重载／新建任务，记录界面证据 | 当前项目配置实际加载，Hook 未信任时不执行，信任后执行。若客户端先要求信任才能发 Prompt，以其正常流程记录，不人为制造绕过 | 实际版本无可用入口则本项未通过；不写信任 store、不用一次性 bypass。CLI `/hooks` 只可另作正常流程诊断，不能冒称已操作 Desktop UI |
| D3 新 Task 和非空 Loadout | alpha 新 Session 首条 Prompt 只发 `desktopfixture`；从 Hook／只读 DB 取得 tsk ID。下一 Turn 用户明确允许模型调用 `task_loadout_resolve`，只给该 taskId；之后再发一条不调用工具的普通 Prompt | 首次 Task.workspace=alpha、初始 request 精确为 desktopfixture；首次 Loadout 可为空（不自动 Resolve）。显式 Resolve 后有 alpha＋GLOBAL 的 MEMORY；随后真实 Hook stdout 含两项 SUMMARY，无 BETA_SUMMARY | 初始请求关键词被其他文字污染、模型未调用或擅自多调时记录实际事件；不改 Task.request／直接 SQL 修 Loadout。必要时新建测试 Session 重做，保留原证据 |
| D4 非空 Workspace Search／Read | 用户要求模型依次按下方准确入参调用 Search，Read alpha，再 Read GLOBAL；再用 alpha taskId 对 beta assetId 各尝试一次 Read 和 Mark Used | Search 恰好可见 alpha＋GLOBAL；两次允许 Read 返回当前文件和 Hash；beta Read／Used 返回 `ASSET_NOT_ACCESSIBLE`，无 beta 正文／摘要，Usage 不产生 beta 项 | 不把 Hub 人工全库浏览当越权；不传任意 workspace／路径，不修改样本权限 |
| D5 真实模型使用 | 用户要求模型仅依据实际 MCP Read 返回的两条“验收值”逐字回答，并分别列出来源 assetId；明确只将 alpha 标记 Used，随后再显式重复一次 alpha Used | 客户端工具详情有真实成功结果；答案等于 manifest 中 alpha 和 global 的正文值，正文值预先不在 Prompt／摘要中。真实 `asset_mark_used` 成功，alpha used_flag=1；重复调用后整行不变 | 若模型通过 shell／文件读取、预先看 manifest 或猜答案，则该条不能算真实 MCP 使用验证，记录并以新随机样本另行重做 |
| D6 同 Session 多 Turn | 在 alpha 原 Session 连续两次纯普通 Prompt，明确不调用 MCP／文件工具；读取实际 Hook 证据 | sessionId 相同、turnId 不同、taskId 相同；每新 Turn 增一个对应 Binding，Loadout 原 JSON 和 Task 行不变，Usage 所有字段不变；合法摘要仍输出 | 若模型实际调用工具，按真实调用计数，这一轮不能作为纯投影零计数证据 |
| D7 跨 Session 显式 attach | 用户在同一 alpha 项目新建独立任务／Session，首条含 `taskId: <alpha tsk ID>`，要求仅查看已注入上下文，不 Resolve | 新 sessionId 与新 Binding 指向原 RUNNING Task；无新 Task，无 Loadout 改写，Usage 不变；Hook 正常输出 alpha＋GLOBAL | Session 只是 UI 看起来不同不够，按真实 event 标识确认；不 attach 终态，不用服务端手工伪造 Binding |
| D8 两个 Desktop 窗口 | 用户保留 alpha 窗口，同时在第二个窗口打开 beta 本地项目；正常信任 beta 配置。beta 首条同样只发 desktopfixture，显式 Resolve；交替发纯 Prompt，再在 beta 用 beta taskId Search／Read beta，尝试 Read alpha | 两个真实窗口同时存在；不同 Session、可信 Workspace 正确；beta 只见 beta＋GLOBAL、Read alpha 被拒绝，alpha 窗口继续正常。分别比对每个 Task 的 JSON／Usage；记录窗口、Session、Task 对照表 | 两个 CLI 或同窗口两条对话不能代替多窗口；不要求并行 Agent。跨 Workspace attach 可作为附加负例，失败不得创建错误 Binding |
| D9 服务故障和恢复 | Codex 对本次前台 Server Ctrl-C，用户在既有 Session 发不依赖知识的普通 Prompt；再新建一个测试 Session 验证可选 MCP 启动失败不阻断真实模型回复。然后 Codex 用原参数重启，用户重连／新建连接验证 `task_loadout_get` 和一次 Read | 离线时 Prompt 真正完成、有真实模型答复，不伪造工具成功；恢复后 READY，get／Read 返回当前样本；get 零计数，Read 正常计数 | 停服务不等于独立 Hook 无法读文件／DB，所以允许 Hook 仍有合格上下文。不要据此误判 F05。若没有自动重连，只记录用户执行的连接重启步骤，不改 required=true |
| D10 Hook 依赖故障和恢复 | 作为 F05 Desktop 必验子项，Codex 先备份**本次** workspaces.json 的原字节，再临时改为无效 JSON；用户在已有测试 Session 发纯普通 Prompt；之后恢复原字节，等 status READY 再发一条纯 Prompt | 真实 Hook exit 0、stdout 为空，stderr／本地日志有不可用诊断，模型 Prompt 仍完成；故障前后既有 Task／Usage／Loadout 不变，配置解析失败阶段不产生 Binding；恢复 Turn 正常增加 Binding、输出合格摘要 | 不改个人配置或 Hook 定义来注入故障；无论断言是否通过都恢复本次配置原字节。故障期间不发 Resolve／Used；不将普通失败包装成成功 |
| D11 结算与撤销 | Codex 汇总各阶段行差异、调用证据、未通过项；用户审阅后按 §5 撤销本次配置 | 每次纯投影与显式工具副作用有独立证据；清理后本次 Hook／MCP 不再加载，其他配置保持 | 不执行 complete/cancel，不把测试 Task 结束作为清理前置条件 |

`desktopfixture` 必须出现在三份标题中，确保初始 request 可命中且 MEMORY 达 DIRECT 分数阈值（`loadout/service.ts:103`、`loadout/policy.ts:15`、`asset/search.ts:815`）。首次 Hook 不自动 Resolve 的行为本身是通过标准，不能用首次空 Loadout 判配置失败。必须有一次**保存非空 Loadout 之后的真实新 Turn**，才能证明 Hook 的当前 Asset 读取配置有效。

当前准确工具参数示例（尖括号替换为 manifest／实际 Task 值；每次由真实模型通过 Desktop 工具执行，不通过本轮 Agent 的 SDK 代替）：

```json
{"taskId":"<alpha taskId>"}
{"taskId":"<alpha taskId>","query":"desktopfixture","limit":10}
{"taskId":"<alpha taskId>","assetId":"<alpha assetId>"}
{"taskId":"<alpha taskId>","assetId":"<global assetId>"}
{"taskId":"<alpha taskId>","assetId":"<beta assetId>"}
{"workspace":"alpha","status":"RUNNING","limit":10}
```

第一种用于 resolve／get；第二种用于 search；第三到五种用于 read 或明确指定的 mark_used；最后一种仅用于 list，**不是 Search 的 Workspace 覆盖参数**（`mcp/tools.ts:44`、`:52`、`:60`、`:62`）。至少实际调用一次 get 和 list，并证明它们不增加 Usage。六个工具的命名空间由 Desktop 返回的元数据确定。

### 4.2 数据快照与精确计数

在初始 Resolve／测试准备完成后采样 S0；每个独立动作前后暂停其他测试窗口发 Prompt，采样完整行，按真实工具轨迹解释差异。以下只读观察命令使用项目已有 SQLite 库；在操作终端补回相同 CM_RUN 和 DATABASE_PATH，只针对已存在的测试库：

```bash
/opt/homebrew/bin/npx -y -p node@22.16.0 -p pnpm@11.1.3 \
  pnpm --dir "$CM_REPO" --filter @codex-memory-os/server exec node --input-type=module <<'JS'
import Database from 'better-sqlite3';
const db = new Database(process.env.CODEX_MEMORY_OS_DATABASE_PATH, { readonly: true, fileMustExist: true });
try {
  const snapshot = db.transaction(() => ({
    tasks: db.prepare('SELECT * FROM task_loadout ORDER BY task_id').all(),
    bindings: db.prepare('SELECT * FROM task_turn_binding ORDER BY source_session_id, source_turn_id').all(),
    usages: db.prepare('SELECT * FROM task_asset_usage ORDER BY task_id, asset_id').all(),
    catalog: db.prepare('SELECT * FROM asset_catalog ORDER BY asset_id').all(),
  }))();
  console.log(JSON.stringify(snapshot, null, 2));
} finally { db.close(); }
JS
```

将每次 stdout 保存为本次 evidence 下不同阶段的快照文件，不能覆盖 S0。`loadout_json` 保留为原始字符串比较，不只比较解析后的对象；Usage 比较完整行，包括 usage_id、task_id、asset_id、两个计数、used_flag、created_at、updated_at。SQLite 文件本身会有正常事务变化，不要求整个数据库文件 Hash 不变。

| 动作 | Task／Binding／Loadout 预期 | Usage 预期 |
|---|---|---|
| 首个正常 Hook | 新 RUNNING Task＋Binding，空 Loadout；request 固定为首次 Prompt | 不新增 Recall／Read／Used |
| 显式 Resolve | 只按当前 Task 初始 request／Workspace 更新 Loadout 及必要 updated_at | 使用纯 Search，**不增加 RECALL**（`loadout/service.ts:98`） |
| 纯 Hook 新 Turn／显式 attach | 按契约增加 Binding；已保存 Task、Loadout JSON／顺序保持 | 全行不变 |
| 纯 get／list／REST／观察 SQL | 不修改运行行；REST 人工全库浏览边界保留 | 全行不变 |
| 一次成功 Search | 不修改 Task／Loadout | 每个实际返回 Asset 的 recall_count＋1；不可见 beta 不产生记录 |
| 一次成功 Read | 不修改 Task／Loadout | 对该 Task＋Asset 的 read_count＋1；重复成功 Read 仍计数 |
| 首次显式 Used | 不修改 Task／Loadout | used_flag 置 1，不隐含增加 Read／Recall；已有 Usage ID／created_at 保留，必要 updated_at 更新 |
| 再次 Used 同一项 | 不修改 Task／Loadout | 幂等，已 used 的整行保持，含时间字段（`usage/repository.ts:125`、`:136`、`:151`） |
| 不可访问 Read／Used | 当前资格拒绝，无对应 Markdown | 不创建／更新对应使用记录；不能拿旧 Catalog 资格作替代 |

例如 alpha 首次 Search 返回 alpha＋GLOBAL 各一次，两项各 Read 一次，只标记 alpha Used：alpha 为 `(recall=1, read=1, used=1)`，GLOBAL 为 `(1,1,0)`，beta 无该 Task 的 Usage。再次对 alpha Used 不改变行。之后故障恢复显式 Read 必须另计一次，不能要求仍为 1。实际多余调用也必须纳入账本，不弱化计数以凑预期。

MCP Search／Read 的 Usage 写入是 best-effort，业务读取可能成功但写计数失败；验收环境正常时必须同时核对无相应写失败日志及正确计数。不得仅凭 `ok=true` 宣称 Usage 通过。Used 写失败则按现有错误返回（`mcp/tools.ts:122`、`:160`、`:196`）。纯投影使用不带计数的资格 Read（`loadout/service.ts:272`），不会通过 MCP Read 偷增计数。

## 5. 仅撤销本次配置的恢复方案

1. 先恢复 D10 的测试 workspaces.json 原字节，保存其前后 SHA；停止本次前台服务并确认本次端口不再监听。只操作记录下来的本次进程，不动其他服务。
2. 用户关闭本次两个测试窗口／任务连接。经核对文件仍是本次创建版本后，撤下两个测试项目的 `.codex/hooks.json`，以及各自 config.toml 中 `mcp_servers.codex_memory_os_desktop_check` 表；若文件只有该表可撤下整个本次文件。若用户期间增添了其他内容，保留其他内容，不用旧备份整体覆盖。
3. 用户通过客户端正常界面停用／撤销**这两个来源和当前定义**的 Hook 信任、项目信任（以该版本实际支持的粒度为准），重载连接／新建任务核对本次服务和 Hook 已消失。不批量清空信任、不手改未公开 trust store、不触碰其他项目。官方 `/hooks` 明确支持逐项停用；若 Desktop 无粒度足够的撤销入口，保留“信任记录未完全撤销”的事实，不能把配置已撤下等同于记录已删除。
4. 本次测试根及 evidence 暂留供用户复核，不自动递归删除，不迁移到真实知识目录。测试 Task 保持 RUNNING 不影响它们作为隔离证据；不为清理调用终态命令。若用户之后授权删除，只删除记录中的确切本次测试根。

故障注入、恢复或配置撤销任一步失败，都保留真实结果和确切剩余变更；不写“全部清理完成”。本轮尚未创建这些文件和信任记录，**目前没有需要执行的恢复动作**。

## 6. 证据复用、门槛与停止点

复用合并记录 R5／R6／R8 的既有证据，不在本轮重跑：全量 **232/232**、typecheck 三包、build、Server dist 安全及剩余回归 **103/103**、ID 包 **5/5**、真实 CLI 八场景／六工具；其中 CLI 使用隔离 Home 与脚本 Responses，后七场景采用一次性信任绕过。F01 的 42、F02 的 20、F03/U04 的 16、F04 的 9 场景保留，不能由本文 Desktop 方案替代或削弱。上述数字是**上一轮已交付结果**，不是本轮新执行的 PASS。

本轮实际验证是源码／消费者／契约逐项核对、只读版本和应用信息核验、官方客户端文档核对，以及既有文件 SHA-256／新增文档静态检查。`git diff --check` 通过；对四个 Bash 块执行 `bash -n`，对其中三个 JavaScript heredoc 及一个观察器块执行 `node --check --input-type=module`，共 **8 项语法检查通过**。这些命令只从 stdin 检查语法，没有运行其中的夹具操作。没有运行全量套件、build、Desktop Hook、模型请求、测试数据库或配置安装；本文脚本未作真实执行验证，执行时应按前置检查逐步确认。

| 门槛 | 完成本文后的状态 | 后续解除条件 |
|---|---|---|
| U03 契约说明 | 已明确当前公式、兼容边界和候选补充，待用户确认 | 用户接受契约文字及相应 U03 独立复核；需要落入设计／README 时另按授权实施最小文档补充 |
| U01 Desktop | 准备完成，实际验收未通过／未执行 | D2–D10 的正常信任、配置、非空 Workspace、真实模型、生命周期、多窗口、故障恢复和副作用全部有实际证据并获复核 |
| 既有人工复核 | 原状态完整保留 | F01/S01、F02、F03 及其他待复核项分别由用户确认，不由 Desktop 成功自动替代 |
| 受控本机客户端可用 | 尚待 D 项执行 | 对已记录的本机版本、隔离样本、真实模型成立；不外推其他版本／OS／网络盘 |
| 长期效果、迁移、真实运行 | 未验证且不在本轮范围 | 需要各自独立验证；本文不证明减少真实 Read、提升任务质量、知识迁移完成或生产运行成熟 |

**交付保护结果：142 个既有基线文件 SHA-256 全部一致，0 个修改、0 个缺失；唯一新增文件为本文。** 相对于 Git HEAD 的变更由原有 26 项变为 27 项，原有修改完整保留。原审计、V2、W01、各修复记录和设计正文均保留，不更新任何历史人工确认状态。

到此停止。等待用户明确确认 **U03 候选契约**，以及 **两个隔离项目配置、正常信任所需持久变化和合成样本真实模型验收** 的范围；未确认前不应用草案。本文不解除整体 NO-GO。
