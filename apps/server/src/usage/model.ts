export interface UsageRecord {
  assetId: string;
  createdAt: string;
  readCount: number;
  recallCount: number;
  taskId: string;
  updatedAt: string;
  usageId: string;
  usedFlag: boolean;
}

export interface UsageWithAssetState extends UsageRecord {
  assetMissing: boolean;
}

export interface UsageListInput {
  assetId?: string;
  limit?: number;
  taskId?: string;
  workspace?: string | null;
}

export interface UsageListItem extends UsageWithAssetState {
  workspace: string | null;
}

export interface AssetUsageSummary {
  readCount: number;
  recallCount: number;
  taskCount: number;
  usedTaskCount: number;
}
