<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, ref } from "vue";
import { HubApiClient, isAbortError } from "../api/client.js";
import type { OverviewDto, OverviewScope } from "../api/types.js";
import PageHeader from "../components/PageHeader.vue";
import UiIcon from "../components/UiIcon.vue";
import { navigate } from "../navigation.js";
import { formatDate } from "./view-helpers.js";

const api = new HubApiClient();
const data = ref<OverviewDto>();
const selected = ref("all");
const loading = ref(false);
const error = ref("");
let controller: AbortController | undefined;
let request = 0;
const key = (workspace: string | null) => JSON.stringify(workspace);
const chosen = computed(() => data.value?.scopes.filter(s => selected.value === "all" || key(s.workspace) === selected.value) ?? []);
const totals = computed(() => chosen.value.reduce((sum, scope) => {
  for (const type of ["MEMORY", "DOCUMENT", "SKILL"] as const) sum.assets[type] += scope.assets[type];
  for (const status of ["RUNNING", "COMPLETED", "CANCELLED"] as const) sum.tasks[status] += scope.tasks[status];
  for (const field of ["recallCount", "readCount", "usedPairCount", "usedTaskCount"] as const) sum.usage[field] += scope.usage[field];
  sum.inboxCount += scope.inboxCount;
  return sum;
}, { workspace: null, assets: { MEMORY: 0, DOCUMENT: 0, SKILL: 0 }, inboxCount: 0,
  tasks: { RUNNING: 0, COMPLETED: 0, CANCELLED: 0 },
  usage: { recallCount: 0, readCount: 0, usedPairCount: 0, usedTaskCount: 0 } } as OverviewScope));
const assetCount = (scope: OverviewScope) => Object.values(scope.assets).reduce((a, b) => a + b, 0);
const number = (value: number) => value.toLocaleString("zh-CN");
const taskCount = computed(() => Object.values(totals.value.tasks).reduce((a, b) => a + b, 0));
const distribution = computed(() => [...chosen.value].sort((a, b) => assetCount(b) - assetCount(a)));
const maxAssets = computed(() => Math.max(1, ...distribution.value.map(assetCount)));
const assetTypes = [{ type: "MEMORY", label: "记忆", icon: "memory" }, { type: "DOCUMENT", label: "文档", icon: "document" }, { type: "SKILL", label: "技能", icon: "code" }] as const;
const taskStatuses = [{ status: "RUNNING", label: "进行中" }, { status: "COMPLETED", label: "已完成" }, { status: "CANCELLED", label: "已取消" }] as const;

async function refresh() {
  const id = ++request;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = "";
  try {
    const result = await api.getOverview(controller.signal);
    if (id !== request) return;
    data.value = result;
    if (selected.value !== "all" && !result.scopes.some(s => key(s.workspace) === selected.value)) selected.value = "all";
  } catch (caught) {
    if (id !== request || isAbortError(caught)) return;
    data.value = undefined;
    error.value = caught instanceof Error ? caught.message : "暂时无法读取统计数据";
  } finally {
    if (id === request) loading.value = false;
  }
}
function openAssets(type?: string, workspaceKey = selected.value) {
  const filters: Record<string, string> = {};
  if (type) filters.type = type;
  if (workspaceKey !== "all") {
    const workspace = JSON.parse(workspaceKey) as string | null;
    filters.workspace = workspace ?? "null";
    filters.scope = workspace === null ? "GLOBAL" : "WORKSPACE";
  }
  navigate("library", undefined, false, filters);
}
function openTasks(status?: string) {
  const filters: Record<string, string> = {};
  if (status) filters.status = status;
  if (selected.value !== "all") filters.workspace = (JSON.parse(selected.value) as string | null) ?? "null";
  navigate("tasks", undefined, false, filters);
}
onActivated(() => void refresh());
onBeforeUnmount(() => { request++; controller?.abort(); });
</script>

