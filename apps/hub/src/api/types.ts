export type AssetType = "MEMORY" | "DOCUMENT" | "SKILL";
export type AssetScope = "GLOBAL" | "WORKSPACE";
export type SearchStrategy = "FTS" | "HYBRID" | "LITERAL";

export type AssetFrontmatter =
  | {
      id: string;
      scope: "GLOBAL";
      summary: string;
      title: string;
      type: AssetType;
    }
  | {
      id: string;
      scope: "WORKSPACE";
      summary: string;
      title: string;
      type: AssetType;
      workspace: string;
    };

export interface AssetLibraryItem {
  assetId: string;
  contentHash: string;
  matchedSnippet?: string;
  modifiedAt: string;
  relativePath: string;
  scope: AssetScope;
  score?: number;
  searchStrategy?: SearchStrategy;
  summary: string;
  title: string;
  type: AssetType;
  workspace: string | null;
}

export interface AssetUsageSummary { readCount: number; recallCount: number; totalUsedCount: number }
export type { RecallProjection, ItemProjection, UsageProjection } from "../../../server/src/knowledge/projection.js";
import type { ItemProjection, UsageProjection, KnowledgeProjection } from "../../../server/src/knowledge/projection.js";
export type WorkspaceProjection = Awaited<ReturnType<KnowledgeProjection["workspaces"]>>;
export type RecallDetail = NonNullable<ReturnType<KnowledgeProjection["recall"]>>;

export interface AssetDetail extends AssetLibraryItem {
  frontmatter: AssetFrontmatter;
  rawMarkdown: string;
  recentRecalls: ItemProjection[];
  recentUsage: UsageProjection[];
  renderedMarkdown: string;
  usageSummary: AssetUsageSummary;
}

export interface InboxItem {
  assetId: string;
  contentHash: string;
  frontmatter: AssetFrontmatter;
  modifiedAt: string;
  rawMarkdown: string;
  relativePath: string;
  scope: AssetScope;
  summary: string;
  title: string;
  type: AssetType;
  workspace: string | null;
}

export type InboxDiagnosticCode =
  | "ID_CONFLICT"
  | "DUPLICATE_ASSET_ID"
  | "INVALID_FRONTMATTER"
  | "UNKNOWN_WORKSPACE"
  | "PATH_TYPE_MISMATCH"
  | "PATH_SCOPE_MISMATCH"
  | "PATH_WORKSPACE_MISMATCH"
  | "NON_MARKDOWN_FILE"
  | "DIRECTORY_ASSET"
  | "SYMLINK"
  | string;

export interface InboxDiagnostic {
  assetId?: string;
  code: InboxDiagnosticCode;
  message: string;
  relativePath: string;
}

export interface InboxResult {
  diagnostics: InboxDiagnostic[];
  items: InboxItem[];
}

export interface AssetListFilters {
  limit?: 20 | 50 | 100;
  query?: string;
  scope?: AssetScope;
  type?: AssetType;
  workspace?: string | null;
}

export type WatcherState = "NOT_STARTED" | "STARTING" | "RUNNING" | "DEGRADED" | "STOPPED";
export type SystemReadiness = "READY" | "DEGRADED" | "REBUILD_REQUIRED";

export interface SystemDiagnostic {
  code: string;
  message: string;
  occurredAt?: string;
  relativePath?: string;
  source: "INBOX" | "INDEX" | "SCANNER" | "WATCHER" | "WORKSPACE";
}

export interface SystemStatus {
  diagnostics: SystemDiagnostic[];
  index: {
    catalogCount: number | null;
    ftsCount: number | null;
    indexState: SystemReadiness;
    lastSuccessfulScanAt: string | null;
    rebuildRequired: boolean;
    watcherState: WatcherState;
  };
  mcpEndpoint: {
    path: "/mcp";
    ready: boolean;
  };
  repository: {
    assetRepositoryPath: string;
    formalAssetCount: number | null;
    inboxAssetCount: number | null;
  };
  service: {
    name: string;
    readiness: SystemReadiness;
    uptimeSeconds: number;
    version: string;
  };
}

export type { OverviewDto } from "../../../server/src/http/overview.js";
