import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  AssetNotAccessibleError,
  AssetNotFoundError,
  AssetSearchInputError,
  AssetSearchService,
  AssetSearchUnavailableError,
  assetIdSchema,
  type AssetIndexStatus,
} from "../asset/index.js";
import {
  LoadoutJsonError,
  LoadoutNotMutableError,
  TaskLoadoutApplicationService,
  type ResolveTaskLoadoutResult,
  type TaskLoadoutSummaryDto,
  type TaskLoadoutWithUsageDto,
} from "../loadout/index.js";
import type { StructuredLogger } from "../logging.js";
import {
  TASK_STATUSES,
  TaskApplicationService,
  TaskInputError,
  TaskNotFoundError,
} from "../task/index.js";
import {
  UsageApplicationService,
  UsageSchemaError,
  UsageWriteError,
  type UsageRecord,
} from "../usage/index.js";

const SERVICE_NAME = "codex-memory-os";
const SERVICE_VERSION = "0.0.0";

const taskIdSchema = z
  .string()
  .min(1)
  .describe("A valid tsk-prefixed Task ID. The server resolves its trusted Workspace.");

export const assetSearchToolInputSchema = z
  .object({
    taskId: taskIdSchema,
    query: z.string().describe("A literal Asset search query."),
    limit: z.number().int().positive().safe().optional().describe("Maximum number of results; defaults to 20."),
  })
  .strict();

export const assetReadToolInputSchema = z
  .object({
    taskId: taskIdSchema,
    assetId: z.string().min(1).describe("The exact ast-prefixed Asset ID to read."),
  })
  .strict();

export const assetMarkUsedToolInputSchema = assetReadToolInputSchema;
export const taskLoadoutResolveToolInputSchema = z.object({ taskId: taskIdSchema }).strict();
export const taskLoadoutGetToolInputSchema = taskLoadoutResolveToolInputSchema;
export const taskLoadoutListToolInputSchema = z
  .object({
    workspace: z.string().min(1).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    limit: z.number().int().min(1).max(100).safe().optional(),
  })
  .strict();

export type N08BusinessErrorCode =
  | "ASSET_ID_INVALID"
  | "ASSET_INDEX_UNAVAILABLE"
  | "ASSET_NOT_ACCESSIBLE"
  | "ASSET_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "LOADOUT_JSON_INVALID"
  | "SEARCH_INPUT_INVALID"
  | "TASK_ID_INVALID"
  | "TASK_NOT_FOUND"
  | "TASK_STATUS_NOT_ALLOWED"
  | "USAGE_SCHEMA_INVALID"
  | "USAGE_WRITE_FAILED"
  | "WORKSPACE_CONFIG_UNAVAILABLE";

export interface N08BusinessError {
  code: N08BusinessErrorCode;
  message: string;
  retryable: boolean;
}

export type N07BusinessErrorCode = N08BusinessErrorCode;
export type N07BusinessError = N08BusinessError;

export interface AssetMcpDependencies {
  assetSearchService: AssetSearchService;
  indexStatus: () => AssetIndexStatus;
  loadoutService: TaskLoadoutApplicationService;
  logger: StructuredLogger;
  onInternalError?: (error: unknown) => void;
  taskService: TaskApplicationService;
  usageService: UsageApplicationService;
}

class N08ToolError extends Error {
  constructor(readonly detail: N08BusinessError) {
    super(detail.message);
    this.name = "N08ToolError";
  }
}

