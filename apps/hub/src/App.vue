<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import OverviewView from "./views/OverviewView.vue";
import AssetsView from "./views/AssetsView.vue";
import KnowledgeView from "./views/KnowledgeView.vue";
import SystemStatusView from "./views/SystemStatusView.vue";
import UiIcon from "./components/UiIcon.vue";
import FilterMenu from "./components/FilterMenu.vue";
import { navigate, useRoute, type Page } from "./navigation.js";
const route = useRoute();
const collapsed = ref(false);
const theme = ref<"system" | "light" | "dark">("dark");
const navigation: { page: Page; label: string; icon: string }[] = [
  { page: "overview", label: "总览", icon: "overview" },
  { page: "library", label: "知识资产", icon: "library" },
  { page: "inbox", label: "收件箱", icon: "inbox" },
  { page: "workspaces", label: "工作区", icon: "layers" },
  { page: "scenarios", label: "场景", icon: "layers" },
  { page: "recalls", label: "召回记录", icon: "search" },
  { page: "usage", label: "使用记录", icon: "activity" },
  { page: "status", label: "系统状态", icon: "settings" },
];
const view = computed(
  () =>
    ({ overview: OverviewView, workspaces: KnowledgeView, scenarios: KnowledgeView, recalls: KnowledgeView, usage: KnowledgeView, status: SystemStatusView })[
      route.value.page as "overview" | "workspaces" | "scenarios" | "recalls" | "usage" | "status"
    ] ?? AssetsView,
);
function documentMainFocus() {
  document.getElementById("main-content")?.focus();
}
function changeTheme() {
  document.documentElement.dataset.theme = theme.value;
  try {
    localStorage.setItem("hub-theme", theme.value);
  } catch {
    /* Appearance works without storage. */
  }
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    navigate("search");
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(".search-bar input")?.focus(),
    );
  }
}
onMounted(() => {
  try {
    const stored = localStorage.getItem("hub-theme");
    if (stored === "dark" || stored === "light" || stored === "system")
      theme.value = stored;
  } catch {
    /* Keep default appearance. */
  }
  changeTheme();
  window.addEventListener("keydown", shortcut);
});
onBeforeUnmount(() => window.removeEventListener("keydown", shortcut));
</script>
<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': collapsed }">
    <a class="skip-link" href="#main-content" @click.prevent="documentMainFocus"
      >跳到主要内容</a
    >
    <aside class="sidebar" aria-label="主导航">
      <div class="sidebar-heading">
        <div v-if="!collapsed" class="brand-lockup">
          <span class="brand-mark">C</span><strong>CodexMemoryOS</strong>
        </div>
        <button
          type="button"
          class="icon-button"
          :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
          :aria-expanded="!collapsed"
          @click="collapsed = !collapsed"
        >
          <UiIcon name="panel" />
        </button>
      </div>
      <button
        type="button"
        class="sidebar-search nav-row"
        :class="{ active: route.page === 'search' }"
        aria-label="搜索知识"
        :aria-current="route.page === 'search' ? 'page' : undefined"
        title="搜索知识 · ⌘K"
        @click="navigate('search')"
      >
        <UiIcon name="search" /><span v-if="!collapsed">搜索知识</span>
      </button>
      <nav class="primary-navigation" aria-label="页面导航">
        <button
          v-for="item in navigation"
          :key="item.page"
          type="button"
          class="nav-row"
          :class="{ active: route.page === item.page }"
          :aria-label="item.label"
          :title="collapsed ? item.label : undefined"
          :aria-current="route.page === item.page ? 'page' : undefined"
          @click="navigate(item.page)"
        >
          <UiIcon :name="item.icon" /><span v-if="!collapsed">{{
            item.label
          }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <FilterMenu label="外观" icon="sun"
          ><label class="menu-input"
            >外观主题<select
              v-model="theme"
              aria-label="外观主题"
              @change="changeTheme"
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
              <option value="system">跟随系统</option>
            </select></label
          ></FilterMenu
        >
        <span v-if="!collapsed" class="local-note">本地 · 只读</span>
      </div>
    </aside>
    <div id="main-content" class="main-content" tabindex="-1">
      <KeepAlive><component :is="view" /></KeepAlive>
    </div>
  </div>
</template>
