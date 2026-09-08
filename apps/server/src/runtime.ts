import { createServer, type Server } from "node:http";
import { isAbsolute, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { getRequestListener } from "@hono/node-server";
import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";

import { AssetContentVersionRepository } from "./asset/content-version.js";
import { AssetDiffService } from "./asset/content-diff.js";
import { createApp } from "./app.js";
import {
  AssetIndexManager,
  AssetSearchService,
  InboxApplicationService,
} from "./asset/index.js";
import {
  HOOK_DATABASE_PATH_ENV,
  HOOK_WORKSPACE_CONFIG_PATH_ENV,
} from "./hook/user-prompt-submit.js";
import {
  LoadoutAssetProjectionRepository,
  TaskLoadoutApplicationService,
} from "./loadout/index.js";
import { JsonFileLogger, logPathFromEnvironment } from "./logging.js";
import {
  OverviewApplicationService,
  HubAssetApplicationService,
  SystemStatusApplicationService,
} from "./http/index.js";
import { createMcpHttpRequestHandler } from "./mcp/index.js";
import { TaskApplicationService, TaskRepository } from "./task/index.js";
import { UsageApplicationService, UsageRepository } from "./usage/index.js";

export const SERVER_ASSET_REPOSITORY_PATH_ENV = "CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH";
export const SERVER_PORT_ENV = "PORT";
const HOST = "127.0.0.1";
const HUB_DIST_PATH = fileURLToPath(new URL("../../hub/dist/", import.meta.url));

export interface ServerRuntimeConfiguration {
  assetRepositoryPath: string;
  databasePath: string;
  logPath: string;
  port: number;
  workspaceConfigPath: string;
}

export interface RunningCodexMemoryOsServer {
  close: () => Promise<void>;
  endpoint: string;
  server: Server;
}

export class ServerConfigurationError extends Error {
  readonly code = "SERVER_CONFIGURATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ServerConfigurationError";
  }
}

export function serverConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerRuntimeConfiguration {
  const assetRepositoryPath = environment[SERVER_ASSET_REPOSITORY_PATH_ENV];
  const databasePath = environment[HOOK_DATABASE_PATH_ENV];
  const workspaceConfigPath = environment[HOOK_WORKSPACE_CONFIG_PATH_ENV];
  if (
    assetRepositoryPath === undefined ||
    databasePath === undefined ||
    workspaceConfigPath === undefined
  ) {
    throw new ServerConfigurationError(
      `${SERVER_ASSET_REPOSITORY_PATH_ENV}, ${HOOK_DATABASE_PATH_ENV}, and ${HOOK_WORKSPACE_CONFIG_PATH_ENV} must be configured`,
    );
  }
  assertAbsolutePath(assetRepositoryPath, "Asset Repository path");
  assertAbsolutePath(databasePath, "database path");
  assertAbsolutePath(workspaceConfigPath, "Workspace configuration path");

  const rawPort = environment[SERVER_PORT_ENV] ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ServerConfigurationError(`${SERVER_PORT_ENV} must be an integer from 1 to 65535`);
  }
  let logPath: string;
  try {
    logPath = logPathFromEnvironment(environment);
  } catch (error) {
    throw new ServerConfigurationError(error instanceof Error ? error.message : "Log path is invalid");
  }
  return {
    assetRepositoryPath,
    databasePath,
    logPath,
    port,
    workspaceConfigPath,
  };
}

