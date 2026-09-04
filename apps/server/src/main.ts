import {
  serverConfigurationFromEnvironment,
  startCodexMemoryOsServer,
} from "./runtime.js";

try {
  const runtime = await startCodexMemoryOsServer(serverConfigurationFromEnvironment(process.env));
  process.stdout.write(
    `${JSON.stringify({ event: "listening", endpoint: runtime.endpoint })}\n`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    try {
      await runtime.close();
    } catch (error) {
      const name = error instanceof Error ? error.name : typeof error;
      process.stderr.write(`${JSON.stringify({ event: "shutdown_error", signal, name })}\n`);
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
} catch (error) {
  const code = error instanceof Error && "code" in error ? String(error.code) : "SERVER_START_FAILED";
  const name = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`${JSON.stringify({ event: "startup_error", code, name })}\n`);
  process.exitCode = 1;
}
