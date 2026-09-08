<script setup lang="ts">
import { displayValue } from "./view-helpers.js";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client.js";
import type { SystemReadiness, SystemStatus } from "../api/types.js";
import { asHubApiError, formatDate, presentReadError } from "./view-helpers.js";

const api = new HubApiClient();
const status = ref<SystemStatus>();
const loading = ref(false);
const error = ref<HubApiError>();

let request = 0;
let controller: AbortController | undefined;

const errorCopy = computed(() =>
  presentReadError(error.value, "SYSTEM_STATUS"),
);

onMounted(() => void loadStatus());
onBeforeUnmount(() => controller?.abort());

async function loadStatus(): Promise<void> {
  const requestId = ++request;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = undefined;
  try {
    const result = await api.getSystemStatus(controller.signal);
    if (requestId === request) {
      status.value = result;
    }
  } catch (caught) {
    if (requestId !== request || isAbortError(caught)) {
      return;
    }
    status.value = undefined;
    error.value = asHubApiError(caught);
  } finally {
    if (requestId === request) {
      loading.value = false;
    }
  }
}

function readinessClass(readiness: SystemReadiness): string {
  return `readiness-${readiness.toLowerCase().replaceAll("_", "-")}`;
}

function formatCount(value: number | null): string {
  return value === null ? "未知 / 不可用" : String(value);
}

function formatOptionalDate(value: string | null): string {
  return value === null ? "未知 / 不可用" : formatDate(value);
}