export function createAssetMcpServer(dependencies: AssetMcpDependencies): McpServer {
  const server = new McpServer({ name: SERVICE_NAME, version: SERVICE_VERSION });

  server.registerTool(
    "asset_search",
    {
      title: "Search Assets",
      description: "Search trusted Task Workspace Assets and record non-critical Recall Usage.",
      inputSchema: assetSearchToolInputSchema,
      annotations: nonIdempotentUsageAnnotations,
    },
    async ({ taskId, query, limit }) => {
      try {
        const task = dependencies.taskService.getTask(taskId);
        assertIndexReady(dependencies.indexStatus());
        const items = await dependencies.assetSearchService.search({
          context: { workspace: task.workspace },
          query,
          ...(limit === undefined ? {} : { limit }),
        });
        if (items.length > 0) {
          try {
            dependencies.usageService.recordRecalls(taskId, items.map(({ assetId }) => assetId));
          } catch (error) {
            logNonBlocking(dependencies, {
              error,
              errorCode: usageErrorCode(error),
              event: "USAGE_RECALL_WRITE_FAILED",
              operation: "RECALL",
              taskId,
              assetIds: items.map(({ assetId }) => assetId),
            });
          }
        }
        return successResult({ ok: true, items });
      } catch (error) {
        return errorResult(mapToolError(error, dependencies.onInternalError));
      }
    },
  );

  server.registerTool(
    "asset_read",
    {
      title: "Read Asset",
      description: "Read current Markdown for an accessible Asset and record non-critical Read Usage.",
      inputSchema: assetReadToolInputSchema,
      annotations: nonIdempotentUsageAnnotations,
    },
    async ({ taskId, assetId }) => {
      try {
        const task = dependencies.taskService.getTask(taskId);
        assertAssetId(assetId);
        assertIndexReady(dependencies.indexStatus());
        const asset = await dependencies.assetSearchService.read({
          assetId,
          context: { workspace: task.workspace },
        });
        try {
          dependencies.usageService.recordRead(taskId, assetId);
        } catch (error) {
          logNonBlocking(dependencies, {
            error,
            errorCode: usageErrorCode(error),
            event: "USAGE_READ_WRITE_FAILED",
            operation: "READ",
            taskId,
            assetId,
          });
        }
        return successResult({ ok: true, asset });
      } catch (error) {
        return errorResult(mapToolError(error, dependencies.onInternalError));
      }
    },
  );

  server.registerTool(
    "asset_mark_used",
    {
      title: "Mark Asset Used",
      description: "Idempotently mark one accessible Asset as used by the Task.",
      inputSchema: assetMarkUsedToolInputSchema,
      annotations: idempotentWriteAnnotations,
    },
    async ({ taskId, assetId }) => {
      try {
        const task = dependencies.taskService.getTask(taskId);
        assertAssetId(assetId);
        assertIndexReady(dependencies.indexStatus());
        await dependencies.assetSearchService.read({
          assetId,
          context: { workspace: task.workspace },
        });
        let usage: UsageRecord;
        try {
          usage = dependencies.usageService.markUsed(taskId, assetId);
        } catch (error) {
          logNonBlocking(dependencies, {
            error,
            errorCode: usageErrorCode(error),
            event: "USAGE_USED_WRITE_FAILED",
            operation: "USED",
            taskId,
            assetId,
          });
          throw new N08ToolError({
            code: "USAGE_WRITE_FAILED",
            message: "Used Usage could not be persisted",
            retryable: true,
          });
        }
        return successResult({ ok: true, usage });
      } catch (error) {
        return errorResult(mapToolError(error, dependencies.onInternalError));
      }
    },
  );

  server.registerTool(
    "task_loadout_resolve",
    {
      title: "Resolve Task Loadout",
      description: "Replace one RUNNING Task Loadout using its trusted Workspace and initial request.",
      inputSchema: taskLoadoutResolveToolInputSchema,
      annotations: idempotentWriteAnnotations,
    },
    async ({ taskId }) => {
      try {
        const task = dependencies.taskService.getTask(taskId);
        if (task.status !== "RUNNING") {
          throw new LoadoutNotMutableError(task.taskId, task.status);
        }
        assertIndexReady(dependencies.indexStatus());
        const result: ResolveTaskLoadoutResult = await dependencies.loadoutService.resolve(taskId);
        return successResult({ ok: true, ...result });
      } catch (error) {
        if (!isExpectedBusinessError(error)) {
          logNonBlocking(dependencies, {
            error,
            errorCode: "LOADOUT_RESOLVE_FAILED",
            event: "LOADOUT_RESOLVE_FAILED",
            operation: "LOADOUT_RESOLVE",
            taskId,
          });
        }
        return errorResult(mapToolError(error, dependencies.onInternalError));
      }
    },
  );

  server.registerTool(
    "task_loadout_get",
    {
      title: "Get Task Loadout",
      description: "Read one Task, its structured Loadout, and associated Usage.",
      inputSchema: taskLoadoutGetToolInputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ taskId }) => {
      try {
        dependencies.taskService.getTask(taskId);
        assertIndexReady(dependencies.indexStatus());
        const task: TaskLoadoutWithUsageDto = dependencies.loadoutService.get(taskId);
        return successResult({ ok: true, task });
      } catch (error) {
        return errorResult(mapToolError(error, dependencies.onInternalError));
      }
    },
  );

  server.registerTool(
    "task_loadout_list",
    {
      title: "List Task Loadouts",
      description: "List Task Loadout summaries with stable filtering and ordering.",
      inputSchema: taskLoadoutListToolInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const items: TaskLoadoutSummaryDto[] = dependencies.loadoutService.list({
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(Object.prototype.hasOwnProperty.call(input, "workspace")
            ? { workspace: input.workspace ?? null }
            : {}),
        });
        return successResult({ ok: true, items });
      } catch (error) {
        return errorResult(mapToolError(error, dependencies.onInternalError));
      }
    },
  );

  return server;
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const nonIdempotentUsageAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const idempotentWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function assertAssetId(assetId: string): void {
  if (!assetIdSchema.safeParse(assetId).success) {
    throw new N08ToolError({
      code: "ASSET_ID_INVALID",
      message: "assetId must be a valid ast-prefixed ID",
      retryable: false,
    });
  }
}

