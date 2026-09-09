import { lstat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assetIdSchema, type WorkspaceConfig } from "../asset/schema.js";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/u);
const policySchema = z.object({
  schemaVersion: z.literal(1),
  kinds: z.array(z.object({ id, name: z.string().min(1).max(80) }).strict()).max(100),
  workspaceKinds: z.array(z.object({ workspace: z.string().min(1).max(128), kindIds: z.array(id).max(20) }).strict()).max(1000),
  scenarios: z.array(z.object({ id, name: z.string().min(1).max(80), description: z.string().max(256), enabled: z.boolean(),
    applicableKinds: z.array(id).max(20), assets: z.array(z.object({ assetId: assetIdSchema, mode: z.enum(["DIRECT", "ON_DEMAND"]) }).strict()).max(1000),
  }).strict()).max(100),
}).strict();
export type Policy = z.infer<typeof policySchema>;
export interface PolicySnapshot { policy: Policy; hash?: string; diagnostics: string[] }
export async function loadPolicy(path: string, config: WorkspaceConfig): Promise<PolicySnapshot> {
  const empty: Policy = { schemaVersion: 1, kinds: [], workspaceKinds: [], scenarios: [] };
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error("Invalid policy file");
    const bytes = await readFile(path);
    const policy = policySchema.parse(JSON.parse(bytes.toString("utf8")));
    const unique = (values: string[]) => new Set(values).size === values.length;
    const kinds = new Set(policy.kinds.map((kind) => kind.id));
    if (!unique(policy.kinds.map((kind) => kind.id)) || !unique(policy.scenarios.map((scenario) => scenario.id)) ||
        !unique(policy.workspaceKinds.map((binding) => binding.workspace)) ||
        policy.workspaceKinds.some((binding) => !unique(binding.kindIds) || binding.kindIds.some((kind) => !kinds.has(kind))) ||
        policy.scenarios.some((scenario) => !unique(scenario.applicableKinds) || scenario.applicableKinds.some((kind) => !kinds.has(kind)) || !unique(scenario.assets.map((asset) => asset.assetId)))) throw new Error("Invalid references");
    const names = new Set(config.workspaces.map((workspace) => workspace.name));
    const diagnostics = policy.workspaceKinds.some((binding) => !names.has(binding.workspace)) ? ["POLICY_WORKSPACE_UNKNOWN"] : [];
    policy.workspaceKinds = policy.workspaceKinds.filter((binding) => names.has(binding.workspace));
    return { policy, hash: createHash("sha256").update(bytes).digest("hex"), diagnostics };
  } catch (error) {
    return { policy: empty, diagnostics: [(error as NodeJS.ErrnoException).code === "ENOENT" ? "POLICY_MISSING" : "POLICY_INVALID"] };
  }
}
export function applicableScenarios(policy: Policy, workspaces: readonly string[]) {
  const kinds = new Set(policy.workspaceKinds.filter((binding) => workspaces.includes(binding.workspace)).flatMap((binding) => binding.kindIds));
  return policy.scenarios.filter((scenario) => scenario.enabled && (!scenario.applicableKinds.length || scenario.applicableKinds.some((kind) => kinds.has(kind))))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
