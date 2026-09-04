<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { HubApiClient, HubApiError, isAbortError } from "../api/client";
import type { SystemReadiness, SystemStatus } from "../api/types";
import { asHubApiError, formatDate, presentReadError } from "./view-helpers";

const api = new HubApiClient();
const status = ref<SystemStatus>();
const loading = ref(false);
const error = ref<HubApiError>();

let request = 0;
let controller: AbortController | undefined;

const errorCopy = computed(() => presentReadError(error.value, "SYSTEM_STATUS"));

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
  return value === null ? "Unknown / unavailable" : String(value);
}

function formatOptionalDate(value: string | null): string {
  return value === null ? "Unknown / unavailable" : formatDate(value);
}

function formatUptime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(wholeSeconds / 86_400);
  const hours = Math.floor((wholeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainder = wholeSeconds % 60;
  return [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : "", minutes > 0 ? `${minutes}m` : "", `${remainder}s`]
    .filter((part) => part.length > 0)
    .join(" ");
}
</script>

<template>
  <main class="report-workbench status-report" aria-labelledby="system-status-heading">
    <header class="report-header">
      <div><p class="eyebrow">Current process report</p><h2 id="system-status-heading">System Status</h2></div>
      <button type="button" class="secondary-button" @click="loadStatus">Refresh status</button>
    </header>
    <p class="supporting-copy report-intro">Calculated on request from the running service, repository scan, index, watcher, and local endpoint. This view does not poll or keep history.</p>

    <div v-if="loading" class="state-panel status-state" role="status" aria-live="polite"><span class="loading-line" aria-hidden="true"></span><strong>Calculating current status…</strong></div>
    <div v-else-if="error && errorCopy" class="state-panel status-state error-state" role="alert"><p class="error-code mono">{{ error.code }}</p><strong>{{ errorCopy.title }}</strong><p>{{ errorCopy.detail }}</p><button type="button" class="secondary-button" @click="loadStatus">Retry</button></div>
    <article v-else-if="status" class="status-sheet">
      <header class="status-verdict">
        <div><p class="eyebrow">Service readiness</p><h3>{{ status.service.name }} <span>{{ status.service.version }}</span></h3></div>
        <span class="readiness-label" :class="readinessClass(status.service.readiness)">{{ status.service.readiness }}</span>
      </header>

      <section aria-labelledby="service-status-section">
        <div class="section-heading"><div><p class="eyebrow">Runtime</p><h3 id="service-status-section">Service</h3></div></div>
        <dl class="status-definition-list">
          <div><dt>Name</dt><dd>{{ status.service.name }}</dd></div>
          <div><dt>Version</dt><dd>{{ status.service.version }}</dd></div>
          <div><dt>Uptime</dt><dd>{{ formatUptime(status.service.uptimeSeconds) }} <small>({{ status.service.uptimeSeconds }} seconds)</small></dd></div>
          <div><dt>Readiness</dt><dd><span class="readiness-label" :class="readinessClass(status.service.readiness)">{{ status.service.readiness }}</span></dd></div>
        </dl>
      </section>

      <section aria-labelledby="repository-status-section">
        <div class="section-heading"><div><p class="eyebrow">Current files</p><h3 id="repository-status-section">Repository</h3></div></div>
        <dl class="status-definition-list">
          <div class="status-wide-row"><dt>Asset Repository path</dt><dd><code>{{ status.repository.assetRepositoryPath }}</code></dd></div>
          <div><dt>Formal Assets</dt><dd>{{ formatCount(status.repository.formalAssetCount) }}</dd></div>
          <div><dt>Inbox Assets</dt><dd>{{ formatCount(status.repository.inboxAssetCount) }}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="index-status-section">
        <div class="section-heading"><div><p class="eyebrow">Projection health</p><h3 id="index-status-section">Index</h3></div></div>
        <dl class="status-definition-list">
          <div><dt>Catalog count</dt><dd>{{ formatCount(status.index.catalogCount) }}</dd></div>
          <div><dt>FTS count</dt><dd>{{ formatCount(status.index.ftsCount) }}</dd></div>
          <div><dt>Last successful scan</dt><dd>{{ formatOptionalDate(status.index.lastSuccessfulScanAt) }}</dd></div>
          <div><dt>Watcher state</dt><dd>{{ status.index.watcherState }}</dd></div>
          <div><dt>Index state</dt><dd><span class="readiness-label" :class="readinessClass(status.index.indexState)">{{ status.index.indexState }}</span></dd></div>
          <div><dt>Rebuild required</dt><dd>{{ status.index.rebuildRequired ? 'YES' : 'NO' }}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="mcp-status-section">
        <div class="section-heading"><div><p class="eyebrow">Local HTTP surface</p><h3 id="mcp-status-section">MCP Endpoint</h3></div></div>
        <dl class="status-definition-list">
          <div><dt>Path</dt><dd><code>{{ status.mcpEndpoint.path }}</code></dd></div>
          <div><dt>Endpoint ready</dt><dd>{{ status.mcpEndpoint.ready ? 'YES' : 'NO' }}</dd></div>
        </dl>
        <p class="boundary-note endpoint-boundary"><strong>Endpoint scope</strong><span>This only reports whether the local <code>/mcp</code> endpoint is ready. It does not claim that any Codex client is connected.</span></p>
      </section>

      <section aria-labelledby="diagnostics-status-section">
        <div class="section-heading"><div><p class="eyebrow">Service-provided order</p><h3 id="diagnostics-status-section">Diagnostics</h3></div><span>{{ status.diagnostics.length }} shown</span></div>
        <div v-if="status.diagnostics.length === 0" class="state-panel compact"><strong>No diagnostics</strong><p>The current calculated response contains no diagnostic rows.</p></div>
        <ol v-else class="status-diagnostics">
          <li v-for="(diagnostic, index) in status.diagnostics" :key="`${diagnostic.source}:${diagnostic.relativePath ?? ''}:${diagnostic.code}:${index}`">
            <div><span class="tag warning">{{ diagnostic.source }}</span><code>{{ diagnostic.code }}</code></div>
            <p>{{ diagnostic.message }}</p>
            <dl><div v-if="diagnostic.relativePath"><dt>Relative path</dt><dd><code>{{ diagnostic.relativePath }}</code></dd></div><div v-if="diagnostic.occurredAt"><dt>Occurred</dt><dd><time :datetime="diagnostic.occurredAt">{{ formatDate(diagnostic.occurredAt) }}</time></dd></div></dl>
          </li>
        </ol>
      </section>
    </article>
  </main>
</template>
