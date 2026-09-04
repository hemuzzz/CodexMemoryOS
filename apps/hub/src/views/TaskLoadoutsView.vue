<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client";
import type {
  TaskLoadoutDetail,
  TaskLoadoutListFilters,
  TaskLoadoutSummary,
  TaskStatus,
} from "../api/types";
import {
  asHubApiError,
  displayWorkspace,
  formatDate,
  presentReadError,
} from "./view-helpers";

type DetailTab = "STRUCTURED" | "RAW" | "USAGE";
type WorkspaceMode = "ALL" | "NULL" | "NAMED";

const api = new HubApiClient();
const filters = reactive({
  limit: 20 as 20 | 50 | 100,
  status: "" as "" | TaskStatus,
  workspace: "",
});
const workspaceMode = ref<WorkspaceMode>("ALL");
const filterError = ref("");
const appliedFilters = ref<TaskLoadoutListFilters>({ limit: 20 });

const tasks = ref<TaskLoadoutSummary[]>([]);
const listLoading = ref(false);
const listError = ref<HubApiError>();
const selectedTaskId = ref<string>();
const detail = ref<TaskLoadoutDetail>();
const detailLoading = ref(false);
const detailError = ref<HubApiError>();
const detailTab = ref<DetailTab>("STRUCTURED");

let listRequest = 0;
let detailRequest = 0;
let listController: AbortController | undefined;
let detailController: AbortController | undefined;

const workspaceSuggestions = computed(() =>
  [...new Set(tasks.value.flatMap((task) => task.workspace === null ? [] : [task.workspace]))]
    .sort((left, right) => left.localeCompare(right)),
);
const listErrorCopy = computed(() => presentReadError(listError.value, "TASK_LIST"));
const detailErrorCopy = computed(() => presentReadError(detailError.value, "TASK_DETAIL"));
const rawLoadout = computed(() => detail.value === undefined
  ? ""
  : JSON.stringify(detail.value.loadout, null, 2));

onMounted(() => void loadTasks({ limit: 20 }));
onBeforeUnmount(() => {
  listController?.abort();
  detailController?.abort();
});

function setWorkspaceMode(mode: WorkspaceMode): void {
  workspaceMode.value = mode;
}

function currentFilters(): TaskLoadoutListFilters | undefined {
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
    ...(filters.status === "" ? {} : { status: filters.status }),
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
    void loadTasks(nextFilters);
  }
}

function resetFilters(): void {
  filters.limit = 20;
  filters.status = "";
  filters.workspace = "";
  workspaceMode.value = "ALL";
  filterError.value = "";
  appliedFilters.value = { limit: 20 };
  void loadTasks(appliedFilters.value);
}

function refreshTasks(): void {
  void loadTasks(appliedFilters.value);
}

async function loadTasks(requestFilters: TaskLoadoutListFilters): Promise<void> {
  const requestId = ++listRequest;
  listController?.abort();
  listController = new AbortController();
  listLoading.value = true;
  listError.value = undefined;
  try {
    const result = await api.listTaskLoadouts(requestFilters, listController.signal);
    if (requestId !== listRequest) {
      return;
    }
    tasks.value = result.items;
    const retained = result.items.find(({ taskId }) => taskId === selectedTaskId.value);
    const nextSelection = retained ?? result.items[0];
    selectedTaskId.value = nextSelection?.taskId;
    if (nextSelection === undefined) {
      clearDetail();
    } else {
      void loadDetail(nextSelection.taskId);
    }
  } catch (error) {
    if (requestId !== listRequest || isAbortError(error)) {
      return;
    }
    tasks.value = [];
    selectedTaskId.value = undefined;
    clearDetail();
    listError.value = asHubApiError(error);
  } finally {
    if (requestId === listRequest) {
      listLoading.value = false;
    }
  }
}

function selectTask(taskId: string): void {
  if (selectedTaskId.value === taskId && detail.value !== undefined) {
    return;
  }
  selectedTaskId.value = taskId;
  detailTab.value = "STRUCTURED";
  void loadDetail(taskId);
}

async function loadDetail(taskId: string): Promise<void> {
  const requestId = ++detailRequest;
  detailController?.abort();
  detailController = new AbortController();
  detailLoading.value = true;
  detailError.value = undefined;
  detail.value = undefined;
  try {
    const result = await api.getTaskLoadout(taskId, detailController.signal);
    if (requestId === detailRequest && selectedTaskId.value === taskId) {
      detail.value = result.taskLoadout;
    }
  } catch (error) {
    if (requestId !== detailRequest || isAbortError(error)) {
      return;
    }
    detailError.value = asHubApiError(error);
  } finally {
    if (requestId === detailRequest) {
      detailLoading.value = false;
    }
  }
}

function clearDetail(): void {
  detailRequest += 1;
  detailController?.abort();
  detail.value = undefined;
  detailError.value = undefined;
  detailLoading.value = false;
}

