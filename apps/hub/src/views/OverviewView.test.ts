import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App.vue";
import KnowledgeGraph from "../components/KnowledgeGraph.vue";
import type { OverviewDto } from "../api/types.js";

enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());
const overview: OverviewDto = {
  generatedAt: "2026-09-12T08:00:00.000Z", diagnosticCount: 0,
  facts: { recallOperations: 95, recallItems: 182, reads: 43, used: 19 },
  scopes: [
    { workspace: null, assets: { MEMORY: 0, DOCUMENT: 0, SKILL: 0 }, inboxCount: 0, items: [] },
    { workspace: "alpha", assets: { MEMORY: 12, DOCUMENT: 1, SKILL: 0 }, inboxCount: 1,
      items: [
        ...Array.from({ length: 12 }, (_, i) => ({ assetId: `ast${i + 100}`, title: `充值规则 ${i}`, type: "MEMORY" as const, pending: false })),
        { assetId: "ast200", title: "核心设计", type: "DOCUMENT", pending: false },
        { assetId: "ast201", title: "待审核方案", type: "MEMORY", pending: true },
      ] },
  ],
};
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  history.replaceState(null, "", "/");
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => new Response(JSON.stringify({ ok: true,
    data: String(input) === "/api/overview" ? overview : { items: [], diagnostics: [] } })));
  vi.stubGlobal("fetch", fetchMock);
});
it("shows real facts and four categories per scope, with titles instead of the old table", async () => {
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.get("h1").text()).toBe("总览");
  expect(wrapper.findAll(".overview-stat strong").map(n => n.text())).toEqual(["13", "1", "95 / 182", "43 / 19"]);
  expect(wrapper.findAll(".graph-node.category")).toHaveLength(8);
  expect(wrapper.findAll(".graph-node.category:disabled")).toHaveLength(5);
  expect(wrapper.find("table").exists()).toBe(false);
  await wrapper.get('[aria-label="核心设计"]').trigger("click");
  await flushPromises();
  expect(location.hash).toBe("#/library/ast200");
  expect(fetchMock.mock.calls.some(([path]) => path === "/api/assets/ast200")).toBe(true);
});
it("expands large branches in readable batches without dropping titles, and collapses workspaces", async () => {
  const wrapper = mount(KnowledgeGraph, { props: { scopes: overview.scopes } });
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(2);
  await wrapper.get('[aria-label="记忆 12 条"]').trigger("click");
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(10);
  await wrapper.get(".graph-node.more").trigger("click");
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(14);
  expect(wrapper.find(".graph-node.more").exists()).toBe(false);
  await wrapper.get('[aria-label="alpha"]').trigger("click");
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(0);
  expect(wrapper.findAll(".graph-node.category")).toHaveLength(4);
});
it("finds titles inside collapsed branches and keeps inbox navigation separate", async () => {
  const wrapper = mount(KnowledgeGraph, { props: { scopes: overview.scopes } });
  await wrapper.get("input").setValue("充值规则 11");
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(1);
  await wrapper.get(".graph-node.asset").trigger("click");
  expect(location.hash).toBe("#/library/ast111");
  await wrapper.get("input").setValue("待审核");
  await wrapper.get(".graph-node.asset").trigger("click");
  expect(location.hash).toBe("#/inbox/ast201");
  await wrapper.get("input").setValue("不存在的知识");
  expect(wrapper.get('[role="status"]').text()).toContain("没有匹配");
  await wrapper.get("input").setValue("");
  expect(wrapper.findAll(".graph-node.category")).toHaveLength(8);
});
it("supports zoom, fit, pan and expanding/collapsing categories", async () => {
  const wrapper = mount(KnowledgeGraph, { props: { scopes: overview.scopes } });
  await flushPromises();
  const before = wrapper.get(".graph-world").attributes("style");
  await wrapper.get('[aria-label="放大图谱"]').trigger("click");
  expect(wrapper.get(".graph-world").attributes("style")).not.toBe(before);
  await wrapper.get('[aria-label="适应画布"]').trigger("click");
  expect(wrapper.get(".graph-world").attributes("style")).toBe(before);
  await wrapper.get(".graph-viewport").trigger("keydown", { key: "ArrowLeft" });
  expect(wrapper.get(".graph-world").attributes("style")).not.toBe(before);
  await wrapper.get('[aria-label="收起全部分类"]').trigger("click");
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(0);
  await wrapper.get('[aria-label="展开全部分类"]').trigger("click");
  expect(wrapper.findAll(".graph-node.asset")).toHaveLength(10);
});
it("reports errors and retries, and handles an empty repository", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("本地 CodexMemoryOS 服务未响应");
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { ...overview, scopes: [overview.scopes[0]] } })));
  await wrapper.get('[role="alert"] button').trigger("click");
  await flushPromises();
  expect(wrapper.findAll(".overview-stat strong").slice(0, 2).map(n => n.text())).toEqual(["0", "0"]);
  expect(wrapper.findAll(".graph-node.category:disabled")).toHaveLength(4);
});
