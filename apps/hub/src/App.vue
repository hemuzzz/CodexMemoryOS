<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "./api/client";
import type {
  AssetDetail,
  AssetLibraryItem,
  AssetListFilters,
  AssetScope,
  AssetType,
  InboxDiagnostic,
  InboxItem,
} from "./api/types";
import SystemStatusView from "./views/SystemStatusView.vue";
import TaskLoadoutsView from "./views/TaskLoadoutsView.vue";
import UsageView from "./views/UsageView.vue";

type ActiveView = "LIBRARY" | "INBOX";
type PrimaryView = "ASSETS" | "TASK_LOADOUTS" | "USAGE" | "SYSTEM_STATUS";
type DetailTab = "RENDERED" | "RAW" | "FRONTMATTER";
type InboxDetailTab = "RAW" | "FRONTMATTER";
type WorkspaceMode = "ALL" | "GLOBAL" | "NAMED";
type ViewContext = "ASSET_LIST" | "ASSET_DETAIL" | "INBOX";

interface PresentedError {
  detail: string;
  title: string;
}

const api = new HubApiClient();
const primaryView = ref<PrimaryView>("ASSETS");
const activeView = ref<ActiveView>("LIBRARY");

const filters = reactive({
  limit: 20 as 20 | 50 | 100,
  query: "",
  scope: "" as "" | AssetScope,
  type: "" as "" | AssetType,
  workspace: "",
});
const workspaceMode = ref<WorkspaceMode>("ALL");
const appliedQuery = ref("");
const filterError = ref("");

const assets = ref<AssetLibraryItem[]>([]);
const assetsLoading = ref(false);
const assetsError = ref<HubApiError>();
const selectedAssetId = ref<string>();
const assetDetail = ref<AssetDetail>();
const detailLoading = ref(false);
const detailError = ref<HubApiError>();
const detailTab = ref<DetailTab>("RENDERED");

const inboxItems = ref<InboxItem[]>([]);
const inboxDiagnostics = ref<InboxDiagnostic[]>([]);
const inboxLoading = ref(false);
const inboxError = ref<HubApiError>();
const selectedInboxItem = ref<InboxItem>();
const selectedInboxDiagnostic = ref<InboxDiagnostic>();
const inboxDetailTab = ref<InboxDetailTab>("RAW");

let assetListRequest = 0;
let assetDetailRequest = 0;
let inboxRequest = 0;
let assetListController: AbortController | undefined;
let assetDetailController: AbortController | undefined;
let inboxController: AbortController | undefined;

const workspaceSuggestions = computed(() =>
  [...new Set(assets.value.flatMap((asset) => asset.workspace === null ? [] : [asset.workspace]))]
    .sort((left, right) => left.localeCompare(right)),
);
const listErrorCopy = computed(() => presentError(assetsError.value, "ASSET_LIST"));
const detailErrorCopy = computed(() => presentError(detailError.value, "ASSET_DETAIL"));
const inboxErrorCopy = computed(() => presentError(inboxError.value, "INBOX"));

onMounted(() => void loadAssets({ limit: 20 }));
onBeforeUnmount(() => {
  assetListController?.abort();
  assetDetailController?.abort();
  inboxController?.abort();
});

function setActiveView(view: ActiveView): void {
  activeView.value = view;
  if (view === "INBOX") {
    void loadInbox();
  }
}

function setWorkspaceMode(mode: WorkspaceMode): void {
  workspaceMode.value = mode;
  if (mode === "GLOBAL" && filters.scope === "WORKSPACE") {
    filters.scope = "";
  }
  if (mode === "NAMED" && filters.scope === "GLOBAL") {
    filters.scope = "";
  }
}

function reconcileScope(): void {
  if (filters.scope === "WORKSPACE" && workspaceMode.value === "GLOBAL") {
    workspaceMode.value = "ALL";
  }
  if (filters.scope === "GLOBAL" && workspaceMode.value === "NAMED") {
    workspaceMode.value = "ALL";
  }
}

function applyFilters(): void {
  filterError.value = "";
  const nextFilters = currentFilters();
  if (nextFilters === undefined) {
    return;
  }
  appliedQuery.value = nextFilters.query ?? "";
  void loadAssets(nextFilters);
}

