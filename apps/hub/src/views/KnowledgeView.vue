<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, ref, watch } from "vue";
import { HubApiClient, isAbortError } from "../api/client.js";
import type { WorkspaceProjection, ScenarioProjection, RecallProjection, RecallDetail, UsageProjection } from "../api/types.js";
import PageHeader from "../components/PageHeader.vue";
import { navigate, useRoute } from "../navigation.js";
import { formatDate } from "./view-helpers.js";
const route = useRoute(); const api = new HubApiClient();
const workspaces = ref<WorkspaceProjection>(); const scenarios = ref<ScenarioProjection>();
const recalls = ref<RecallProjection[]>([]); const usage = ref<UsageProjection[]>([]); const detail = ref<RecallDetail>();
const total = ref(0); const loading = ref(false); const error = ref("");
const offset = computed(() => { const n = Number(new URLSearchParams(route.value.query).get('offset') ?? 0); return Number.isSafeInteger(n) && n >= 0 ? n : 0; });
const title = computed(() => ({ workspaces: '工作区', scenarios: '场景', recalls: '召回记录', usage: '使用记录' })[route.value.page as 'workspaces' | 'scenarios' | 'recalls' | 'usage'] ?? '知识');
let controller: AbortController | undefined;
async function refresh() {
  if (!['workspaces','scenarios','recalls','usage'].includes(route.value.page)) return;
  controller?.abort(); const current = new AbortController(); controller = current;
  loading.value = true; error.value = ''; detail.value = undefined;
  try {
    const page = route.value.page;
    if (page === 'workspaces') { const result = await api.getWorkspaces(current.signal); if (controller === current) workspaces.value = result; }
    else if (page === 'scenarios') { const result = await api.getScenarios(current.signal); if (controller === current) scenarios.value = result; }
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
          <div class="table-scroll"><table><thead><tr><th>工作区 / 标签</th><th>知识</th><th>可选场景</th><th>授权操作（召回 / 读 / 用）</th><th>来源事实（召回 / 读 / 用）</th></tr></thead>
            <tbody><tr v-for="item in workspaces.items" :key="item.name"><td>{{ item.name }}<small>{{ item.kinds.join('、') || '无标签' }}</small></td><td>{{ item.assetCount }}</td><td>{{ item.scenarios.join('、') || '无' }}</td><td>{{ item.authorizedRecallCount }} / {{ item.authorizedReadCount }} / {{ item.authorizedUsedCount }}</td><td>{{ item.sourceRecallCount }} / {{ item.sourceReadCount }} / {{ item.sourceUsedCount }}</td></tr></tbody></table></div>
          <p v-if="!workspaces.items.length">暂无配置工作区。</p>
        </template>
        <template v-else-if="route.page === 'scenarios' && scenarios">
          <p>未经过实际净收益验收的场景保持禁用。关联数量与使用次数不代表净收益；多原因归因不可相加作为全库总量。</p>
          <p v-for="code in scenarios.diagnostics" :key="code">{{ code }}</p>
          <section v-for="item in scenarios.scenarios" :key="item.id" class="overview-section"><h2>{{ item.name }} · {{ item.enabled ? '已启用' : '禁用 / 待人工验证' }}</h2><p>{{ item.description }}</p><p>适用标签：{{ item.applicableKinds.join('、') || '通用' }} · 激活 {{ item.activationCount }} · 贡献 {{ item.contributionCount }} · 使用 {{ item.usedCount }}</p><ul><li v-for="asset in item.assets" :key="asset.assetId"><button class="quiet-button" @click="navigate('library', asset.assetId)">{{ asset.assetId }}</button> {{ asset.mode }}</li></ul></section>
          <p v-if="!scenarios.scenarios.length">暂无场景；基础 Query 召回仍可使用。</p>
        </template>
        <template v-else-if="route.page === 'recalls' && detail">
          <button class="quiet-button" @click="navigate('recalls')">返回召回列表</button><h2>{{ detail.operation.query }}</h2>
          <p>授权：GLOBAL + {{ detail.operation.authorizedWorkspaces.join('、') || '无项目' }} · 场景 {{ detail.operation.scenarios.join('、') || '无' }}</p>
          <p>字符 {{ detail.operation.budget.modelVisibleCharacters }} / {{ detail.operation.budget.maxModelVisibleCharacters }}（知识 {{ detail.operation.budget.knowledgeContentCharacters }}，元数据 {{ detail.operation.budget.metadataCharacters }}）· DIRECT {{ detail.operation.budget.directBucketAssets }} / Query {{ detail.operation.budget.queryBucketAssets }} · 省略 {{ detail.operation.budget.omittedCount }}</p>
          <p>{{ detail.operation.diagnostics.join('、') }}</p>
          <section v-for="item in detail.items" :key="item.recallItemId" class="overview-section"><button class="quiet-button" @click="navigate('library',item.assetId)">{{ item.assetId }}</button><p>来源 {{ item.assetWorkspace ?? 'GLOBAL' }} · {{ item.bucket }} · 交付 {{ item.deliveredMode }} · 请求 {{ item.requestedMode ?? '基础匹配' }}</p><p>{{ item.selectionReasons.join('、') }} · {{ item.deliveryReasons.join('、') }}</p><p>读取 {{ item.readCount }} · 使用 {{ item.totalUsedCount }}</p><code>{{ item.contentHash }}</code></section>
          <p v-if="!detail.items.length">本次召回没有交付条目。</p>
        </template>
        <template v-else-if="route.page === 'recalls'">
          <div class="table-scroll"><table><thead><tr><th>Query</th><th>授权范围</th><th>场景</th><th>条目 / 字符</th><th>时间</th></tr></thead><tbody><tr v-for="item in recalls" :key="item.recallId"><td><button class="quiet-button" @click="navigate('recalls',item.recallId)">{{ item.query }}</button></td><td>GLOBAL + {{ item.authorizedWorkspaces.join('、') || '无项目' }}</td><td>{{ item.scenarios.join('、') || '无' }}</td><td>{{ item.budget.deliveredAssets }} / {{ item.budget.modelVisibleCharacters }}</td><td>{{ formatDate(item.occurredAt) }}</td></tr></tbody></table></div><p v-if="!recalls.length">暂无已记录召回。</p>
        </template>
        <template v-else-if="route.page === 'usage'">
          <div class="table-scroll"><table><thead><tr><th>事实</th><th>知识 / 来源</th><th>授权范围</th><th>交付 Hash / 引用</th><th>时间</th></tr></thead><tbody><tr v-for="item in usage" :key="item.id"><td>{{ item.kind === 'READ' ? '读取' : '使用' }}</td><td><button class="quiet-button" @click="navigate('library',item.assetId)">{{ item.assetId }}</button><small>{{ item.assetWorkspace ?? 'GLOBAL' }}</small></td><td>GLOBAL + {{ item.authorizedWorkspaces.join('、') || '无项目' }}</td><td><code>{{ item.contentHash }}</code><small>{{ item.recallItemId ?? item.readRef }}</small></td><td>{{ formatDate(item.occurredAt) }}</td></tr></tbody></table></div><p v-if="!usage.length">暂无已记录读取或使用。</p>
        </template>
        <nav v-if="['recalls','usage'].includes(route.page) && !route.id" aria-label="事实分页"><button class="quiet-button" :disabled="offset === 0" @click="move(Math.max(0,offset-50))">上一页</button><span>{{ offset + 1 }}–{{ Math.min(offset+50,total) }} / {{ total }}</span><button class="quiet-button" :disabled="offset+50 >= total" @click="move(offset+50)">下一页</button></nav>
      </template>
    </div>
  </main>
</template>
