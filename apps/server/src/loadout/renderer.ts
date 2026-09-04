import type { TaskStatus } from "../task/model.js";
import { LoadoutRenderError } from "./errors.js";
import type { TaskLoadout, TaskLoadoutAsset } from "./policy.js";

export interface LoadoutAssetMetadata {
  assetId: string;
  summary: string;
  title: string;
}

export interface LoadoutRenderInput {
  assetMetadata: ReadonlyMap<string, LoadoutAssetMetadata>;
  loadout: TaskLoadout;
  status: TaskStatus;
  taskId: string;
  workspace: string | null;
}

export function unicodeCharacterCount(value: string): number {
  return Array.from(value).length;
}

export function renderLoadoutAssetForHook(
  taskId: string,
  asset: TaskLoadoutAsset,
  metadata: LoadoutAssetMetadata | undefined,
): string {
  const lines = [
    `- ${asset.mode} ${asset.assetId}`,
    `  reason: ${asset.reason}`,
  ];
  if (metadata === undefined) {
    lines.push("  assetMissing: true");
  } else {
    lines.push(`  title: ${JSON.stringify(metadata.title)}`);
    if (asset.mode === "DIRECT") {
      lines.push(`  summary: ${JSON.stringify(metadata.summary)}`);
    }
  }
  if (asset.mode === "ON_DEMAND") {
    lines.push(`  hint: call asset_read with taskId=${taskId} and assetId=${asset.assetId} when needed`);
  }
  return lines.join("\n");
}

export function renderLoadoutForHook(input: LoadoutRenderInput): string {
  const header = [
    "CodexMemoryOS Task Context",
    `taskId: ${input.taskId}`,
    `workspace: ${input.workspace === null ? "null" : JSON.stringify(input.workspace)}`,
    `status: ${input.status}`,
    `loadoutLimits: maxInjectedCharacters=${input.loadout.limits.maxInjectedCharacters}, maxAssets=${input.loadout.limits.maxAssets}`,
    "loadoutAssets:",
  ];
  const fragments = input.loadout.assets.map((asset) =>
    renderLoadoutAssetForHook(input.taskId, asset, input.assetMetadata.get(asset.assetId)),
  );
  const rendered = [...header, ...(fragments.length === 0 ? ["- none"] : fragments)].join("\n");
  if (unicodeCharacterCount(rendered) > input.loadout.limits.maxInjectedCharacters) {
    throw new LoadoutRenderError("Rendered Hook Loadout exceeds maxInjectedCharacters");
  }
  return rendered;
}
