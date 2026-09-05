import { AssetNotAccessibleError, AssetNotFoundError, type AssetSearchItem, type AssetSearchService } from "../asset/index.js";
import {
  TaskApplicationService,
  TaskNotRunningError,
  TaskRepository,
  type TaskRecord,
  type TaskStatus,
} from "../task/index.js";
import type { UsageApplicationService, UsageRecord, UsageWithAssetState } from "../usage/index.js";
import { LoadoutJsonError, LoadoutNotMutableError, LoadoutRenderError } from "./errors.js";
import {
  DEFAULT_LOADOUT_POLICY,
  type LoadoutReason,
  type TaskLoadout,
  type TaskLoadoutAsset,
  taskLoadoutSchema,
} from "./policy.js";
import { LoadoutAssetProjectionRepository } from "./projection-repository.js";
import {
  renderLoadoutAssetForHook,
  renderLoadoutForHook,
  unicodeCharacterCount,
  type LoadoutAssetMetadata,
} from "./renderer.js";

export interface TaskLoadoutDto {
  createdAt: string;
  loadout: TaskLoadout;
  request: string;
  status: TaskStatus;
  taskId: string;
  updatedAt: string;
  workspace: string | null;
}

export interface TaskLoadoutWithUsageDto extends TaskLoadoutDto {
  usages: UsageWithAssetState[];
}

export interface TaskLoadoutSummaryDto {
  assetCount: number;
  createdAt: string;
  estimatedCharacters: number;
  request: string;
  status: TaskStatus;
  taskId: string;
  updatedAt: string;
  workspace: string | null;
}

export interface TaskLoadoutListInput {
  limit?: number;
  status?: TaskStatus;
  workspace?: string | null;
}

export interface RecentAssetLoadoutDto {
  mode: TaskLoadoutAsset["mode"];
  readCount: number;
  reason: TaskLoadoutAsset["reason"];
  recallCount: number;
  requestSummary: string;
  status: TaskStatus;
  taskId: string;
  updatedAt: string;
  usedFlag: boolean;
  workspace: string | null;
}

export interface ResolveTaskLoadoutResult {
  changed: boolean;
  task: TaskLoadoutDto;
}

export interface TaskLoadoutApplicationServiceOptions {
  now?: () => string;
}

export interface TaskLoadoutDependencies {
  assetProjection: LoadoutAssetProjectionRepository;
  assetSearchService: Pick<AssetSearchService, "search">;
  taskRepository: TaskRepository;
  taskService: TaskApplicationService;
  usageService: Pick<UsageApplicationService, "listByTask">;
}

export class TaskLoadoutApplicationService {
  readonly #now: () => string;

