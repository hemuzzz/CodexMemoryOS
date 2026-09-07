import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SystemReadiness, SystemStatus } from "../api/types";
import SystemStatusView from "./SystemStatusView.vue";

const readyStatus: SystemStatus = {
  diagnostics: [
    {
      code: "INVALID_FRONTMATTER",
      message: "Frontmatter is invalid",
      relativePath: "assets/invalid.md",
      source: "SCANNER",
    },
    {
      code: "WATCHER_EVENT_FAILED",
      message: "Watcher event could not be applied",
      occurredAt: "2026-09-04T09:00:00.000Z",
      source: "WATCHER",
    },
  ],
  index: {
    catalogCount: 12,
    ftsCount: 12,
    indexState: "READY",
    lastSuccessfulScanAt: "2026-09-04T08:59:00.000Z",
    rebuildRequired: false,
    watcherState: "RUNNING",
  },
  mcpEndpoint: { path: "/mcp", ready: true },
  repository: {
    assetRepositoryPath: "/tmp/codex-memory-os/assets",
    formalAssetCount: 12,
    inboxAssetCount: 1,
  },
  service: {
    name: "codex-memory-os",
    readiness: "READY",
    uptimeSeconds: 3661,
    version: "0.0.0",
  },
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, data: readyStatus }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("System Status view", () => {
  it.each(["READY", "DEGRADED", "REBUILD_REQUIRED"] as const)(
    "renders the calculated %s readiness without creating history",
    async (readiness) => {
      const value = withReadiness(readiness);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: value }));
      const wrapper = await mountLoadedView();
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/system/status");
      expect(wrapper.get(".status-verdict .readiness-label").text()).toBe(({ READY: "就绪", DEGRADED: "降级运行", REBUILD_REQUIRED: "需要重建" })[readiness]);
      expect(wrapper.text()).toContain(({ READY: "就绪", DEGRADED: "降级运行", REBUILD_REQUIRED: "需要重建" })[value.index.indexState]);
      expect(wrapper.text()).toContain(`需要重建${value.index.rebuildRequired ? "是" : "否"}`);
      expect(wrapper.text()).not.toContain("Status history");
    },
  );

  it("shows all service, repository, index, endpoint, and diagnostic fields in service order", async () => {
    const wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain("codex-memory-os");
    expect(wrapper.text()).toContain("1时 1分 1秒 (3661 秒)");
    expect(wrapper.text()).toContain("/tmp/codex-memory-os/assets");
    expect(wrapper.text()).toContain("目录条目12");
    expect(wrapper.text()).toContain("全文索引条目12");
    expect(wrapper.text()).toContain("文件监听状态进行中");
    expect(wrapper.text()).toContain("端点就绪是");
    expect(wrapper.text()).toContain("不代表 Codex 客户端已连接。");
    expect(wrapper.findAll(".status-diagnostics > li > div > code").map((item) => item.text())).toEqual([
      "INVALID_FRONTMATTER",
      "WATCHER_EVENT_FAILED",
    ]);
    expect(wrapper.text()).toContain("assets/invalid.md");
    expect(wrapper.text()).toContain("Frontmatter is invalid");
  });

  it("renders NULL counts and dates as unknown rather than zero", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ok: true,
      data: {
        ...readyStatus,
        index: { ...readyStatus.index, catalogCount: null, ftsCount: null, lastSuccessfulScanAt: null },
        repository: { ...readyStatus.repository, formalAssetCount: null, inboxAssetCount: null },
      },
    }));
    const wrapper = await mountLoadedView();
    expect(wrapper.findAll("dd").filter((item) => item.text() === "未知 / 不可用")).toHaveLength(5);
    expect(wrapper.text()).not.toContain("正式资产0");
    expect(wrapper.text()).not.toContain("候选资产0");
    expect(wrapper.text()).not.toContain("目录条目0");
    expect(wrapper.text()).not.toContain("全文索引条目0");
  });

  it("loads once, then refreshes only after the explicit control is used", async () => {
    const wrapper = await mountLoadedView();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await buttonNamed(wrapper, "刷新状态").trigger("click");
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("keeps the explicit refresh when the initial response arrives late", async () => {
    const initial = deferred<Response>();
    const degraded = withReadiness("DEGRADED");
    fetchMock
      .mockImplementationOnce(async () => initial.promise)
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: degraded }));
    const wrapper = mount(SystemStatusView);
    await buttonNamed(wrapper, "刷新状态").trigger("click");
    await flushPromises();
    expect(wrapper.get(".status-verdict .readiness-label").text()).toBe("降级运行");

    initial.resolve(jsonResponse({ ok: true, data: readyStatus }));
    await flushPromises();
    expect(wrapper.get(".status-verdict .readiness-label").text()).toBe("降级运行");
  });

  it.each([503, 500])("shows safe explicit recovery for HTTP %i", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({
      ok: false,
      error: { code: status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR", message: "private path", retryable: status === 503 },
    }, status));
    const wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain(status === 503
      ? "系统状态暂时不可用"
      : "本地服务未能完成请求");
    expect(wrapper.text()).not.toContain("private path");
    expect(buttonNamed(wrapper, "重试").exists()).toBe(true);
  });

  it("handles an unreadable response with safe copy", async () => {
    fetchMock.mockResolvedValue(new Response("SQL path and stack", { status: 500 }));
    const wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain("无法读取服务响应");
    expect(wrapper.text()).not.toContain("SQL path and stack");
  });
});

function withReadiness(readiness: SystemReadiness): SystemStatus {
  return {
    ...readyStatus,
    index: {
      ...readyStatus.index,
      indexState: readiness,
      rebuildRequired: readiness === "REBUILD_REQUIRED",
    },
    service: { ...readyStatus.service, readiness },
  };
}

async function mountLoadedView(): Promise<VueWrapper> {
  const wrapper = mount(SystemStatusView);
  await flushPromises();
  return wrapper;
}

function buttonNamed(wrapper: VueWrapper, name: string): DOMWrapper<Element> {
  const button = wrapper.findAll("button").find((item) => item.text().trim() === name);
  if (button === undefined) {
    throw new Error(`Button not found: ${name}`);
  }
  return button;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