function formatUptime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(wholeSeconds / 86_400);
  const hours = Math.floor((wholeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainder = wholeSeconds % 60;
  return [
    days > 0 ? `${days}天` : "",
    hours > 0 ? `${hours}时` : "",
    minutes > 0 ? `${minutes}分` : "",
    `${remainder}秒`,
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}
import PageHeader from "../components/PageHeader.vue";
</script>

<template>
  <main class="list-page">
    <PageHeader title="系统状态" subtitle="当前运行状态"
      ><button type="button" class="quiet-button" @click="loadStatus">
        刷新状态
      </button></PageHeader
    >
    <section class="list-scroll status-content" aria-label="系统状态">
      <div
        v-if="loading"
        class="state-panel status-state"
        role="status"
        aria-live="polite"
      >
        <span class="loading-line" aria-hidden="true"></span
        ><strong>正在读取系统状态…</strong>
      </div>
      <div
        v-else-if="error && errorCopy"
        class="state-panel status-state error-state"
        role="alert"
      >
        <p class="error-code mono">{{ error.code }}</p>
        <strong>{{ errorCopy.title }}</strong>
        <p>{{ errorCopy.detail }}</p>
        <button type="button" class="secondary-button" @click="loadStatus">
          重试
        </button>
      </div>
      <article v-else-if="status" class="status-sheet">
        <header class="status-verdict">
          <div>
            <p class="eyebrow">服务状态</p>
            <h3>
              {{ status.service.name }}
              <span>{{ status.service.version }}</span>
            </h3>
          </div>
          <span
            class="readiness-label"
            :class="readinessClass(status.service.readiness)"
            >{{ displayValue(status.service.readiness) }}</span
          >
        </header>

        <section aria-labelledby="service-status-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">本地运行</p>
              <h3 id="service-status-section">服务</h3>
            </div>
          </div>
          <dl class="status-definition-list">
            <div>
              <dt>名称</dt>
              <dd>{{ status.service.name }}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{{ status.service.version }}</dd>
            </div>
            <div>
              <dt>运行时长</dt>
              <dd>
                {{ formatUptime(status.service.uptimeSeconds) }}
                <small>({{ status.service.uptimeSeconds }} 秒)</small>
              </dd>
            </div>
            <div>
              <dt>就绪状态</dt>
              <dd>
                <span
                  class="readiness-label"
                  :class="readinessClass(status.service.readiness)"
                  >{{ displayValue(status.service.readiness) }}</span
                >
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="repository-status-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">知识原件</p>
              <h3 id="repository-status-section">知识仓库</h3>
            </div>
          </div>
          <dl class="status-definition-list">
            <div class="status-wide-row">
              <dt>知识仓库路径</dt>
              <dd>
                <code>{{ status.repository.assetRepositoryPath }}</code>
              </dd>
            </div>
            <div>
              <dt>正式资产</dt>
              <dd>{{ formatCount(status.repository.formalAssetCount) }}</dd>
            </div>
            <div>
              <dt>候选资产</dt>
              <dd>{{ formatCount(status.repository.inboxAssetCount) }}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="index-status-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">派生索引</p>
              <h3 id="index-status-section">索引</h3>
            </div>
          </div>
          <dl class="status-definition-list">
            <div>
              <dt>目录条目</dt>
              <dd>{{ formatCount(status.index.catalogCount) }}</dd>
            </div>
            <div>
              <dt>全文索引条目</dt>
              <dd>{{ formatCount(status.index.ftsCount) }}</dd>
            </div>
            <div>
              <dt>最近成功扫描</dt>
              <dd>
                {{ formatOptionalDate(status.index.lastSuccessfulScanAt) }}
              </dd>
            </div>
            <div>
              <dt>文件监听状态</dt>
              <dd>{{ displayValue(status.index.watcherState) }}</dd>
            </div>
            <div>
              <dt>索引状态</dt>
              <dd>
                <span
                  class="readiness-label"
                  :class="readinessClass(status.index.indexState)"
                  >{{ displayValue(status.index.indexState) }}</span
                >
              </dd>
            </div>
            <div>
              <dt>需要重建</dt>
              <dd>{{ status.index.rebuildRequired ? "是" : "否" }}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="mcp-status-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">连接入口</p>
              <h3 id="mcp-status-section">MCP 端点</h3>
            </div>
          </div>
          <dl class="status-definition-list">
            <div>
              <dt>端点路径</dt>
              <dd>
                <code>{{ status.mcpEndpoint.path }}</code>
              </dd>
            </div>
            <div>
              <dt>端点就绪</dt>
              <dd>{{ status.mcpEndpoint.ready ? "是" : "否" }}</dd>
            </div>
          </dl>
          <p class="boundary-note endpoint-boundary">
            <strong>连接说明</strong
            ><span
              >这里只表示本地 <code>/mcp</code> 端点是否就绪，不代表 Codex
              客户端已连接。</span
            >
          </p>
        </section>

        <section aria-labelledby="diagnostics-status-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">当前诊断</p>
              <h3 id="diagnostics-status-section">诊断信息</h3>
            </div>
            <span>{{ status.diagnostics.length }} 条</span>
          </div>
          <div
            v-if="status.diagnostics.length === 0"
            class="state-panel compact"
          >
            <strong>暂无诊断问题</strong>
            <p>本次检查没有返回诊断信息。</p>
          </div>
          <ol v-else class="status-diagnostics">
            <li
              v-for="(diagnostic, index) in status.diagnostics"
              :key="`${diagnostic.source}:${diagnostic.relativePath ?? ''}:${diagnostic.code}:${index}`"
            >
              <div>
                <span class="tag warning">{{ diagnostic.source }}</span
                ><code>{{ diagnostic.code }}</code>
              </div>
              <p>{{ diagnostic.message }}</p>
              <dl>
                <div v-if="diagnostic.relativePath">
                  <dt>相对路径</dt>
                  <dd>
                    <code>{{ diagnostic.relativePath }}</code>
                  </dd>
                </div>
                <div v-if="diagnostic.occurredAt">
                  <dt>发生时间</dt>
                  <dd>
                    <time :datetime="diagnostic.occurredAt">{{
                      formatDate(diagnostic.occurredAt)
                    }}</time>
                  </dd>
                </div>
              </dl>
            </li>
          </ol>
        </section>
      </article>
    </section>
  </main>
</template>