function resetFilters(): void {
  filters.query = "";
  filters.scope = "";
  filters.type = "";
  filters.workspace = "";
  filters.limit = 20;
  workspaceMode.value = "ALL";
  appliedQuery.value = "";
  filterError.value = "";
  void loadAssets({ limit: 20 });
}

function currentFilters(): AssetListFilters | undefined {
  if (filters.query.length > 0 && filters.query.trim().length === 0) {
    filterError.value = "Search must contain a visible character.";
    return undefined;
  }
  if (workspaceMode.value === "NAMED") {
    if (filters.workspace.length === 0) {
      filterError.value = "Enter an exact Workspace name.";
      return undefined;
    }
    if (filters.workspace !== filters.workspace.trim()) {
      filterError.value = "Workspace names cannot start or end with spaces.";
      return undefined;
    }
  }

  return {
    limit: filters.limit,
    ...(filters.query.length === 0 ? {} : { query: filters.query }),
    ...(filters.scope === "" ? {} : { scope: filters.scope }),
    ...(filters.type === "" ? {} : { type: filters.type }),
    ...(workspaceMode.value === "GLOBAL"
      ? { workspace: null }
      : workspaceMode.value === "NAMED"
        ? { workspace: filters.workspace }
        : {}),
  };
}

async function loadAssets(requestFilters: AssetListFilters): Promise<void> {
  const requestId = ++assetListRequest;
  assetListController?.abort();
  assetListController = new AbortController();
  assetsLoading.value = true;
  assetsError.value = undefined;
  try {
    const result = await api.listAssets(requestFilters, assetListController.signal);
    if (requestId !== assetListRequest) {
      return;
    }
    assets.value = result.items;
    const currentSelection = result.items.find(({ assetId }) => assetId === selectedAssetId.value);
    const nextSelection = currentSelection ?? result.items[0];
    selectedAssetId.value = nextSelection?.assetId;
    if (nextSelection === undefined) {
      assetDetailController?.abort();
      assetDetail.value = undefined;
      detailError.value = undefined;
      detailLoading.value = false;
    } else {
      void loadAssetDetail(nextSelection.assetId);
    }
  } catch (error) {
    if (requestId !== assetListRequest || isAbortError(error)) {
      return;
    }
    assets.value = [];
    selectedAssetId.value = undefined;
    assetDetail.value = undefined;
    assetsError.value = asHubApiError(error);
  } finally {
    if (requestId === assetListRequest) {
      assetsLoading.value = false;
    }
  }
}

function selectAsset(assetId: string): void {
  if (selectedAssetId.value === assetId && assetDetail.value !== undefined) {
    return;
  }
  selectedAssetId.value = assetId;
  detailTab.value = "RENDERED";
  void loadAssetDetail(assetId);
}

async function loadAssetDetail(assetId: string): Promise<void> {
  const requestId = ++assetDetailRequest;
  assetDetailController?.abort();
  assetDetailController = new AbortController();
  detailLoading.value = true;
  detailError.value = undefined;
  assetDetail.value = undefined;
  try {
    const result = await api.getAsset(assetId, assetDetailController.signal);
    if (requestId === assetDetailRequest && selectedAssetId.value === assetId) {
      assetDetail.value = result.asset;
    }
  } catch (error) {
    if (requestId !== assetDetailRequest || isAbortError(error)) {
      return;
    }
    detailError.value = asHubApiError(error);
  } finally {
    if (requestId === assetDetailRequest) {
      detailLoading.value = false;
    }
  }
}

function retryDetail(): void {
  if (selectedAssetId.value === undefined) {
    return;
  }
  if (detailError.value?.status === 404) {
    applyFilters();
  } else {
    void loadAssetDetail(selectedAssetId.value);
  }
}

