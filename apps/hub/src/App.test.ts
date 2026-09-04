import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import type { AssetDetail, AssetLibraryItem, InboxResult } from "./api/types";

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
  rawMarkdown: "---\ntitle: Current Asset\n---\n# Raw source\n<script>not rendered here</script>",
  recentLoadouts: [{
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
  }],
  renderedMarkdown: "<h1>Rendered source</h1><p>Server HTML</p>",
  usageSummary: { readCount: 2, recallCount: 3, taskCount: 4, usedTaskCount: 1 },
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
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
  it("switches among the four read-only Hub views without a router", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/task-loadouts?limit=20") {
        return jsonResponse({ ok: true, data: { items: [] } });
      }
      if (path === "/api/usages?limit=20") {
        return jsonResponse({ ok: true, data: { items: [] } });
      }
      if (path === "/api/system/status") {
        return jsonResponse({ ok: true, data: {
          diagnostics: [],
          index: { catalogCount: 0, ftsCount: 0, indexState: "READY", lastSuccessfulScanAt: null, rebuildRequired: false, watcherState: "RUNNING" },
          mcpEndpoint: { path: "/mcp", ready: true },
          repository: { assetRepositoryPath: "/tmp/assets", formalAssetCount: 0, inboxAssetCount: 0 },
          service: { name: "codex-memory-os", readiness: "READY", uptimeSeconds: 1, version: "0.0.0" },
        } });
      }
      if (path === `/api/assets/${assetId}`) {
        return jsonResponse({ ok: true, data: { asset: assetDetail } });
      }
      return jsonResponse({ ok: true, data: { items: [assetItem] } });
    });
    const wrapper = await mountLoadedApp();
    const navigation = wrapper.get(".primary-navigation");
    expect(navigation.findAll("button").map((button) => button.text())).toEqual([
      "Assets",
      "Task Loadouts",
      "Usage",
      "System Status",
    ]);
    expect(buttonNamed(wrapper, "Assets").attributes("aria-current")).toBe("page");

    await buttonNamed(wrapper, "Task Loadouts").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("No Task Loadouts in this slice");
    await buttonNamed(wrapper, "Usage").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("No Usage in this slice");
    await buttonNamed(wrapper, "System Status").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Current process report");
    expect(buttonNamed(wrapper, "System Status").attributes("aria-current")).toBe("page");
  });

  it("loads the Library and selected detail, then switches rendered/raw/frontmatter content", async () => {
    const wrapper = await mountLoadedApp();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assets?limit=20");
    expect(wrapper.text()).toContain("Current Asset");
    expect(wrapper.find(".match-snippet").exists()).toBe(false);
    expect(wrapper.find(".markdown-body h1").text()).toBe("Rendered source");
    expect(wrapper.text()).toContain("Usage summary");
    expect(wrapper.text()).toContain("Task Loadouts");
    expect(wrapper.text()).toContain("DOCUMENT_MATCH");
    expect(wrapper.text()).toContain("Rcl 3 · Rd 2 · Used");

    await buttonNamed(wrapper, "Raw Markdown").trigger("click");
    expect(wrapper.find(".source-view").text()).toContain("<script>not rendered here</script>");
    expect(wrapper.find(".source-view script").exists()).toBe(false);
    await buttonNamed(wrapper, "Frontmatter").trigger("click");
    expect(wrapper.find(".source-view").text()).toContain(`\"id\": \"${assetId}\"`);

    expect(wrapper.text()).not.toMatch(/\b(Create|Edit|Delete|Move|Promote|Confirm)\b/u);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit | undefined)?.method === "GET")).toBe(true);
  });

  it("applies exact search filters and only displays match metadata after a query", async () => {
    const wrapper = await mountLoadedApp();
    await wrapper.get('input[type="search"]').setValue("needle");
    await buttonNamed(wrapper, "Exact").trigger("click");
    await wrapper.get(".exact-workspace input").setValue("alpha");
    const selects = wrapper.findAll(".filter-row select");
    await selects[0]?.setValue("DOCUMENT");
    await selects[1]?.setValue("WORKSPACE");
    await selects[2]?.setValue("100");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock.mock.calls.some(([input]) => String(input) ===
      "/api/assets?query=needle&workspace=alpha&type=DOCUMENT&scope=WORKSPACE&limit=100")).toBe(true);
    expect(wrapper.find(".match-snippet").text()).toContain("needle");
    expect(wrapper.find(".match-meta").text()).toBe("FTS · 9.25");
  });

  it("never sends an illegal Workspace/Scope combination from the controls", async () => {
    const wrapper = await mountLoadedApp();
    const scope = wrapper.findAll(".filter-row select")[1];
    await scope?.setValue("WORKSPACE");
    await buttonNamed(wrapper, "GLOBAL only").trigger("click");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const globalPath = String(fetchMock.mock.calls.at(-2)?.[0] ?? fetchMock.mock.calls.at(-1)?.[0]);
    expect(globalPath).toContain("workspace=null");
    expect(globalPath).not.toContain("scope=WORKSPACE");

    await scope?.setValue("GLOBAL");
    await buttonNamed(wrapper, "Exact").trigger("click");
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
    const newItem = { ...assetItem, assetId: "ast2034512345678901255", title: "Newest response" };
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("query=old")) {
        return oldResult.promise;
      }
      if (path.includes("query=new")) {
        return jsonResponse({ ok: true, data: { items: [newItem] } });
      }
      if (path.includes(newItem.assetId)) {
        return jsonResponse({ ok: true, data: { asset: { ...assetDetail, ...newItem } } });
      }
      if (path === `/api/assets/${assetId}`) {
        return jsonResponse({ ok: true, data: { asset: assetDetail } });
      }
      return jsonResponse({ ok: true, data: { items: [assetItem] } });
    });
    const wrapper = await mountLoadedApp();
    const search = wrapper.get('input[type="search"]');
    await search.setValue("old");
    await wrapper.get("form").trigger("submit");
    await search.setValue("new");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Newest response");

    oldResult.resolve(jsonResponse({ ok: true, data: { items: [{ ...assetItem, title: "Stale response" }] } }));
    await flushPromises();
    expect(wrapper.text()).toContain("Newest response");
    expect(wrapper.text()).not.toContain("Stale response");
  });

  it.each([
    [404, "ASSET_NOT_FOUND", "Asset no longer exists", "Refresh library"],
    [409, "ASSET_STALE", "Asset changed on disk", "Retry detail"],
    [503, "ASSET_INDEX_UNAVAILABLE", "Asset service is temporarily unavailable", "Retry detail"],
    [500, "INTERNAL_ERROR", "Local service could not complete the request", "Retry detail"],
  ])("shows safe, explicit detail error handling for HTTP %i", async (status, code, copy, action) => {
    fetchMock.mockImplementation(async (input) => String(input).startsWith("/api/assets/")
      ? jsonResponse({ ok: false, error: { code, message: "sensitive backend object", retryable: status === 409 || status === 503 } }, status)
      : jsonResponse({ ok: true, data: { items: [assetItem] } }));
    const wrapper = await mountLoadedApp();
    expect(wrapper.text()).toContain(copy);
    expect(buttonNamed(wrapper, action).exists()).toBe(true);
    expect(wrapper.text()).not.toContain("sensitive backend object");
  });

  it("shows explicit offline recovery when the initial request cannot reach the service", async () => {
    fetchMock.mockRejectedValue(new TypeError("private socket detail"));
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.text()).toContain("Local service is offline");
    expect(buttonNamed(wrapper, "Retry").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("private socket detail");
  });

  it("shows Inbox candidates, raw/frontmatter, and distinct Scanner diagnostics", async () => {
    const inbox: InboxResult = {
      items: [{
        ...assetItem,
        frontmatter: assetDetail.frontmatter,
        rawMarkdown: "---\ntitle: Inbox Candidate\n---\nCandidate source",
        relativePath: "inbox/workspaces/alpha/documents/candidate.md",
        title: "Inbox Candidate",
      }],
      diagnostics: [
        { assetId, code: "ID_CONFLICT", message: "Conflicts with formal Asset", relativePath: "inbox/conflict.md" },
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
    fetchMock.mockImplementation(async (input) => String(input) === "/api/inbox"
      ? jsonResponse({ ok: true, data: inbox })
      : String(input).startsWith("/api/assets/")
        ? jsonResponse({ ok: true, data: { asset: assetDetail } })
        : jsonResponse({ ok: true, data: { items: [assetItem] } }));
    const wrapper = await mountLoadedApp();
    await buttonNamed(wrapper, "Inbox").trigger("click");
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
    expect(wrapper.find(".source-view").text()).toContain("Candidate source");

    await wrapper.findAll(".diagnostic-card")[0]?.trigger("click");
    expect(wrapper.find(".diagnostic-document").text()).toContain("Conflicts with formal Asset");
    expect(wrapper.find(".diagnostic-document").text()).toContain(assetId);
    expect(wrapper.text()).not.toMatch(/\b(Delete|Move|Promote|Confirm)\b/u);
  });

  it("treats a missing Inbox as a normal empty state", async () => {
    const wrapper = await mountLoadedApp();
    await buttonNamed(wrapper, "Inbox").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Inbox is clear");
    expect(wrapper.text()).not.toContain("temporarily unavailable");
  });

  it("exposes keyboard-native controls and visible selection semantics", async () => {
    const wrapper = await mountLoadedApp();
    expect(wrapper.findAll("button").length).toBeGreaterThan(5);
    expect(wrapper.findAll("button").every((button) => button.attributes("type") === "button" || button.attributes("type") === "submit")).toBe(true);
    expect(wrapper.get(".asset-card").attributes("aria-current")).toBe("true");
    expect(wrapper.findAll('[role="tab"]').every((tab) => tab.element.tagName === "BUTTON")).toBe(true);
  });
});

async function mountLoadedApp(): Promise<VueWrapper> {
  const wrapper = mount(App);
  await flushPromises();
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
