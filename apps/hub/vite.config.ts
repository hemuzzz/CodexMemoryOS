import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const serverPort = process.env.CODEX_MEMORY_OS_SERVER_PORT ?? "3000";
if (!/^[1-9][0-9]*$/u.test(serverPort) || Number(serverPort) > 65_535) {
  throw new Error("CODEX_MEMORY_OS_SERVER_PORT must be an integer from 1 to 65535");
}
const apiTarget = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            proxyRequest.setHeader("host", `127.0.0.1:${serverPort}`);
            if (request.headers.origin !== undefined) {
              proxyRequest.setHeader("origin", apiTarget);
            }
          });
        },
        target: apiTarget,
      },
    },
  },
  test: {
    environment: "happy-dom",
  },
});
