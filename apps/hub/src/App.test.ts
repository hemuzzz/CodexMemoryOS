import {
  enableAutoUnmount,
  flushPromises,
  mount,
  type DOMWrapper,
  type VueWrapper,
} from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import { navigate } from "./navigation.js";
import type {
  AssetDetail,
  AssetLibraryItem,
  InboxResult,
} from "./api/types.js";

const assetId = "ast2034512345678901248";
const assetItem: AssetLibraryItem = {
  assetId,
  contentHash: "a".repeat(64),
  matchedSnippet: "needle in current Markdown",
  modifiedAt: "2026-09-04T08:30:00.000Z",
  relativePath: "assets/workspaces/alpha/documents/asset.md",
  scope: "WORKSPACE",
  score: 9.25,
  searchStrategy: "FTS",
  summary: "A precise Asset summary",
  title: "Current Asset",
  type: "DOCUMENT",
  workspace: "alpha",
};
const assetDetail: AssetDetail = {
  ...assetItem,
  frontmatter: {
    id: assetId,
    scope: "WORKSPACE",
    summary: assetItem.summary,
    title: assetItem.title,
    type: "DOCUMENT",
    workspace: "alpha",
  },
  rawMarkdown:
    "---\ntitle: Current Asset\n---\n# Raw source\n<script>not rendered here</script>",
  recentLoadouts: [
    {
      mode: "ON_DEMAND",
      readCount: 2,
      reason: "DOCUMENT_MATCH",
      recallCount: 3,
      requestSummary: "Review the current knowledge contract",
      status: "RUNNING",
      taskId: "tsk2034512345678901249",
      updatedAt: "2026-09-04T09:00:00.000Z",
      usedFlag: true,
      workspace: "alpha",
    },
  ],
  renderedMarkdown: "<h1>Rendered source</h1><p>Server HTML</p>",
  usageSummary: {
    readCount: 2,
    recallCount: 3,
    taskCount: 4,
    usedTaskCount: 1,
  },
};

