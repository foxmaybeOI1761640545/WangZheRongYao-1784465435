<script setup>
const props = defineProps({
  status: { type: Object, required: true },
})

const emit = defineEmits(['sync', 'open'])

function statusLabel() {
  return props.status.message || '云同步'
}
</script>

<template>
  <div class="cloud-sync-status" :class="`is-${status.state}`" role="status">
    <button
      class="cloud-sync-summary"
      type="button"
      :aria-label="`云同步状态：${statusLabel()}。打开同步设置`"
      @click="emit('open')"
    >
      <span class="cloud-sync-dot" aria-hidden="true"></span>
      <span class="cloud-sync-copy">
        <strong>{{ statusLabel() }}</strong>
        <small v-if="status.revision">云端 revision {{ status.revision }}</small>
        <small v-else>设备 {{ status.deviceIdShort }}</small>
      </span>
    </button>
    <button
      class="cloud-sync-now"
      type="button"
      :disabled="status.state === 'syncing' || status.state === 'invalid-config'"
      aria-label="立即同步"
      @click="emit('sync')"
    >
      ↻
    </button>
  </div>
</template>

<style scoped>
.cloud-sync-status {
  display: flex;
  min-width: 0;
  height: 44px;
  overflow: hidden;
  border: 1px solid rgba(49, 88, 143, .22);
  border-radius: 14px;
  background: rgba(255, 255, 255, .9);
}

.cloud-sync-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  color: #263d65;
  background: transparent;
  box-shadow: none;
}

.cloud-sync-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #77849a;
}

.cloud-sync-copy {
  display: grid;
  min-width: 0;
  text-align: left;
}

.cloud-sync-copy strong,
.cloud-sync-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-sync-copy strong { font-size: 12px; }
.cloud-sync-copy small { color: #738097; font-size: 10px; }
.is-synced .cloud-sync-dot { background: #2c9b61; }
.is-syncing .cloud-sync-dot,
.is-pending .cloud-sync-dot { background: #d49526; }
.is-error .cloud-sync-dot,
.is-invalid-config .cloud-sync-dot { background: #c64e58; }
.is-offline .cloud-sync-dot,
.is-paused .cloud-sync-dot { background: #7f8795; }

.cloud-sync-now {
  width: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border-left: 1px solid rgba(49, 88, 143, .16);
  border-radius: 0;
  color: #31588f;
  background: transparent;
  box-shadow: none;
  font-size: 20px;
}

@media (max-width: 430px) {
  .cloud-sync-copy small { display: none; }
  .cloud-sync-summary { padding-inline: 8px; }
}
</style>
