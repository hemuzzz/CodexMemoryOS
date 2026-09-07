<script setup lang="ts">
import { displayValue, handleTabKeydown } from "./view-helpers.js";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client.js";
import type {
  TaskLoadoutDetail,
  TaskLoadoutListFilters,
  TaskLoadoutSummary,
  TaskStatus,
} from "../api/types.js";
import {
  asHubApiError,
  displayWorkspace,
  formatDate,
  presentReadError,
} from "./view-helpers.js";

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
  [
    ...new Set(
      tasks.value.flatMap((task) =>
        task.workspace === null ? [] : [task.workspace],
      ),
    ),
  ].sort((left, right) => left.localeCompare(right)),
);
const listErrorCopy = computed(() =>
  presentReadError(listError.value, "TASK_LIST"),
);
const detailErrorCopy = computed(() =>
  presentReadError(detailError.value, "TASK_DETAIL"),
);
const rawLoadout = computed(() =>
  detail.value === undefined
    ? ""
    : JSON.stringify(detail.value.loadout, null, 2),
);

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
      filterError.value = "请输入准确的工作区名称。";
      return undefined;
    }
    if (filters.workspace !== filters.workspace.trim()) {
      filterError.value = "工作区名称首尾不能包含空格。";
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

async function loadTasks(
  requestFilters: TaskLoadoutListFilters,
): Promise<void> {
  const requestId = ++listRequest;
  listController?.abort();
  listController = new AbortController();
  listLoading.value = true;
  listError.value = undefined;
  try {
    const result = await api.listTaskLoadouts(
      requestFilters,
      listController.signal,
    );
    if (requestId !== listRequest) {
      return;
    }
    tasks.value = result.items;
    const retained = result.items.find(
      ({ taskId }) => taskId === selectedTaskId.value,
    );
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
    <section class="catalog-pane" aria-label="任务装载 list">
      <form
        class="filter-panel"
        aria-label="Filter 任务与装载"
        @submit.prevent="applyFilters"
      >
        <fieldset class="workspace-filter">
          <legend>工作区</legend>
          <div class="segmented-control">
            <button
              type="button"
              :aria-pressed="workspaceMode === 'ALL'"
              @click="setWorkspaceMode('ALL')"
            >
              全部
            </button>
            <button
              type="button"
              :aria-pressed="workspaceMode === 'NULL'"
              @click="setWorkspaceMode('NULL')"
            >
              未绑定
            </button>
            <button
              type="button"
              :aria-pressed="workspaceMode === 'NAMED'"
              @click="setWorkspaceMode('NAMED')"
            >
              指定工作区
            </button>
          </div>
          <label v-if="workspaceMode === 'NAMED'" class="exact-workspace">
            <span>工作区名称</span>
            <input
              v-model="filters.workspace"
              list="task-workspace-suggestions"
              autocomplete="off"
            />
            <datalist id="task-workspace-suggestions">
              <option
                v-for="workspace in workspaceSuggestions"
                :key="workspace"
                :value="workspace"
              />
            </datalist>
            <small>建议名称来自当前结果。</small>
          </label>
        </fieldset>
        <div class="filter-row two-fields">
          <label>
            <span>状态</span>
            <select v-model="filters.status">
              <option value="">全部状态</option>
              <option value="RUNNING">进行中</option>
              <option value="COMPLETED">已完成</option>
              <option value="CANCELLED">已取消</option>
            </select>
          </label>
          <label>
            <span>显示条数</span>
            <select v-model="filters.limit">
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
        </div>
        <p v-if="filterError" class="field-error" role="alert">
          {{ filterError }}
        </p>
        <div class="filter-actions">
          <button type="submit" class="primary-button">应用筛选</button>
          <button type="button" class="quiet-button" @click="resetFilters">
            重置
          </button>
        </div>
      </form>

      <div class="result-heading">
        <div>
          <p class="eyebrow">浏览知识</p>
          <h2>任务与装载</h2>
        </div>
        <button type="button" class="secondary-button" @click="refreshTasks">
          刷新列表
        </button>
      </div>
      <p
        v-if="!listLoading && !listError"
        class="result-count"
        aria-live="polite"
      >
        {{ tasks.length }} 条 · 当前返回结果
      </p>
      <div
        v-if="listLoading"
        class="state-panel compact"
        role="status"
        aria-live="polite"
      >
        <span class="loading-line" aria-hidden="true"></span>
        <p>正在读取任务装载…</p>
      </div>
      <div
        v-else-if="listError && listErrorCopy"
        class="state-panel compact error-state"
        role="alert"
      >
        <strong>{{ listErrorCopy.title }}</strong>
        <p>{{ listErrorCopy.detail }}</p>
        <button type="button" class="secondary-button" @click="refreshTasks">
          重试
        </button>
      </div>
      <div v-else-if="tasks.length === 0" class="state-panel compact">
        <strong>暂无任务装载</strong>
        <p>调整筛选条件或刷新列表。</p>
      </div>
      <ol v-else class="asset-list task-list" aria-label="任务装载 results">
        <li v-for="task in tasks" :key="task.taskId">
          <button
            type="button"
            class="asset-card task-card"
            :class="{ selected: selectedTaskId === task.taskId }"
            :aria-current="selectedTaskId === task.taskId ? 'true' : undefined"
            @click="selectTask(task.taskId)"
          >
            <span class="asset-card-topline">
              <span
                class="status-label"
                :class="`status-${task.status.toLowerCase()}`"
                >{{ displayValue(task.status) }}</span
              >
              <span class="scope-label">{{
                displayWorkspace(task.workspace)
              }}</span>
            </span>
            <strong class="mono task-id">{{ task.taskId }}</strong>
            <span class="asset-summary request-summary">{{
              task.request
            }}</span>
            <span class="task-measures">
              <span>{{ task.assetCount }} 条资产</span>
              <span>{{ task.estimatedCharacters }} 字符</span>
            </span>
            <span class="asset-card-footer">
              <time :datetime="task.createdAt"
                >创建于 {{ formatDate(task.createdAt) }}</time
              >
              <time :datetime="task.updatedAt"
                >更新于 {{ formatDate(task.updatedAt) }}</time
              >
            </span>
          </button>
        </li>
      </ol>
    </section>

    <section class="detail-pane" aria-label="Selected 任务装载 detail">
      <div
        v-if="detailLoading"
        class="state-panel detail-state"
        role="status"
        aria-live="polite"
      >
        <span class="loading-line" aria-hidden="true"></span
        ><strong>正在打开任务…</strong>
        <p>正在读取已保存的装载与使用记录。</p>
      </div>
      <div
        v-else-if="detailError && detailErrorCopy"
        class="state-panel detail-state error-state"
        role="alert"
      >
        <p class="error-code mono">{{ detailError.code }}</p>
        <strong>{{ detailErrorCopy.title }}</strong>
        <p>{{ detailErrorCopy.detail }}</p>
        <button type="button" class="secondary-button" @click="retryDetail">
          {{ detailError.status === 404 ? "刷新任务列表" : "重新加载" }}
        </button>
      </div>
      <article v-else-if="detail" class="detail-document task-document">
        <header class="document-header">
          <div class="document-kicker">
            <span
              class="status-label"
              :class="`status-${detail.status.toLowerCase()}`"
              >{{ displayValue(detail.status) }}</span
            >
            <span>{{ displayWorkspace(detail.workspace) }}</span>
          </div>
          <h2 class="mono task-detail-id">{{ detail.taskId }}</h2>
          <p>{{ detail.request }}</p>
        </header>
        <dl class="metadata-sheet">
          <div>
            <dt>工作区</dt>
            <dd>{{ displayWorkspace(detail.workspace) }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ displayValue(detail.status) }}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>
              <time :datetime="detail.createdAt">{{
                formatDate(detail.createdAt)
              }}</time>
            </dd>
          </div>
          <div>
            <dt>更新时间</dt>
            <dd>
              <time :datetime="detail.updatedAt">{{
                formatDate(detail.updatedAt)
              }}</time>
            </dd>
          </div>
          <div>
            <dt>数据格式版本</dt>
            <dd>{{ detail.loadout.schemaVersion }}</dd>
          </div>
          <div>
            <dt>装载资产数量</dt>
            <dd>
              {{ detail.loadout.assets.length }} /
              {{ detail.loadout.limits.maxAssets }}
            </dd>
          </div>
        </dl>

        <section
          class="content-section"
          aria-labelledby="task-loadout-content-heading"
        >
          <div class="section-heading content-heading-row">
            <div>
              <p class="eyebrow">已保存快照</p>
              <h3 id="task-loadout-content-heading">知识装载</h3>
            </div>
            <div
              class="content-tabs"
              role="tablist"
              @keydown="handleTabKeydown"
              aria-label="任务装载 detail format"
            >
              <button
                type="button"
                role="tab"
                id="task-tab-STRUCTURED"
                aria-controls="task-panel"
                :tabindex="detailTab === 'STRUCTURED' ? 0 : -1"
                :aria-selected="detailTab === 'STRUCTURED'"
                @click="detailTab = 'STRUCTURED'"
              >
                装载列表
              </button>
              <button
                type="button"
                role="tab"
                id="task-tab-RAW"
                aria-controls="task-panel"
                :tabindex="detailTab === 'RAW' ? 0 : -1"
                :aria-selected="detailTab === 'RAW'"
                @click="detailTab = 'RAW'"
              >
                原始 JSON
              </button>
              <button
                type="button"
                role="tab"
                id="task-tab-USAGE"
                aria-controls="task-panel"
                :tabindex="detailTab === 'USAGE' ? 0 : -1"
                :aria-selected="detailTab === 'USAGE'"
                @click="detailTab = 'USAGE'"
              >
                关联使用
              </button>
            </div>
          </div>

          <div
            v-if="detailTab === 'STRUCTURED'"
            class="loadout-structured"
            role="tabpanel"
            id="task-panel"
            :aria-labelledby="`task-tab-${detailTab}`"
            tabindex="0"
          >
            <dl class="loadout-limits">
              <div>
                <dt>注入字符上限</dt>
                <dd>{{ detail.loadout.limits.maxInjectedCharacters }}</dd>
              </div>
              <div>
                <dt>资产数量上限</dt>
                <dd>{{ detail.loadout.limits.maxAssets }}</dd>
              </div>
            </dl>
            <div
              v-if="detail.loadout.assets.length === 0"
              class="state-panel compact"
            >
              <strong>本次装载为空</strong>
              <p>已保存的装载中没有资产。</p>
            </div>
            <ol
              v-else
              class="loadout-sequence"
              aria-label="按保存顺序排列的资产"
            >
              <li
                v-for="(asset, index) in detail.loadout.assets"
                :key="`${asset.assetId}:${index}`"
              >
                <span class="sequence-number" aria-hidden="true">{{
                  sequenceNumber(index)
                }}</span>
                <div class="sequence-body">
                  <div class="sequence-heading">
                    <code>{{ asset.assetId }}</code
                    ><span class="status-label">{{
                      displayValue(asset.mode)
                    }}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>装载原因</dt>
                      <dd>
                        <code>{{ asset.reason }}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>预估字符数</dt>
                      <dd>{{ asset.estimatedCharacters }}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            </ol>
          </div>
          <pre
            v-else-if="detailTab === 'RAW'"
            class="source-view"
            role="tabpanel"
            id="task-panel"
            :aria-labelledby="`task-tab-${detailTab}`"
            tabindex="0"
            >{{ rawLoadout }}</pre
          >
          <div
            v-else
            role="tabpanel"
            id="task-panel"
            :aria-labelledby="`task-tab-${detailTab}`"
            tabindex="0"
          >
            <div v-if="detail.usages.length === 0" class="state-panel compact">
              <strong>暂无关联使用</strong>
              <p>该任务暂无使用记录。</p>
            </div>
            <div v-else class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>使用记录 ID</th>
                    <th>资产 ID</th>
                    <th>召回</th>
                    <th>读取</th>
                    <th>已使用</th>
                    <th>资产状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="usage in detail.usages" :key="usage.usageId">
                    <td>
                      <code>{{ usage.usageId }}</code>
                    </td>
                    <td>
                      <code>{{ usage.assetId }}</code>
                    </td>
                    <td>{{ usage.recallCount }}</td>
                    <td>{{ usage.readCount }}</td>
                    <td>{{ usage.usedFlag ? "已使用" : "未使用" }}</td>
                    <td>
                      <span v-if="usage.assetMissing" class="missing-label"
                        >资产已缺失</span
                      ><span v-else>可用</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </article>
      <div v-else class="state-panel detail-state">
        <strong>选择一个任务</strong>
        <p>查看该任务已保存的知识装载与实际使用记录。</p>
      </div>
    </section>
  </main>
</template>