  constructor(
    readonly dependencies: TaskLoadoutDependencies,
    options: TaskLoadoutApplicationServiceOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async resolve(taskId: string): Promise<ResolveTaskLoadoutResult> {
    const task = this.dependencies.taskService.getTask(taskId);
    if (task.status !== "RUNNING") {
      throw new LoadoutNotMutableError(task.taskId, task.status);
    }
    const items = await this.dependencies.assetSearchService.search({
      context: { workspace: task.workspace },
      query: task.request,
      limit: DEFAULT_LOADOUT_POLICY.maxAssets,
    });
    const loadout = buildTaskLoadout(task, items);
    let update;
    try {
      update = this.dependencies.taskRepository.replaceLoadout(
        task.taskId,
        JSON.stringify(loadout),
        this.#now(),
      );
    } catch (error) {
      if (error instanceof TaskNotRunningError) {
        const current = this.dependencies.taskService.getTask(task.taskId);
        throw new LoadoutNotMutableError(task.taskId, current.status);
      }
      throw error;
    }
    return { changed: update.changed, task: taskDto(update.task) };
  }

  get(taskId: string): TaskLoadoutWithUsageDto {
    const task = this.dependencies.taskService.getTask(taskId);
    const usages = this.dependencies.usageService.listByTask(taskId);
    const existing = this.dependencies.assetProjection.existingAssetIds(
      usages.map(({ assetId }) => assetId),
    );
    return {
      ...taskDto(task),
      usages: usages.map((usage) => usageWithAssetState(usage, existing.has(usage.assetId))),
    };
  }

  list(input: TaskLoadoutListInput): TaskLoadoutSummaryDto[] {
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new LoadoutJsonError("Task list limit must be a safe integer from 1 to 100");
    }
    const tasks = this.dependencies.taskRepository.listTasks({
      limit,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(Object.prototype.hasOwnProperty.call(input, "workspace") ? { workspace: input.workspace ?? null } : {}),
    });
    return tasks.map((task) => {
      const loadout = parseTaskLoadout(task.loadoutJson);
      return {
        taskId: task.taskId,
        workspace: task.workspace,
        request: task.request,
        status: task.status,
        assetCount: loadout.assets.length,
        estimatedCharacters: loadout.assets.reduce(
          (total, asset) => total + asset.estimatedCharacters,
          0,
        ),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    });
  }

  recentByAsset(assetId: string): RecentAssetLoadoutDto[] {
    const matches: RecentAssetLoadoutDto[] = [];
    for (const task of this.dependencies.taskRepository.listTasksReferencingAsset(assetId)) {
      const loadout = parseTaskLoadout(task.loadoutJson);
      const asset = loadout.assets.find((item) => item.assetId === assetId);
      if (asset === undefined) {
        continue;
      }
      const usage = this.dependencies.usageService
        .listByTask(task.taskId)
        .find((item) => item.assetId === assetId);
      matches.push({
        mode: asset.mode,
        readCount: usage?.readCount ?? 0,
        reason: asset.reason,
        recallCount: usage?.recallCount ?? 0,
        requestSummary: summarizeRequest(task.request),
        status: task.status,
        taskId: task.taskId,
        updatedAt: task.updatedAt,
        usedFlag: usage?.usedFlag ?? false,
        workspace: task.workspace,
      });
      if (matches.length === 10) {
        break;
      }
    }
    return matches;
  }
}

function summarizeRequest(request: string): string {
  const compact = request.replaceAll(/\s+/gu, " ").trim();
  const characters = Array.from(compact);
  return characters.length <= 180 ? compact : `${characters.slice(0, 179).join("")}…`;
}

export function buildTaskLoadout(task: TaskRecord, searchItems: readonly AssetSearchItem[]): TaskLoadout {
  const loadout: TaskLoadout = {
    schemaVersion: 1,
    limits: {
      maxInjectedCharacters: DEFAULT_LOADOUT_POLICY.maxInjectedCharacters,
      maxAssets: DEFAULT_LOADOUT_POLICY.maxAssets,
    },
    assets: [],
  };
  const metadata = new Map<string, LoadoutAssetMetadata>();
  for (const item of searchItems) {
    metadata.set(item.assetId, {
      assetId: item.assetId,
      summary: item.summary,
      title: item.title,
    });
  }

  for (const item of searchItems) {
    if (loadout.assets.length >= DEFAULT_LOADOUT_POLICY.maxAssets) {
      break;
    }
    if (item.score < DEFAULT_LOADOUT_POLICY.minScore) {
      continue;
    }

    let asset = initialLoadoutAsset(task.taskId, item, metadata.get(item.assetId));
    if (fitsBudget(task, loadout, asset, metadata)) {
      loadout.assets.push(asset);
      continue;
    }
    if (asset.mode === "DIRECT") {
      asset = withRenderingEstimate(task.taskId, {
        ...asset,
        mode: "ON_DEMAND",
        reason: "DIRECT_BUDGET_DOWNGRADED",
      }, metadata.get(item.assetId));
      if (fitsBudget(task, loadout, asset, metadata)) {
        loadout.assets.push(asset);
      }
    }
  }
  return loadout;
}

export function parseTaskLoadout(loadoutJson: string): TaskLoadout {
  let parsed: unknown;
  try {
    parsed = JSON.parse(loadoutJson) as unknown;
  } catch (error) {
    throw new LoadoutJsonError("Task loadout_json is not valid JSON");
  }
  const result = taskLoadoutSchema.safeParse(parsed);
  if (!result.success) {
    throw new LoadoutJsonError("Task loadout_json does not match the fixed N08 schema");
  }
  return result.data;
}

export async function renderStoredTaskLoadout(
  task: TaskRecord,
  assetReader: Pick<AssetSearchService, "read">,
): Promise<string> {
  const loadout = parseTaskLoadout(task.loadoutJson);
  const metadata = new Map<string, LoadoutAssetMetadata>();
  const projectedAssets: TaskLoadoutAsset[] = [];
  for (const asset of loadout.assets) {
    let current;
    try {
      current = await assetReader.read({ assetId: asset.assetId, context: { workspace: task.workspace } });
    } catch (error) {
      if (!(error instanceof AssetNotFoundError || error instanceof AssetNotAccessibleError)) {
        throw error;
      }
      // Retain historical fields, but provide no dynamic content for this item.
      projectedAssets.push(asset);
      continue;
    }
    const { frontmatter } = current;
    metadata.set(asset.assetId, { assetId: asset.assetId, title: frontmatter.title, summary: frontmatter.summary });
    // This is a transient rendering choice; never rewrite the saved mode/reason.
    projectedAssets.push(asset.mode === "DIRECT" && frontmatter.type !== "MEMORY"
      ? { ...asset, mode: "ON_DEMAND" }
      : asset);
  }
  return renderLoadoutForHook({
    assetMetadata: metadata,
    loadout: { ...loadout, assets: projectedAssets },
    status: task.status,
    taskId: task.taskId,
    workspace: task.workspace,
  });
}

function taskDto(task: TaskRecord): TaskLoadoutDto {
  return {
    taskId: task.taskId,
    workspace: task.workspace,
    request: task.request,
    status: task.status,
    loadout: parseTaskLoadout(task.loadoutJson),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function usageWithAssetState(usage: UsageRecord, exists: boolean): UsageWithAssetState {
  return { ...usage, assetMissing: !exists };
}

function initialLoadoutAsset(
  taskId: string,
  item: AssetSearchItem,
  metadata: LoadoutAssetMetadata | undefined,
): TaskLoadoutAsset {
  const mode = item.type === "MEMORY" && item.score >= DEFAULT_LOADOUT_POLICY.directMemoryMinScore
    ? "DIRECT"
    : "ON_DEMAND";
  let reason: LoadoutReason;
  if (item.type === "MEMORY") {
    reason = mode === "DIRECT" ? "MEMORY_STRONG_MATCH" : "MEMORY_MATCH";
  } else {
    reason = item.type === "DOCUMENT" ? "DOCUMENT_ON_DEMAND" : "SKILL_ON_DEMAND";
  }
  return withRenderingEstimate(taskId, {
    assetId: item.assetId,
    mode,
    reason,
    estimatedCharacters: 0,
  }, metadata);
}

function withRenderingEstimate(
  taskId: string,
  asset: TaskLoadoutAsset,
  metadata: LoadoutAssetMetadata | undefined,
): TaskLoadoutAsset {
  return {
    ...asset,
    estimatedCharacters: unicodeCharacterCount(renderLoadoutAssetForHook(taskId, asset, metadata)),
  };
}

function fitsBudget(
  task: TaskRecord,
  current: TaskLoadout,
  asset: TaskLoadoutAsset,
  metadata: ReadonlyMap<string, LoadoutAssetMetadata>,
): boolean {
  try {
    renderLoadoutForHook({
      assetMetadata: metadata,
      loadout: { ...current, assets: [...current.assets, asset] },
      status: task.status,
      taskId: task.taskId,
      workspace: task.workspace,
    });
    return true;
  } catch (error) {
    if (error instanceof LoadoutRenderError) {
      return false;
    }
    throw error;
  }
}
