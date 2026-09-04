import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = await mkdtemp(join(tmpdir(), "codex-memory-os-n12-build-"));
const repositoryPath = join(fixtureRoot, "asset-repository");
const workspaceConfigPath = join(fixtureRoot, "config", "workspaces.json");
const sourceRelativePath = "inbox/workspaces/alpha/memories/build-smoke.md";
const targetRelativePath = "assets/workspaces/alpha/memories/build-smoke.md";
const source = Buffer.from([
  "---",
  "id: ast2034512345678901248",
  "type: MEMORY",
  "scope: WORKSPACE",
  "workspace: alpha",
  "title: N12 build smoke",
  "summary: verifies compiled confirmation command",
  "---",
  "compiled-confirmation-token",
  "",
].join("\n"), "utf8");
const contentHash = createHash("sha256").update(source).digest("hex");

try {
  await writeFixture(
    workspaceConfigPath,
    Buffer.from(JSON.stringify({
      schemaVersion: 1,
      workspaces: [{ name: "alpha", paths: ["/workspace/alpha"] }],
    }), "utf8"),
  );
  await mkdir(join(repositoryPath, "assets"), { recursive: true });
  await writeFixture(join(repositoryPath, sourceRelativePath), source);

  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@codex-memory-os/server",
      "asset:confirm",
      "--",
      "--relative-path",
      sourceRelativePath,
      "--expected-content-hash",
      contentHash,
    ],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: repositoryPath,
        CODEX_MEMORY_OS_WORKSPACES_PATH: workspaceConfigPath,
      },
    },
  );
  assert.match(stderr, /^\$ node dist\/asset\/confirm-cli\.js -- /u);
  assert.doesNotMatch(stderr, /"ok":false|Error:|ERR_PNPM/u);
  assert.deepEqual(JSON.parse(stdout), {
    ok: true,
    assetId: "ast2034512345678901248",
    sourceRelativePath,
    targetRelativePath,
    contentHash,
  });
  assert.deepEqual(await readFile(join(repositoryPath, targetRelativePath)), source);
  await assert.rejects(readFile(join(repositoryPath, sourceRelativePath)), { code: "ENOENT" });
  process.stdout.write(`${JSON.stringify({ event: "N12_ASSET_CONFIRM_BUILD_SMOKE", status: "ok" })}\n`);
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}

async function writeFixture(path, source) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source);
}
