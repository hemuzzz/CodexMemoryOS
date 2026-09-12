import { packager } from "@electron/packager";
import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, BUNDLE_ID, cleanEnvironment, executeFile, inspectNode, localConfigSchema, type LocalConfig } from "./config.js";
import { assertClosedDependencies } from "./package-files.js";
export { assertClosedDependencies } from "./package-files.js";

export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export async function pnpm(args: string[], cwd = projectRoot): Promise<void> {
  const { stdout } = await executeFile("npx", ["-y", "-p", "node@22.16.0", "-p", "pnpm@11.1.3", "pnpm", ...args], {
    cwd, env: cleanEnvironment(), maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(stdout);
}
export async function verifyNativeRuntime(runtime: string, nodePath: string): Promise<void> {
  await assertClosedDependencies(runtime);
  const fixture = await mkdtemp(join(tmpdir(), "codex-desktop-native-"));
  try {
    await executeFile(nodePath, ["--input-type=module", "-e", `
      import {createRequire} from 'node:module';
      import {pathToFileURL} from 'node:url';
      const require=createRequire(pathToFileURL(process.argv[1]));
      const Database=require('better-sqlite3');
      const db=new Database(process.argv[2]);
      try { db.exec('CREATE TABLE probe(value INTEGER); INSERT INTO probe VALUES (42)');
        if(db.prepare('SELECT value FROM probe').get().value!==42) throw Error('SQLite probe failed');
      } finally { db.close(); }
      await import(pathToFileURL(process.argv[1]));
    `, join(runtime, "apps/server/dist/runtime.js"), join(fixture, "probe.sqlite")], {
      cwd: fixture, env: cleanEnvironment(), timeout: 15000,
    });
    await lstat(join(runtime, "apps/hub/dist/index.html"));
  } finally { await rm(fixture, { recursive: true, force: true }); }
}

export interface AppIdentity { name: string; bundleId: string }
export async function packageApp(config: LocalConfig, output: string, identity: AppIdentity = { name: APP_NAME, bundleId: BUNDLE_ID }): Promise<string> {
  if (process.platform !== "darwin") throw new Error("首版只支持本机 macOS 打包");
  const node = await inspectNode(config.nodePath);
  const { version } = JSON.parse(await readFile(join(projectRoot, "apps/desktop/package.json"), "utf8")) as { version: string };
  const build = { buildId: randomUUID(), version, ...node };
  const stage = await mkdtemp(join(tmpdir(), "codex-desktop-package-"));
  try {
    const desktop = join(stage, "desktop");
    const runtime = join(stage, "runtime");
    // Deploy in a disposable workspace: pnpm legacy deploy also writes workspace install state.
    const workspace = join(stage, "workspace");
    await mkdir(workspace);
    for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]) {
      await cp(join(projectRoot, file), join(workspace, file));
    }
    for (const pkg of ["apps/server", "apps/hub", "apps/desktop", "packages/id-generator"]) {
      await mkdir(join(workspace, pkg), { recursive: true });
      await cp(join(projectRoot, pkg, "package.json"), join(workspace, pkg, "package.json"));
      await cp(join(projectRoot, pkg, "dist"), join(workspace, pkg, "dist"), { recursive: true });
    }
    await mkdir(join(runtime, "apps"), { recursive: true });
    await pnpm(["--filter", "@codex-memory-os/server", "deploy", "--prod", "--legacy", "--config.hoist-workspace-packages=false", join(runtime, "apps/server")], workspace);
    await pnpm(["--filter", "@codex-memory-os/desktop", "deploy", "--prod", "--legacy", "--config.hoist-workspace-packages=false", desktop], workspace);
    await cp(join(projectRoot, "apps/hub/dist"), join(runtime, "apps/hub/dist"), { recursive: true });
    await writeFile(join(runtime, "build-info.json"), JSON.stringify(build, null, 2) + "\n");
    const configuration = join(stage, "local-runtime.json");
    await writeFile(configuration, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    await verifyNativeRuntime(runtime, config.nodePath);
    await assertClosedDependencies(desktop);
    const { name, bundleId } = identity;
    const [built] = await packager({
      dir: desktop, name, appBundleId: bundleId,
      appVersion: version, platform: "darwin", arch: node.arch, electronVersion: "44.3.0",
      out: join(stage, "packaged"), asar: false, prune: false,
    });
    if (!built) throw new Error("打包未生成 App");
    const app = join(built, `${name}.app`);
    // Preserve relative pnpm links; generic extraResource copying resolves them to staging paths.
    await cp(runtime, join(app, "Contents/Resources/runtime"), { recursive: true, verbatimSymlinks: true });
    await cp(configuration, join(app, "Contents/Resources/local-runtime.json"));
    await assertClosedDependencies(app);
    await mkdir(output, { recursive: true });
    const destination = join(output, `${name}.app`);
    // A unique output directory is required; never silently overwrite a prior artifact.
    await cp(app, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
    await assertClosedDependencies(destination);
    return destination;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const configFile = resolve(process.argv[2] ?? join(projectRoot, ".desktop-local.json"));
    const config = localConfigSchema.parse(JSON.parse(await readFile(configFile, "utf8")));
    const output = resolve(process.argv[3] ?? join(projectRoot, "dist/desktop", randomUUID()));
    process.stdout.write(JSON.stringify({ appPath: await packageApp(config, output) }) + "\n");
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