async function loadInbox(): Promise<void> {
  const requestId = ++inboxRequest;
  inboxController?.abort();
  inboxController = new AbortController();
  inboxLoading.value = true;
  inboxError.value = undefined;
  try {
    const result = await api.getInbox(inboxController.signal);
    if (requestId !== inboxRequest) {
      return;
    }
    inboxItems.value = result.items;
    inboxDiagnostics.value = result.diagnostics;
    const retainedItem = result.items.find(({ assetId }) => assetId === selectedInboxItem.value?.assetId);
    const retainedDiagnostic = result.diagnostics.find((diagnostic) =>
      diagnostic.code === selectedInboxDiagnostic.value?.code &&
      diagnostic.relativePath === selectedInboxDiagnostic.value.relativePath
    );
    if (retainedItem !== undefined) {
      selectInboxItem(retainedItem);
    } else if (retainedDiagnostic !== undefined) {
      selectInboxDiagnostic(retainedDiagnostic);
    } else if (result.items[0] !== undefined) {
      selectInboxItem(result.items[0]);
    } else if (result.diagnostics[0] !== undefined) {
      selectInboxDiagnostic(result.diagnostics[0]);
    } else {
      selectedInboxItem.value = undefined;
      selectedInboxDiagnostic.value = undefined;
    }
  } catch (error) {
    if (requestId !== inboxRequest || isAbortError(error)) {
      return;
    }
    inboxItems.value = [];
    inboxDiagnostics.value = [];
    selectedInboxItem.value = undefined;
    selectedInboxDiagnostic.value = undefined;
    inboxError.value = asHubApiError(error);
  } finally {
    if (requestId === inboxRequest) {
      inboxLoading.value = false;
    }
  }
}

function selectInboxItem(item: InboxItem): void {
  selectedInboxItem.value = item;
  selectedInboxDiagnostic.value = undefined;
  inboxDetailTab.value = "RAW";
}

function selectInboxDiagnostic(diagnostic: InboxDiagnostic): void {
  selectedInboxDiagnostic.value = diagnostic;
  selectedInboxItem.value = undefined;
}

