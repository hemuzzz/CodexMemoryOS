import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, win32 } from "node:path";
import { pathToFileURL } from "node:url";

import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import { z } from "zod";

import {
  LoadoutAssetProjectionRepository,
  LoadoutError,
  renderStoredTaskLoadout,
} from "../loadout/index.js";
import { JsonFileLogger, logPathFromEnvironment, type StructuredLogger } from "../logging.js";
import {
  TaskApplicationService,
  TaskError,
  TaskRepository,
  WorkspaceResolutionError,
  resolveTrustedWorkspace,
} from "../task/index.js";

export const HOOK_DATABASE_PATH_ENV = "CODEX_MEMORY_OS_DATABASE_PATH";
export const HOOK_WORKSPACE_CONFIG_PATH_ENV = "CODEX_MEMORY_OS_WORKSPACES_PATH";

const noOpEvents = new Set(["Stop", "Interrupt", "SessionEnd"]);
const hookEnvelopeSchema = z
  .object({
    hook_event_name: z.string(),
  })
  .passthrough();
const userPromptSubmitSchema = z
  .object({
    cwd: z.string().min(1),
    hook_event_name: z.literal("UserPromptSubmit"),
    prompt: z.string().min(1),
    session_id: z.string().min(1),
    turn_id: z.string().min(1),
  })
  .passthrough();

export interface HookRuntimeConfiguration {
  databasePath: string;
  workspaceConfigPath: string;
}

export interface UserPromptSubmitHookConfiguration {
  hooks: {
    UserPromptSubmit: Array<{
      hooks: Array<{
        additionalContextLimit: number;
        command: string;
        timeout: number;
        type: "command";
      }>;
    }>;
  };
}

export class HookError extends Error {
  constructor(
    readonly code: "HOOK_CONFIGURATION_INVALID" | "HOOK_INPUT_INVALID" | "HOOK_TASK_ID_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "HookError";
  }
}

export function createUserPromptSubmitHookConfiguration(command: string): UserPromptSubmitHookConfiguration {
  if (command.trim().length === 0) {
    throw new HookError("HOOK_CONFIGURATION_INVALID", "Hook command must contain non-whitespace text");
  }

  return {
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command,
              timeout: 10,
              additionalContextLimit: 3000,
            },
          ],
        },
      ],
    },
  };
}

export async function handleCodexHook(
  input: unknown,
  configuration: HookRuntimeConfiguration,
  logger: StructuredLogger = new JsonFileLogger(logPathFromEnvironment(process.env)),
): Promise<string | null> {
  const envelope = hookEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    throw new HookError("HOOK_INPUT_INVALID", `Hook input is invalid: ${z.prettifyError(envelope.error)}`);
  }
  if (noOpEvents.has(envelope.data.hook_event_name)) {
    return null;
  }
  if (envelope.data.hook_event_name !== "UserPromptSubmit") {
    throw new HookError(
      "HOOK_INPUT_INVALID",
      `Unsupported Hook event ${JSON.stringify(envelope.data.hook_event_name)}`,
    );
  }

  const parsed = userPromptSubmitSchema.safeParse(input);
  if (!parsed.success) {
    throw new HookError("HOOK_INPUT_INVALID", `UserPromptSubmit input is invalid: ${z.prettifyError(parsed.error)}`);
  }
  assertRuntimeConfiguration(configuration);

  const idGenerator = new SnowflakeIdGenerator();
  const explicitTaskId = extractExplicitTaskId(parsed.data.prompt, idGenerator);
  const workspace = await resolveTrustedWorkspace(parsed.data.cwd, configuration.workspaceConfigPath);

  if (configuration.databasePath !== ":memory:") {
    await mkdir(dirname(configuration.databasePath), { recursive: true });
  }
  const repository = new TaskRepository(configuration.databasePath);
  let assetProjection: LoadoutAssetProjectionRepository | undefined;
  try {
    const service = new TaskApplicationService(repository, { idGenerator });
    const resolution = service.resolveTask({
      sourceSessionId: parsed.data.session_id,
      sourceTurnId: parsed.data.turn_id,
      request: parsed.data.prompt,
      workspace,
      ...(explicitTaskId === undefined ? {} : { explicitTaskId }),
    });
    assetProjection = new LoadoutAssetProjectionRepository(configuration.databasePath);
    let additionalContext: string;
    try {
      additionalContext = renderStoredTaskLoadout(resolution.task, assetProjection);
    } catch (error) {
      safeLog(logger, {
        error,
        errorCode: error instanceof LoadoutError ? error.code : "LOADOUT_RENDER_FAILED",
        event: "LOADOUT_RENDER_FAILED",
        operation: "HOOK_RENDER",
        taskId: resolution.task.taskId,
      });
      throw error;
    }

    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    });
  } finally {
    assetProjection?.close();
    repository.close();
  }
}

