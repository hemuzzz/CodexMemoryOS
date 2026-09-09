<script setup lang="ts">
import { onActivated, onBeforeUnmount, ref } from "vue";
import { HubApiClient, isAbortError } from "../api/client.js";
import type { OverviewDto } from "../api/types.js";
import PageHeader from "../components/PageHeader.vue";
import { navigate } from "../navigation.js";
const api = new HubApiClient();
const data = ref<OverviewDto>();
const loading = ref(false);
const error = ref("");
let controller: AbortController | undefined;
async function refresh() {
  controller?.abort(); const current = new AbortController(); controller = current;
  loading.value = true; error.value = "";
  try { const result = await api.getOverview(current.signal); if (controller === current) data.value = result; }
  catch (caught) { if (controller === current && !isAbortError(caught)) { data.value = undefined; error.value = caught instanceof Error ? caught.message : "读取失败"; } }
  finally { if (controller === current) loading.value = false; }
}
onActivated(refresh);
onBeforeUnmount(() => controller?.abort());
</script>
<template>
  <main class="list-page overview-page">
    <PageHeader title="总览" subtitle="知识积累与已记录使用"><button class="quiet-button" :disabled="loading" @click="refresh">刷新</button></PageHeader>
    <div class="list-scroll overview-content" :aria-busy="loading">
      <p v-if="loading" role="status">正在读取统计…</p>
      <p v-else-if="error" role="alert">{{ error }} <button @click="refresh">重试</button></p>
      <template v-else-if="data">
        <section class="overview-metrics" aria-label="知识与使用数量">
          <button class="overview-stat" @click="navigate('library')"><span>正式知识</span><strong>{{ data.scopes.reduce((n,s) => n + Object.values(s.assets).reduce((a,b) => a+b,0),0) }}</strong></button>
          <button class="overview-stat" @click="navigate('inbox')"><span>待确认</span><strong>{{ data.scopes.reduce((n,s) => n+s.inboxCount,0) }}</strong></button>
          <button class="overview-stat" @click="navigate('recalls')"><span>召回操作 / 条目</span><strong>{{ data.facts.recallOperations }} / {{ data.facts.recallItems }}</strong></button>
          <button class="overview-stat" @click="navigate('usage')"><span>读取 / 累计使用</span><strong>{{ data.facts.reads }} / {{ data.facts.used }}</strong></button>
        </section>
        <p>统计来自成功持久的事实。写入失败的交付不会出现在此处；记录不证明客户端实际接收或理解。</p>
        <section class="overview-section"><h2>知识分布</h2><div class="table-scroll"><table>
          <thead><tr><th>范围</th><th>记忆</th><th>文档</th><th>技能</th><th>待确认</th></tr></thead>
          <tbody><tr v-for="scope in data.scopes" :key="scope.workspace ?? 'GLOBAL'"><td>{{ scope.workspace ?? 'GLOBAL' }}</td><td>{{ scope.assets.MEMORY }}</td><td>{{ scope.assets.DOCUMENT }}</td><td>{{ scope.assets.SKILL }}</td><td>{{ scope.inboxCount }}</td></tr></tbody>
        </table></div></section>
      </template>
    </div>
  </main>
</template>