function retryDetail(): void {
  if (detailError.value?.status === 404) {
    refreshTasks();
  } else if (selectedTaskId.value !== undefined) {
    void loadDetail(selectedTaskId.value);
  }
}

function sequenceNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
</script>

<template>
  <main class="workbench task-workbench">
    <section class="catalog-pane" aria-label="Task Loadout list">
      <form class="filter-panel" aria-label="Filter Task Loadouts" @submit.prevent="applyFilters">
        <fieldset class="workspace-filter">
          <legend>Workspace</legend>
          <div class="segmented-control">
            <button type="button" :aria-pressed="workspaceMode === 'ALL'" @click="setWorkspaceMode('ALL')">All</button>
            <button type="button" :aria-pressed="workspaceMode === 'NULL'" @click="setWorkspaceMode('NULL')">NULL only</button>
            <button type="button" :aria-pressed="workspaceMode === 'NAMED'" @click="setWorkspaceMode('NAMED')">Exact</button>
          </div>
          <label v-if="workspaceMode === 'NAMED'" class="exact-workspace">
            <span>Exact Workspace name</span>
            <input v-model="filters.workspace" list="task-workspace-suggestions" autocomplete="off" />
            <datalist id="task-workspace-suggestions">
              <option v-for="workspace in workspaceSuggestions" :key="workspace" :value="workspace" />
            </datalist>
            <small>Suggestions come only from the current result set.</small>
          </label>
        </fieldset>
        <div class="filter-row two-fields">
          <label>
            <span>Status</span>
            <select v-model="filters.status">
              <option value="">All statuses</option>
              <option value="RUNNING">RUNNING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </label>
          <label>
            <span>Limit</span>
            <select v-model="filters.limit">
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
        </div>
        <p v-if="filterError" class="field-error" role="alert">{{ filterError }}</p>
        <div class="filter-actions">
          <button type="submit" class="primary-button">Apply filters</button>
          <button type="button" class="quiet-button" @click="resetFilters">Clear</button>
        </div>
      </form>

      <div class="result-heading">
        <div><p class="eyebrow">Current slice</p><h2>Task Loadouts</h2></div>
        <button type="button" class="secondary-button" @click="refreshTasks">Refresh list</button>
      </div>
      <p v-if="!listLoading && !listError" class="result-count" aria-live="polite">{{ tasks.length }} shown · no hidden page count</p>
      <div v-if="listLoading" class="state-panel compact" role="status" aria-live="polite">
        <span class="loading-line" aria-hidden="true"></span><p>Reading Task Loadouts…</p>
      </div>
      <div v-else-if="listError && listErrorCopy" class="state-panel compact error-state" role="alert">
        <strong>{{ listErrorCopy.title }}</strong><p>{{ listErrorCopy.detail }}</p>
        <button type="button" class="secondary-button" @click="refreshTasks">Retry</button>
      </div>
      <div v-else-if="tasks.length === 0" class="state-panel compact">
        <strong>No Task Loadouts in this slice</strong>
        <p>Change the filters or refresh. The result has no hidden pages.</p>
      </div>
      <ol v-else class="asset-list task-list" aria-label="Task Loadout results">
        <li v-for="task in tasks" :key="task.taskId">
          <button
            type="button"
            class="asset-card task-card"
            :class="{ selected: selectedTaskId === task.taskId }"
            :aria-current="selectedTaskId === task.taskId ? 'true' : undefined"
            @click="selectTask(task.taskId)"
          >
            <span class="asset-card-topline">
              <span class="status-label" :class="`status-${task.status.toLowerCase()}`">{{ task.status }}</span>
              <span class="scope-label">{{ displayWorkspace(task.workspace) }}</span>
            </span>
            <strong class="mono task-id">{{ task.taskId }}</strong>
            <span class="asset-summary request-summary">{{ task.request }}</span>
            <span class="task-measures">
              <span>{{ task.assetCount }} Assets</span>
              <span>{{ task.estimatedCharacters }} chars</span>
            </span>
            <span class="asset-card-footer">
              <time :datetime="task.createdAt">Created {{ formatDate(task.createdAt) }}</time>
              <time :datetime="task.updatedAt">Updated {{ formatDate(task.updatedAt) }}</time>
            </span>
          </button>
        </li>
      </ol>
    </section>

    <section class="detail-pane" aria-label="Selected Task Loadout detail">
      <div v-if="detailLoading" class="state-panel detail-state" role="status" aria-live="polite">
        <span class="loading-line" aria-hidden="true"></span><strong>Opening Task Loadout…</strong>
        <p>The frozen Loadout and associated Usage are loading.</p>
      </div>
      <div v-else-if="detailError && detailErrorCopy" class="state-panel detail-state error-state" role="alert">
        <p class="error-code mono">{{ detailError.code }}</p><strong>{{ detailErrorCopy.title }}</strong>
        <p>{{ detailErrorCopy.detail }}</p>
        <button type="button" class="secondary-button" @click="retryDetail">
          {{ detailError.status === 404 ? 'Refresh Task list' : 'Retry detail' }}
        </button>
      </div>
      <article v-else-if="detail" class="detail-document task-document">
        <header class="document-header">
          <div class="document-kicker">
            <span class="status-label" :class="`status-${detail.status.toLowerCase()}`">{{ detail.status }}</span>
            <span>{{ displayWorkspace(detail.workspace) }}</span>
          </div>
          <h2 class="mono task-detail-id">{{ detail.taskId }}</h2>
          <p>{{ detail.request }}</p>
        </header>
        <dl class="metadata-sheet">
          <div><dt>Workspace</dt><dd>{{ displayWorkspace(detail.workspace) }}</dd></div>
          <div><dt>Status</dt><dd>{{ detail.status }}</dd></div>
          <div><dt>Created</dt><dd><time :datetime="detail.createdAt">{{ formatDate(detail.createdAt) }}</time></dd></div>
          <div><dt>Updated</dt><dd><time :datetime="detail.updatedAt">{{ formatDate(detail.updatedAt) }}</time></dd></div>
          <div><dt>Schema version</dt><dd>{{ detail.loadout.schemaVersion }}</dd></div>
          <div><dt>Loadout Assets</dt><dd>{{ detail.loadout.assets.length }} / {{ detail.loadout.limits.maxAssets }}</dd></div>
        </dl>

        <section class="content-section" aria-labelledby="task-loadout-content-heading">
          <div class="section-heading content-heading-row">
            <div><p class="eyebrow">Frozen Task projection</p><h3 id="task-loadout-content-heading">Loadout</h3></div>
            <div class="content-tabs" role="tablist" aria-label="Task Loadout detail format">
              <button type="button" role="tab" :aria-selected="detailTab === 'STRUCTURED'" @click="detailTab = 'STRUCTURED'">Structured Loadout</button>
              <button type="button" role="tab" :aria-selected="detailTab === 'RAW'" @click="detailTab = 'RAW'">Raw JSON</button>
              <button type="button" role="tab" :aria-selected="detailTab === 'USAGE'" @click="detailTab = 'USAGE'">Associated Usage</button>
            </div>
          </div>

          <div v-if="detailTab === 'STRUCTURED'" class="loadout-structured" role="tabpanel">
            <dl class="loadout-limits">
              <div><dt>Max injected characters</dt><dd>{{ detail.loadout.limits.maxInjectedCharacters }}</dd></div>
              <div><dt>Max Assets</dt><dd>{{ detail.loadout.limits.maxAssets }}</dd></div>
            </dl>
            <div v-if="detail.loadout.assets.length === 0" class="state-panel compact">
              <strong>This Loadout is empty</strong><p>No Assets are present in the stored array.</p>
            </div>
            <ol v-else class="loadout-sequence" aria-label="Loadout Assets in stored order">
              <li v-for="(asset, index) in detail.loadout.assets" :key="`${asset.assetId}:${index}`">
                <span class="sequence-number" aria-hidden="true">{{ sequenceNumber(index) }}</span>
                <div class="sequence-body">
                  <div class="sequence-heading">
                    <code>{{ asset.assetId }}</code><span class="status-label">{{ asset.mode }}</span>
                  </div>
                  <dl>
                    <div><dt>Reason</dt><dd><code>{{ asset.reason }}</code></dd></div>
                    <div><dt>Estimated characters</dt><dd>{{ asset.estimatedCharacters }}</dd></div>
                  </dl>
                </div>
              </li>
            </ol>
          </div>
          <pre v-else-if="detailTab === 'RAW'" class="source-view" role="tabpanel">{{ rawLoadout }}</pre>
          <div v-else role="tabpanel">
            <div v-if="detail.usages.length === 0" class="state-panel compact">
              <strong>No associated Usage</strong><p>The service returned no Usage rows for this Task.</p>
            </div>
            <div v-else class="table-scroll">
              <table>
                <thead><tr><th>Usage ID</th><th>Asset ID</th><th>Recall</th><th>Read</th><th>Used</th><th>Asset state</th></tr></thead>
                <tbody>
                  <tr v-for="usage in detail.usages" :key="usage.usageId">
                    <td><code>{{ usage.usageId }}</code></td><td><code>{{ usage.assetId }}</code></td>
                    <td>{{ usage.recallCount }}</td><td>{{ usage.readCount }}</td>
                    <td>{{ usage.usedFlag ? 'USED' : 'NOT USED' }}</td>
                    <td><span v-if="usage.assetMissing" class="missing-label">ASSET MISSING</span><span v-else>Available</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </article>
      <div v-else class="state-panel detail-state">
        <strong>Select a Task Loadout</strong><p>Choose a Task to inspect its stored Asset order and associated Usage.</p>
      </div>
    </section>
  </main>
</template>
