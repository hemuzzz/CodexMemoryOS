<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, ref, watch } from "vue";
import { HubApiClient, isAbortError } from "../api/client.js";
import type { WorkspaceProjection, RecallProjection, RecallDetail, UsageProjection } from "../api/types.js";
import PageHeader from "../components/PageHeader.vue";
import { navigate, useRoute } from "../navigation.js";
import { formatDate } from "./view-helpers.js";
const route = useRoute(); const api = new HubApiClient();
const workspaces = ref<WorkspaceProjection>();
const recalls = ref<RecallProjection[]>([]); const usage = ref<UsageProjection[]>([]); const detail = ref<RecallDetail>();
const total = ref(0); const loading = ref(false); const error = ref("");
const offset = computed(() => { const n = Number(new URLSearchParams(route.value.query).get('offset') ?? 0); return Number.isSafeInteger(n) && n >= 0 ? n : 0; });
const title = computed(() => ({ workspaces: '工作区', recalls: '召回记录', usage: '使用记录' })[route.value.page as 'workspaces' | 'recalls' | 'usage'] ?? '知识');
let controller: AbortController | undefined;
async function refresh() {
  if (!['workspaces','recalls','usage'].includes(route.value.page)) return;
  controller?.abort(); const current = new AbortController(); controller = current;
  loading.value = true; error.value = ''; detail.value = undefined;
  try {
    const page = route.value.page;
    if (page === 'workspaces') { const result = await api.getWorkspaces(current.signal); if (controller === current) workspaces.value = result; }
    else if (page === 'recalls' && route.value.id) { const result = await api.getRecall(route.value.id, current.signal); if (controller === current) detail.value = result; }
    else if (page === 'recalls') { const result = await api.getRecalls(offset.value, current.signal); if (controller === current) { recalls.value = result.items; total.value = result.total; } }
    else { const result = await api.getUsage(offset.value, current.signal); if (controller === current) { usage.value = result.items; total.value = result.total; } }
  } catch (caught) { if (controller === current && !isAbortError(caught)) error.value = caught instanceof Error ? caught.message : '读取失败'; }
  finally { if (controller === current) loading.value = false; }
}
function move(next: number) { navigate(route.value.page, undefined, false, { offset: String(next) }); }
watch(route, refresh); onActivated(refresh); onBeforeUnmount(() => controller?.abort());
</script>
<template>
  <main class="list-page"><PageHeader :title="title" subtitle="只读知识投影"><button class="quiet-button" :disabled="loading" @click="refresh">刷新</button></PageHeader>
    <div class="list-scroll overview-content" :aria-busy="loading">
      <p v-if="loading" role="status">正在读取…</p><p v-else-if="error" role="alert">{{ error }} <button @click="refresh">重试</button></p>
      <template v-else>
        <p>仅显示已记录事实；知识交付时写入失败不会留下记录。授权范围与知识来源分别展示，多项目操作不可跨行相加。</p>
        <template v-if="route.page === 'workspaces' && workspaces">
          <p>GLOBAL 知识 {{ workspaces.globalAssetCount }} · GLOBAL 召回条目 {{ workspaces.globalRecallCount }}</p>
          <p v-for="code in workspaces.diagnostics" :key="code">{{ code }}</p>
          <div class="table-scroll"><table><thead><tr><th>工作区</th><th>知识</th><th>授权操作（召回 / 读 / 用）</th><th>来源事实（召回 / 读 / 用）</th></tr></thead>
            <tbody><tr v-for="item in workspaces.items" :key="item.name"><td>{{ item.name }}</td><td>{{ item.assetCount }}</td><td>{{ item.authorizedRecallCount }} / {{ item.authorizedReadCount }} / {{ item.authorizedUsedCount }}</td><td>{{ item.sourceRecallCount }} / {{ item.sourceReadCount }} / {{ item.sourceUsedCount }}</td></tr></tbody></table></div>
          <p v-if="!workspaces.items.length">暂无配置工作区。</p>
        </template>
        <template v-else-if="route.page === 'recalls' && detail">
          <button class="quiet-button" @click="navigate('recalls')">返回召回列表</button><h2>检索表达</h2>
          <ul class="recall-expressions"><li v-for="(query, index) in detail.operation.queries" :key="index">{{ query }}</li></ul>
          <p>授权：GLOBAL + {{ detail.operation.authorizedWorkspaces.join('、') || '无项目' }}</p>
          <p>字符 {{ detail.operation.budget.modelVisibleCharacters }} / {{ detail.operation.budget.maxModelVisibleCharacters }}（知识 {{ detail.operation.budget.knowledgeContentCharacters }}，元数据 {{ detail.operation.budget.metadataCharacters }}）· 省略 {{ detail.operation.budget.omittedCount }}</p>
          <p>{{ detail.operation.diagnostics.join('、') }}</p>
          <section v-for="item in detail.items" :key="item.recallItemId" class="overview-section"><button class="quiet-button" @click="navigate('library',item.assetId)">{{ item.assetId }}</button><p>来源 {{ item.assetWorkspace ?? 'GLOBAL' }} · 交付 {{ item.deliveredMode }}</p><p>{{ item.deliveryReasons.join('、') }}</p><p>读取 {{ item.readCount }} · 使用 {{ item.totalUsedCount }}</p><code>{{ item.contentHash }}</code></section>
          <p v-if="!detail.items.length">本次召回没有交付条目。</p>
        </template>
        <template v-else-if="route.page === 'recalls'">
          <div class="table-scroll"><table><thead><tr><th>检索表达</th><th>授权范围</th><th>条目 / 字符</th><th>时间</th></tr></thead><tbody><tr v-for="item in recalls" :key="item.recallId"><td><button class="quiet-button recall-expressions" @click="navigate('recalls',item.recallId)"><span v-for="(query, index) in item.queries" :key="index">{{ query }}</span></button></td><td>GLOBAL + {{ item.authorizedWorkspaces.join('、') || '无项目' }}</td><td>{{ item.budget.deliveredAssets }} / {{ item.budget.modelVisibleCharacters }}</td><td>{{ formatDate(item.occurredAt) }}</td></tr></tbody></table></div><p v-if="!recalls.length">暂无已记录召回。</p>
        </template>
        <template v-else-if="route.page === 'usage'">
          <div class="table-scroll"><table><thead><tr><th>事实</th><th>知识 / 来源</th><th>授权范围</th><th>交付 Hash / 引用</th><th>时间</th></tr></thead><tbody><tr v-for="item in usage" :key="item.id"><td>{{ item.kind === 'READ' ? '读取' : '使用' }}</td><td><button class="quiet-button" @click="navigate('library',item.assetId)">{{ item.assetId }}</button><small>{{ item.assetWorkspace ?? 'GLOBAL' }}</small></td><td>GLOBAL + {{ item.authorizedWorkspaces.join('、') || '无项目' }}</td><td><code>{{ item.contentHash }}</code><small>{{ item.recallItemId ?? item.readRef }}</small></td><td>{{ formatDate(item.occurredAt) }}</td></tr></tbody></table></div><p v-if="!usage.length">暂无已记录读取或使用。</p>
        </template>
        <nav v-if="['recalls','usage'].includes(route.page) && !route.id" aria-label="事实分页"><button class="quiet-button" :disabled="offset === 0" @click="move(Math.max(0,offset-50))">上一页</button><span>{{ offset + 1 }}–{{ Math.min(offset+50,total) }} / {{ total }}</span><button class="quiet-button" :disabled="offset+50 >= total" @click="move(offset+50)">下一页</button></nav>
      </template>
    </div>
  </main>
</template>
<style scoped>
.recall-expressions { text-align: left; white-space: normal; overflow-wrap: anywhere; }
button.recall-expressions {
  display: block; width: 100%; min-width: 10rem; max-width: 32rem;
  height: auto; min-height: 28px; padding: 0; line-height: inherit;
}
.recall-expressions span { display: block; }
</style>
