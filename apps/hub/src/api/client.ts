import type {
  AssetDetail,
  AssetLibraryItem,
  AssetListFilters,
  InboxResult,
  SystemStatus,
  TaskLoadoutDetail,
  TaskLoadoutListFilters,
  TaskLoadoutSummary,
  UsageListFilters,
  UsageListItem,
} from "./types.js";

interface RestErrorDetail {
  code: string;
  message: string;
  retryable: boolean;
}

type FetchImplementation = typeof fetch;

export class HubApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
  ) {
    super(message);
    this.name = "HubApiError";
  }
}

export class HubApiClient {
  constructor(readonly fetchImplementation: FetchImplementation = globalThis.fetch.bind(globalThis)) {}

  listAssets(filters: AssetListFilters, signal?: AbortSignal): Promise<{ items: AssetLibraryItem[] }> {
    return this.#get(buildAssetListPath(filters), signal);
  }

  getAsset(assetId: string, signal?: AbortSignal): Promise<{ asset: AssetDetail }> {
    return this.#get(`/api/assets/${encodeURIComponent(assetId)}`, signal);
  }

  getInbox(signal?: AbortSignal): Promise<InboxResult> {
    return this.#get("/api/inbox", signal);
  }

  listTaskLoadouts(
    filters: TaskLoadoutListFilters,
    signal?: AbortSignal,
  ): Promise<{ items: TaskLoadoutSummary[] }> {
    return this.#get(buildTaskLoadoutListPath(filters), signal);
  }

  getTaskLoadout(taskId: string, signal?: AbortSignal): Promise<{ taskLoadout: TaskLoadoutDetail }> {
    return this.#get(`/api/task-loadouts/${encodeURIComponent(taskId)}`, signal);
  }

  listUsages(filters: UsageListFilters, signal?: AbortSignal): Promise<{ items: UsageListItem[] }> {
    return this.#get(buildUsageListPath(filters), signal);
  }

  getSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
    return this.#get("/api/system/status", signal);
  }

  async #get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImplementation(path, {
        headers: { accept: "application/json" },
        method: "GET",
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw new HubApiError(
        "SERVICE_UNREACHABLE",
        "本地 CodexMemoryOS 服务未响应",
        true,
        0,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      throw new HubApiError(
        "INVALID_RESPONSE",
        "本地服务返回了无法读取的响应",
        true,
        response.status,
      );
    }

    if (response.ok && isRecord(payload) && payload.ok === true && Object.hasOwn(payload, "data")) {
      return payload.data as T;
    }
    if (isRecord(payload) && payload.ok === false && isRestErrorDetail(payload.error)) {
      throw new HubApiError(
        payload.error.code,
        payload.error.message,
        payload.error.retryable,
        response.status,
      );
    }
    throw new HubApiError(
      "INVALID_RESPONSE",
      "本地服务返回了非预期响应",
      true,
      response.status,
    );
  }
}

export function buildAssetListPath(filters: AssetListFilters): string {
  if (filters.workspace === null && filters.scope === "WORKSPACE") {
    throw invalidFilterCombination();
  }
  if (typeof filters.workspace === "string" && filters.scope === "GLOBAL") {
    throw invalidFilterCombination();
  }

  const parameters = new URLSearchParams();
  appendText(parameters, "query", filters.query);
  if (filters.workspace === null) {
    parameters.set("workspace", "null");
  } else {
    appendText(parameters, "workspace", filters.workspace);
  }
  appendText(parameters, "type", filters.type);
  appendText(parameters, "scope", filters.scope);
  if (filters.limit !== undefined) {
    parameters.set("limit", String(filters.limit));
  }
  const query = parameters.toString();
  return query.length === 0 ? "/api/assets" : `/api/assets?${query}`;
}

export function buildTaskLoadoutListPath(filters: TaskLoadoutListFilters): string {
  const parameters = new URLSearchParams();
  appendWorkspace(parameters, filters.workspace);
  appendText(parameters, "status", filters.status);
  appendLimit(parameters, filters.limit);
  return withQuery("/api/task-loadouts", parameters);
}

export function buildUsageListPath(filters: UsageListFilters): string {
  const parameters = new URLSearchParams();
  appendText(parameters, "taskId", filters.taskId);
  appendText(parameters, "assetId", filters.assetId);
  appendWorkspace(parameters, filters.workspace);
  appendLimit(parameters, filters.limit);
  return withQuery("/api/usages", parameters);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function appendText(parameters: URLSearchParams, name: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    parameters.set(name, value);
  }
}

function appendWorkspace(parameters: URLSearchParams, workspace: string | null | undefined): void {
  if (workspace === null) {
    parameters.set("workspace", "null");
  } else {
    appendText(parameters, "workspace", workspace);
  }
}

function appendLimit(parameters: URLSearchParams, limit: number | undefined): void {
  if (limit !== undefined) {
    parameters.set("limit", String(limit));
  }
}

function withQuery(path: string, parameters: URLSearchParams): string {
  const query = parameters.toString();
  return query.length === 0 ? path : `${path}?${query}`;
}

function invalidFilterCombination(): HubApiError {
  return new HubApiError(
    "INVALID_FILTER_COMBINATION",
    "工作区与范围筛选不兼容",
    false,
    0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRestErrorDetail(value: unknown): value is RestErrorDetail {
  return isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean";
}