export async function startCodexMemoryOsServer(
  configuration: ServerRuntimeConfiguration,
): Promise<RunningCodexMemoryOsServer> {
  const indexManager = await AssetIndexManager.create({
    databasePath: configuration.databasePath,
    repositoryPath: configuration.assetRepositoryPath,
    workspaceConfigPath: configuration.workspaceConfigPath,
  });
  let contentVersions: AssetContentVersionRepository | undefined;
  let taskRepository: TaskRepository | undefined;
  let usageRepository: UsageRepository | undefined;
  let assetProjection: LoadoutAssetProjectionRepository | undefined;
  let assetSearchService: AssetSearchService | undefined;
  let server: Server | undefined;

  try {
    await indexManager.start();
    contentVersions = new AssetContentVersionRepository(configuration.databasePath);
    taskRepository = new TaskRepository(configuration.databasePath);
    const idGenerator = new SnowflakeIdGenerator();
    const taskService = new TaskApplicationService(taskRepository, { idGenerator });
    usageRepository = new UsageRepository(configuration.databasePath);
    const usageService = new UsageApplicationService(usageRepository, { idGenerator });
    assetProjection = new LoadoutAssetProjectionRepository(configuration.databasePath);
    assetSearchService = new AssetSearchService({
      databasePath: configuration.databasePath,
      repositoryPath: configuration.assetRepositoryPath,
      workspaceConfigPath: configuration.workspaceConfigPath,
      refreshIndex: async () => await indexManager.synchronize(),
    });
    const loadoutService = new TaskLoadoutApplicationService({
      assetProjection,
      assetSearchService,
      taskRepository,
      taskService,
      usageService,
    });
    const logger = new JsonFileLogger(configuration.logPath);
    const mcpRequest = createMcpHttpRequestHandler({
      assetSearchService,
      indexStatus: () => indexManager.status(),
      loadoutService,
      logger,
      onInternalError: logInternalError,
      taskService,
      usageService,
    });
    const inboxService = new InboxApplicationService(
      {
        repositoryPath: configuration.assetRepositoryPath,
        workspaceConfigPath: configuration.workspaceConfigPath,
      },
      assetSearchService,
    );
    const assetService = new HubAssetApplicationService(
      assetSearchService,
      loadoutService,
      usageService,
      new AssetDiffService(assetSearchService, contentVersions),
    );
    const systemStatusService = new SystemStatusApplicationService({
      repositoryPath: configuration.assetRepositoryPath,
      workspaceConfigPath: configuration.workspaceConfigPath,
      indexStatus: () => indexManager.status(),
      inboxService,
      mcpEndpointReady: () => server?.listening === true,
    });
    const httpApp = createApp(
      {
        allowedAuthority: `${HOST}:${configuration.port}`,
        assetService,
        inboxService,
        indexStatus: () => indexManager.status(),
        loadoutService,
        onInternalError: logInternalError,
        systemStatusService,
        overviewService: new OverviewApplicationService({ ...systemStatusService.dependencies, taskRepository, usageRepository }),
        usageService,
      },
      { root: HUB_DIST_PATH },
    );
    const honoRequest = getRequestListener(httpApp.fetch, { hostname: HOST });
    server = createServer((request, response) => {
      const operation = request.url === "/mcp"
        ? mcpRequest(request, response)
        : honoRequest(request, response);
      void operation.catch((error: unknown) => {
        logInternalError(error);
        if (!response.headersSent) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "request_failed" }));
        } else if (!response.writableEnded) {
          response.end();
        }
      });
    });
    await listen(server, configuration.port);
    const runningServer = server;

    let closed = false;
    return {
      server: runningServer,
      endpoint: `http://${HOST}:${configuration.port}/mcp`,
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        await closeServer(runningServer);
        contentVersions?.close();
        assetSearchService?.close();
        assetProjection?.close();
        usageRepository?.close();
        taskRepository?.close();
        await indexManager.close();
      },
    };
  } catch (error) {
    if (server !== undefined) {
      await closeServer(server);
    }
    contentVersions?.close();
    assetSearchService?.close();
    assetProjection?.close();
    usageRepository?.close();
    taskRepository?.close();
    await indexManager.close();
    throw error;
  }
}

function assertAbsolutePath(path: string, label: string): void {
  if (!isAbsolute(path) && !win32.isAbsolute(path)) {
    throw new ServerConfigurationError(`${label} must be absolute`);
  }
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    server.closeAllConnections();
  });
}

function logInternalError(error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`${JSON.stringify({ event: "internal_error", name })}\n`);
}
