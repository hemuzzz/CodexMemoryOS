import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App.vue";
import { navigate } from "../navigation.js";
import type { RecallProjection } from "../api/types.js";

enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());
const operation: RecallProjection = {
  recallId: "usg123", authorizedWorkspaces: ["alpha"], queries: ["业务字典", "DictConfig", "字典配置", "sys_dict", "<script>alert(1)</script>"],
  scenarios: [], policyHash: null, occurredAt: "2026-09-09T08:00:00.000Z", diagnostics: ["POLICY_MISSING"],
  budget: { maxAssets: 8, maxModelVisibleCharacters: 5000, modelVisibleCharacters: 1200, knowledgeContentCharacters: 120,
    metadataCharacters: 1080, deliveredAssets: 2, directBucketAssets: 0, queryBucketAssets: 2, omittedCount: 0, downgradedCount: 0 },
};
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  history.replaceState(null, "", "/#/recalls");
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => {
    const path = String(input);
    const data = path === "/api/recalls/usg123" ? { operation, items: [] }
      : path.startsWith("/api/recalls?") ? { items: [operation], total: 1 } : { items: [] };
    return new Response(JSON.stringify({ ok: true, data }));
  });
  vi.stubGlobal("fetch", fetchMock);
});

it("shows every expression in the list and detail, preserves navigation, and escapes expression text", async () => {
  const wrapper = mount(App); await flushPromises();
  expect(wrapper.get("h1").text()).toBe("召回记录");
  expect(wrapper.findAll("button.recall-expressions span").map(node => node.text())).toEqual(operation.queries);
  expect(wrapper.find("script").exists()).toBe(false);
  await wrapper.get("button.recall-expressions").trigger("click"); await flushPromises();
  expect(fetchMock.mock.calls.some(([path]) => path === "/api/recalls/usg123")).toBe(true);
  expect(wrapper.findAll("ul.recall-expressions li").map(node => node.text())).toEqual(operation.queries);
  expect(wrapper.text()).toContain("POLICY_MISSING");
  expect(wrapper.find("script").exists()).toBe(false);
  const back = wrapper.findAll("button").find(button => button.text() === "返回召回列表")!;
  await back.trigger("click"); await flushPromises();
  expect(wrapper.findAll("button.recall-expressions span")).toHaveLength(5);
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
});

it("renders a migrated single expression and the empty list without assuming multiple values", async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, data: { items: [{ ...operation, queries: ['["旧query"]'] }], total: 1 } })));
  const wrapper = mount(App); await flushPromises();
  expect(wrapper.get("button.recall-expressions").text()).toBe('["旧query"]');
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, data: { items: [], total: 0 } })));
  navigate("recalls", undefined, false, { offset: "50" }); await flushPromises();
  expect(wrapper.text()).toContain("暂无已记录召回");
  expect(wrapper.find("button.recall-expressions").exists()).toBe(false);
});
