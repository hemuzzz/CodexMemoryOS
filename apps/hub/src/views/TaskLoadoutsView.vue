<script setup lang="ts">
import { displayValue, handleTabKeydown } from "./view-helpers.js";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";

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

import { navigate, useRoute } from "../navigation.js";
import PageHeader from "../components/PageHeader.vue";
import FilterMenu from "../components/FilterMenu.vue";
import FilterOptions from "../components/FilterOptions.vue";
import PreviewDialog from "../components/PreviewDialog.vue";
import UiIcon from "../components/UiIcon.vue";
const route = useRoute();
function closePreview() {
  navigate("tasks", undefined, false, Object.fromEntries(new URLSearchParams(route.value.query)));
}
function openTask(id: string) {
  navigate("tasks", id, false, Object.fromEntries(new URLSearchParams(route.value.query)));
}
function chooseWorkspace(mode: WorkspaceMode) {
  setWorkspaceMode(mode);
  if (mode !== "NAMED") applyFilters();
}
function chooseStatus(value: "" | TaskStatus) {
  filters.status = value;
  applyFilters();
}
function chooseLimit(value: number) {
  filters.limit = value as 20 | 50 | 100;
  applyFilters();
}
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

watch(
  () => route.value,
  (current) => {
    if (current.page === "tasks" && current.id) selectTask(current.id);
    else {
      selectedTaskId.value = undefined;
      clearDetail();
    }
  },
  { immediate: true },
);
watch(() => route.value, (current, previous) => {
  if (current.page !== "tasks" || current.id) return;
  if (!previous || current.query !== previous.query || (current.page !== previous.page && (current.query || previous.page === "overview"))) {
    const query = new URLSearchParams(current.query);
    const status = query.get("status");
    filters.status = status === "RUNNING" || status === "COMPLETED" || status === "CANCELLED" ? status : "";
    const workspace = query.get("workspace");
    workspaceMode.value = workspace === null ? "ALL" : workspace === "null" ? "NULL" : "NAMED";
    filters.workspace = workspace && workspace !== "null" ? workspace : "";
    applyFilters();
  }
}, { immediate: true });
onMounted(() => { if (route.value.id) void loadTasks({ limit: 20 }); });
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
  if (
    selectedTaskId.value === taskId &&
    (detail.value !== undefined || detailLoading.value)
  ) {
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
    closePreview();
    refreshTasks();
  } else if (selectedTaskId.value !== undefined) {
    void loadDetail(selectedTaskId.value);
  }
}

function sequenceNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function taskTitle(request: string): string {
  // Attachment wrappers include a separate user-request heading. Prefer that
  // section for the preview while keeping the stored request intact.
  const requestHeading = /(?:^|\r\n|\n|\r)#{1,6}\s+My request:[ \t]*(?:\r\n|\n|\r)/u.exec(request);
  const source = requestHeading
    ? request.slice(requestHeading.index + requestHeading[0].length)
    : request;
  const firstLine = source.split(/\r\n|\n|\r/u).find((line) => line.trim());
  const title = (firstLine ?? "").replace(/^\s{0,3}#{1,6}\s+/u, "").trim();
  const characters = Array.from(title || "未命名任务");
  return characters.length > 72
    ? `${characters.slice(0, 72).join("")}…`
    : characters.join("");
}
</script>

<template>
  <main class="list-page">
    <PageHeader title="任务" subtitle="选择任务，查看知识装载与使用情况">
      <FilterMenu
        label="筛选"
        :count="
          Number(!!appliedFilters.status) +
          Number(appliedFilters.workspace !== undefined)
        "
      >
        <FilterOptions
          label="任务状态"
          :model-value="filters.status"
          :options="[
            { value: '', label: '全部状态' },
            { value: 'RUNNING', label: '进行中' },
            { value: 'COMPLETED', label: '已完成' },
            { value: 'CANCELLED', label: '已取消' },
          ]"
          @update:model-value="chooseStatus"
        />
        <FilterOptions
          label="任务工作区"
          :model-value="workspaceMode"
          :options="[
            { value: 'ALL', label: '全部' },
            { value: 'NULL', label: '未绑定' },
            { value: 'NAMED', label: '指定工作区' },
          ]"
          @update:model-value="chooseWorkspace"
        />
        <form
          v-if="workspaceMode === 'NAMED'"
          class="menu-input exact-workspace"
          @submit.prevent="applyFilters"
        >
          <label
            >工作区名称<input
              v-model="filters.workspace"
              list="task-workspace-suggestions"
              autocomplete="off" /></label
          ><datalist id="task-workspace-suggestions">
            <option
              v-for="workspace in workspaceSuggestions"
              :key="workspace"
              :value="workspace"
            /></datalist
          ><button type="submit" class="quiet-button">应用工作区</button>
        </form>
        <p v-if="filterError" class="field-error" role="alert">
          {{ filterError }}
        </p>
        <button type="button" class="menu-reset" @click="resetFilters">
          清除筛选
        </button>
      </FilterMenu>
      <FilterMenu label="显示" icon="settings"
        ><FilterOptions
          label="显示条数"
          :model-value="filters.limit"
          :options="[
            { value: 20, label: '20 条' },
            { value: 50, label: '50 条' },
            { value: 100, label: '100 条' },
          ]"
          @update:model-value="chooseLimit"
      /></FilterMenu>
      <button type="button" class="quiet-button" @click="refreshTasks">
        <UiIcon name="refresh" />刷新
      </button>
    </PageHeader>
    <section class="list-scroll" aria-label="任务列表">
      <div
        v-if="listLoading"
        class="state-panel compact"
        role="status"
        aria-live="polite"
      >
        <span class="loading-line" aria-hidden="true"></span>
        <p>正在读取任务…</p>
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
        <strong>暂无任务</strong>
        <p>调整筛选条件或刷新列表。</p>
      </div>
      <ol v-else class="asset-list task-list" aria-label="任务结果">
        <li v-for="task in tasks" :key="task.taskId">
          <button
            type="button"
            class="asset-row task-row"
            :title="task.taskId"
            @click="openTask(task.taskId)"
          >
            <UiIcon name="layers" /><span class="row-title">{{
              taskTitle(task.request)
            }}</span
            ><span class="row-scope">{{
              displayWorkspace(task.workspace)
            }}</span
            ><time class="row-date" :datetime="task.updatedAt" :title="`更新时间：${formatDate(task.updatedAt)}`">{{
              formatDate(task.updatedAt)
            }}</time>
          </button>
        </li>
      </ol>
    </section>
    <PreviewDialog
      v-if="route.page === 'tasks' && route.id"
      label="任务详情"
      :expanded="route.expanded"
      @close="closePreview"
      @expand="navigate('tasks', route.id, !route.expanded)"
    >
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
          <h2>{{ taskTitle(detail.request) }}</h2>
          <p class="mono task-detail-id">{{ detail.taskId }}</p>
          <details class="task-request">
            <summary>原始请求</summary>
            <pre>{{ detail.request }}</pre>
          </details>
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
            <dt>状态说明</dt>
            <dd>任务状态由显式操作更新；“进行中”表示尚未显式结束，不代表 Codex 此刻正在执行。</dd>
          </div>
        </dl>

        <section
          class="content-section"
          aria-labelledby="task-loadout-content-heading"
        >
          <div class="section-heading content-heading-row">
            <div>
              <h3 id="task-loadout-content-heading">{{ detailTab === 'USAGE' ? '知识使用' : '知识装载' }}</h3>
            </div>
            <div
              class="content-tabs"
              role="tablist"
              @keydown="handleTabKeydown"
              aria-label="任务知识详情"
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
                知识装载
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
                知识使用
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
            <details class="task-loadout-options">
              <summary>装载信息与限制 · {{ detail.loadout.assets.length }} 条知识</summary>
              <dl class="loadout-limits">
                <div>
                  <dt>注入字符上限</dt>
                  <dd>{{ detail.loadout.limits.maxInjectedCharacters }}</dd>
                </div>
                <div>
                  <dt>资产数量上限</dt>
                  <dd>{{ detail.loadout.limits.maxAssets }}</dd>
                </div>
                <div>
                  <dt>数据格式版本</dt>
                  <dd>{{ detail.loadout.schemaVersion }}</dd>
                </div>
              </dl>
            </details>
            <div
              v-if="detail.loadout.assets.length === 0"
              class="state-panel compact"
            >
              <strong>暂无已保存的知识装载</strong>
              <p>可在“知识使用”中查看搜索、读取和实际使用记录。</p>
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
              <strong>暂无知识使用记录</strong>
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
    </PreviewDialog>
  </main>
</template>
