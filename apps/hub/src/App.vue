<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from "vue";

import { HubApiClient, HubApiError, isAbortError } from "./api/client.js";
import type {
  AssetDetail,
  AssetLibraryItem,
  AssetListFilters,
  AssetScope,
  AssetType,
  InboxDiagnostic,
  InboxItem,
} from "./api/types.js";
import UiIcon from "./components/UiIcon.vue";
import type { PresentedError } from "./views/view-helpers.js";
import {
  asHubApiError,
  displayValue,
  formatDate,
  handleTabKeydown,
} from "./views/view-helpers.js";
import SystemStatusView from "./views/SystemStatusView.vue";
import TaskLoadoutsView from "./views/TaskLoadoutsView.vue";
import UsageView from "./views/UsageView.vue";

type ActiveView = "LIBRARY" | "INBOX";
type PrimaryView = "ASSETS" | "TASK_LOADOUTS" | "USAGE" | "SYSTEM_STATUS";
type DetailTab = "RENDERED" | "RAW" | "FRONTMATTER";
type InboxDetailTab = "RAW" | "FRONTMATTER";
type WorkspaceMode = "ALL" | "GLOBAL" | "NAMED";
type ViewContext = "ASSET_LIST" | "ASSET_DETAIL" | "INBOX";

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
const theme = ref<"system" | "light" | "dark">("system");
const viewTitle = computed(() =>
  primaryView.value === "ASSETS"
    ? activeView.value === "INBOX"
      ? "收件箱"
      : "知识资产"
    : {
        TASK_LOADOUTS: "任务与装载",
        USAGE: "使用记录",
        SYSTEM_STATUS: "系统状态",
      }[primaryView.value],
);

async function focusSearch(): Promise<void> {
  primaryView.value = "ASSETS";
  activeView.value = "LIBRARY";
  await nextTick();
  searchInput.value?.focus();
}

function handleShortcut(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    void focusSearch();
  }
}

function changeTheme(): void {
  document.documentElement.dataset.theme = theme.value;
  try {
    localStorage.setItem("hub-theme", theme.value);
  } catch {
    /* Appearance still works without storage. */
  }
}

