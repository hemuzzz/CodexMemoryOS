import { Hono, type Context } from "hono";
import { z, type ZodType } from "zod";

import {
  AssetLibraryInputError,
  AssetNotFoundError,
  AssetSearchInputError,
  AssetSearchUnavailableError,
  AssetStaleError,
  InboxApplicationService,
  InboxUnavailableError,
  type AssetIndexStatus,
} from "../asset/index.js";
import {
  LoadoutJsonError,
  TaskLoadoutApplicationService,
} from "../loadout/index.js";
import { TaskInputError, TaskNotFoundError } from "../task/index.js";
import {
  UsageApplicationService,
  UsageInputError,
  UsageSchemaError,
} from "../usage/index.js";
import {
  assetListQuerySchema,
  assetPathSchema,
  taskLoadoutListQuerySchema,
  taskPathSchema,
  usageListQuerySchema,
  type RestErrorDetail,
  type RestErrorResponse,
  type RestSuccessResponse,
} from "./contracts/index.js";
import type { OverviewApplicationService } from "./overview.js";
import { RestError, invalidRequest } from "./errors.js";
import {
  HubAssetApplicationService,
  SystemStatusApplicationService,
} from "./service.js";

const KNOWN_API_PATHS = [
  /^\/api\/overview$/u,
  /^\/api\/assets$/u,
  /^\/api\/assets\/[^/]+\/diff$/u,
  /^\/api\/assets\/[^/]+$/u,
  /^\/api\/inbox$/u,
  /^\/api\/task-loadouts$/u,
  /^\/api\/task-loadouts\/[^/]+$/u,
  /^\/api\/usages$/u,
  /^\/api\/system\/status$/u,
];

export interface RestApiDependencies {
  allowedAuthority: string;
  overviewService: Pick<OverviewApplicationService, "get">;
  assetService: HubAssetApplicationService;
  inboxService: Pick<InboxApplicationService, "scan">;
  indexStatus: () => AssetIndexStatus;
  loadoutService: Pick<TaskLoadoutApplicationService, "get" | "list">;
  onInternalError?: (error: unknown) => void;
  systemStatusService: Pick<SystemStatusApplicationService, "get">;
  usageService: Pick<UsageApplicationService, "list">;
}