enableAutoUnmount(afterEach);

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  history.replaceState(null, "", "/#/library");
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = String(input);
    if (path === `/api/assets/${assetId}`) {
      return jsonResponse({ ok: true, data: { asset: assetDetail } });
    }
    if (path === "/api/inbox") {
      return jsonResponse({ ok: true, data: { items: [], diagnostics: [] } });
    }
    return jsonResponse({ ok: true, data: { items: [assetItem] } });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Asset Desk", () => {
  it("keeps the list idle until opened, expands without rereading, and restores row focus on close", async () => {
    const wrapper = await mountLoadedApp();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find("dialog").exists()).toBe(false);
    const row = wrapper.get<HTMLButtonElement>(".asset-row");
    row.element.focus();
    await openAsset(wrapper);
    expect(location.hash).toBe(`#/library/${assetId}`);
    expect(wrapper.get<HTMLDialogElement>("dialog").element.open).toBe(true);
    await buttonNamed(wrapper, "展开阅读").trigger("click");
    await flushPromises();
    expect(location.hash).toBe(`#/library/${assetId}/read`);
    expect(wrapper.get("dialog").classes()).toContain("full-detail");
    expect(
      fetchMock.mock.calls.filter(
        ([path]) => String(path) === `/api/assets/${assetId}`,
      ),
    ).toHaveLength(1);
    await wrapper.get("dialog").trigger("cancel");
    await flushPromises();
    expect(location.hash).toBe("#/library");
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect(document.activeElement).toBe(row.element);
  });

  it("hydrates a detail link and responds to browser history navigation", async () => {
    history.replaceState(null, "", `#/library/${assetId}/read`);
    const wrapper = await mountLoadedApp();
    expect(wrapper.get("dialog").classes()).toContain("full-detail");
    expect(wrapper.get(".markdown-body h1").text()).toBe("Rendered source");
    history.replaceState(null, "", "#/library");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flushPromises();
    expect(wrapper.find("dialog").exists()).toBe(false);
    history.replaceState(null, "", `#/library/${assetId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flushPromises();
    expect(wrapper.get<HTMLDialogElement>("dialog").element.open).toBe(true);
  });

  it("aborts a pending preview on close and ignores its late response", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === `/api/assets/${assetId}`) {
        signal = init?.signal ?? undefined;
        return pending.promise;
      }
      return jsonResponse({ ok: true, data: { items: [assetItem] } });
    });
    const wrapper = await mountLoadedApp();
    await openAsset(wrapper);
    await buttonNamed(wrapper, "展开阅读").trigger("click");
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await buttonNamed(wrapper, "关闭详情").trigger("click");
    await flushPromises();
    expect(signal?.aborted).toBe(true);
    pending.resolve(jsonResponse({ ok: true, data: { asset: assetDetail } }));
    await flushPromises();
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Rendered source");
  });

  it("loads inbox once on a deep link and keeps the skip link out of routing", async () => {
    history.replaceState(null, "", "#/inbox/missing");
    const wrapper = await mountLoadedApp();
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/inbox"),
    ).toHaveLength(1);
    expect(wrapper.text()).toContain("候选已不存在");
    await buttonNamed(wrapper, "关闭详情").trigger("click");
    await flushPromises();
    await wrapper.get(".skip-link").trigger("click");
    expect(location.hash).toBe("#/inbox");
    expect(document.activeElement?.id).toBe("main-content");
  });

  it("does not leak a search query into the library after visiting another page", async () => {
    const wrapper = await mountLoadedApp();
    navigate("search");
    await flushPromises();
    await wrapper.get('input[type="search"]').setValue("needle");
    await wrapper.get(".search-bar").trigger("submit");
    await flushPromises();
    navigate("inbox");
    await flushPromises();
    navigate("library");
    await flushPromises();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/assets?limit=20");
  });

  it("loads the library when entering from an initial inbox route", async () => {
    history.replaceState(null, "", "#/inbox");
    const wrapper = await mountLoadedApp();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    navigate("library");
    await flushPromises();
    expect(wrapper.findAll(".asset-row")).toHaveLength(1);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/assets?limit=20");
  });

  it("switches among the six read-only Hub views through the shared navigation", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/task-loadouts?limit=20") {
        return jsonResponse({ ok: true, data: { items: [] } });
      }
      if (path === "/api/usages?limit=20") {
        return jsonResponse({ ok: true, data: { items: [] } });
      }
      if (path === "/api/system/status") {
        return jsonResponse({
          ok: true,
          data: {
            diagnostics: [],
            index: {
              catalogCount: 0,
              ftsCount: 0,
              indexState: "READY",
              lastSuccessfulScanAt: null,
              rebuildRequired: false,
              watcherState: "RUNNING",
            },
            mcpEndpoint: { path: "/mcp", ready: true },
            repository: {
              assetRepositoryPath: "/tmp/assets",
              formalAssetCount: 0,
              inboxAssetCount: 0,
            },
            service: {
              name: "codex-memory-os",
              readiness: "READY",
              uptimeSeconds: 1,
              version: "0.0.0",
            },
          },
        });
      }
      if (path === `/api/assets/${assetId}`) {
        return jsonResponse({ ok: true, data: { asset: assetDetail } });
      }
      return jsonResponse({ ok: true, data: { items: [assetItem] } });
    });
    const wrapper = await mountLoadedApp();
    const navigation = wrapper.get(".primary-navigation");
    expect(navigation.findAll("button").map((button) => button.text())).toEqual(
      ["总览", "知识资产", "收件箱", "任务", "使用记录", "系统状态"],
    );
    expect(buttonNamed(wrapper, "知识资产").attributes("aria-current")).toBe(
      "page",
    );

    await buttonNamed(wrapper, "任务").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("暂无任务");
    await buttonNamed(wrapper, "使用记录").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("暂无使用记录");
    await buttonNamed(wrapper, "系统状态").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("当前运行状态");
    expect(buttonNamed(wrapper, "系统状态").attributes("aria-current")).toBe(
      "page",
    );
  });

  it("opens detail on demand and switches rendered/raw/frontmatter content", async () => {
    const wrapper = await mountLoadedApp();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assets?limit=20");
    expect(wrapper.text()).toContain("Current Asset");
    expect(wrapper.find(".match-snippet").exists()).toBe(false);
    await openAsset(wrapper);
    expect(wrapper.find(".markdown-body h1").text()).toBe("Rendered source");
    expect(wrapper.text()).toContain("使用统计");
    expect(wrapper.text()).toContain("任务与装载");
    expect(wrapper.text()).toContain("DOCUMENT_MATCH");
    expect(wrapper.text()).toContain("召回 3 · 读取 2 · 已使用");

    await buttonNamed(wrapper, "Markdown 源文").trigger("click");
    expect(wrapper.find(".source-view").text()).toContain(
      "<script>not rendered here</script>",
    );
    expect(wrapper.find(".source-view script").exists()).toBe(false);
    await buttonNamed(wrapper, "元信息").trigger("click");
    expect(wrapper.find(".source-view").text()).toContain(
      `\"id\": \"${assetId}\"`,
    );

    expect(wrapper.text()).not.toMatch(
      /\b(Create|Edit|Delete|Move|Promote|Confirm)\b|新增资产|编辑资产|删除资产|确认入库/u,
    );
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => (init as RequestInit | undefined)?.method === "GET",
      ),
    ).toBe(true);
  });

  it("applies exact search filters and only displays match metadata after a query", async () => {
    const wrapper = await mountLoadedApp();
    navigate("search");
    await flushPromises();
    await wrapper.get('input[type="search"]').setValue("needle");
    await buttonNamed(wrapper, "指定工作区").trigger("click");
    await wrapper.get(".exact-workspace input").setValue("alpha");
    await option(wrapper, "类型", "文档");
    await option(wrapper, "范围", "工作区");
    await option(wrapper, "显示条数", "100 条");
    await wrapper.get(".search-bar").trigger("submit");
    await flushPromises();

    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input) ===
          "/api/assets?query=needle&workspace=alpha&type=DOCUMENT&scope=WORKSPACE&limit=100",
      ),
    ).toBe(true);
    expect(wrapper.find(".match-snippet").text()).toContain("needle");
    expect(wrapper.find(".match-meta").text()).toBe("FTS · 9.25");
  });

  it("never sends an illegal Workspace/Scope combination from the controls", async () => {
    const wrapper = await mountLoadedApp();
    await option(wrapper, "范围", "工作区");
    await buttonNamed(wrapper, "仅全局").trigger("click");
    await flushPromises();
    const globalPath = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(globalPath).toContain("workspace=null");
    expect(globalPath).not.toContain("scope=WORKSPACE");

    await option(wrapper, "范围", "全局知识");
    await buttonNamed(wrapper, "指定工作区").trigger("click");
    await wrapper.get(".exact-workspace input").setValue("alpha");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const namedRequest = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((path) => path.startsWith("/api/assets?"))
      .at(-1);
    expect(namedRequest).toContain("workspace=alpha");
    expect(namedRequest).not.toContain("scope=GLOBAL");
  });

  it("does not let an older search response overwrite a newer result", async () => {
    const oldResult = deferred<Response>();
    const newItem = {
      ...assetItem,
      assetId: "ast2034512345678901255",
      title: "Newest response",
    };
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("query=old")) {
        return oldResult.promise;
      }
      if (path.includes("query=new")) {
        return jsonResponse({ ok: true, data: { items: [newItem] } });
      }
      if (path.includes(newItem.assetId)) {
        return jsonResponse({
          ok: true,
          data: { asset: { ...assetDetail, ...newItem } },
        });
      }
      if (path === `/api/assets/${assetId}`) {
        return jsonResponse({ ok: true, data: { asset: assetDetail } });
      }
      return jsonResponse({ ok: true, data: { items: [assetItem] } });
    });
    const wrapper = await mountLoadedApp();
    navigate("search");
    await flushPromises();
    const search = wrapper.get('input[type="search"]');
    await search.setValue("old");
    await wrapper.get("form").trigger("submit");
    await search.setValue("new");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Newest response");

    oldResult.resolve(
      jsonResponse({
        ok: true,
        data: { items: [{ ...assetItem, title: "Stale response" }] },
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain("Newest response");
    expect(wrapper.text()).not.toContain("Stale response");
  });

  it.each([
    [404, "ASSET_NOT_FOUND", "知识资产已不存在", "刷新资产列表"],
    [409, "ASSET_STALE", "知识文件已更新", "重新加载"],
    [503, "ASSET_INDEX_UNAVAILABLE", "知识服务暂时不可用", "重新加载"],
    [500, "INTERNAL_ERROR", "本地服务未能完成请求", "重新加载"],
  ])(
    "shows safe, explicit detail error handling for HTTP %i",
    async (status, code, copy, action) => {
      fetchMock.mockImplementation(async (input) =>
        String(input).startsWith("/api/assets/")
          ? jsonResponse(
              {
                ok: false,
                error: {
                  code,
                  message: "sensitive backend object",
                  retryable: status === 409 || status === 503,
                },
              },
              status,
            )
          : jsonResponse({ ok: true, data: { items: [assetItem] } }),
      );
      const wrapper = await mountLoadedApp();
      await openAsset(wrapper);
      expect(wrapper.text()).toContain(copy);
      expect(buttonNamed(wrapper, action).exists()).toBe(true);
      expect(wrapper.text()).not.toContain("sensitive backend object");
    },
  );

  it("shows explicit offline recovery when the initial request cannot reach the service", async () => {
    fetchMock.mockRejectedValue(new TypeError("private socket detail"));
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).toContain("本地服务未连接");
    expect(buttonNamed(wrapper, "重试").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("private socket detail");
  });

  it("shows Inbox candidates, raw/frontmatter, and distinct Scanner diagnostics", async () => {
    const inbox: InboxResult = {
      items: [
        {
          ...assetItem,
          frontmatter: assetDetail.frontmatter,
          rawMarkdown: "---\ntitle: Inbox Candidate\n---\nCandidate source",
          relativePath: "inbox/workspaces/alpha/documents/candidate.md",
          title: "Inbox Candidate",
        },
      ],
      diagnostics: [
        {
          assetId,
          code: "ID_CONFLICT",
          message: "Conflicts with formal Asset",
          relativePath: "inbox/conflict.md",
        },
        ...[
          "DUPLICATE_ASSET_ID",
          "INVALID_FRONTMATTER",
          "UNKNOWN_WORKSPACE",
          "PATH_TYPE_MISMATCH",
          "PATH_SCOPE_MISMATCH",
          "PATH_WORKSPACE_MISMATCH",
          "NON_MARKDOWN_FILE",
          "DIRECTORY_ASSET",
          "SYMLINK",
          "OTHER_SCANNER_DIAGNOSTIC",
        ].map((code, index) => ({
          code,
          message: `${code} message`,
          relativePath: `inbox/diagnostic-${index}.md`,
        })),
      ],
    };
    fetchMock.mockImplementation(async (input) =>
      String(input) === "/api/inbox"
        ? jsonResponse({ ok: true, data: inbox })
        : String(input).startsWith("/api/assets/")
          ? jsonResponse({ ok: true, data: { asset: assetDetail } })
          : jsonResponse({ ok: true, data: { items: [assetItem] } }),
    );
    const wrapper = await mountLoadedApp();
    await buttonNamed(wrapper, "收件箱").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Inbox Candidate");
    for (const code of [
      "ID_CONFLICT",
      "DUPLICATE_ASSET_ID",
      "INVALID_FRONTMATTER",
      "UNKNOWN_WORKSPACE",
      "PATH_TYPE_MISMATCH",
      "PATH_SCOPE_MISMATCH",
      "PATH_WORKSPACE_MISMATCH",
      "NON_MARKDOWN_FILE",
      "DIRECTORY_ASSET",
      "SYMLINK",
      "OTHER_SCANNER_DIAGNOSTIC",
    ]) {
      expect(wrapper.text()).toContain(code);
    }
    await wrapper.get(".asset-row").trigger("click");
    await flushPromises();
    expect(wrapper.find(".source-view").text()).toContain("Candidate source");
    await buttonNamed(wrapper, "关闭详情").trigger("click");
    await flushPromises();

    await wrapper.findAll(".diagnostic-row")[0]?.trigger("click");
    expect(wrapper.find(".diagnostic-document").text()).toContain(
      "Conflicts with formal Asset",
    );
    expect(wrapper.find(".diagnostic-document").text()).toContain(assetId);
    expect(wrapper.text()).not.toMatch(/\b(Delete|Move|Promote|Confirm)\b/u);
  });

  it("treats a missing Inbox as a normal empty state", async () => {
    const wrapper = await mountLoadedApp();
    await buttonNamed(wrapper, "收件箱").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("收件箱已清空");
    expect(wrapper.text()).not.toContain("temporarily unavailable");
  });

  it("returns from Inbox to search with the keyboard shortcut", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await buttonNamed(wrapper, "收件箱").trigger("click");
    await flushPromises();
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        cancelable: true,
      }),
    );
    await flushPromises();
    expect(document.activeElement).toBe(
      wrapper.get('input[type="search"]').element,
    );
    expect(buttonNamed(wrapper, "搜索知识").attributes("aria-current")).toBe(
      "page",
    );
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });

  it("switches content tabs using arrows and connects the active panel", async () => {
    const wrapper = await mountLoadedApp();
    await openAsset(wrapper);
    await wrapper
      .get("#asset-tab-RENDERED")
      .trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get("#asset-tab-RAW").attributes("aria-selected")).toBe(
      "true",
    );
    expect(wrapper.get("#asset-panel").attributes("aria-labelledby")).toBe(
      "asset-tab-RAW",
    );
    expect(wrapper.get("#asset-panel").text()).toContain("# Raw source");
    await wrapper.get("#asset-tab-RAW").trigger("keydown", { key: "End" });
    expect(wrapper.get("#asset-tab-FRONTMATTER").attributes("tabindex")).toBe(
      "0",
    );
    await wrapper
      .get("#asset-tab-FRONTMATTER")
      .trigger("keydown", { key: "Home" });
    expect(wrapper.find(".markdown-body h1").text()).toBe("Rendered source");
  });

  it("persists the chosen appearance and can return to system appearance", async () => {
    const wrapper = await mountLoadedApp();
    await wrapper.get('select[aria-label="外观主题"]').setValue("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("hub-theme")).toBe("dark");
    wrapper.unmount();
    const restored = await mountLoadedApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await restored.get('select[aria-label="外观主题"]').setValue("system");
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  it("exposes keyboard-native controls and visible selection semantics", async () => {
    const wrapper = await mountLoadedApp();
    expect(wrapper.findAll("button").length).toBeGreaterThan(5);
    expect(
      wrapper
        .findAll("button")
        .every(
          (button) =>
            button.attributes("type") === "button" ||
            button.attributes("type") === "submit",
        ),
    ).toBe(true);
    expect(
      wrapper.get(".asset-row").attributes("aria-current"),
    ).toBeUndefined();
    expect(wrapper.find("dialog").exists()).toBe(false);
    await openAsset(wrapper);
    expect(
      wrapper
        .findAll('[role="tab"]')
        .every((tab) => tab.element.tagName === "BUTTON"),
    ).toBe(true);
  });
});

async function mountLoadedApp(): Promise<VueWrapper> {
  const wrapper = mount(App, { attachTo: document.body });
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

async function openAsset(wrapper: VueWrapper) {
  await wrapper.get(".asset-row").trigger("click");
  await flushPromises();
}
async function option(wrapper: VueWrapper, group: string, label: string) {
  const button = wrapper
    .get(`.filter-options[aria-label="${group}"]`)
    .findAll("button")
    .find((b) => b.text().replace(/✓/g, "").trim() === label);
  if (!button) throw new Error(`Missing option ${label}`);
  await button.trigger("click");
}
