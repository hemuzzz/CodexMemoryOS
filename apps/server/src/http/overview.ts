import { AssetSearchUnavailableError, scanAssetRepository, type AssetScanOptions, type InboxApplicationService } from "../asset/index.js";
import type { TaskRepository } from "../task/repository.js";
import type { UsageRepository } from "../usage/repository.js";

export interface OverviewScope {
  workspace: string | null;
  assets: { MEMORY: number; DOCUMENT: number; SKILL: number };
  inboxCount: number;
  tasks: { RUNNING: number; COMPLETED: number; CANCELLED: number };
  usage: { recallCount: number; readCount: number; usedPairCount: number; usedTaskCount: number };
}

export interface OverviewDto {
  scopes: OverviewScope[];
  generatedAt: string;
  diagnosticCount: number;
}

export class OverviewApplicationService {
  constructor(readonly dependencies: AssetScanOptions & {
    inboxService: Pick<InboxApplicationService, "scan">;
    taskRepository: Pick<TaskRepository, "summarizeByWorkspace">;
    usageRepository: Pick<UsageRepository, "summarizeByWorkspace">;
  }) {}

  async get(): Promise<OverviewDto> {
    const [scan, inbox] = await Promise.all([
      scanAssetRepository(this.dependencies), this.dependencies.inboxService.scan(),
    ]);
    if (!scan.isComplete) {
      throw new AssetSearchUnavailableError(scan.diagnostics.some(({ code }) => code === "INVALID_WORKSPACE_CONFIG")
        ? "WORKSPACE_CONFIGURATION" : "ASSET_QUALIFICATION");
    }
    const scopes = new Map<string | null, OverviewScope>();
    const scope = (workspace: string | null): OverviewScope => {
      let value = scopes.get(workspace);
      if (!value) {
        value = { workspace, assets: { MEMORY: 0, DOCUMENT: 0, SKILL: 0 }, inboxCount: 0,
          tasks: { RUNNING: 0, COMPLETED: 0, CANCELLED: 0 },
          usage: { recallCount: 0, readCount: 0, usedPairCount: 0, usedTaskCount: 0 } };
        scopes.set(workspace, value);
      }
      return value;
    };
    for (const { frontmatter } of scan.assets) {
      scope(frontmatter.scope === "GLOBAL" ? null : frontmatter.workspace).assets[frontmatter.type]++;
    }
    for (const item of inbox.items) scope(item.workspace).inboxCount++;
    for (const row of this.dependencies.taskRepository.summarizeByWorkspace()) {
      scope(row.workspace).tasks[row.status] = row.count;
    }
    for (const { workspace, ...usage } of this.dependencies.usageRepository.summarizeByWorkspace()) {
      scope(workspace).usage = usage;
    }
    return { scopes: [...scopes.values()].sort((a, b) => (a.workspace ?? "").localeCompare(b.workspace ?? "")),
      generatedAt: new Date().toISOString(), diagnosticCount: scan.diagnostics.length + inbox.diagnostics.length };
  }
}