function assertIndexReady(status: AssetIndexStatus): void {
  if (status.indexState === "READY") {
    return;
  }
  if (status.diagnostics.some(({ code }) => code === "INVALID_WORKSPACE_CONFIG")) {
    throw new N08ToolError({
      code: "WORKSPACE_CONFIG_UNAVAILABLE",
      message: "Workspace configuration is unavailable or invalid",
      retryable: true,
    });
  }
  throw new N08ToolError({
    code: "ASSET_INDEX_UNAVAILABLE",
    message: "Asset Catalog/FTS is not ready for queries",
    retryable: true,
  });
}

function successResult<T extends object>(output: T): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
    structuredContent: output as Record<string, unknown>,
  };
}

function errorResult(error: N08BusinessError): CallToolResult {
  const output = { ok: false, error };
  return {
    content: [{ type: "text", text: `[${error.code}] ${error.message}` }],
    structuredContent: output,
    isError: true,
  };
}

function mapToolError(
  error: unknown,
  onInternalError: ((error: unknown) => void) | undefined,
): N08BusinessError {
  if (error instanceof N08ToolError) {
    return error.detail;
  }
  if (error instanceof TaskInputError) {
    return { code: "TASK_ID_INVALID", message: "taskId must be a valid tsk-prefixed ID", retryable: false };
  }
  if (error instanceof TaskNotFoundError) {
    return { code: "TASK_NOT_FOUND", message: "Task does not exist", retryable: false };
  }
  if (error instanceof LoadoutNotMutableError) {
    return { code: "TASK_STATUS_NOT_ALLOWED", message: "Only RUNNING Tasks can resolve Loadout", retryable: false };
  }
  if (error instanceof LoadoutJsonError) {
    return { code: "LOADOUT_JSON_INVALID", message: error.message, retryable: false };
  }
  if (error instanceof UsageSchemaError) {
    return { code: "USAGE_SCHEMA_INVALID", message: "Usage storage schema is invalid", retryable: false };
  }
  if (error instanceof UsageWriteError) {
    return { code: "USAGE_WRITE_FAILED", message: "Usage could not be persisted", retryable: true };
  }
  if (error instanceof AssetSearchInputError) {
    return { code: "SEARCH_INPUT_INVALID", message: error.message, retryable: false };
  }
  if (error instanceof AssetNotFoundError) {
    return { code: "ASSET_NOT_FOUND", message: "Asset does not exist", retryable: false };
  }
  if (error instanceof AssetNotAccessibleError) {
    return {
      code: "ASSET_NOT_ACCESSIBLE",
      message: "Asset is not accessible for this Task Workspace",
      retryable: false,
    };
  }
  if (error instanceof AssetSearchUnavailableError) {
    return error.reason === "WORKSPACE_CONFIGURATION"
      ? {
          code: "WORKSPACE_CONFIG_UNAVAILABLE",
          message: "Workspace configuration is unavailable or invalid",
          retryable: true,
        }
      : {
          code: "ASSET_INDEX_UNAVAILABLE",
          message: "Current Asset qualification could not be confirmed",
          retryable: true,
        };
  }

  onInternalError?.(error);
  return {
    code: "INTERNAL_ERROR",
    message: "The local Asset service could not complete the request",
    retryable: true,
  };
}

function usageErrorCode(error: unknown): string {
  return error instanceof UsageWriteError || error instanceof UsageSchemaError
    ? error.code
    : "USAGE_WRITE_FAILED";
}

function isExpectedBusinessError(error: unknown): boolean {
  return error instanceof N08ToolError ||
    error instanceof TaskInputError ||
    error instanceof TaskNotFoundError ||
    error instanceof LoadoutNotMutableError ||
    error instanceof LoadoutJsonError ||
    error instanceof AssetSearchInputError ||
    error instanceof AssetSearchUnavailableError;
}

function logNonBlocking(
  dependencies: AssetMcpDependencies,
  input: Parameters<StructuredLogger["error"]>[0],
): void {
  try {
    dependencies.logger.error(input);
  } catch (error) {
    dependencies.onInternalError?.(error);
  }
}