onMounted(() => {
  try {
    const saved = localStorage.getItem("hub-theme");
    if (saved === "light" || saved === "dark") theme.value = saved;
  } catch {
    /* Use the system appearance when storage is unavailable. */
  }
  document.documentElement.dataset.theme = theme.value;
  window.addEventListener("keydown", handleShortcut);
  void loadAssets({ limit: 20 });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleShortcut);
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
    const currentSelection = result.items.find(
      ({ assetId }) => assetId === selectedAssetId.value,
    );
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
    const retainedItem = result.items.find(
      ({ assetId }) => assetId === selectedInboxItem.value?.assetId,
    );
    const retainedDiagnostic = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === selectedInboxDiagnostic.value?.code &&
        diagnostic.relativePath === selectedInboxDiagnostic.value.relativePath,
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
  return (
    selectedInboxDiagnostic.value?.code === diagnostic.code &&
    selectedInboxDiagnostic.value.relativePath === diagnostic.relativePath
  );
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
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <aside class="sidebar" aria-label="主导航">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"
          ><UiIcon name="layers" /></span
        ><strong>CodexMemoryOS</strong><span class="local-label">本地</span>
      </div>
      <button type="button" class="sidebar-search" @click="focusSearch">
        <UiIcon name="search" /><span>搜索知识</span><kbd>⌘ K</kbd>
      </button>
      <p class="nav-label">知识空间</p>
      <nav class="primary-navigation" aria-label="页面导航">
        <button
          type="button"
          :aria-current="
            primaryView === 'ASSETS' && activeView === 'LIBRARY'
              ? 'page'
              : undefined
          "
          @click="
            primaryView = 'ASSETS';
            setActiveView('LIBRARY');
          "
        >
          <UiIcon name="library" />知识资产
        </button>
        <button
          type="button"
          :aria-current="
            primaryView === 'ASSETS' && activeView === 'INBOX'
              ? 'page'
              : undefined
          "
          @click="
            primaryView = 'ASSETS';
            setActiveView('INBOX');
          "
        >
          <UiIcon name="inbox" />收件箱
        </button>
        <button
          type="button"
          :aria-current="primaryView === 'TASK_LOADOUTS' ? 'page' : undefined"
          @click="primaryView = 'TASK_LOADOUTS'"
        >
          <UiIcon name="layers" />任务与装载
        </button>
        <button
          type="button"
          :aria-current="primaryView === 'USAGE' ? 'page' : undefined"
          @click="primaryView = 'USAGE'"
        >
          <UiIcon name="activity" />使用记录
        </button>
        <button
          type="button"
          :aria-current="primaryView === 'SYSTEM_STATUS' ? 'page' : undefined"
          @click="primaryView = 'SYSTEM_STATUS'"
        >
          <UiIcon name="settings" />系统状态
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="workspace-identity">
          <span class="workspace-avatar">知</span>
          <div>
            <strong>个人知识空间</strong><small>Markdown · 本地知识原件</small>
          </div>
        </div>
        <label class="theme-control"
          ><UiIcon name="sun" /><span>外观</span
          ><select v-model="theme" aria-label="外观主题" @change="changeTheme">
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select></label
        >
      </div>
    </aside>
    <div id="main-content" class="main-content" tabindex="-1">
      <header class="page-header">
        <div class="breadcrumb">
          <UiIcon
            :name="primaryView === 'ASSETS' ? 'library' : 'layers'"
          /><span>知识空间</span><span class="breadcrumb-divider">/</span>
          <h1>{{ viewTitle }}</h1>
        </div>
        <span class="read-only-note"
          ><span aria-hidden="true"></span>只读浏览</span
        >
      </header>

      <main v-if="primaryView === 'ASSETS'" class="workbench">
        <section class="catalog-pane" aria-label="知识资产列表">
          <template v-if="activeView === 'LIBRARY'">
            <form
              class="filter-panel"
              aria-label="筛选知识资产"
              @submit.prevent="applyFilters"
            >
              <label class="search-field"
                ><span>搜索</span
                ><input
                  ref="searchInput"
                  v-model="filters.query"
                  type="search"
                  placeholder="搜索标题、摘要或正文…"
              /></label>
              <details class="filter-disclosure">
                <summary>
                  <UiIcon name="filter" />筛选条件<span>{{
                    filters.type ? displayValue(filters.type) : "全部类型"
                  }}</span>
                </summary>
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
                      :aria-pressed="workspaceMode === 'GLOBAL'"
                      @click="setWorkspaceMode('GLOBAL')"
                    >
                      仅全局
                    </button>
                    <button
                      type="button"
                      :aria-pressed="workspaceMode === 'NAMED'"
                      @click="setWorkspaceMode('NAMED')"
                    >
                      指定工作区
                    </button>
                  </div>
                  <label
                    v-if="workspaceMode === 'NAMED'"
                    class="exact-workspace"
                  >
                    <span>工作区名称</span>
                    <input
                      v-model="filters.workspace"
                      list="workspace-suggestions"
                      autocomplete="off"
                    />
                    <datalist id="workspace-suggestions">
                      <option
                        v-for="workspace in workspaceSuggestions"
                        :key="workspace"
                        :value="workspace"
                      />
                    </datalist>
                    <small>建议名称来自当前结果。</small>
                  </label>
                </fieldset>
                <div class="filter-row">
                  <label
                    ><span>类型</span
                    ><select v-model="filters.type">
                      <option value="">全部类型</option>
                      <option value="MEMORY">工程记忆</option>
                      <option value="DOCUMENT">文档</option>
                      <option value="SKILL">技能</option>
                    </select></label
                  >
                  <label
                    ><span>范围</span
                    ><select v-model="filters.scope" @change="reconcileScope">
                      <option value="">全部范围</option>
                      <option value="GLOBAL">全局知识</option>
                      <option value="WORKSPACE">工作区</option>
                    </select></label
                  >
                  <label
                    ><span>显示条数</span
                    ><select v-model="filters.limit">
                      <option :value="20">20</option>
                      <option :value="50">50</option>
                      <option :value="100">100</option>
                    </select></label
                  >
                </div>
              </details>
              <p v-if="filterError" class="field-error" role="alert">
                {{ filterError }}
              </p>
              <div class="filter-actions">
                <button type="submit" class="primary-button">应用筛选</button
                ><button
                  type="button"
                  class="quiet-button"
                  @click="resetFilters"
                >
                  重置
                </button>
              </div>
            </form>

            <div class="result-heading">
              <div>
                <p class="eyebrow">浏览知识</p>
                <h2>资产列表</h2>
              </div>
              <span v-if="!assetsLoading && !assetsError" aria-live="polite"
                >{{ assets.length }} 条</span
              >
            </div>
            <div
              v-if="assetsLoading"
              class="state-panel compact"
              role="status"
              aria-live="polite"
            >
              <span class="loading-line" aria-hidden="true"></span>
              <p>正在读取知识资产…</p>
            </div>
            <div
              v-else-if="assetsError && listErrorCopy"
              class="state-panel compact error-state"
              role="alert"
            >
              <strong>{{ listErrorCopy.title }}</strong>
              <p>{{ listErrorCopy.detail }}</p>
              <button
                type="button"
                class="secondary-button"
                @click="applyFilters"
              >
                重试
              </button>
            </div>
            <div v-else-if="assets.length === 0" class="state-panel compact">
              <strong>没有找到知识资产</strong>
              <p>试试其他关键词，或调整筛选条件。</p>
            </div>
            <ol v-else class="asset-list" aria-label="知识资产结果">
              <li v-for="asset in assets" :key="asset.assetId">
                <button
                  type="button"
                  class="asset-card"
                  :class="[
                    `type-${asset.type.toLowerCase()}`,
                    { selected: selectedAssetId === asset.assetId },
                  ]"
                  :aria-current="
                    selectedAssetId === asset.assetId ? 'true' : undefined
                  "
                  @click="selectAsset(asset.assetId)"
                >
                  <span class="asset-card-topline"
                    ><span class="tag">{{ displayValue(asset.type) }}</span
                    ><span class="scope-label">{{
                      asset.scope === "GLOBAL" ? "全局知识" : asset.workspace
                    }}</span></span
                  >
                  <strong>{{ asset.title }}</strong
                  ><span class="asset-summary">{{ asset.summary }}</span>
                  <span
                    v-if="appliedQuery && asset.matchedSnippet"
                    class="match-snippet"
                    >{{ asset.matchedSnippet }}</span
                  >
                  <span v-if="appliedQuery" class="match-meta"
                    >{{ asset.searchStrategy ?? "MATCH"
                    }}<template v-if="asset.score !== undefined">
                      · {{ asset.score }}</template
                    ></span
                  >
                  <span class="asset-card-footer"
                    ><time :datetime="asset.modifiedAt">{{
                      formatDate(asset.modifiedAt)
                    }}</time></span
                  >
                </button>
              </li>
            </ol>
          </template>

          <template v-else>
            <div class="inbox-intro">
              <div>
                <p class="eyebrow">候选知识</p>
                <h2>收件箱</h2>
              </div>
              <button type="button" class="secondary-button" @click="loadInbox">
                刷新
              </button>
            </div>
            <p class="supporting-copy">
              浏览待确认的知识候选与文件问题。入库确认在 Codex 中完成。
            </p>
            <div
              v-if="inboxLoading"
              class="state-panel compact"
              role="status"
              aria-live="polite"
            >
              <span class="loading-line" aria-hidden="true"></span>
              <p>正在读取收件箱…</p>
            </div>
            <div
              v-else-if="inboxError && inboxErrorCopy"
              class="state-panel compact error-state"
              role="alert"
            >
              <strong>{{ inboxErrorCopy.title }}</strong>
              <p>{{ inboxErrorCopy.detail }}</p>
              <button type="button" class="secondary-button" @click="loadInbox">
                重试
              </button>
            </div>
            <div
              v-else-if="
                inboxItems.length === 0 && inboxDiagnostics.length === 0
              "
              class="state-panel compact"
            >
              <strong>收件箱已清空</strong>
              <p>暂无知识候选或文件问题。</p>
            </div>
            <div v-else class="inbox-groups">
              <section
                v-if="inboxItems.length > 0"
                aria-labelledby="candidate-heading"
              >
                <h3 id="candidate-heading">
                  待确认候选 <span>{{ inboxItems.length }}</span>
                </h3>
                <ol class="asset-list">
                  <li v-for="item in inboxItems" :key="item.assetId">
                    <button
                      type="button"
                      class="asset-card"
                      :class="[
                        `type-${item.type.toLowerCase()}`,
                        {
                          selected: selectedInboxItem?.assetId === item.assetId,
                        },
                      ]"
                      @click="selectInboxItem(item)"
                    >
                      <span class="asset-card-topline"
                        ><span class="tag">{{ displayValue(item.type) }}</span
                        ><span class="scope-label">{{
                          item.scope === "GLOBAL" ? "全局知识" : item.workspace
                        }}</span></span
                      ><strong>{{ item.title }}</strong
                      ><span class="asset-summary">{{ item.summary }}</span
                      ><span class="path-line mono">{{
                        item.relativePath
                      }}</span>
                    </button>
                  </li>
                </ol>
              </section>
              <section
                v-if="inboxDiagnostics.length > 0"
                aria-labelledby="diagnostic-heading"
              >
                <h3 id="diagnostic-heading">
                  诊断信息 <span>{{ inboxDiagnostics.length }}</span>
                </h3>
                <ol class="diagnostic-list">
                  <li
                    v-for="(diagnostic, index) in inboxDiagnostics"
                    :key="`${diagnostic.relativePath}:${diagnostic.code}:${index}`"
                  >
                    <button
                      type="button"
                      class="diagnostic-card"
                      :class="{
                        selected: isSelectedDiagnostic(diagnostic),
                        conflict:
                          diagnostic.code === 'ID_CONFLICT' ||
                          diagnostic.code === 'DUPLICATE_ASSET_ID',
                      }"
                      @click="selectInboxDiagnostic(diagnostic)"
                    >
                      <strong class="mono">{{ diagnostic.code }}</strong
                      ><span>{{ diagnostic.message }}</span
                      ><span class="path-line mono">{{
                        diagnostic.relativePath
                      }}</span>
                    </button>
                  </li>
                </ol>
              </section>
            </div>
          </template>
        </section>

        <section class="detail-pane" aria-label="所选内容详情">
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
              <button
                type="button"
                class="secondary-button"
                @click="retryDetail"
              >
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
              <section
                class="content-section"
                aria-labelledby="content-heading"
              >
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
                <section
                  class="loadout-section"
                  aria-labelledby="loadout-heading"
                >
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
                            ><small>{{
                              loadout.workspace ?? "全局知识"
                            }}</small>
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
              <strong>选择一条知识</strong>
              <p>从左侧列表选择知识，查看正文与使用情况。</p>
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
              <strong>等待选择</strong>
              <p>选择左侧候选或诊断信息，查看详情。</p>
            </div>
          </template>
        </section>
      </main>
      <TaskLoadoutsView v-else-if="primaryView === 'TASK_LOADOUTS'" />
      <UsageView v-else-if="primaryView === 'USAGE'" />
      <SystemStatusView v-else />
    </div>
  </div>
</template>
