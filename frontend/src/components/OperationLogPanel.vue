<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Delete, Document } from "@element-plus/icons-vue";

import {
  appLogger,
  type AppLogEntry,
  type AppLogLevel,
} from "../services/logger";

const entries = ref<AppLogEntry[]>([]);
let unsubscribe: (() => void) | null = null;

const levelLabels: Record<AppLogLevel, string> = {
  info: "信息",
  success: "成功",
  warning: "警告",
  error: "错误",
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

onMounted(() => {
  unsubscribe = appLogger.subscribe((nextEntries) => {
    entries.value = [...nextEntries].reverse();
  });
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
});
</script>

<template>
  <section class="panel operation-log-panel">
    <header class="panel-header">
      <div>
        <p class="section-label">运行记录</p>
        <h2>操作日志</h2>
      </div>
      <el-button
        :icon="Delete"
        circle
        aria-label="清空操作日志"
        :disabled="entries.length === 0"
        @click="appLogger.clear()"
      />
    </header>

    <div v-if="entries.length" class="log-list" role="log">
      <article
        v-for="entry in entries"
        :key="entry.id"
        class="log-entry"
        :class="`log-${entry.level}`"
      >
        <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
        <span class="log-level">{{ levelLabels[entry.level] }}</span>
        <div class="log-copy">
          <strong>{{ entry.message }}</strong>
          <code v-if="entry.detail">{{ entry.detail }}</code>
        </div>
      </article>
    </div>
    <div v-else class="log-empty">
      <Document />
      <span>暂无操作日志</span>
    </div>
  </section>
</template>