<template>
  <main class="list-page overview-page">
    <PageHeader title="总览" subtitle="知识积累与使用情况">
      <label class="overview-scope"><span class="sr-only">统计范围</span>
        <select v-model="selected" aria-label="统计范围">
          <option value="all">全部范围</option>
          <option v-for="scope in data?.scopes" :key="key(scope.workspace)" :value="key(scope.workspace)">{{ scope.workspace ?? '全局 / 未绑定工作区' }}</option>
        </select>
      </label>
      <button type="button" class="quiet-button" :disabled="loading" @click="refresh"><UiIcon name="refresh" />刷新</button>
    </PageHeader>
    <div class="list-scroll overview-content" :aria-busy="loading">
      <div v-if="loading" class="state-panel compact" role="status"><span class="loading-line" aria-hidden="true"></span><p>正在统计知识与任务…</p></div>
      <div v-else-if="error" class="state-panel compact error-state" role="alert"><strong>统计暂不可用</strong><p>{{ error }}</p><button class="secondary-button" type="button" @click="refresh">重试</button></div>
      <template v-else-if="data">
        <div class="overview-intro"><div><h2>你的知识，一目了然</h2><p>当前存量与累计使用 · {{ selected === 'all' ? '全部范围' : '所选范围' }}</p></div><span class="overview-local">本地知识库</span></div>
        <section class="overview-metrics" aria-label="核心数量">
          <button class="overview-stat" type="button" @click="openAssets()"><span><UiIcon name="library" />正式资产</span><strong>{{ number(assetCount(totals)) }}</strong><small>已入库的记忆、文档与技能 <span>↗</span></small></button>
          <button class="overview-stat" type="button" @click="navigate('inbox')"><span><UiIcon name="inbox" />待确认候选</span><strong>{{ number(totals.inboxCount) }}</strong><small>查看全部收件箱 <span>↗</span></small></button>
          <button class="overview-stat" type="button" @click="openTasks()"><span><UiIcon name="layers" />任务总数</span><strong>{{ number(taskCount) }}</strong><small>{{ number(totals.tasks.RUNNING) }} 个进行中 <span>↗</span></small></button>
          <button class="overview-stat" type="button" @click="navigate('usage')"><span><UiIcon name="activity" />使用过知识的任务</span><strong>{{ number(totals.usage.usedTaskCount) }}</strong><small>查看全部使用记录 <span>↗</span></small></button>
        </section>
        <div class="overview-columns">
          <section class="overview-section" aria-labelledby="asset-types"><div class="overview-section-title"><h3 id="asset-types">知识构成</h3><span>{{ number(assetCount(totals)) }} 项资产</span></div>
            <button v-for="item in assetTypes" :key="item.type" class="overview-bar-row" type="button" @click="openAssets(item.type)">
              <span class="overview-bar-label"><UiIcon :name="item.icon" />{{ item.label }}<small>{{ item.type }}</small><strong>{{ number(totals.assets[item.type]) }}</strong></span>
              <span class="overview-track"><span :style="{ width: `${totals.assets[item.type] / Math.max(1, assetCount(totals)) * 100}%` }"></span></span>
            </button>
          </section>
          <section class="overview-section" aria-labelledby="task-statuses"><div class="overview-section-title"><h3 id="task-statuses">任务状态</h3><span>{{ number(taskCount) }} 个任务</span></div>
            <button v-for="item in taskStatuses" :key="item.status" class="overview-status-row" type="button" @click="openTasks(item.status)"><span class="overview-status-dot" :class="item.status.toLowerCase()"></span><span>{{ item.label }}</span><strong>{{ number(totals.tasks[item.status]) }}</strong><span class="overview-percent">{{ taskCount ? Math.round(totals.tasks[item.status] / taskCount * 100) : 0 }}%</span></button>
          </section>
        </div>
        <div class="overview-columns">
          <section class="overview-section" aria-labelledby="usage-summary"><div class="overview-section-title"><h3 id="usage-summary">知识使用</h3><span>累计统计</span></div>
            <dl class="overview-usage"><div><dt>召回次数</dt><dd>{{ number(totals.usage.recallCount) }}</dd></div><div><dt>读取次数</dt><dd>{{ number(totals.usage.readCount) }}</dd></div><div><dt>确认使用</dt><dd>{{ number(totals.usage.usedPairCount) }}</dd></div></dl>
            <p class="overview-note">确认使用按任务与资产去重；召回、读取分别累计。</p>
          </section>
          <section class="overview-section" aria-labelledby="workspace-distribution"><div class="overview-section-title"><h3 id="workspace-distribution">资产分布</h3><span>按归属范围</span></div>
            <p v-if="!distribution.length" class="overview-note">暂无资产与任务，后续数据会显示在这里。</p>
            <button v-for="scope in distribution" :key="key(scope.workspace)" class="overview-bar-row workspace-bar" type="button" @click="openAssets(undefined, key(scope.workspace))"><span class="overview-bar-label"><span>{{ scope.workspace ?? '全局知识' }}</span><strong>{{ number(assetCount(scope)) }}</strong></span><span class="overview-track"><span :style="{ width: `${assetCount(scope) / maxAssets * 100}%` }"></span></span></button>
          </section>
        </div>
        <footer class="overview-footer"><span>更新于 {{ formatDate(data.generatedAt) }}</span><button type="button" class="quiet-button" @click="navigate('status')"><UiIcon :name="data.diagnosticCount ? 'warning' : 'settings'" />{{ data.diagnosticCount ? `${data.diagnosticCount} 项扫描诊断` : '查看系统状态' }}</button></footer>
      </template>
    </div>
  </main>
</template>
