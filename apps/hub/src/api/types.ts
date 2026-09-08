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

export interface AssetUsageSummary {
  readCount: number;
  recallCount: number;
  taskCount: number;
  usedTaskCount: number;
}

export interface RecentAssetLoadout {
  mode: "DIRECT" | "ON_DEMAND";
  readCount: number;
  reason: string;
  recallCount: number;
  requestSummary: string;
  status: "RUNNING" | "COMPLETED" | "CANCELLED";
  taskId: string;
  updatedAt: string;
  usedFlag: boolean;
  workspace: string | null;
}

export interface AssetDetail extends AssetLibraryItem {
  frontmatter: AssetFrontmatter;
  rawMarkdown: string;
  recentLoadouts: RecentAssetLoadout[];
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

export type TaskStatus = "RUNNING" | "COMPLETED" | "CANCELLED";
export type LoadoutMode = "DIRECT" | "ON_DEMAND";
export type LoadoutReason =
  | "MEMORY_STRONG_MATCH"
  | "MEMORY_MATCH"
  | "DOCUMENT_ON_DEMAND"
  | "SKILL_ON_DEMAND"
  | "DIRECT_BUDGET_DOWNGRADED";
export type WatcherState = "NOT_STARTED" | "STARTING" | "RUNNING" | "DEGRADED" | "STOPPED";

export interface TaskLoadoutAsset {
  assetId: string;
  estimatedCharacters: number;
  mode: LoadoutMode;
  reason: LoadoutReason;
}

export interface TaskLoadout {
  assets: TaskLoadoutAsset[];
  limits: {
    maxAssets: number;
    maxInjectedCharacters: number;
  };
  schemaVersion: number;
}

export interface TaskUsage {
  assetId: string;
  assetMissing: boolean;
  createdAt: string;
  readCount: number;
  recallCount: number;
  taskId: string;
  updatedAt: string;
  usageId: string;
  usedFlag: boolean;
}

export interface TaskLoadoutDetail {
  createdAt: string;
  loadout: TaskLoadout;
  request: string;
  status: TaskStatus;
  taskId: string;
  updatedAt: string;
  usages: TaskUsage[];
  workspace: string | null;
}

export interface TaskLoadoutSummary {
  assetCount: number;
  createdAt: string;
  estimatedCharacters: number;
  request: string;
  status: TaskStatus;
  taskId: string;
  updatedAt: string;
  workspace: string | null;
}

export interface TaskLoadoutListFilters {
  limit?: 20 | 50 | 100;
  status?: TaskStatus;
  workspace?: string | null;
}

export interface UsageListItem extends TaskUsage {
  workspace: string | null;
}

export interface UsageListFilters {
  assetId?: string;
  limit?: 20 | 50 | 100;
  taskId?: string;
  workspace?: string | null;
}

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
