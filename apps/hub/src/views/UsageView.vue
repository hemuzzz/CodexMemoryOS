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
</script>

<template>
  <main class="report-workbench" aria-labelledby="usage-view-heading">
    <header class="report-header">
      <div>
        <p class="eyebrow">知识使用情况</p>
        <h2 id="usage-view-heading">使用记录</h2>
      </div>
      <button type="button" class="secondary-button" @click="refreshUsages">
        刷新记录
      </button>
    </header>
    <p class="supporting-copy report-intro">
      分别展示知识的召回次数、读取次数与实际使用情况。
    </p>

    <form
      class="filter-panel report-filters"
      aria-label="筛选使用记录"
      @submit.prevent="applyFilters"
    >
      <div class="filter-row usage-id-filters">
        <label
          ><span>任务 ID</span
          ><input
            v-model="filters.taskId"
            autocomplete="off"
            placeholder="输入完整 tsk… ID"
        /></label>
        <label
          ><span>资产 ID</span
          ><input
            v-model="filters.assetId"
            autocomplete="off"
            placeholder="输入完整 ast… ID"
        /></label>
        <label
          ><span>显示条数</span
          ><select v-model="filters.limit">
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select></label
        >
      </div>
      <fieldset class="workspace-filter usage-workspace-filter">
        <legend>任务工作区</legend>
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
            list="usage-workspace-suggestions"
            autocomplete="off"
          />
          <datalist id="usage-workspace-suggestions">
            <option
              v-for="workspace in workspaceSuggestions"
              :key="workspace"
              :value="workspace"
            />
          </datalist>
          <small>建议名称来自当前结果。</small>
        </label>
      </fieldset>
      <p v-if="filterError" class="field-error" role="alert">
        {{ filterError }}
      </p>
      <div class="filter-actions">
        <button type="submit" class="primary-button">应用筛选</button
        ><button type="button" class="quiet-button" @click="resetFilters">
          重置
        </button>
      </div>
    </form>

    <div class="ledger-heading">
      <div>
        <p class="eyebrow">当前筛选</p>
        <h3>{{ appliedSummary }}</h3>
      </div>
      <span v-if="!loading && !error" aria-live="polite"
        >{{ usages.length }} 条 · 当前返回结果</span
      >
    </div>
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
    <ol v-else class="usage-ledger" aria-label="使用记录结果">
      <li
        v-for="usage in usages"
        :key="usage.usageId"
        :class="{ missing: usage.assetMissing }"
      >
        <div class="usage-record-heading">
          <div>
            <span class="tag">使用记录</span><code>{{ usage.usageId }}</code>
          </div>
          <span v-if="usage.assetMissing" class="missing-label">资产已缺失</span
          ><span v-else class="available-label">资产可用</span>
        </div>
        <dl class="usage-facts">
          <div class="wide-fact">
            <dt>任务 ID</dt>
            <dd>
              <code>{{ usage.taskId }}</code>
            </dd>
          </div>
          <div class="wide-fact">
            <dt>资产 ID</dt>
            <dd>
              <code>{{ usage.assetId }}</code>
            </dd>
          </div>
          <div>
            <dt>工作区</dt>
            <dd>{{ displayWorkspace(usage.workspace) }}</dd>
          </div>
          <div>
            <dt>召回</dt>
            <dd>{{ usage.recallCount }}</dd>
          </div>
          <div>
            <dt>读取</dt>
            <dd>{{ usage.readCount }}</dd>
          </div>
          <div>
            <dt>实际使用</dt>
            <dd>{{ usage.usedFlag ? "已使用" : "未使用" }}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>
              <time :datetime="usage.createdAt">{{
                formatDate(usage.createdAt)
              }}</time>
            </dd>
          </div>
          <div>
            <dt>更新时间</dt>
            <dd>
              <time :datetime="usage.updatedAt">{{
                formatDate(usage.updatedAt)
              }}</time>
            </dd>
          </div>
        </dl>
      </li>
    </ol>
  </main>
</template>
