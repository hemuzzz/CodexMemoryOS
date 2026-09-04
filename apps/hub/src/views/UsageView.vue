<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client";
import type { UsageListFilters, UsageListItem } from "../api/types";
import {
  asHubApiError,
  displayWorkspace,
  formatDate,
  presentReadError,
} from "./view-helpers";

type WorkspaceMode = "ALL" | "NULL" | "NAMED";

const api = new HubApiClient();
const filters = reactive({
  assetId: "",
  limit: 20 as 20 | 50 | 100,
  taskId: "",
  workspace: "",
});
const workspaceMode = ref<WorkspaceMode>("ALL");
const filterError = ref("");
const appliedFilters = ref<UsageListFilters>({ limit: 20 });
const usages = ref<UsageListItem[]>([]);
const loading = ref(false);
const error = ref<HubApiError>();
const selectedUsageId = ref<string>();

let request = 0;
let controller: AbortController | undefined;

const errorCopy = computed(() => presentReadError(error.value, "USAGE_LIST"));
const workspaceSuggestions = computed(() =>
  [...new Set(usages.value.flatMap((usage) => usage.workspace === null ? [] : [usage.workspace]))]
    .sort((left, right) => left.localeCompare(right)),
);
const appliedSummary = computed(() => {
  const values: string[] = [];
  if (appliedFilters.value.taskId !== undefined) {
    values.push(`Task ${appliedFilters.value.taskId}`);
  }
  if (appliedFilters.value.assetId !== undefined) {
    values.push(`Asset ${appliedFilters.value.assetId}`);
  }
  if (Object.hasOwn(appliedFilters.value, "workspace")) {
    values.push(appliedFilters.value.workspace === null
      ? "Workspace NULL"
      : `Workspace ${appliedFilters.value.workspace}`);
  }
  return values.length === 0 ? "All Usage rows" : values.join(" AND ");
});

onMounted(() => void loadUsages({ limit: 20 }));
onBeforeUnmount(() => controller?.abort());

function setWorkspaceMode(mode: WorkspaceMode): void {
  workspaceMode.value = mode;
}

function validateOptionalExact(value: string, label: string): boolean {
  if (value.length > 0 && value !== value.trim()) {
    filterError.value = `${label} cannot start or end with spaces.`;
    return false;
  }
  return true;
}

function currentFilters(): UsageListFilters | undefined {
  if (!validateOptionalExact(filters.taskId, "Task ID") ||
      !validateOptionalExact(filters.assetId, "Asset ID")) {
    return undefined;
  }
  if (workspaceMode.value === "NAMED") {
    if (filters.workspace.length === 0) {
      filterError.value = "Enter an exact Workspace name.";
      return undefined;
    }
    if (!validateOptionalExact(filters.workspace, "Workspace name")) {
      return undefined;
    }
  }
  return {
    limit: filters.limit,
    ...(filters.taskId.length === 0 ? {} : { taskId: filters.taskId }),
    ...(filters.assetId.length === 0 ? {} : { assetId: filters.assetId }),
    ...(workspaceMode.value === "NULL"
      ? { workspace: null }
      : workspaceMode.value === "NAMED"
        ? { workspace: filters.workspace }
        : {}),
  };
}

function applyFilters(): void {
  filterError.value = "";
  const nextFilters = currentFilters();
  if (nextFilters !== undefined) {
    appliedFilters.value = nextFilters;
    void loadUsages(nextFilters);
  }
}

function resetFilters(): void {
  filters.assetId = "";
  filters.limit = 20;
  filters.taskId = "";
  filters.workspace = "";
  workspaceMode.value = "ALL";
  filterError.value = "";
  appliedFilters.value = { limit: 20 };
  void loadUsages(appliedFilters.value);
}

function refreshUsages(): void {
  void loadUsages(appliedFilters.value);
}

async function loadUsages(requestFilters: UsageListFilters): Promise<void> {
  const requestId = ++request;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = undefined;
  try {
    const result = await api.listUsages(requestFilters, controller.signal);
    if (requestId !== request) {
      return;
    }
    usages.value = result.items;
    const retained = result.items.some(({ usageId }) => usageId === selectedUsageId.value);
    selectedUsageId.value = retained ? selectedUsageId.value : result.items[0]?.usageId;
  } catch (caught) {
    if (requestId !== request || isAbortError(caught)) {
      return;
    }
    usages.value = [];
    selectedUsageId.value = undefined;
    error.value = asHubApiError(caught);
  } finally {
    if (requestId === request) {
      loading.value = false;
    }
  }
}
</script>