export function createRestApiApp(dependencies: RestApiDependencies): Hono {
  const app = new Hono();

  app.use("/api/*", async (context, next) => {
    if (!requestIsAllowed(context, dependencies.allowedAuthority)) {
      return failure(context, 403, {
        code: "FORBIDDEN_HOST_ORIGIN",
        message: "Host or Origin is not allowed",
        retryable: false,
      });
    }
    if (context.req.method !== "GET" && isKnownApiPath(context.req.path)) {
      context.header("Allow", "GET");
      return failure(context, 405, {
        code: "METHOD_NOT_ALLOWED",
        message: "This Hub API route only allows GET",
        retryable: false,
      });
    }
    await next();
  });

  app.get("/api/overview", async (context) => {
    parseStrictQuery(context, [], z.object({}).strict());
    return success(context, await dependencies.overviewService.get());
  });

  app.get("/api/assets", async (context) => {
    assertIndexReady(dependencies.indexStatus());
    const query = parseStrictQuery(
      context,
      ["query", "workspace", "type", "scope", "limit"],
      assetListQuerySchema,
    );
    const items = await dependencies.assetService.list({
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.scope === undefined ? {} : { scope: query.scope }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(Object.prototype.hasOwnProperty.call(query, "workspace")
        ? { workspace: query.workspace ?? null }
        : {}),
    });
    return success(context, { items });
  });

  app.get("/api/assets/:assetId", async (context) => {
    parseStrictQuery(context, [], z.object({}).strict());
    assertIndexReady(dependencies.indexStatus());
    const path = parsePath(assetPathSchema, { assetId: context.req.param("assetId") }, "ASSET_ID_INVALID");
    return success(context, { asset: await dependencies.assetService.get(path.assetId) });
  });

  app.get("/api/assets/:assetId/diff", async (context) => {
    parseStrictQuery(context, [], z.object({}).strict());
    assertIndexReady(dependencies.indexStatus());
    const path = parsePath(assetPathSchema, { assetId: context.req.param("assetId") }, "ASSET_ID_INVALID");
    return success(context, { diff: await dependencies.assetService.diff(path.assetId) });
  });

  app.get("/api/inbox", async (context) => {
    parseStrictQuery(context, [], z.object({}).strict());
    return success(context, await dependencies.inboxService.scan());
  });

  app.get("/api/task-loadouts", (context) => {
    const query = parseStrictQuery(
      context,
      ["workspace", "status", "limit"],
      taskLoadoutListQuerySchema,
    );
    const items = dependencies.loadoutService.list({
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(Object.prototype.hasOwnProperty.call(query, "workspace")
        ? { workspace: query.workspace ?? null }
        : {}),
    });
    return success(context, { items });
  });

  app.get("/api/task-loadouts/:taskId", (context) => {
    parseStrictQuery(context, [], z.object({}).strict());
    const path = parsePath(taskPathSchema, { taskId: context.req.param("taskId") }, "TASK_ID_INVALID");
    return success(context, { taskLoadout: dependencies.loadoutService.get(path.taskId) });
  });

  app.get("/api/usages", (context) => {
    const query = parseStrictQuery(
      context,
      ["taskId", "assetId", "workspace", "limit"],
      usageListQuerySchema,
    );
    const items = dependencies.usageService.list({
      ...(query.taskId === undefined ? {} : { taskId: query.taskId }),
      ...(query.assetId === undefined ? {} : { assetId: query.assetId }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(Object.prototype.hasOwnProperty.call(query, "workspace")
        ? { workspace: query.workspace ?? null }
        : {}),
    });
    return success(context, { items });
  });

  app.get("/api/system/status", async (context) => {
    parseStrictQuery(context, [], z.object({}).strict());
    return success(context, await dependencies.systemStatusService.get());
  });

  app.notFound((context) => failure(context, 404, {
    code: "ROUTE_NOT_FOUND",
    message: "Route does not exist",
    retryable: false,
  }));

  app.onError((error, context) => {
    const mapped = mapRestError(error, dependencies.onInternalError);
    return failure(context, mapped.status, mapped.detail);
  });
  return app;
}

function parseStrictQuery<T>(
  context: Context,
  allowedNames: readonly string[],
  schema: ZodType<T>,
): T {
  const allowed = new Set(allowedNames);
  const values: Record<string, string> = {};
  const url = new URL(context.req.url);
  for (const [name, value] of url.searchParams) {
    if (!allowed.has(name)) {
      throw invalidRequest("QUERY_PARAMETER_UNKNOWN", `Unknown query parameter: ${name}`);
    }
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      throw invalidRequest("QUERY_PARAMETER_REPEATED", `Query parameter must not be repeated: ${name}`);
    }
    if (value.length === 0) {
      throw invalidRequest("QUERY_PARAMETER_EMPTY", `Query parameter must not be empty: ${name}`);
    }
    values[name] = value;
  }
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const invalidCombination = parsed.error.issues.some(
      (issue) => issue.code === "custom" && issue.message.includes("cannot be combined"),
    );
    throw invalidRequest(
      invalidCombination ? "INVALID_FILTER_COMBINATION" : "QUERY_PARAMETER_INVALID",
      invalidCombination ? parsed.error.issues[0]?.message ?? "Invalid filter combination" : "Query parameters are invalid",
    );
  }
  return parsed.data;
}

function parsePath<T>(schema: ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw invalidRequest(code, parsed.error.issues[0]?.message ?? "Path parameter is invalid");
  }
  return parsed.data;
}

