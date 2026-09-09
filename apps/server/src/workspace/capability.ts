import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import { generateWorkspaceCapability } from "@codex-memory-os/id-generator";
import { loadWorkspaceConfig, type WorkspaceConfig } from "../asset/index.js";
import { KnowledgeError, capabilityIdsSchema } from "../knowledge/model.js";
import type { KnowledgeRepository } from "../knowledge/repository.js";
import { resolveWorkspaceFromConfig } from "./resolver.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export interface HostWorkspaceCapability {
  capabilityId: string;
  workspace: string;
  aliases: string[];
  description?: string;
}
const canonicalPath = (path: string) => {
  const api = win32.isAbsolute(path) && !posix.isAbsolute(path) ? win32 : posix;
  const normalized = api.resolve(path);
  return api === win32 ? normalized.toLowerCase() : normalized;
};
export class WorkspaceCapabilityService {
  constructor(readonly repository: KnowledgeRepository, readonly configPath: string) {}
  async config(): Promise<WorkspaceConfig> {
    try {
      const config = await loadWorkspaceConfig(this.configPath);
      if (config.workspaces.length > 1000 || config.workspaces.some((w) => w.name.length > 128 || /[\u0000-\u001f\u007f]/u.test(w.name))) throw new Error("Configuration limits exceeded");
      const owners = new Map<string, string>();
      for (const workspace of config.workspaces) {
        for (const path of workspace.paths) {
          const key = canonicalPath(path);
          if (owners.has(key) && owners.get(key) !== workspace.name) throw new Error("Ambiguous mapping");
          owners.set(key, workspace.name);
        }
      }
      return config;
    } catch { throw new KnowledgeError("WORKSPACE_CONFIG_UNAVAILABLE"); }
  }
  mappingHash(config: WorkspaceConfig, name: string, preauthorized = false): string | undefined {
    const workspace = config.workspaces.find((item) => item.name === name);
    if (!workspace || (preauthorized && workspace.knowledgeAccess !== "PREAUTHORIZED")) return undefined;
    const mapping = { name, paths: [...new Set(workspace.paths.map(canonicalPath))].sort() };
    // Preserve existing cwd-issued hashes. Bind additional grants to the explicit
    // policy so disabling preauthorization invalidates them, but not cwd grants.
    return digest(JSON.stringify(preauthorized ? { ...mapping, knowledgeAccess: "PREAUTHORIZED" } : mapping));
  }
  async select(input: unknown): Promise<{ authorizedWorkspaces: string[]; config: WorkspaceConfig }> {
    const parsed = capabilityIdsSchema.safeParse(input);
    if (!parsed.success) throw new KnowledgeError("INPUT_INVALID");
    const config = await this.config();
    const selected = new Set<string>();
    for (const id of [...new Set(parsed.data)].sort()) {
      const row = this.repository.db.prepare<[string], { workspace: string; hash: string }>(
        "SELECT workspace, trusted_workspace_mapping_hash AS hash FROM workspace_capability WHERE capability_key_hash=?").get(digest(id));
      if (!row || (row.hash !== this.mappingHash(config, row.workspace)
        && row.hash !== this.mappingHash(config, row.workspace, true))) throw new KnowledgeError("CAPABILITY_INVALID");
      selected.add(row.workspace);
    }
    return { authorizedWorkspaces: [...selected].sort(), config };
  }
  /** Trusted host adapter only. Never register this method as an MCP/REST tool. */
  async issueFromTrustedHost(cwd: string): Promise<HostWorkspaceCapability[]> {
    const config = await this.config();
    const current = resolveWorkspaceFromConfig(cwd, config);
    const workspaces = config.workspaces.filter((workspace) => workspace.name === current
      || workspace.knowledgeAccess === "PREAUTHORIZED").sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    // Bound the model context; never silently omit an authorized project.
    if (workspaces.length > 8) throw new KnowledgeError("WORKSPACE_CAPABILITY_LIMIT");
    const capabilities = workspaces.map((workspace): HostWorkspaceCapability => ({
      capabilityId: generateWorkspaceCapability(), workspace: workspace.name,
      aliases: [...new Set(workspace.aliases ?? [])],
      ...(workspace.description ? { description: workspace.description } : {}),
    }));
    this.repository.db.transaction(() => {
      const insert = this.repository.db.prepare("INSERT INTO workspace_capability VALUES (?,?,?,?)");
      const createdAt = new Date().toISOString();
      for (const capability of capabilities) {
        insert.run(digest(capability.capabilityId), capability.workspace, createdAt,
          this.mappingHash(config, capability.workspace, capability.workspace !== current));
      }
    })();
    return capabilities;
  }
}
