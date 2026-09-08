<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client.js";
import type {
  AssetDetail,
  AssetLibraryItem,
  AssetListFilters,
  AssetScope,
  AssetType,
  InboxDiagnostic,
  InboxItem,
} from "../api/types.js";
import UiIcon from "../components/UiIcon.vue";
import type { PresentedError } from "./view-helpers.js";
import {
  asHubApiError,
  displayValue,
  formatDate,
  handleTabKeydown,
} from "./view-helpers.js";
import { navigate, useRoute } from "../navigation.js";
import PageHeader from "../components/PageHeader.vue";
import FilterMenu from "../components/FilterMenu.vue";
import FilterOptions from "../components/FilterOptions.vue";
import PreviewDialog from "../components/PreviewDialog.vue";

type DetailTab = "RENDERED" | "RAW" | "FRONTMATTER";
type InboxDetailTab = "RAW" | "FRONTMATTER";
type WorkspaceMode = "ALL" | "GLOBAL" | "NAMED";
type ViewContext = "ASSET_LIST" | "ASSET_DETAIL" | "INBOX";

const api = new HubApiClient();
const route = useRoute();
const activeView = computed(() =>
  route.value.page === "inbox" ? "INBOX" : "LIBRARY",
);
const searchMode = computed(() => route.value.page === "search");
const previewOpen = computed(
  () =>
    ["library", "search", "inbox"].includes(route.value.page) &&
    !!route.value.id,
);
const appliedFilters = ref<AssetListFilters>({ limit: 20 });
const filterCount = computed(
  () =>
    Number(!!appliedFilters.value.type) +
    Number(!!appliedFilters.value.scope) +
    Number(appliedFilters.value.workspace !== undefined),
);
function closePreview() {
  navigate(route.value.page, undefined, false, Object.fromEntries(new URLSearchParams(route.value.query)));
}
function expandPreview() {
  navigate(route.value.page, route.value.id, !route.value.expanded, Object.fromEntries(new URLSearchParams(route.value.query)));
}
function openAsset(assetId: string) {
  navigate(route.value.page, assetId, false, Object.fromEntries(new URLSearchParams(route.value.query)));
}
function openInbox(item: InboxItem) {
  navigate("inbox", item.assetId);
}
function openDiagnostic(index: number) {
  navigate("inbox", `diagnostic-${index}`);
}

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
  [
    ...new Set(
      assets.value.flatMap((asset) =>
        asset.workspace === null ? [] : [asset.workspace],
      ),
    ),
  ].sort((left, right) => left.localeCompare(right)),
);
const listErrorCopy = computed(() =>
  presentError(assetsError.value, "ASSET_LIST"),
);
const detailErrorCopy = computed(() =>
  presentError(detailError.value, "ASSET_DETAIL"),
);
const inboxErrorCopy = computed(() => presentError(inboxError.value, "INBOX"));

