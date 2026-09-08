import {
  enableAutoUnmount,
  flushPromises,
  mount,
  type DOMWrapper,
  type VueWrapper,
} from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskLoadoutDetail, TaskLoadoutSummary } from "../api/types";
import TaskLoadoutsView from "./TaskLoadoutsView.vue";

const taskId = "tsk2034512345678901249";
const firstAssetId = "ast2034512345678901251";
const secondAssetId = "ast2034512345678901250";
const summary: TaskLoadoutSummary = {
  assetCount: 2,
  createdAt: "2026-09-04T08:00:00.000Z",
  estimatedCharacters: 461,
  request: "Review the current knowledge contract",
  status: "RUNNING",
  taskId,
  updatedAt: "2026-09-04T09:00:00.000Z",
  workspace: "alpha",
};
const detail: TaskLoadoutDetail = {
  createdAt: summary.createdAt,
  loadout: {
    assets: [
      {
        assetId: firstAssetId,
        estimatedCharacters: 301,
        mode: "DIRECT",
        reason: "MEMORY_STRONG_MATCH",
      },
      {
        assetId: secondAssetId,
        estimatedCharacters: 160,
        mode: "ON_DEMAND",
        reason: "DOCUMENT_ON_DEMAND",
      },
    ],
    limits: { maxAssets: 8, maxInjectedCharacters: 3000 },
    schemaVersion: 1,
  },
  request: summary.request,
  status: summary.status,
  taskId,
  updatedAt: summary.updatedAt,
  usages: [
    {
      assetId: secondAssetId,
      assetMissing: true,
      createdAt: "2026-09-04T08:30:00.000Z",
      readCount: 2,
      recallCount: 3,
      taskId,
      updatedAt: "2026-09-04T09:00:00.000Z",
      usageId: "usg2034512345678901252",
      usedFlag: true,
    },
  ],
  workspace: "alpha",
};

