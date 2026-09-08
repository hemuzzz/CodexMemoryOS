import {
  enableAutoUnmount,
  flushPromises,
  mount,
  type DOMWrapper,
  type VueWrapper,
} from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UsageListItem } from "../api/types";
import UsageView from "./UsageView.vue";

const usage: UsageListItem = {
  assetId: "ast2034512345678901250",
  assetMissing: true,
  createdAt: "2026-09-04T08:30:00.000Z",
  readCount: 4,
  recallCount: 7,
  taskId: "tsk2034512345678901249",
  updatedAt: "2026-09-04T09:00:00.000Z",
  usageId: "usg2034512345678901252",
  usedFlag: true,
  workspace: "alpha",
};

enableAutoUnmount(afterEach);

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse({ ok: true, data: { items: [usage] } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("Usage view", () => {
  it("shows separate read-only Usage facts and an explicit missing Asset state", async () => {
    const wrapper = await mountLoadedView();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/usages?limit=20");
    expect(wrapper.text()).toContain(usage.usageId);
    expect(wrapper.text()).toContain(usage.taskId);
    expect(wrapper.text()).toContain(usage.assetId);
    expect(wrapper.findAll("tbody td")[3]?.text()).toBe("7");
    expect(wrapper.findAll("tbody td")[4]?.text()).toBe("4");
    expect(wrapper.text()).toContain("已使用");
    expect(wrapper.text()).toContain("资产已缺失");
    expect(wrapper.get(".usage-table").element.tagName).toBe("TABLE");
    expect(
      wrapper.get(".usage-table tbody tr").attributes("tabindex"),
    ).toBeUndefined();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(
      /\b(Score|Trend|Ranking|Recommendation)\b/u,
    );
  });

  it("constructs taskId, assetId, Workspace, and limit as one AND query", async () => {
    const wrapper = await mountLoadedView();
    const inputs = wrapper.findAll(".usage-id-filters input");
    await inputs[0]?.setValue(usage.taskId);
    await inputs[1]?.setValue(usage.assetId);
    await buttonNamed(wrapper, "100 条").trigger("click");
    await buttonNamed(wrapper, "指定工作区").trigger("click");
    await wrapper.get(".exact-workspace input").setValue("alpha");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input) ===
          `/api/usages?taskId=${usage.taskId}&assetId=${usage.assetId}&workspace=alpha&limit=100`,
      ),
    ).toBe(true);
    expect(wrapper.text()).toContain(
      `任务 ${usage.taskId} · 资产 ${usage.assetId} · 工作区 alpha`,
    );

    await buttonNamed(wrapper, "未绑定").trigger("click");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input) ===
          `/api/usages?taskId=${usage.taskId}&assetId=${usage.assetId}&workspace=null&limit=100`,
      ),
    ).toBe(true);
  });

  it("does not send whitespace-only or padded exact values", async () => {
    const wrapper = await mountLoadedView();
    const requestsBefore = fetchMock.mock.calls.length;
    await wrapper.findAll(".usage-id-filters input")[0]?.setValue(" padded ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("任务 ID首尾不能包含空格");
    expect(fetchMock.mock.calls).toHaveLength(requestsBefore);

    await wrapper.findAll(".usage-id-filters input")[0]?.setValue("");
    await buttonNamed(wrapper, "指定工作区").trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("请输入准确的工作区名称");
    expect(fetchMock.mock.calls).toHaveLength(requestsBefore);
  });

  it("keeps the newer filtered response when an older request finishes later", async () => {
    const oldResult = deferred<Response>();
    const newerUsage = {
      ...usage,
      taskId: "tsk2034512345678901299",
      usageId: "usg2034512345678901298",
    };
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes(`taskId=${usage.taskId}`)) {
        return oldResult.promise;
      }
      if (path.includes(`taskId=${newerUsage.taskId}`)) {
        return jsonResponse({ ok: true, data: { items: [newerUsage] } });
      }
      return jsonResponse({ ok: true, data: { items: [usage] } });
    });
    const wrapper = await mountLoadedView();
    const taskInput = wrapper.findAll(".usage-id-filters input")[0];
    await taskInput?.setValue(usage.taskId);
    await wrapper.get("form").trigger("submit");
    await taskInput?.setValue(newerUsage.taskId);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain(newerUsage.usageId);

    oldResult.resolve(
      jsonResponse({
        ok: true,
        data: { items: [{ ...usage, usageId: "usg-stale" }] },
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain(newerUsage.usageId);
    expect(wrapper.text()).not.toContain("usg-stale");
  });

  it("shows normal empty results and safe explicit recovery", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, data: { items: [] } }),
    );
    let wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain("暂无使用记录");
    wrapper.unmount();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "private database detail",
            retryable: false,
          },
        },
        500,
      ),
    );
    wrapper = await mountLoadedView();
    expect(wrapper.text()).toContain("本地服务未能完成请求");
    expect(wrapper.text()).not.toContain("private database detail");
    expect(buttonNamed(wrapper, "重试").exists()).toBe(true);
  });

  it("refreshes only on demand and sends GET requests only", async () => {
    const wrapper = await mountLoadedView();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await buttonNamed(wrapper, "刷新记录").trigger("click");
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
});

async function mountLoadedView(): Promise<VueWrapper> {
  const wrapper = mount(UsageView);
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