const searchInput = ref<HTMLInputElement>();
onBeforeUnmount(() => {
  assetListController?.abort();
  assetDetailController?.abort();
  inboxController?.abort();
});
watch(
  () => route.value,
  (current, previous) => {
    if (!["library", "search"].includes(current.page) || !current.id) {
      selectedAssetId.value = undefined;
      assetDetailRequest++;
      assetDetailController?.abort();
      assetDetail.value = undefined;
      detailError.value = undefined;
      detailLoading.value = false;
    }
    if (current.page === "inbox") {
      if (previous?.page !== "inbox") void loadInbox();
      syncInboxSelection();
    } else if (["library", "search"].includes(current.page)) {
      if (current.id) selectAsset(current.id);
      if (current.page === "library" && !current.id && (current.query !== (previous?.query ?? "") || (current.page !== previous?.page && (current.query || previous?.page === "overview")))) {
        const query = new URLSearchParams(current.query);
        const type = query.get("type");
        filters.type = type === "MEMORY" || type === "DOCUMENT" || type === "SKILL" ? type : "";
        const workspace = query.get("workspace");
        workspaceMode.value = workspace === null ? "ALL" : workspace === "null" ? "GLOBAL" : "NAMED";
        filters.workspace = workspace && workspace !== "null" ? workspace : "";
        filters.scope = workspace === null ? "" : workspace === "null" ? "GLOBAL" : "WORKSPACE";
        filters.query = "";
        applyFilters();
        return;
      }


      if (current.page === "search" && previous?.page !== "search")
        void nextTick(() => searchInput.value?.focus());
      if (
        current.page === "library" &&
        (filters.query || appliedFilters.value.query)
      ) {
        resetFilters();
      } else if (!previous || previous.page === "inbox") {
        void loadAssets(appliedFilters.value);
      }
    }
  },
  { immediate: true },
);
function syncInboxSelection() {
  selectedInboxItem.value = undefined;
  selectedInboxDiagnostic.value = undefined;
  const id = route.value.page === "inbox" ? route.value.id : undefined;
  if (!id) return;
  const item = inboxItems.value.find((item) => item.assetId === id);
  if (item) selectInboxItem(item);
  else if (/^diagnostic-\d+$/.test(id)) {
    const diagnostic = inboxDiagnostics.value[Number(id.slice(11))];
    if (diagnostic) selectInboxDiagnostic(diagnostic);
  }
}
function chooseWorkspace(mode: WorkspaceMode) {
  setWorkspaceMode(mode);
  if (mode !== "NAMED") applyFilters();
}
function chooseScope(value: "" | AssetScope) {
  filters.scope = value;
  reconcileScope();
  applyFilters();
}
function chooseType(value: "" | AssetType) {
  filters.type = value;
  applyFilters();
}
function chooseLimit(value: number) {
  filters.limit = value as 20 | 50 | 100;
  applyFilters();
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
  appliedFilters.value = nextFilters;
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
  appliedFilters.value = { limit: 20 };
  filterError.value = "";
  void loadAssets({ limit: 20 });
}

function currentFilters(): AssetListFilters | undefined {
  if (filters.query.length > 0 && filters.query.trim().length === 0) {
    filterError.value = "请输入有效的搜索关键词。";
    return undefined;
  }
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
    const result = await api.listAssets(
      requestFilters,
      assetListController.signal,
    );
    if (requestId !== assetListRequest) {
      return;
    }
    assets.value = result.items;
  } catch (error) {
    if (requestId !== assetListRequest || isAbortError(error)) {
      return;
    }
    assets.value = [];
    assetsError.value = asHubApiError(error);
  } finally {
    if (requestId === assetListRequest) {
      assetsLoading.value = false;
    }
  }
}

