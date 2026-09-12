import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

export const APP_NAME = "CodexMemoryOS";
export const BUNDLE_ID = "local.codexmemoryos.desktop";
export const INSTALL_PATH = `/Applications/${APP_NAME}.app`;
const absolutePath = z.string().min(1).refine(isAbsolute, "必须是绝对路径");
export const localConfigSchema = z.object({
  nodePath: absolutePath,
  assetRepositoryPath: absolutePath,
  databasePath: absolutePath,
  workspaceConfigPath: absolutePath,
  logPath: absolutePath,
  desktopLogPath: absolutePath,
  port: z.number().int().min(1).max(65535),
  startupTimeoutMs: z.number().int().min(100).max(120000).default(30000),
  shutdownTimeoutMs: z.number().int().min(100).max(120000).default(15000),
}).strict();
export type LocalConfig = z.infer<typeof localConfigSchema>;
export const buildInfoSchema = z.object({
  buildId: z.string().uuid(), nodeVersion: z.literal("v22.16.0"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u).optional(),
  arch: z.enum(["arm64", "x64"]), modules: z.string().min(1),
}).strict();
export type BuildInfo = z.infer<typeof buildInfoSchema>;
export const executeFile = promisify(execFile);

export function cleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE", "NODE_CHANNEL_FD", "NODE_CHANNEL_SERIALIZATION_MODE"]) delete env[key];
  return env;
}
export async function readConfiguration(resources: string): Promise<{ config: LocalConfig; build: BuildInfo }> {
  const [config, build] = await Promise.all([
    readFile(join(resources, "local-runtime.json"), "utf8"),
    readFile(join(resources, "runtime/build-info.json"), "utf8"),
  ]);
  return { config: localConfigSchema.parse(JSON.parse(config)), build: buildInfoSchema.parse(JSON.parse(build)) };
}
export async function inspectNode(nodePath: string): Promise<Omit<BuildInfo, "buildId">> {
  const { stdout } = await executeFile(nodePath, ["-e", "console.log(JSON.stringify({nodeVersion:process.version,arch:process.arch,modules:process.versions.modules}))"], {
    env: cleanEnvironment(), timeout: 10000,
  });
  return buildInfoSchema.omit({ buildId: true }).parse(JSON.parse(stdout));
}
export function backendEnvironment(config: LocalConfig): NodeJS.ProcessEnv {
  return { ...cleanEnvironment(),
    CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: config.assetRepositoryPath,
    CODEX_MEMORY_OS_DATABASE_PATH: config.databasePath,
    CODEX_MEMORY_OS_WORKSPACES_PATH: config.workspaceConfigPath,
    CODEX_MEMORY_OS_LOG_PATH: config.logPath,
    PORT: String(config.port),
  };
}