<template>
  <main class="report-workbench" aria-labelledby="usage-view-heading">
    <header class="report-header">
      <div><p class="eyebrow">Non-canonical telemetry</p><h2 id="usage-view-heading">Usage</h2></div>
      <button type="button" class="secondary-button" @click="refreshUsages">Refresh Usage</button>
    </header>
    <p class="supporting-copy report-intro">Recall, Read, Used, and Asset availability are shown as separate service facts. No score or trend is inferred.</p>

    <form class="filter-panel report-filters" aria-label="Filter Usage" @submit.prevent="applyFilters">
      <div class="filter-row usage-id-filters">
        <label><span>Task ID</span><input v-model="filters.taskId" autocomplete="off" placeholder="Exact tsk… ID" /></label>
        <label><span>Asset ID</span><input v-model="filters.assetId" autocomplete="off" placeholder="Exact ast… ID" /></label>
        <label><span>Limit</span><select v-model="filters.limit"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
      </div>
      <fieldset class="workspace-filter usage-workspace-filter">
        <legend>Task Workspace</legend>
        <div class="segmented-control">
          <button type="button" :aria-pressed="workspaceMode === 'ALL'" @click="setWorkspaceMode('ALL')">All</button>
          <button type="button" :aria-pressed="workspaceMode === 'NULL'" @click="setWorkspaceMode('NULL')">NULL only</button>
          <button type="button" :aria-pressed="workspaceMode === 'NAMED'" @click="setWorkspaceMode('NAMED')">Exact</button>
        </div>
        <label v-if="workspaceMode === 'NAMED'" class="exact-workspace">
          <span>Exact Workspace name</span>
          <input v-model="filters.workspace" list="usage-workspace-suggestions" autocomplete="off" />
          <datalist id="usage-workspace-suggestions"><option v-for="workspace in workspaceSuggestions" :key="workspace" :value="workspace" /></datalist>
          <small>Suggestions come only from the current result set.</small>
        </label>
      </fieldset>
      <p v-if="filterError" class="field-error" role="alert">{{ filterError }}</p>
      <div class="filter-actions"><button type="submit" class="primary-button">Apply filters</button><button type="button" class="quiet-button" @click="resetFilters">Clear</button></div>
    </form>

    <div class="ledger-heading">
      <div><p class="eyebrow">Applied query</p><h3>{{ appliedSummary }}</h3></div>
      <span v-if="!loading && !error" aria-live="polite">{{ usages.length }} shown · no hidden page count</span>
    </div>
    <div v-if="loading" class="state-panel compact" role="status" aria-live="polite"><span class="loading-line" aria-hidden="true"></span><p>Reading Usage…</p></div>
    <div v-else-if="error && errorCopy" class="state-panel compact error-state" role="alert"><strong>{{ errorCopy.title }}</strong><p>{{ errorCopy.detail }}</p><button type="button" class="secondary-button" @click="refreshUsages">Retry</button></div>
    <div v-else-if="usages.length === 0" class="state-panel compact"><strong>No Usage in this slice</strong><p>Change the exact filters or refresh. The result has no hidden pages.</p></div>
    <ol v-else class="usage-ledger" role="listbox" aria-label="Usage results">
      <li
        v-for="usage in usages"
        :key="usage.usageId"
        :class="{ selected: selectedUsageId === usage.usageId, missing: usage.assetMissing }"
        role="option"
        :aria-selected="selectedUsageId === usage.usageId"
        tabindex="0"
        @focus="selectedUsageId = usage.usageId"
        @click="selectedUsageId = usage.usageId"
        @keydown.enter="selectedUsageId = usage.usageId"
        @keydown.space.prevent="selectedUsageId = usage.usageId"
      >
        <div class="usage-record-heading">
          <div><span class="tag">USAGE</span><code>{{ usage.usageId }}</code></div>
          <span v-if="usage.assetMissing" class="missing-label">ASSET MISSING</span><span v-else class="available-label">Asset available</span>
        </div>
        <dl class="usage-facts">
          <div class="wide-fact"><dt>Task ID</dt><dd><code>{{ usage.taskId }}</code></dd></div>
          <div class="wide-fact"><dt>Asset ID</dt><dd><code>{{ usage.assetId }}</code></dd></div>
          <div><dt>Workspace</dt><dd>{{ displayWorkspace(usage.workspace) }}</dd></div>
          <div><dt>Recall</dt><dd>{{ usage.recallCount }}</dd></div>
          <div><dt>Read</dt><dd>{{ usage.readCount }}</dd></div>
          <div><dt>Used fact</dt><dd>{{ usage.usedFlag ? 'USED' : 'NOT USED' }}</dd></div>
          <div><dt>Created</dt><dd><time :datetime="usage.createdAt">{{ formatDate(usage.createdAt) }}</time></dd></div>
          <div><dt>Updated</dt><dd><time :datetime="usage.updatedAt">{{ formatDate(usage.updatedAt) }}</time></dd></div>
        </dl>
      </li>
    </ol>
  </main>
</template>