function selectAsset(assetId: string): void {
  if (
    selectedAssetId.value === assetId &&
    (assetDetail.value !== undefined || detailLoading.value)
  ) {
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
    closePreview();
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
    syncInboxSelection();
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

function frontmatterText(frontmatter: object): string {
  return JSON.stringify(frontmatter, null, 2);
}

function presentError(
  error: HubApiError | undefined,
  context: ViewContext,
): PresentedError | undefined {
  if (error === undefined) {
    return undefined;
  }
  if (error.code === "SERVICE_UNREACHABLE") {
    return {
      title: "本地服务未连接",
      detail: "启动 CodexMemoryOS 服务后重试。",
    };
  }
  if (error.code === "INVALID_RESPONSE") {
    return {
      title: "无法读取服务响应",
      detail: "服务返回了无法识别的响应，请检查服务后重试。",
    };
  }
  if (context === "ASSET_DETAIL" && error.status === 404) {
    return {
      title: "知识资产已不存在",
      detail: "刷新资产列表以获取当前内容。",
    };
  }
  if (context === "ASSET_DETAIL" && error.code === "ASSET_STALE") {
    return {
      title: "知识文件已更新",
      detail: "索引已刷新，重试即可读取最新内容。",
    };
  }
  if (error.status === 503) {
    return {
      title: context === "INBOX" ? "收件箱暂时不可用" : "知识服务暂时不可用",
      detail: "本地索引或工作区配置尚未就绪，请恢复后重试。",
    };
  }
  if (error.status >= 500) {
    return { title: "本地服务未能完成请求", detail: "请检查服务日志后重试。" };
  }
  return { title: "请求未完成", detail: error.message };
}
</script>

<template>
  <main class="list-page">
    <PageHeader
      :title="
        activeView === 'INBOX' ? '收件箱' : searchMode ? '搜索知识' : '知识资产'
      "
      :subtitle="
        activeView === 'INBOX'
          ? '待确认候选与文件诊断'
          : searchMode
            ? '搜索标题、摘要或正文'
            : '全部知识资产'
      "
    >
      <template v-if="activeView === 'LIBRARY'">
        <FilterMenu label="筛选" :count="filterCount">
          <FilterOptions
            label="类型"
            :model-value="filters.type"
            :options="[
              { value: '', label: '全部类型' },
              { value: 'MEMORY', label: '工程记忆' },
              { value: 'DOCUMENT', label: '文档' },
              { value: 'SKILL', label: '技能' },
            ]"
            @update:model-value="chooseType"
          />
          <FilterOptions
            label="范围"
            :model-value="filters.scope"
            :options="[
              { value: '', label: '全部范围' },
              { value: 'GLOBAL', label: '全局知识' },
              { value: 'WORKSPACE', label: '工作区' },
            ]"
            @update:model-value="chooseScope"
          />
          <FilterOptions
            label="工作区"
            :model-value="workspaceMode"
            :options="[
              { value: 'ALL', label: '全部' },
              { value: 'GLOBAL', label: '仅全局' },
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
                list="workspace-suggestions"
                autocomplete="off"
            /></label>
            <datalist id="workspace-suggestions">
              <option
                v-for="workspace in workspaceSuggestions"
                :key="workspace"
                :value="workspace"
              />
            </datalist>
            <button type="submit" class="quiet-button">应用工作区</button>
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
        <button
          type="button"
          class="quiet-button"
          aria-label="刷新资产"
          @click="applyFilters"
        >
          <UiIcon name="refresh" />刷新
        </button>
      </template>
      <button v-else type="button" class="quiet-button" @click="loadInbox">
        <UiIcon name="refresh" />刷新
      </button>
    </PageHeader>
    <form
      v-if="searchMode"
      class="search-bar"
      aria-label="搜索知识资产"
      @submit.prevent="applyFilters"
    >
      <label class="search-input"
        ><UiIcon name="search" /><input
          ref="searchInput"
          v-model="filters.query"
          type="search"
          aria-label="搜索"
          placeholder="搜索标题、摘要或正文…"
        /><button type="submit" class="quiet-button">搜索</button></label
      >
      <p v-if="filterError" class="field-error" role="alert">
        {{ filterError }}
      </p>
    </form>
    <section
      class="list-scroll"
      :aria-label="activeView === 'INBOX' ? '收件箱列表' : '知识资产列表'"
    >
      <template v-if="activeView === 'LIBRARY'">
        <div v-if="assetsLoading" class="state-panel" role="status">
          正在读取知识资产…
        </div>
        <div
          v-else-if="assetsError && listErrorCopy"
          class="state-panel"
          role="alert"
        >
          <strong>{{ listErrorCopy.title }}</strong>
          <p>{{ listErrorCopy.detail }}</p>
          <button type="button" class="quiet-button" @click="applyFilters">
            重试
          </button>
        </div>
        <div v-else-if="!assets.length" class="state-panel">
          <strong>没有找到知识资产</strong>
          <p>试试其他关键词，或调整筛选条件。</p>
        </div>
        <template v-else>
          <p v-if="searchMode" class="result-count" aria-live="polite">
            {{ assets.length }} 条结果
          </p>
          <ol class="asset-list" aria-label="知识资产结果">
            <li v-for="asset in assets" :key="asset.assetId">
              <button
                type="button"
                class="asset-row"
                :title="asset.title"
                @click="openAsset(asset.assetId)"
              >
                <UiIcon
                  :name="
                    asset.type === 'SKILL'
                      ? 'code'
                      : asset.type === 'MEMORY'
                        ? 'memory'
                        : 'document'
                  "
                />
                <span class="row-main"
                  ><span class="row-title">{{ asset.title }}</span
                  ><span
                    v-if="appliedQuery && asset.matchedSnippet"
                    class="match-snippet"
                    >{{ asset.matchedSnippet }}</span
                  ></span
                >
                <span v-if="appliedQuery" class="match-meta"
                  >{{ asset.searchStrategy ?? "MATCH"
                  }}<template v-if="asset.score !== undefined">
                    · {{ asset.score }}</template
                  ></span
                >
                <span class="row-scope">{{
                  asset.scope === "GLOBAL" ? "全局知识" : asset.workspace
                }}</span>
                <span class="tag">{{ displayValue(asset.type) }}</span>
                <time class="row-date" :datetime="asset.modifiedAt">{{
                  formatDate(asset.modifiedAt)
                }}</time>
              </button>
            </li>
          </ol>
        </template>
      </template>
      <template v-else>
        <div v-if="inboxLoading" class="state-panel" role="status">
          正在读取收件箱…
        </div>
        <div
          v-else-if="inboxError && inboxErrorCopy"
          class="state-panel"
          role="alert"
        >
          <strong>{{ inboxErrorCopy.title }}</strong>
          <p>{{ inboxErrorCopy.detail }}</p>
          <button type="button" class="quiet-button" @click="loadInbox">
            重试
          </button>
        </div>
        <div
          v-else-if="!inboxItems.length && !inboxDiagnostics.length"
          class="state-panel"
        >
          <strong>收件箱已清空</strong>
          <p>暂无知识候选或文件问题。</p>
        </div>
        <div v-else class="inbox-groups">
          <template v-if="inboxItems.length"
            ><h2 class="group-heading">
              待确认候选 <span>{{ inboxItems.length }}</span>
            </h2>
            <ol class="asset-list">
              <li v-for="item in inboxItems" :key="item.assetId">
                <button
                  type="button"
                  class="asset-row"
                  @click="openInbox(item)"
                >
                  <UiIcon name="document" /><span class="row-title">{{
                    item.title
                  }}</span
                  ><span class="row-scope">{{
                    item.scope === "GLOBAL" ? "全局知识" : item.workspace
                  }}</span
                  ><span class="tag">{{ displayValue(item.type) }}</span>
                </button>
              </li>
            </ol></template
          >
          <template v-if="inboxDiagnostics.length"
            ><h2 class="group-heading">
              诊断信息 <span>{{ inboxDiagnostics.length }}</span>
            </h2>
            <ol class="diagnostic-list">
              <li v-for="(diagnostic, index) in inboxDiagnostics" :key="index">
                <button
                  type="button"
                  class="asset-row diagnostic-row"
                  @click="openDiagnostic(index)"
                >
                  <UiIcon name="warning" /><span class="row-title">{{
                    diagnostic.message
                  }}</span
                  ><code>{{ diagnostic.code }}</code
                  ><span class="row-scope">{{ diagnostic.relativePath }}</span>
                </button>
              </li>
            </ol></template
          >
        </div>
      </template>
    </section>
    <PreviewDialog
      v-if="previewOpen"
      :label="activeView === 'LIBRARY' ? '知识资产详情' : '候选详情'"
      :expanded="route.expanded"
      @close="closePreview"
      @expand="expandPreview"
    >
      <template v-if="activeView === 'LIBRARY'">
        <div
          v-if="detailLoading"
          class="state-panel detail-state"
          role="status"
          aria-live="polite"
        >
          <span class="loading-line" aria-hidden="true"></span
          ><strong>正在打开知识资产…</strong>
          <p>正在读取正文与使用情况。</p>
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
            {{ detailError.status === 404 ? "刷新资产列表" : "重新加载" }}
          </button>
        </div>
        <div v-else-if="assetDetail" class="detail-document">
          <header class="document-header">
            <div class="document-kicker">
              <span class="tag">{{ displayValue(assetDetail.type) }}</span
              ><span>{{
                assetDetail.scope === "GLOBAL"
                  ? "全局知识"
                  : assetDetail.workspace
              }}</span>
            </div>
            <h2>{{ assetDetail.title }}</h2>
            <p>{{ assetDetail.summary }}</p>
          </header>
          <section class="content-section" aria-labelledby="content-heading">
            <div class="section-heading content-heading-row">
              <div>
                <p class="eyebrow">知识原文</p>
                <h3 id="content-heading">正文</h3>
              </div>
              <div
                class="content-tabs"
                role="tablist"
                @keydown="handleTabKeydown"
                aria-label="正文显示方式"
              >
                <button
                  type="button"
                  role="tab"
                  id="asset-tab-RENDERED"
                  aria-controls="asset-panel"
                  :tabindex="detailTab === 'RENDERED' ? 0 : -1"
                  :aria-selected="detailTab === 'RENDERED'"
                  @click="detailTab = 'RENDERED'"
                >
                  阅读</button
                ><button
                  type="button"
                  role="tab"
                  id="asset-tab-RAW"
                  aria-controls="asset-panel"
                  :tabindex="detailTab === 'RAW' ? 0 : -1"
                  :aria-selected="detailTab === 'RAW'"
                  @click="detailTab = 'RAW'"
                >
                  Markdown 源文</button
                ><button
                  type="button"
                  role="tab"
                  id="asset-tab-FRONTMATTER"
                  aria-controls="asset-panel"
                  :tabindex="detailTab === 'FRONTMATTER' ? 0 : -1"
                  :aria-selected="detailTab === 'FRONTMATTER'"
                  @click="detailTab = 'FRONTMATTER'"
                >
                  元信息
                </button>
              </div>
            </div>
            <div
              v-if="detailTab === 'RENDERED'"
              class="markdown-body"
              role="tabpanel"
              id="asset-panel"
              :aria-labelledby="`asset-tab-${detailTab}`"
              tabindex="0"
              v-html="assetDetail.renderedMarkdown"
            ></div>
            <pre
              v-else-if="detailTab === 'RAW'"
              class="source-view"
              role="tabpanel"
              id="asset-panel"
              :aria-labelledby="`asset-tab-${detailTab}`"
              tabindex="0"
              >{{ assetDetail.rawMarkdown }}</pre
            >
            <pre
              v-else
              class="source-view"
              role="tabpanel"
              id="asset-panel"
              :aria-labelledby="`asset-tab-${detailTab}`"
              tabindex="0"
              >{{ frontmatterText(assetDetail.frontmatter) }}</pre
            >
          </section>
          <details class="detail-disclosure">
            <summary>属性与使用情况</summary>
            <dl class="metadata-sheet">
              <div>
                <dt>资产 ID</dt>
                <dd>
                  <code>{{ assetDetail.assetId }}</code>
                </dd>
              </div>
              <div>
                <dt>工作区</dt>
                <dd>{{ assetDetail.workspace ?? "全局知识" }}</dd>
              </div>
              <div>
                <dt>文件路径</dt>
                <dd>
                  <code>{{ assetDetail.relativePath }}</code>
                </dd>
              </div>
              <div>
                <dt>修改时间</dt>
                <dd>
                  <time :datetime="assetDetail.modifiedAt">{{
                    formatDate(assetDetail.modifiedAt)
                  }}</time>
                </dd>
              </div>
              <div class="wide-row">
                <dt>内容 Hash</dt>
                <dd>
                  <code>{{ assetDetail.contentHash }}</code>
                </dd>
              </div>
            </dl>
            <section class="usage-section" aria-labelledby="usage-heading">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">使用情况</p>
                  <h3 id="usage-heading">使用统计</h3>
                </div>
              </div>
              <dl class="usage-strip">
                <div>
                  <dt>关联任务</dt>
                  <dd>{{ assetDetail.usageSummary.taskCount }}</dd>
                </div>
                <div>
                  <dt>召回</dt>
                  <dd>{{ assetDetail.usageSummary.recallCount }}</dd>
                </div>
                <div>
                  <dt>读取</dt>
                  <dd>{{ assetDetail.usageSummary.readCount }}</dd>
                </div>
                <div>
                  <dt>实际使用任务</dt>
                  <dd>{{ assetDetail.usageSummary.usedTaskCount }}</dd>
                </div>
              </dl>
            </section>
            <section class="loadout-section" aria-labelledby="loadout-heading">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">最近关联</p>
                  <h3 id="loadout-heading">任务与装载</h3>
                </div>
                <span>{{ assetDetail.recentLoadouts.length }} 条</span>
              </div>
              <div
                v-if="assetDetail.recentLoadouts.length === 0"
                class="state-panel compact"
              >
                <p>该资产尚未出现在已记录的任务装载中。</p>
              </div>
              <div v-else class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>任务</th>
                      <th>任务内容</th>
                      <th>状态</th>
                      <th>装载原因</th>
                      <th>使用记录</th>
                      <th>更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="loadout in assetDetail.recentLoadouts"
                      :key="loadout.taskId"
                    >
                      <td>
                        <code>{{ loadout.taskId }}</code
                        ><small>{{ loadout.workspace ?? "全局知识" }}</small>
                      </td>
                      <td>{{ loadout.requestSummary }}</td>
                      <td>
                        <span class="status-label">{{
                          displayValue(loadout.status)
                        }}</span
                        ><small>{{ displayValue(loadout.mode) }}</small>
                      </td>
                      <td>
                        <code>{{ loadout.reason }}</code>
                      </td>
                      <td>
                        召回 {{ loadout.recallCount }} · 读取
                        {{ loadout.readCount }} ·
                        {{ loadout.usedFlag ? "已使用" : "未使用" }}
                      </td>
                      <td>
                        <time :datetime="loadout.updatedAt">{{
                          formatDate(loadout.updatedAt)
                        }}</time>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </details>
        </div>
        <div v-else class="state-panel detail-state">
          <strong>知识详情暂不可用</strong>
          <p>关闭详情后刷新列表，重新打开知识。</p>
        </div>
      </template>

      <template v-else>
        <div
          v-if="inboxLoading"
          class="state-panel detail-state"
          role="status"
          aria-live="polite"
        >
          <span class="loading-line" aria-hidden="true"></span
          ><strong>正在读取收件箱…</strong>
        </div>
        <div
          v-else-if="inboxError && inboxErrorCopy"
          class="state-panel detail-state error-state"
          role="alert"
        >
          <p class="error-code mono">{{ inboxError.code }}</p>
          <strong>{{ inboxErrorCopy.title }}</strong>
          <p>{{ inboxErrorCopy.detail }}</p>
          <button type="button" class="secondary-button" @click="loadInbox">
            重试
          </button>
        </div>
        <article
          v-else-if="selectedInboxItem"
          class="detail-document inbox-document"
        >
          <header class="document-header">
            <div class="document-kicker">
              <span class="tag">待确认</span
              ><span>{{ displayValue(selectedInboxItem.type) }}</span>
            </div>
            <h2>{{ selectedInboxItem.title }}</h2>
            <p>{{ selectedInboxItem.summary }}</p>
          </header>

          <section class="content-section">
            <div class="section-heading content-heading-row">
              <div>
                <p class="eyebrow">候选原文</p>
                <h3>源文件</h3>
              </div>
              <div
                class="content-tabs"
                role="tablist"
                @keydown="handleTabKeydown"
                aria-label="候选显示方式"
              >
                <button
                  type="button"
                  role="tab"
                  id="inbox-tab-RAW"
                  aria-controls="inbox-panel"
                  :tabindex="inboxDetailTab === 'RAW' ? 0 : -1"
                  :aria-selected="inboxDetailTab === 'RAW'"
                  @click="inboxDetailTab = 'RAW'"
                >
                  Markdown 源文</button
                ><button
                  type="button"
                  role="tab"
                  id="inbox-tab-FRONTMATTER"
                  aria-controls="inbox-panel"
                  :tabindex="inboxDetailTab === 'FRONTMATTER' ? 0 : -1"
                  :aria-selected="inboxDetailTab === 'FRONTMATTER'"
                  @click="inboxDetailTab = 'FRONTMATTER'"
                >
                  元信息
                </button>
              </div>
            </div>
            <pre
              v-if="inboxDetailTab === 'RAW'"
              class="source-view"
              role="tabpanel"
              id="inbox-panel"
              :aria-labelledby="`inbox-tab-${inboxDetailTab}`"
              tabindex="0"
              >{{ selectedInboxItem.rawMarkdown }}</pre
            >
            <pre
              v-else
              class="source-view"
              role="tabpanel"
              id="inbox-panel"
              :aria-labelledby="`inbox-tab-${inboxDetailTab}`"
              tabindex="0"
              >{{ frontmatterText(selectedInboxItem.frontmatter) }}</pre
            >
          </section>

          <details class="detail-disclosure">
            <summary>候选属性</summary>
            <dl class="metadata-sheet">
              <div>
                <dt>资产 ID</dt>
                <dd>
                  <code>{{ selectedInboxItem.assetId }}</code>
                </dd>
              </div>
              <div>
                <dt>范围</dt>
                <dd>{{ displayValue(selectedInboxItem.scope) }}</dd>
              </div>
              <div>
                <dt>工作区</dt>
                <dd>{{ selectedInboxItem.workspace ?? "全局知识" }}</dd>
              </div>
              <div>
                <dt>修改时间</dt>
                <dd>{{ formatDate(selectedInboxItem.modifiedAt) }}</dd>
              </div>
              <div class="wide-row">
                <dt>文件路径</dt>
                <dd>
                  <code>{{ selectedInboxItem.relativePath }}</code>
                </dd>
              </div>
              <div class="wide-row">
                <dt>内容 Hash</dt>
                <dd>
                  <code>{{ selectedInboxItem.contentHash }}</code>
                </dd>
              </div>
            </dl>
          </details>
        </article>
        <article
          v-else-if="selectedInboxDiagnostic"
          class="detail-document diagnostic-document"
        >
          <header class="document-header">
            <div class="document-kicker">
              <span class="tag warning">文件诊断</span>
            </div>
            <h2 class="mono">{{ selectedInboxDiagnostic.code }}</h2>
            <p>{{ selectedInboxDiagnostic.message }}</p>
          </header>
          <dl class="metadata-sheet single-column">
            <div>
              <dt>相对路径</dt>
              <dd>
                <code>{{ selectedInboxDiagnostic.relativePath }}</code>
              </dd>
            </div>
            <div v-if="selectedInboxDiagnostic.assetId">
              <dt>资产 ID</dt>
              <dd>
                <code>{{ selectedInboxDiagnostic.assetId }}</code>
              </dd>
            </div>
          </dl>
          <div class="boundary-note">
            <strong>请在源文件中处理</strong>
            <p>处理文件问题后，刷新收件箱查看结果。</p>
          </div>
        </article>
        <div v-else class="state-panel detail-state">
          <strong>候选已不存在</strong>
          <p>关闭详情后刷新收件箱，查看当前候选与诊断。</p>
        </div>
      </template>
    </PreviewDialog>
  </main>
</template>
