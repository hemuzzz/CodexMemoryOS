import { describe, expect, it, vi } from "vitest";

import {
  buildAssetListPath,
  buildTaskLoadoutListPath,
  buildUsageListPath,
  HubApiClient,
  HubApiError,
} from "./client";

describe("HubApiClient", () => {
  it("builds only the frozen Asset query parameters and preserves Workspace semantics", () => {
    expect(buildAssetListPath({})).toBe("/api/assets");
    expect(buildAssetListPath({ workspace: null })).toBe("/api/assets?workspace=null");
    expect(buildAssetListPath({ workspace: "alpha" })).toBe("/api/assets?workspace=alpha");
    expect(buildAssetListPath({ scope: "GLOBAL" })).toBe("/api/assets?scope=GLOBAL");
    expect(buildAssetListPath({ scope: "WORKSPACE" })).toBe("/api/assets?scope=WORKSPACE");
    expect(buildAssetListPath({ scope: "WORKSPACE", workspace: "alpha" }))
      .toBe("/api/assets?workspace=alpha&scope=WORKSPACE");
    expect(buildAssetListPath({
      limit: 100,
      query: "exact phrase",
      scope: "WORKSPACE",
      type: "DOCUMENT",
      workspace: "alpha",
    })).toBe("/api/assets?query=exact+phrase&workspace=alpha&type=DOCUMENT&scope=WORKSPACE&limit=100");
  });

  it("omits empty values, writes each name once, and rejects illegal filter combinations", () => {
    expect(buildAssetListPath({ limit: 20, query: "", workspace: "" })).toBe("/api/assets?limit=20");
    expect(() => buildAssetListPath({ scope: "WORKSPACE", workspace: null })).toThrowError(HubApiError);
    expect(() => buildAssetListPath({ scope: "GLOBAL", workspace: "alpha" })).toThrowError(HubApiError);
    for (const limit of [20, 50, 100] as const) {
      const url = new URL(buildAssetListPath({ limit }), "http://local");
      expect(url.searchParams.get("limit")).toBe(String(limit));
      expect([...url.searchParams.keys()]).toEqual(["limit"]);
    }
  });

  it("builds only the frozen Task Loadout and Usage query parameters", () => {
    expect(buildTaskLoadoutListPath({})).toBe("/api/task-loadouts");
    expect(buildTaskLoadoutListPath({ workspace: null })).toBe("/api/task-loadouts?workspace=null");
    expect(buildTaskLoadoutListPath({ workspace: "alpha", status: "RUNNING", limit: 100 }))
      .toBe("/api/task-loadouts?workspace=alpha&status=RUNNING&limit=100");
    expect(buildTaskLoadoutListPath({ workspace: "", limit: 20 })).toBe("/api/task-loadouts?limit=20");

    expect(buildUsageListPath({})).toBe("/api/usages");
    expect(buildUsageListPath({ workspace: null })).toBe("/api/usages?workspace=null");
    expect(buildUsageListPath({
      taskId: "tsk1",
      assetId: "ast1",
      workspace: "alpha",
      limit: 50,
    })).toBe("/api/usages?taskId=tsk1&assetId=ast1&workspace=alpha&limit=50");
    expect(buildUsageListPath({ taskId: "", assetId: "", workspace: "" })).toBe("/api/usages");

    for (const limit of [20, 50, 100] as const) {
      expect(buildTaskLoadoutListPath({ limit })).toBe(`/api/task-loadouts?limit=${limit}`);
      expect(buildUsageListPath({ limit })).toBe(`/api/usages?limit=${limit}`);
    }

    for (const path of [
      buildTaskLoadoutListPath({ workspace: "alpha", status: "COMPLETED", limit: 20 }),
      buildUsageListPath({ taskId: "tsk1", assetId: "ast1", workspace: "alpha", limit: 20 }),
    ]) {
      const names = [...new URL(path, "http://local").searchParams.keys()];
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("uses relative GET requests and parses success and structured failure envelopes", async () => {
    const successFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, data: { items: [] } }));
    const successClient = new HubApiClient(successFetch);
    await expect(successClient.listAssets({ limit: 20 })).resolves.toEqual({ items: [] });
    expect(successFetch).toHaveBeenCalledWith("/api/assets?limit=20", expect.objectContaining({ method: "GET" }));

    const failureClient = new HubApiClient(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ok: false,
      error: { code: "ASSET_STALE", message: "stale", retryable: true },
    }, 409)));
    await expect(failureClient.getAsset("ast1")).rejects.toMatchObject({
      code: "ASSET_STALE",
      retryable: true,
      status: 409,
    });
  });

  it("uses relative GET for every N11 endpoint and forwards AbortSignal", async () => {
    const signal = new AbortController().signal;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse({ ok: true, data: { items: [] } })
    );
    const client = new HubApiClient(fetchImplementation);

    await client.listTaskLoadouts({ limit: 20 }, signal);
    await client.getTaskLoadout("tsk1", signal);
    await client.listUsages({ limit: 50 }, signal);
    await client.getSystemStatus(signal);

    expect(fetchImplementation.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/task-loadouts?limit=20",
      "/api/task-loadouts/tsk1",
      "/api/usages?limit=50",
      "/api/system/status",
    ]);
    expect(fetchImplementation.mock.calls.every(([, init]) =>
      init?.method === "GET" && init.signal === signal
    )).toBe(true);
  });

  it("maps non-JSON, malformed envelopes, and network failure to safe client errors", async () => {
    const unreadable = new HubApiClient(vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 502 })));
    await expect(unreadable.getInbox()).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });

    const malformed = new HubApiClient(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ internal: "hidden" })));
    await expect(malformed.getInbox()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const offline = new HubApiClient(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("private network detail")));
    await expect(offline.getInbox()).rejects.toMatchObject({
      code: "SERVICE_UNREACHABLE",
      message: "本地 CodexMemoryOS 服务未响应",
      status: 0,
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