export async function runHookCli(
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  try {
    const source = await readStandardInput(stdin);
    let input: unknown;
    try {
      input = JSON.parse(source) as unknown;
    } catch (error) {
      throw new HookError("HOOK_INPUT_INVALID", `Hook stdin must be valid JSON: ${errorMessage(error)}`);
    }

    const logger = new JsonFileLogger(logPathFromEnvironment(environment));
    const output = await handleCodexHook(input, runtimeConfigurationFromEnvironment(environment), logger);
    if (output !== null) {
      stdout.write(`${output}\n`);
    }
    return 0;
  } catch (error) {
    stderr.write(`[${errorCode(error)}] ${errorMessage(error)}\n`);
    return 2;
  }
}

function extractExplicitTaskId(
  prompt: string,
  idGenerator: SnowflakeIdGenerator,
): string | undefined {
  const matches = prompt.matchAll(/(?:^|[\s[({,])taskId\s*[:=]\s*["']?([A-Za-z0-9_-]+)/g);
  const taskIds = [
    ...new Set(
      [...matches]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined && value.startsWith("tsk")),
    ),
  ];
  if (taskIds.length === 0) {
    return undefined;
  }
  if (taskIds.length > 1) {
    throw new HookError("HOOK_TASK_ID_INVALID", `Prompt contains multiple distinct taskId values: ${taskIds.join(", ")}`);
  }

  const taskId = taskIds[0];
  if (taskId === undefined || !idGenerator.validate(taskId, "tsk")) {
    throw new HookError("HOOK_TASK_ID_INVALID", `Prompt taskId must be a valid tsk-prefixed ID: ${String(taskId)}`);
  }
  return taskId;
}

function runtimeConfigurationFromEnvironment(environment: NodeJS.ProcessEnv): HookRuntimeConfiguration {
  const databasePath = environment[HOOK_DATABASE_PATH_ENV];
  const workspaceConfigPath = environment[HOOK_WORKSPACE_CONFIG_PATH_ENV];
  if (databasePath === undefined || workspaceConfigPath === undefined) {
    throw new HookError(
      "HOOK_CONFIGURATION_INVALID",
      `${HOOK_DATABASE_PATH_ENV} and ${HOOK_WORKSPACE_CONFIG_PATH_ENV} must both be configured`,
    );
  }
  return { databasePath, workspaceConfigPath };
}

function assertRuntimeConfiguration(configuration: HookRuntimeConfiguration): void {
  if (configuration.databasePath !== ":memory:" && !isAbsolute(configuration.databasePath) && !win32.isAbsolute(configuration.databasePath)) {
    throw new HookError("HOOK_CONFIGURATION_INVALID", "Task database path must be absolute");
  }
  if (!isAbsolute(configuration.workspaceConfigPath) && !win32.isAbsolute(configuration.workspaceConfigPath)) {
    throw new HookError("HOOK_CONFIGURATION_INVALID", "Workspace configuration path must be absolute");
  }
}

async function readStandardInput(stdin: NodeJS.ReadableStream): Promise<string> {
  let source = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) {
    source += chunk;
  }
  return source;
}

function errorCode(error: unknown): string {
  if (
    error instanceof HookError ||
    error instanceof LoadoutError ||
    error instanceof TaskError ||
    error instanceof WorkspaceResolutionError
  ) {
    return error.code;
  }
  return "HOOK_FAILED";
}

function safeLog(logger: StructuredLogger, input: Parameters<StructuredLogger["error"]>[0]): void {
  try {
    logger.error(input);
  } catch {
    // Logging must not replace the original Hook error.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const entryPath = process.argv[1];
if (entryPath !== undefined && pathToFileURL(entryPath).href === import.meta.url) {
  process.exitCode = await runHookCli();
}