enableAutoUnmount(afterEach);

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  history.replaceState(null, "", "/#/tasks");
  fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input).startsWith("/api/task-loadouts/")
        ? jsonResponse({ ok: true, data: { taskLoadout: detail } })
        : jsonResponse({ ok: true, data: { items: [summary] } }),
    );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("Task Loadouts view", () => {
  it("loads the initial list and detail without changing stored Asset order", async () => {
    const wrapper = await mountLoadedView();
    const row = wrapper.get(".task-row");
    expect(row.text()).toContain(summary.request);
    expect(row.text()).toContain(summary.workspace);
    expect(row.text()).not.toContain("进行中");
    expect(row.text()).not.toContain("条资产");
    expect(row.text()).not.toContain("字符");
    expect(wrapper.find("dialog").exists()).toBe(false);
    await wrapper.get(".task-row").trigger("click");
    await flushPromises();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/task-loadouts?limit=20",
      `/api/task-loadouts/${taskId}`,
    ]);
    expect(wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(wrapper.text()).toContain(summary.request);
    expect(wrapper.get("dialog").text()).toContain("进行中");
    expect(wrapper.get("dialog").text()).toContain("不代表 Codex 此刻正在执行");
    expect(wrapper.text()).toContain("2 条知识");
    expect(
      wrapper.findAll(".sequence-heading code").map((item) => item.text()),
    ).toEqual([firstAssetId, secondAssetId]);
    expect(wrapper.text()).toContain("MEMORY_STRONG_MATCH");
    expect(wrapper.text()).toContain("DOCUMENT_ON_DEMAND");
    expect(wrapper.text()).toContain("301");

    await buttonNamed(wrapper, "原始 JSON").trigger("click");
    const raw = wrapper.get(".source-view").text();
    expect(raw.indexOf(firstAssetId)).toBeLessThan(raw.indexOf(secondAssetId));
    expect(raw).toContain('"maxInjectedCharacters": 3000');

    await buttonNamed(wrapper, "知识使用").trigger("click");
    expect(wrapper.text()).toContain("usg2034512345678901252");
    expect(wrapper.text()).toContain("资产已缺失");
    expect(wrapper.text()).toContain("已使用");
  });

  it("keeps empty-loadout tasks visible and their usage accessible with the full original request", async () => {
    const title = "核对知识使用情况".repeat(12);
    const request = `# Files mentioned by the user:\n\n附件.md: /tmp/附件.md\n\n## My request:\n\n## ${title}\r\n完整原始请求：保留换行、提示词和后续条件。`;
    fetchMock.mockImplementation(async (input) =>
      String(input).startsWith("/api/task-loadouts/")
        ? jsonResponse({ ok: true, data: { taskLoadout: {
            ...detail, request, loadout: { ...detail.loadout, assets: [] },
          } } })
        : jsonResponse({ ok: true, data: { items: [{
            ...summary, request, assetCount: 0, estimatedCharacters: 0,
          }] } }),
    );
    const wrapper = await mountLoadedView();
    expect(wrapper.findAll(".task-row")).toHaveLength(1);
    expect(wrapper.get(".row-title").text()).toBe(`${Array.from(title).slice(0, 72).join("")}…`);
    expect(wrapper.text()).not.toContain("完整原始请求");
    await wrapper.get(".task-row").trigger("click");
    await flushPromises();
    expect(wrapper.get(".task-request pre").element.textContent).toBe(request);
    expect(wrapper.text()).toContain("暂无已保存的知识装载");
    await buttonNamed(wrapper, "知识使用").trigger("click");
    expect(wrapper.get('[role="tabpanel"]').text()).toContain("usg2034512345678901252");
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("applies Workspace, status, and legal limit filters with distinct NULL semantics", async () => {
    const wrapper = await mountLoadedView();
    await buttonNamed(wrapper, "指定工作区").trigger("click");
    await wrapper.get(".exact-workspace input").setValue("alpha");
    await buttonNamed(wrapper, "已完成").trigger("click");
    await buttonNamed(wrapper, "100 条").trigger("click");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input) ===
          "/api/task-loadouts?workspace=alpha&status=COMPLETED&limit=100",
      ),
    ).toBe(true);

    await buttonNamed(wrapper, "未绑定").trigger("click");
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input) ===
          "/api/task-loadouts?workspace=null&status=COMPLETED&limit=100",
      ),
    ).toBe(true);
  });

  it("does not let an older list response replace a newer selection", async () => {
    const oldResult = deferred<Response>();
    const newerSummary = {
      ...summary,
      status: "CANCELLED" as const,
      taskId: "tsk2034512345678901299",
    };
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("status=RUNNING")) {
        return oldResult.promise;
      }
      if (path.includes("status=CANCELLED")) {
        return jsonResponse({ ok: true, data: { items: [newerSummary] } });
      }
      if (path === `/api/task-loadouts/${newerSummary.taskId}`) {
        return jsonResponse({
          ok: true,
          data: { taskLoadout: { ...detail, ...newerSummary } },
        });
      }
      if (path.startsWith("/api/task-loadouts/")) {
        return jsonResponse({ ok: true, data: { taskLoadout: detail } });
      }
      return jsonResponse({ ok: true, data: { items: [summary] } });
    });
    const wrapper = await mountLoadedView();
    await buttonNamed(wrapper, "进行中").trigger("click");
    await buttonNamed(wrapper, "已取消").trigger("click");
    await flushPromises();
    expect(wrapper.get(".task-row").attributes("title")).toBe(
      newerSummary.taskId,
    );

    oldResult.resolve(
      jsonResponse({
        ok: true,
        data: { items: [{ ...summary, request: "Stale Task" }] },
      }),
    );
    await flushPromises();
    expect(wrapper.text()).not.toContain("Stale Task");
  });

  it("handles a missing detail with a safe list refresh action", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).startsWith("/api/task-loadouts/")
        ? jsonResponse(
            {
              ok: false,
              error: {
                code: "TASK_NOT_FOUND",
                message: "private detail",
                retryable: false,
              },
            },
            404,
          )
        : jsonResponse({ ok: true, data: { items: [summary] } }),
    );
    const wrapper = await mountLoadedView();
    await wrapper.get(".task-row").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("任务已不存在");
    expect(wrapper.text()).not.toContain("private detail");
    expect(buttonNamed(wrapper, "刷新任务列表").exists()).toBe(true);
  });

  it.each([503, 500])(
    "shows safe list recovery for HTTP %i",
    async (status) => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            error: {
              code: status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
              message: "private detail",
              retryable: status === 503,
            },
          },
          status,
        ),
      );
      const wrapper = await mountLoadedView();
      expect(wrapper.text()).toContain(
        status === 503 ? "任务暂时不可用" : "本地服务未能完成请求",
      );
      expect(wrapper.text()).not.toContain("private detail");
      expect(buttonNamed(wrapper, "重试").exists()).toBe(true);
    },
  );

  it("handles network and non-JSON list failures without exposing their bodies", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("private socket"));
    let wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain("本地服务未连接");
    expect(wrapper.text()).not.toContain("private socket");
    wrapper.unmount();

    fetchMock.mockResolvedValueOnce(
      new Response("<html>private proxy</html>", { status: 502 }),
    );
    wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain("无法读取服务响应");
    expect(wrapper.text()).not.toContain("private proxy");
  });

  it("contains only GET-backed read controls", async () => {
    const wrapper = await mountLoadedView();
    expect(wrapper.text()).not.toMatch(
      /\b(Resolve|Attach|Complete Task|Cancel Task|Create|Edit|Delete|Promote|Confirm)\b/u,
    );
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
});

async function mountLoadedView(): Promise<VueWrapper> {
  const wrapper = mount(TaskLoadoutsView, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function buttonNamed(wrapper: VueWrapper, name: string): DOMWrapper<Element> {
  const button = wrapper
    .findAll("button")
    .find(
      (item) =>
        item.text().replace(/✓/g, "").trim() === name ||
        item.attributes("aria-label") === name,
    );
  if (button === undefined) {
    throw new Error(`Button not found: ${name}`);
  }
  return button;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
