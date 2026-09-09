import { AssetSearchUnavailableError, scanAssetRepository, type AssetScanOptions, type InboxApplicationService } from "../asset/index.js";
import type { KnowledgeProjection } from "../knowledge/projection.js";
export interface OverviewDto {
  scopes: { workspace: string | null; assets: { MEMORY: number; DOCUMENT: number; SKILL: number }; inboxCount: number }[];
  facts: { recallOperations: number; recallItems: number; reads: number; used: number };
  generatedAt: string; diagnosticCount: number;
}
export class OverviewApplicationService {
  constructor(readonly dependencies: AssetScanOptions & { inboxService: Pick<InboxApplicationService, "scan">; projection: KnowledgeProjection }) {}
  async get(): Promise<OverviewDto> {
    const [scan, inbox] = await Promise.all([scanAssetRepository(this.dependencies), this.dependencies.inboxService.scan()]);
    if (!scan.isComplete) throw new AssetSearchUnavailableError("ASSET_QUALIFICATION");
    const scopes = new Map<string | null, OverviewDto["scopes"][number]>();
    const scope = (workspace: string | null) => {
      let result = scopes.get(workspace);
      if (!result) { result = { workspace, assets: { MEMORY: 0, DOCUMENT: 0, SKILL: 0 }, inboxCount: 0 }; scopes.set(workspace, result); }
      return result;
    };
    scope(null);
    for (const asset of scan.assets) scope(asset.frontmatter.scope === "GLOBAL" ? null : asset.frontmatter.workspace).assets[asset.frontmatter.type]++;
    for (const item of inbox.items) scope(item.workspace).inboxCount++;
    return { scopes: [...scopes.values()].sort((a, b) => (a.workspace ?? "").localeCompare(b.workspace ?? "")),
      facts: this.dependencies.projection.totals(), generatedAt: new Date().toISOString(), diagnosticCount: scan.diagnostics.length + inbox.diagnostics.length };
  }
}