function isSelectedDiagnostic(diagnostic: InboxDiagnostic): boolean {
  return selectedInboxDiagnostic.value?.code === diagnostic.code &&
    selectedInboxDiagnostic.value.relativePath === diagnostic.relativePath;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function frontmatterText(frontmatter: object): string {
  return JSON.stringify(frontmatter, null, 2);
}

function presentError(error: HubApiError | undefined, context: ViewContext): PresentedError | undefined {
  if (error === undefined) {
    return undefined;
  }
  if (error.code === "SERVICE_UNREACHABLE") {
    return { title: "Local service is offline", detail: "Start the CodexMemoryOS server, then retry this view." };
  }
  if (error.code === "INVALID_RESPONSE") {
    return { title: "Response could not be read", detail: "The local service returned an unexpected response. Check the server and retry." };
  }
  if (context === "ASSET_DETAIL" && error.status === 404) {
    return { title: "Asset no longer exists", detail: "Refresh the library to replace this stale selection." };
  }
  if (context === "ASSET_DETAIL" && error.code === "ASSET_STALE") {
    return { title: "Asset changed on disk", detail: "The Catalog has been refreshed. Retry once to load the current Asset." };
  }
  if (error.status === 503) {
    return {
      title: context === "INBOX" ? "Inbox is temporarily unavailable" : "Asset service is temporarily unavailable",
      detail: "The local index or Workspace configuration is not ready. Retry after it recovers.",
    };
  }
  if (error.status >= 500) {
    return { title: "Local service could not complete the request", detail: "No internal details were exposed. Check the server log, then retry." };
  }
  return { title: "Request could not be completed", detail: error.message };
}

function asHubApiError(error: unknown): HubApiError {
  return error instanceof HubApiError
    ? error
    : new HubApiError("CLIENT_ERROR", "The view could not be loaded", true, 0);
}
</script>

<template>
  <div class="app-shell">
    <header class="masthead">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">CM</span>
        <div>
          <p class="eyebrow">Local knowledge index</p>
          <h1>CodexMemoryOS Hub</h1>
        </div>
      </div>
      <p class="read-only-note"><span aria-hidden="true"></span>Read-only workspace</p>
    </header>

    <nav class="primary-navigation" aria-label="Hub views">
      <button type="button" :aria-current="primaryView === 'ASSETS' ? 'page' : undefined" @click="primaryView = 'ASSETS'">Assets</button>
      <button type="button" :aria-current="primaryView === 'TASK_LOADOUTS' ? 'page' : undefined" @click="primaryView = 'TASK_LOADOUTS'">Task Loadouts</button>
      <button type="button" :aria-current="primaryView === 'USAGE' ? 'page' : undefined" @click="primaryView = 'USAGE'">Usage</button>
      <button type="button" :aria-current="primaryView === 'SYSTEM_STATUS' ? 'page' : undefined" @click="primaryView = 'SYSTEM_STATUS'">System Status</button>
    </nav>

    <main v-if="primaryView === 'ASSETS'" class="workbench">
      <section class="catalog-pane" aria-label="Asset catalog">
        <div class="view-switch" role="tablist" aria-label="Asset source">
          <button id="library-tab" type="button" role="tab" :aria-selected="activeView === 'LIBRARY'" :class="{ active: activeView === 'LIBRARY' }" @click="setActiveView('LIBRARY')">Asset Library</button>
          <button id="inbox-tab" type="button" role="tab" :aria-selected="activeView === 'INBOX'" :class="{ active: activeView === 'INBOX' }" @click="setActiveView('INBOX')">Inbox</button>
        </div>

        <template v-if="activeView === 'LIBRARY'">
          <form class="filter-panel" aria-label="Filter Asset Library" @submit.prevent="applyFilters">
            <label class="search-field"><span>Search</span><input v-model="filters.query" type="search" placeholder="Title, summary, or content" /></label>
            <fieldset class="workspace-filter">
              <legend>Workspace</legend>
              <div class="segmented-control">
                <button type="button" :aria-pressed="workspaceMode === 'ALL'" @click="setWorkspaceMode('ALL')">All</button>
                <button type="button" :aria-pressed="workspaceMode === 'GLOBAL'" @click="setWorkspaceMode('GLOBAL')">GLOBAL only</button>
                <button type="button" :aria-pressed="workspaceMode === 'NAMED'" @click="setWorkspaceMode('NAMED')">Exact</button>
              </div>
              <label v-if="workspaceMode === 'NAMED'" class="exact-workspace">
                <span>Exact Workspace name</span>
                <input v-model="filters.workspace" list="workspace-suggestions" autocomplete="off" />
                <datalist id="workspace-suggestions"><option v-for="workspace in workspaceSuggestions" :key="workspace" :value="workspace" /></datalist>
                <small>Suggestions come only from the current result set.</small>
              </label>
            </fieldset>
            <div class="filter-row">
              <label><span>Type</span><select v-model="filters.type"><option value="">All types</option><option value="MEMORY">MEMORY</option><option value="DOCUMENT">DOCUMENT</option><option value="SKILL">SKILL</option></select></label>
              <label><span>Scope</span><select v-model="filters.scope" @change="reconcileScope"><option value="">All scopes</option><option value="GLOBAL">GLOBAL</option><option value="WORKSPACE">WORKSPACE</option></select></label>
              <label><span>Limit</span><select v-model="filters.limit"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
            </div>
            <p v-if="filterError" class="field-error" role="alert">{{ filterError }}</p>
            <div class="filter-actions"><button type="submit" class="primary-button">Apply filters</button><button type="button" class="quiet-button" @click="resetFilters">Clear</button></div>
          </form>

          <div class="result-heading"><div><p class="eyebrow">Current slice</p><h2>Library</h2></div><span v-if="!assetsLoading && !assetsError" aria-live="polite">{{ assets.length }} shown</span></div>
          <div v-if="assetsLoading" class="state-panel compact" role="status" aria-live="polite"><span class="loading-line" aria-hidden="true"></span><p>Reading the Asset index…</p></div>
          <div v-else-if="assetsError && listErrorCopy" class="state-panel compact error-state" role="alert"><strong>{{ listErrorCopy.title }}</strong><p>{{ listErrorCopy.detail }}</p><button type="button" class="secondary-button" @click="applyFilters">Retry</button></div>
          <div v-else-if="assets.length === 0" class="state-panel compact"><strong>No Assets in this slice</strong><p>Change the search or filters. The result has no hidden pages.</p></div>
          <ol v-else class="asset-list" aria-label="Asset results">
            <li v-for="asset in assets" :key="asset.assetId">
              <button type="button" class="asset-card" :class="[`type-${asset.type.toLowerCase()}`, { selected: selectedAssetId === asset.assetId }]" :aria-current="selectedAssetId === asset.assetId ? 'true' : undefined" @click="selectAsset(asset.assetId)">
                <span class="asset-card-topline"><span class="tag">{{ asset.type }}</span><span class="scope-label">{{ asset.scope === 'GLOBAL' ? 'GLOBAL' : asset.workspace }}</span></span>
                <strong>{{ asset.title }}</strong><span class="asset-summary">{{ asset.summary }}</span>
                <span v-if="appliedQuery && asset.matchedSnippet" class="match-snippet">{{ asset.matchedSnippet }}</span>
                <span v-if="appliedQuery" class="match-meta">{{ asset.searchStrategy ?? 'MATCH' }}<template v-if="asset.score !== undefined"> · {{ asset.score }}</template></span>
                <span class="path-line mono">{{ asset.relativePath }}</span>
                <span class="asset-card-footer"><span class="mono">{{ asset.assetId }}</span><time :datetime="asset.modifiedAt">{{ formatDate(asset.modifiedAt) }}</time></span>
              </button>
            </li>
          </ol>
        </template>

        <template v-else>
          <div class="inbox-intro"><div><p class="eyebrow">Live repository scan</p><h2>Inbox</h2></div><button type="button" class="secondary-button" @click="loadInbox">Refresh scan</button></div>
          <p class="supporting-copy">Candidates and diagnostics are shown exactly as found. Nothing here can be promoted or changed.</p>
          <div v-if="inboxLoading" class="state-panel compact" role="status" aria-live="polite"><span class="loading-line" aria-hidden="true"></span><p>Scanning Inbox…</p></div>
          <div v-else-if="inboxError && inboxErrorCopy" class="state-panel compact error-state" role="alert"><strong>{{ inboxErrorCopy.title }}</strong><p>{{ inboxErrorCopy.detail }}</p><button type="button" class="secondary-button" @click="loadInbox">Retry</button></div>
          <div v-else-if="inboxItems.length === 0 && inboxDiagnostics.length === 0" class="state-panel compact"><strong>Inbox is clear</strong><p>No candidate files or Scanner diagnostics were found.</p></div>
          <div v-else class="inbox-groups">
            <section v-if="inboxItems.length > 0" aria-labelledby="candidate-heading"><h3 id="candidate-heading">Candidates <span>{{ inboxItems.length }}</span></h3>
              <ol class="asset-list"><li v-for="item in inboxItems" :key="item.assetId"><button type="button" class="asset-card" :class="[`type-${item.type.toLowerCase()}`, { selected: selectedInboxItem?.assetId === item.assetId }]" @click="selectInboxItem(item)"><span class="asset-card-topline"><span class="tag">{{ item.type }}</span><span class="scope-label">{{ item.scope === 'GLOBAL' ? 'GLOBAL' : item.workspace }}</span></span><strong>{{ item.title }}</strong><span class="asset-summary">{{ item.summary }}</span><span class="path-line mono">{{ item.relativePath }}</span></button></li></ol>
            </section>
            <section v-if="inboxDiagnostics.length > 0" aria-labelledby="diagnostic-heading"><h3 id="diagnostic-heading">Diagnostics <span>{{ inboxDiagnostics.length }}</span></h3>
              <ol class="diagnostic-list"><li v-for="(diagnostic, index) in inboxDiagnostics" :key="`${diagnostic.relativePath}:${diagnostic.code}:${index}`"><button type="button" class="diagnostic-card" :class="{ selected: isSelectedDiagnostic(diagnostic), conflict: diagnostic.code === 'ID_CONFLICT' || diagnostic.code === 'DUPLICATE_ASSET_ID' }" @click="selectInboxDiagnostic(diagnostic)"><strong class="mono">{{ diagnostic.code }}</strong><span>{{ diagnostic.message }}</span><span class="path-line mono">{{ diagnostic.relativePath }}</span></button></li></ol>
            </section>
          </div>
        </template>
      </section>

      <section class="detail-pane" aria-label="Selected item detail">
        <template v-if="activeView === 'LIBRARY'">
          <div v-if="detailLoading" class="state-panel detail-state" role="status" aria-live="polite"><span class="loading-line" aria-hidden="true"></span><strong>Opening Asset…</strong><p>The selected Markdown and Usage summary are loading.</p></div>
          <div v-else-if="detailError && detailErrorCopy" class="state-panel detail-state error-state" role="alert"><p class="error-code mono">{{ detailError.code }}</p><strong>{{ detailErrorCopy.title }}</strong><p>{{ detailErrorCopy.detail }}</p><button type="button" class="secondary-button" @click="retryDetail">{{ detailError.status === 404 ? 'Refresh library' : 'Retry detail' }}</button></div>
          <div v-else-if="assetDetail" class="detail-document">
            <header class="document-header"><div class="document-kicker"><span class="tag">{{ assetDetail.type }}</span><span>{{ assetDetail.scope === 'GLOBAL' ? 'GLOBAL' : assetDetail.workspace }}</span></div><h2>{{ assetDetail.title }}</h2><p>{{ assetDetail.summary }}</p></header>
            <dl class="metadata-sheet"><div><dt>Asset ID</dt><dd><code>{{ assetDetail.assetId }}</code></dd></div><div><dt>Workspace</dt><dd>{{ assetDetail.workspace ?? 'GLOBAL' }}</dd></div><div><dt>Path</dt><dd><code>{{ assetDetail.relativePath }}</code></dd></div><div><dt>Modified</dt><dd><time :datetime="assetDetail.modifiedAt">{{ formatDate(assetDetail.modifiedAt) }}</time></dd></div><div class="wide-row"><dt>Content Hash</dt><dd><code>{{ assetDetail.contentHash }}</code></dd></div></dl>
            <section class="usage-section" aria-labelledby="usage-heading"><div class="section-heading"><div><p class="eyebrow">Observed use</p><h3 id="usage-heading">Usage summary</h3></div></div><dl class="usage-strip"><div><dt>Tasks</dt><dd>{{ assetDetail.usageSummary.taskCount }}</dd></div><div><dt>Recall</dt><dd>{{ assetDetail.usageSummary.recallCount }}</dd></div><div><dt>Read</dt><dd>{{ assetDetail.usageSummary.readCount }}</dd></div><div><dt>Used tasks</dt><dd>{{ assetDetail.usageSummary.usedTaskCount }}</dd></div></dl></section>
            <section class="content-section" aria-labelledby="content-heading"><div class="section-heading content-heading-row"><div><p class="eyebrow">Current file</p><h3 id="content-heading">Content</h3></div><div class="content-tabs" role="tablist" aria-label="Asset content format"><button type="button" role="tab" :aria-selected="detailTab === 'RENDERED'" @click="detailTab = 'RENDERED'">Rendered</button><button type="button" role="tab" :aria-selected="detailTab === 'RAW'" @click="detailTab = 'RAW'">Raw Markdown</button><button type="button" role="tab" :aria-selected="detailTab === 'FRONTMATTER'" @click="detailTab = 'FRONTMATTER'">Frontmatter</button></div></div><div v-if="detailTab === 'RENDERED'" class="markdown-body" role="tabpanel" v-html="assetDetail.renderedMarkdown"></div><pre v-else-if="detailTab === 'RAW'" class="source-view" role="tabpanel">{{ assetDetail.rawMarkdown }}</pre><pre v-else class="source-view" role="tabpanel">{{ frontmatterText(assetDetail.frontmatter) }}</pre></section>
            <section class="loadout-section" aria-labelledby="loadout-heading"><div class="section-heading"><div><p class="eyebrow">Most recent references</p><h3 id="loadout-heading">Task Loadouts</h3></div><span>{{ assetDetail.recentLoadouts.length }} shown</span></div><div v-if="assetDetail.recentLoadouts.length === 0" class="state-panel compact"><p>This Asset has not appeared in a recorded Task Loadout.</p></div><div v-else class="table-scroll"><table><thead><tr><th>Task</th><th>Request</th><th>State</th><th>Reason</th><th>Usage</th><th>Updated</th></tr></thead><tbody><tr v-for="loadout in assetDetail.recentLoadouts" :key="loadout.taskId"><td><code>{{ loadout.taskId }}</code><small>{{ loadout.workspace ?? 'GLOBAL' }}</small></td><td>{{ loadout.requestSummary }}</td><td><span class="status-label">{{ loadout.status }}</span><small>{{ loadout.mode }}</small></td><td><code>{{ loadout.reason }}</code></td><td>Rcl {{ loadout.recallCount }} · Rd {{ loadout.readCount }} · {{ loadout.usedFlag ? 'Used' : 'Not used' }}</td><td><time :datetime="loadout.updatedAt">{{ formatDate(loadout.updatedAt) }}</time></td></tr></tbody></table></div></section>
          </div>
          <div v-else class="state-panel detail-state"><strong>Select an Asset</strong><p>Choose an item from the Library to read its current file and Usage summary.</p></div>
        </template>

        <template v-else>
          <div v-if="inboxLoading" class="state-panel detail-state" role="status" aria-live="polite"><span class="loading-line" aria-hidden="true"></span><strong>Scanning Inbox…</strong></div>
          <div v-else-if="inboxError && inboxErrorCopy" class="state-panel detail-state error-state" role="alert"><p class="error-code mono">{{ inboxError.code }}</p><strong>{{ inboxErrorCopy.title }}</strong><p>{{ inboxErrorCopy.detail }}</p><button type="button" class="secondary-button" @click="loadInbox">Retry</button></div>
          <article v-else-if="selectedInboxItem" class="detail-document inbox-document"><header class="document-header"><div class="document-kicker"><span class="tag">CANDIDATE</span><span>{{ selectedInboxItem.type }}</span></div><h2>{{ selectedInboxItem.title }}</h2><p>{{ selectedInboxItem.summary }}</p></header><dl class="metadata-sheet"><div><dt>Asset ID</dt><dd><code>{{ selectedInboxItem.assetId }}</code></dd></div><div><dt>Scope</dt><dd>{{ selectedInboxItem.scope }}</dd></div><div><dt>Workspace</dt><dd>{{ selectedInboxItem.workspace ?? 'GLOBAL' }}</dd></div><div><dt>Modified</dt><dd>{{ formatDate(selectedInboxItem.modifiedAt) }}</dd></div><div class="wide-row"><dt>Path</dt><dd><code>{{ selectedInboxItem.relativePath }}</code></dd></div><div class="wide-row"><dt>Content Hash</dt><dd><code>{{ selectedInboxItem.contentHash }}</code></dd></div></dl><section class="content-section"><div class="section-heading content-heading-row"><div><p class="eyebrow">Read-only candidate</p><h3>Source</h3></div><div class="content-tabs" role="tablist" aria-label="Inbox candidate format"><button type="button" role="tab" :aria-selected="inboxDetailTab === 'RAW'" @click="inboxDetailTab = 'RAW'">Raw Markdown</button><button type="button" role="tab" :aria-selected="inboxDetailTab === 'FRONTMATTER'" @click="inboxDetailTab = 'FRONTMATTER'">Frontmatter</button></div></div><pre v-if="inboxDetailTab === 'RAW'" class="source-view" role="tabpanel">{{ selectedInboxItem.rawMarkdown }}</pre><pre v-else class="source-view" role="tabpanel">{{ frontmatterText(selectedInboxItem.frontmatter) }}</pre></section></article>
          <article v-else-if="selectedInboxDiagnostic" class="detail-document diagnostic-document"><header class="document-header"><div class="document-kicker"><span class="tag warning">SCANNER DIAGNOSTIC</span></div><h2 class="mono">{{ selectedInboxDiagnostic.code }}</h2><p>{{ selectedInboxDiagnostic.message }}</p></header><dl class="metadata-sheet single-column"><div><dt>Relative path</dt><dd><code>{{ selectedInboxDiagnostic.relativePath }}</code></dd></div><div v-if="selectedInboxDiagnostic.assetId"><dt>Asset ID</dt><dd><code>{{ selectedInboxDiagnostic.assetId }}</code></dd></div></dl><div class="boundary-note"><strong>No action is available here.</strong><p>Resolve the source file outside the Hub, then refresh the Inbox scan.</p></div></article>
          <div v-else class="state-panel detail-state"><strong>Nothing selected</strong><p>Inbox candidates and Scanner diagnostics will appear here when present.</p></div>
        </template>
      </section>
    </main>
    <TaskLoadoutsView v-else-if="primaryView === 'TASK_LOADOUTS'" />
    <UsageView v-else-if="primaryView === 'USAGE'" />
    <SystemStatusView v-else />
  </div>
</template>
