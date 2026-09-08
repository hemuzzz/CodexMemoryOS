import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App.vue";
import { navigate } from "../navigation.js";
import type { OverviewDto } from "../api/types.js";

enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());
const overview: OverviewDto = {
  generatedAt: "2026-09-08T08:00:00.000Z", diagnosticCount: 0,
  scopes: [
    { workspace: "alpha", assets: { MEMORY: 120, DOCUMENT: 3, SKILL: 2 }, inboxCount: 4,
      tasks: { RUNNING: 105, COMPLETED: 8, CANCELLED: 1 },
      usage: { recallCount: 302, readCount: 150, usedPairCount: 7, usedTaskCount: 3 } },
    { workspace: null, assets: { MEMORY: 1, DOCUMENT: 0, SKILL: 0 }, inboxCount: 0,
      tasks: { RUNNING: 0, COMPLETED: 0, CANCELLED: 0 },
      usage: { recallCount: 0, readCount: 0, usedPairCount: 0, usedTaskCount: 0 } },
  ],
};
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  history.replaceState(null, "", "/");
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => new Response(JSON.stringify({ ok: true,
    data: String(input) === "/api/overview" ? overview : { items: [] } })));
  vi.stubGlobal("fetch", fetchMock);
});
it("opens on the overview, filters totals, and opens exact asset and task lists", async () => {
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.get("h1").text()).toBe("总览");
  expect(wrapper.get(".overview-stat strong").text()).toBe("126");
  await wrapper.get('select[aria-label="统计范围"]').setValue('"alpha"');
  expect(wrapper.get(".overview-stat strong").text()).toBe("125");
  expect(wrapper.findAll(".overview-stat strong")[3]?.text()).toBe("3");
  await wrapper.get(".overview-bar-row").trigger("click");
  await flushPromises();
  expect(fetchMock.mock.calls.some(([path]) => String(path).includes("type=MEMORY&scope=WORKSPACE"))).toBe(true);
  expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("workspace=alpha");
  navigate("overview");
  await flushPromises();
  await wrapper.get(".overview-status-row").trigger("click");
  await flushPromises();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/task-loadouts?workspace=alpha&status=RUNNING&limit=20");
  navigate("overview");
  await flushPromises();
  expect(fetchMock.mock.calls.filter(([path]) => path === "/api/overview")).toHaveLength(3);
  await wrapper.get('select[aria-label="统计范围"]').setValue("all");
  await wrapper.get(".overview-stat").trigger("click");
  await flushPromises();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/assets?limit=20");
  navigate("overview");
  await flushPromises();
  await wrapper.findAll(".overview-stat")[2]!.trigger("click");
  await flushPromises();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/task-loadouts?limit=20");
});
it("shows an actionable error and can retry into the empty state", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("统计暂不可用");
  expect(wrapper.find(".overview-stat").exists()).toBe(false);
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { ...overview, scopes: [] } })));
  await wrapper.get('[role="alert"] button').trigger("click");
  await flushPromises();
  expect(wrapper.findAll(".overview-stat strong").map(item => item.text())).toEqual(["0", "0", "0", "0"]);
  expect(wrapper.text()).toContain("暂无资产与任务");
});
