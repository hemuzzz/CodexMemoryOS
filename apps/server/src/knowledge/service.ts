import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import { AssetNotAccessibleError, AssetNotFoundError, type AssetSearchService } from "../asset/index.js";
import { compareRankedItems, normalizeAssetSearchQuery, type RankedSearchItem } from "../asset/search.js";
import type { WorkspaceCapabilityService } from "../workspace/capability.js";
import { applicableScenarios, loadPolicy } from "./policy.js";
import { KnowledgeError, recallInputSchema, readInputSchema, usedInputSchema, scenarioInputSchema,
  type RecallItem, type RecallResult, type Source } from "./model.js";
import type { KnowledgeRepository } from "./repository.js";

const characters = (text: string) => Array.from(text).length;
interface Candidate { item: RecallItem; rank?: RankedSearchItem; summary: string; upgrade: boolean }
export class KnowledgeService {
  readonly ids = new SnowflakeIdGenerator();
  constructor(readonly repository: KnowledgeRepository, readonly capabilities: WorkspaceCapabilityService,
    readonly search: AssetSearchService, readonly policyPath: string, readonly assertReady: () => void) {}
  async scenarios(input: unknown) {
    const parsed = scenarioInputSchema.safeParse(input);
    if (!parsed.success) throw new KnowledgeError("INPUT_INVALID");
    const scope = await this.capabilities.select(parsed.data.capabilityIds);
    const snapshot = await loadPolicy(this.policyPath, scope.config);
    const items = applicableScenarios(snapshot.policy, scope.authorizedWorkspaces).map(({ assets: _assets, ...scenario }) => scenario);
    return { items: items.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit), total: items.length,
      diagnostics: snapshot.diagnostics, nextOffset: parsed.data.offset + parsed.data.limit < items.length ? parsed.data.offset + parsed.data.limit : null };
  }
  async recall(input: unknown): Promise<RecallResult> {
    const parsed = recallInputSchema.safeParse(input);
    if (!parsed.success) throw new KnowledgeError("INPUT_INVALID");
    const { scenarios } = parsed.data;
    // Use the searcher's case/whitespace semantics for deduplication; retain the
    // first expression's spelling for the operation record and model response.
    const expressions = new Map<string, string>();
    for (const query of parsed.data.queries) {
      const key = normalizeAssetSearchQuery(query).phrase;
      if (!expressions.has(key)) expressions.set(key, query.split(/\s+/u).join(" "));
    }
    const queries = [...expressions.values()];
    const { authorizedWorkspaces, config } = await this.capabilities.select(parsed.data.capabilityIds);
    this.assertReady();
    const snapshot = await loadPolicy(this.policyPath, config);
    const available = applicableScenarios(snapshot.policy, authorizedWorkspaces);
    const active = available.filter((scenario) => scenarios.includes(scenario.id));
    const diagnostics = [...snapshot.diagnostics];
    if (scenarios.some((id) => !active.some((scenario) => scenario.id === id))) diagnostics.push("SCENARIO_SKIPPED");
    const context = { authorizedWorkspaces, workspaceConfigSnapshot: config };
    const ranks = new Map<string, RankedSearchItem>();
    for (const query of queries) {
      for (const rank of await this.search.rankedCandidates(context, query)) {
        const prior = ranks.get(rank.assetId);
        if (!prior || compareRankedItems(rank, prior) < 0) ranks.set(rank.assetId, rank);
      }
    }
    const reasons = new Map<string, string[]>();
    for (const assetId of ranks.keys()) reasons.set(assetId, ["QUERY_MATCH"]);
    for (const scenario of active) for (const relation of scenario.assets) {
      if (relation.mode === "ON_DEMAND" && !ranks.has(relation.assetId)) continue;
      const prior = reasons.get(relation.assetId) ?? [];
      prior.push(`SCENARIO_${relation.mode}(${scenario.id})`);
      reasons.set(relation.assetId, prior);
    }
    const candidates: Candidate[] = [];
    let invalid = 0;
    for (const [assetId, selectionReasons] of reasons) {
      try {
        const asset = await this.search.read({ assetId, context });
        const rank = ranks.get(assetId);
        // Sources must describe the same validated bytes; changed candidates are omitted.
        if (rank && rank.item.contentHash !== asset.contentHash) { invalid++; continue; }
        const { frontmatter } = asset;
        const direct = selectionReasons.some((reason) => reason.startsWith("SCENARIO_DIRECT("));
        const demand = selectionReasons.some((reason) => reason.startsWith("SCENARIO_ON_DEMAND("));
        const requestedMode = direct ? "DIRECT" : demand ? "ON_DEMAND" : undefined;
        const item: RecallItem = { recallItemId: this.ids.next("usg"), assetId, contentHash: asset.contentHash,
          assetScope: frontmatter.scope, assetWorkspace: frontmatter.scope === "WORKSPACE" ? frontmatter.workspace : null,
          title: frontmatter.title, type: frontmatter.type, selectionReasons: selectionReasons.sort(), bucket: direct ? "DIRECT" : "QUERY",
          ...(requestedMode ? { requestedMode } : {}), deliveredMode: "ON_DEMAND",
          deliveryReasons: direct && frontmatter.type !== "MEMORY" ? ["TYPE_DOWNGRADED"] : [], reference: "asset_read: recallItemId" };
        candidates.push({ item, ...(rank ? { rank } : {}), summary: frontmatter.summary,
          upgrade: frontmatter.type === "MEMORY" && (direct || (!demand && (rank?.item.score ?? 0) >= 300)) });
      } catch (error) {
        if (error instanceof AssetNotAccessibleError || error instanceof AssetNotFoundError) invalid++;
        else throw error;
      }
    }
    if (invalid) diagnostics.push("CANDIDATE_UNAVAILABLE");
    const compare = (a: Candidate, b: Candidate) => {
      if (a.item.bucket === "QUERY") {
        const boosted = (c: Candidate) => Number(c.item.selectionReasons.some((reason) => reason.startsWith("SCENARIO_ON_DEMAND(")));
        if (boosted(a) !== boosted(b)) return boosted(b) - boosted(a);
      }
      if (a.rank && b.rank) return compareRankedItems(a.rank, b.rank);
      if (a.rank || b.rank) return a.rank ? -1 : 1;
      return a.item.assetId < b.item.assetId ? -1 : a.item.assetId > b.item.assetId ? 1 : 0;
    };
    const buckets = { DIRECT: candidates.filter((c) => c.item.bucket === "DIRECT").sort(compare), QUERY: candidates.filter((c) => c.item.bucket === "QUERY").sort(compare) };
    const result: RecallResult = { usageRecorded: true, recallId: this.ids.next("usg"), authorizedWorkspaces, queries,
      scenarios: active.map((s) => s.id), ...(snapshot.hash ? { policyHash: snapshot.hash } : {}), occurredAt: new Date().toISOString(),
      items: [], diagnostics, budget: { maxAssets: 8, maxModelVisibleCharacters: 5000, modelVisibleCharacters: 0,
        knowledgeContentCharacters: 0, metadataCharacters: 0, deliveredAssets: 0, directBucketAssets: 0, queryBucketAssets: 0,
        omittedCount: candidates.length + invalid, downgradedCount: 0 } };
    // Reserve diagnostic overhead before choosing references, including both write outcomes.
    const reserved = ["ASSET_LIMIT", "CHARACTER_LIMIT", "BUDGET_DOWNGRADED"];
    result.diagnostics.push(...reserved);
    const selected: Candidate[] = [];
    const take = (bucket: "DIRECT" | "QUERY") => {
      while (buckets[bucket].length) {
        const candidate = buckets[bucket].shift()!;
        result.items.push(candidate.item);
        result.budget.omittedCount--;
        if (fits(result)) { selected.push(candidate); return true; }
        result.items.pop(); result.budget.omittedCount++;
      }
      return false;
    };
    // Query first; same-bucket alternatives are exhausted before unused slots flow back.
    for (let index = 0; index < 4; index++) { take("QUERY"); take("DIRECT"); }
    while (result.items.length < 8) {
      if (!take("QUERY") && !take("DIRECT")) break;
    }
    const q = selected.filter((c) => c.item.bucket === "QUERY");
    const d = selected.filter((c) => c.item.bucket === "DIRECT");
    const ordered: Candidate[] = [];
    while (q.length || d.length) { if (q.length) ordered.push(q.shift()!); if (d.length) ordered.push(d.shift()!); }
    result.items = ordered.map((c) => c.item);
    for (const candidate of ordered) {
      if (!candidate.upgrade) continue;
      candidate.item.summary = candidate.summary;
      candidate.item.deliveredMode = "DIRECT";
      if (!fits(result)) {
        delete candidate.item.summary; candidate.item.deliveredMode = "ON_DEMAND";
        candidate.item.deliveryReasons.push("BUDGET_DOWNGRADED");
      }
    }
    result.diagnostics = result.diagnostics.filter((code) => !reserved.includes(code));
    if (candidates.length > 8) result.diagnostics.push("ASSET_LIMIT");
    if (result.items.length < Math.min(8, candidates.length)) result.diagnostics.push("CHARACTER_LIMIT");
    if (result.items.some((i) => i.deliveryReasons.includes("BUDGET_DOWNGRADED"))) result.diagnostics.push("BUDGET_DOWNGRADED");
    if (!fits(result)) throw new KnowledgeError("RESPONSE_BUDGET_EXCEEDED");
    measure(result);
    try { this.repository.recordRecall(result); }
    catch (error) {
      if (!(error instanceof KnowledgeError) || error.code !== "USAGE_WRITE_FAILED") throw error;
      return degraded(result);
    }
    return result;
  }
  async read(input: unknown) {
    const parsed = readInputSchema.safeParse(input);
    if (!parsed.success) throw new KnowledgeError("INPUT_INVALID");
    const { authorizedWorkspaces, config } = await this.capabilities.select(parsed.data.capabilityIds);
    this.assertReady();
    const source = "recallItemId" in parsed.data ? this.repository.item(parsed.data.recallItemId) : undefined;
    if ("recallItemId" in parsed.data && !source) throw new KnowledgeError("SOURCE_NOT_FOUND");
    if (source) assertScope(source, authorizedWorkspaces);
    const assetId = source?.assetId ?? ("assetId" in parsed.data ? parsed.data.assetId : "");
    const asset = await this.search.read({ assetId, context: { authorizedWorkspaces, workspaceConfigSnapshot: config } });
    const expected = source?.contentHash ?? ("expectedContentHash" in parsed.data ? parsed.data.expectedContentHash : undefined);
    if (expected && asset.contentHash !== expected) throw new KnowledgeError("CONTENT_CHANGED");
    if (Buffer.byteLength(asset.markdown, "utf8") > 256_000) throw new KnowledgeError("READ_SIZE_EXCEEDED");
    const fact = { readRef: this.ids.next("usg"), authorizedWorkspaces, assetId, contentHash: asset.contentHash,
      assetScope: asset.frontmatter.scope, assetWorkspace: asset.frontmatter.scope === "WORKSPACE" ? asset.frontmatter.workspace : null,
      recallItemId: source?.recallItemId ?? null, occurredAt: new Date().toISOString() };
    const response = { ...fact, markdown: asset.markdown, usageRecorded: true, readRef: fact.readRef as string | null, diagnostics: [] as string[] };
    // Single-target response deliberately omits the parent operation and its scopes/query.
    try { this.repository.recordRead(fact); }
    catch (error) {
      if (!(error instanceof KnowledgeError) || error.code !== "USAGE_WRITE_FAILED") throw error;
      response.usageRecorded = false; response.readRef = null; response.diagnostics.push("USAGE_WRITE_FAILED");
    }
    return response;
  }
  async used(input: unknown) {
    const parsed = usedInputSchema.safeParse(input);
    if (!parsed.success) throw new KnowledgeError("INPUT_INVALID");
    const { authorizedWorkspaces, config } = await this.capabilities.select(parsed.data.capabilityIds);
    this.assertReady();
    const source = "recallItemId" in parsed.data ? this.repository.item(parsed.data.recallItemId) : this.repository.readFact(parsed.data.readRef);
    if (!source) throw new KnowledgeError("SOURCE_NOT_FOUND");
    assertScope(source, authorizedWorkspaces);
    await this.search.read({ assetId: source.assetId, context: { authorizedWorkspaces, workspaceConfigSnapshot: config } });
    const recallItemId = source.recallItemId;
    return this.repository.recordUsed({ usedId: this.ids.next("usg"), authorizedWorkspaces, assetId: source.assetId,
      recallItemId, directReadRef: recallItemId ? null : ("readRef" in parsed.data ? parsed.data.readRef : null), occurredAt: new Date().toISOString() });
  }
}
function assertScope(source: Source, workspaces: string[]): void {
  if (source.assetScope !== "GLOBAL" && (!source.assetWorkspace || !workspaces.includes(source.assetWorkspace))) throw new KnowledgeError("ASSET_NOT_ACCESSIBLE");
}
function measure(result: RecallResult): number {
  const b = result.budget;
  b.deliveredAssets = result.items.length;
  b.directBucketAssets = result.items.filter((item) => item.bucket === "DIRECT").length;
  b.queryBucketAssets = result.items.length - b.directBucketAssets;
  b.downgradedCount = result.items.filter((item) => item.deliveryReasons.length > 0).length;
  b.knowledgeContentCharacters = result.items.reduce((sum, item) => sum + characters(JSON.stringify(item.title)) - 2 + (item.summary === undefined ? 0 : characters(JSON.stringify(item.summary)) - 2), 0);
  for (let iteration = 0; iteration < 10; iteration++) {
    const total = characters(JSON.stringify(result));
    if (total === b.modelVisibleCharacters && b.metadataCharacters === total - b.knowledgeContentCharacters) return total;
    b.modelVisibleCharacters = total; b.metadataCharacters = total - b.knowledgeContentCharacters;
  }
  return characters(JSON.stringify(result));
}
function degraded(result: RecallResult): RecallResult {
  const response = structuredClone(result);
  response.usageRecorded = false; response.recallId = null;
  response.items.forEach((item) => { item.recallItemId = null; item.reference = "asset_read: assetId + expectedContentHash=contentHash"; });
  response.diagnostics.push("USAGE_WRITE_FAILED");
  measure(response);
  return response;
}
function fits(result: RecallResult): boolean {
  // Also reserve one per-item downgrade reason, before attempting upgrades.
  const reservation = structuredClone(result);
  reservation.items.forEach((item) => { if (!item.deliveryReasons.includes("BUDGET_DOWNGRADED")) item.deliveryReasons.push("BUDGET_DOWNGRADED"); });
  return measure(reservation) <= 5000 && measure(degraded(reservation)) <= 5000;
}
