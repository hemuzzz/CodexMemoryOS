<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client.js";
import type { UsageListFilters, UsageListItem } from "../api/types.js";
import {
  asHubApiError,
  displayWorkspace,
  formatDate,
  presentReadError,
} from "./view-helpers.js";

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

let request = 0;
let controller: AbortController | undefined;

const errorCopy = computed(() => presentReadError(error.value, "USAGE_LIST"));
const workspaceSuggestions = computed(() =>
  [
    ...new Set(
      usages.value.flatMap((usage) =>
        usage.workspace === null ? [] : [usage.workspace],
      ),
    ),
  ].sort((left, right) => left.localeCompare(right)),
);
const appliedSummary = computed(() => {
  const values: string[] = [];
  if (appliedFilters.value.taskId !== undefined) {
    values.push(`任务 ${appliedFilters.value.taskId}`);
  }
  if (appliedFilters.value.assetId !== undefined) {
    values.push(`资产 ${appliedFilters.value.assetId}`);
  }
  if (Object.hasOwn(appliedFilters.value, "workspace")) {
    values.push(
      appliedFilters.value.workspace === null
        ? "未绑定工作区"
        : `工作区 ${appliedFilters.value.workspace}`,
    );
  }
  return values.length === 0 ? "全部使用记录" : values.join(" · ");
});

onMounted(() => void loadUsages({ limit: 20 }));
onBeforeUnmount(() => controller?.abort());

function setWorkspaceMode(mode: WorkspaceMode): void {
  workspaceMode.value = mode;
}

function validateOptionalExact(value: string, label: string): boolean {
  if (value.length > 0 && value !== value.trim()) {
    filterError.value = `${label}首尾不能包含空格。`;
    return false;
  }
  return true;
}

function currentFilters(): UsageListFilters | undefined {
  if (
    !validateOptionalExact(filters.taskId, "任务 ID") ||
    !validateOptionalExact(filters.assetId, "资产 ID")
  ) {
    return undefined;
  }
  if (workspaceMode.value === "NAMED") {
    if (filters.workspace.length === 0) {
      filterError.value = "请输入准确的工作区名称。";
      return undefined;
    }
    if (!validateOptionalExact(filters.workspace, "工作区名称")) {
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
  } catch (caught) {
    if (requestId !== request || isAbortError(caught)) {
      return;
    }
    usages.value = [];
    error.value = asHubApiError(caught);
  } finally {
    if (requestId === request) {
      loading.value = false;
    }
  }
}
import PageHeader from "../components/PageHeader.vue";
import FilterMenu from "../components/FilterMenu.vue";
import FilterOptions from "../components/FilterOptions.vue";
import UiIcon from "../components/UiIcon.vue";
function chooseWorkspace(mode: WorkspaceMode) {
  setWorkspaceMode(mode);
  if (mode !== "NAMED") applyFilters();
}
function chooseLimit(value: number) {
  filters.limit = value as 20 | 50 | 100;
  applyFilters();
}
</script>

<template>
  <main class="list-page">
    <PageHeader title="使用记录" subtitle="召回、读取与实际使用">
      <FilterMenu
        label="筛选"
        :count="
          Number(!!appliedFilters.taskId) +
          Number(!!appliedFilters.assetId) +
          Number(appliedFilters.workspace !== undefined)
        "
      >
        <form
          class="menu-input usage-id-filters"
          aria-label="筛选使用记录"
          @submit.prevent="applyFilters"
        >
          <label
            >任务 ID<input
              v-model="filters.taskId"
              autocomplete="off"
              placeholder="输入完整 tsk… ID" /></label
          ><label
            >资产 ID<input
              v-model="filters.assetId"
              autocomplete="off"
              placeholder="输入完整 ast… ID" /></label
          ><button type="submit" class="quiet-button">应用 ID</button>
        </form>
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
              list="usage-workspace-suggestions"
              autocomplete="off" /></label
          ><datalist id="usage-workspace-suggestions">
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
      <button type="button" class="quiet-button" @click="refreshUsages">
        <UiIcon name="refresh" />刷新记录
      </button>
    </PageHeader>
    <section class="list-scroll" aria-label="使用记录">
      <p class="result-count">{{ appliedSummary }}</p>
      <div
        v-if="loading"
        class="state-panel compact"
        role="status"
        aria-live="polite"
      >
        <span class="loading-line" aria-hidden="true"></span>
        <p>正在读取使用记录…</p>
      </div>
      <div
        v-else-if="error && errorCopy"
        class="state-panel compact error-state"
        role="alert"
      >
        <strong>{{ errorCopy.title }}</strong>
        <p>{{ errorCopy.detail }}</p>
        <button type="button" class="secondary-button" @click="refreshUsages">
          重试
        </button>
      </div>
      <div v-else-if="usages.length === 0" class="state-panel compact">
        <strong>暂无使用记录</strong>
        <p>调整任务、资产或工作区筛选后重试。</p>
      </div>
      <div v-else class="table-scroll">
        <table class="usage-table" aria-label="使用记录结果">
          <thead>
            <tr>
              <th>任务 ID</th>
              <th>资产 ID</th>
              <th>工作区</th>
              <th>召回</th>
              <th>读取</th>
              <th>实际使用</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="usage in usages" :key="usage.usageId">
              <td>
                <code :title="usage.taskId">{{ usage.taskId }}</code>
              </td>
              <td>
                <code :title="usage.assetId">{{ usage.assetId }}</code
                ><small :class="{ 'missing-label': usage.assetMissing }">{{
                  usage.assetMissing ? "资产已缺失" : "资产可用"
                }}</small>
              </td>
              <td>{{ displayWorkspace(usage.workspace) }}</td>
              <td>{{ usage.recallCount }}</td>
              <td>{{ usage.readCount }}</td>
              <td>{{ usage.usedFlag ? "已使用" : "未使用" }}</td>
              <td>
                <time :datetime="usage.updatedAt">{{
                  formatDate(usage.updatedAt)
                }}</time>
                <details class="record-info">
                  <summary>记录信息</summary>
                  <code>{{ usage.usageId }}</code
                  ><span>创建时间 {{ formatDate(usage.createdAt) }}</span>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