function assertIndexReady(status: AssetIndexStatus): void {
  if (status.indexState === "READY") {
    return;
  }
  if (status.diagnostics.some(({ code }) => code === "INVALID_WORKSPACE_CONFIG")) {
    throw new RestError(503, {
      code: "WORKSPACE_CONFIG_UNAVAILABLE",
      message: "Workspace configuration is unavailable or invalid",
      retryable: true,
    });
  }
  throw new RestError(503, {
    code: "ASSET_INDEX_UNAVAILABLE",
    message: "Asset Catalog/FTS is not ready for queries",
    retryable: true,
  });
}

function requestIsAllowed(context: Context, allowedAuthority: string): boolean {
  if (context.req.header("host") !== allowedAuthority) {
    return false;
  }
  const origin = context.req.header("origin");
  return origin === undefined || origin === `http://${allowedAuthority}`;
}

function isKnownApiPath(path: string): boolean {
  return KNOWN_API_PATHS.some((pattern) => pattern.test(path));
}

function mapRestError(error: unknown, onInternalError: ((error: unknown) => void) | undefined): RestError {
  if (error instanceof RestError) {
    return error;
  }
  if (error instanceof AssetLibraryInputError) {
    return new RestError(400, { code: "WORKSPACE_INVALID", message: error.message, retryable: false });
  }
  if (error instanceof AssetSearchInputError) {
    return new RestError(400, { code: "SEARCH_INPUT_INVALID", message: error.message, retryable: false });
  }
  if (error instanceof AssetNotFoundError) {
    return new RestError(404, { code: "ASSET_NOT_FOUND", message: "Asset does not exist", retryable: false });
  }
  if (error instanceof AssetStaleError) {
    return new RestError(409, {
      code: "ASSET_STALE",
      message: "Asset no longer matches its Catalog projection; retry after refresh",
      retryable: true,
    });
  }
  if (error instanceof AssetSearchUnavailableError) {
    return new RestError(503, error.reason === "WORKSPACE_CONFIGURATION"
      ? {
          code: "WORKSPACE_CONFIG_UNAVAILABLE",
          message: "Workspace configuration is unavailable or invalid",
          retryable: true,
        }
      : {
          code: "ASSET_INDEX_UNAVAILABLE",
          message: "Current Asset qualification could not be confirmed",
          retryable: true,
        });
  }
  if (error instanceof InboxUnavailableError) {
    return new RestError(503, {
      code: error.reason === "WORKSPACE_CONFIGURATION" ? "WORKSPACE_CONFIG_UNAVAILABLE" : "INBOX_SCAN_UNAVAILABLE",
      message: error.reason === "WORKSPACE_CONFIGURATION"
        ? "Workspace configuration is unavailable or invalid"
        : "Inbox could not be scanned completely",
      retryable: true,
    });
  }
  if (error instanceof TaskInputError) {
    return new RestError(400, { code: "TASK_ID_INVALID", message: "taskId must be a valid tsk-prefixed ID", retryable: false });
  }
  if (error instanceof TaskNotFoundError) {
    return new RestError(404, { code: "TASK_NOT_FOUND", message: "Task does not exist", retryable: false });
  }
  if (error instanceof UsageInputError) {
    return new RestError(400, { code: "USAGE_INPUT_INVALID", message: error.message, retryable: false });
  }
  if (error instanceof LoadoutJsonError) {
    return new RestError(500, { code: "LOADOUT_JSON_INVALID", message: "Stored Loadout JSON is invalid", retryable: false });
  }
  if (error instanceof UsageSchemaError) {
    return new RestError(500, { code: "USAGE_SCHEMA_INVALID", message: "Usage storage schema is invalid", retryable: false });
  }
  onInternalError?.(error);
  return new RestError(500, {
    code: "INTERNAL_ERROR",
    message: "The local service could not complete the request",
    retryable: false,
  });
}

function success<T>(context: Context, data: T): Response {
  const body: RestSuccessResponse<T> = { ok: true, data };
  return context.json(body, 200);
}

function failure(
  context: Context,
  status: 400 | 403 | 404 | 405 | 409 | 500 | 503,
  error: RestErrorDetail,
): Response {
  const body: RestErrorResponse = { ok: false, error };
  return context.json(body, status);
}
