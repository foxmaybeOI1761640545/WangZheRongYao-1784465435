<script setup>
import { computed } from 'vue'
import {
  cropTypeToCode,
  cropTypeToLabel,
  nextCropType,
} from '../domain/cropTypes.js'

const props = defineProps({
  groupName: { type: String, required: true },
  records: { type: Array, required: true },
})

const emit = defineEmits(['cycle-server-crop', 'done'])

const recordedCount = computed(() => (
  props.records.filter(({ server }) => server.cropType !== '').length
))

function groupPathLabel(record) {
  return record.groupPath.join(' / ')
}

function cropCycleLabel(server) {
  return `${server.serverName}，当前为${cropTypeToLabel(server.cropType)}，点击切换为${cropTypeToLabel(nextCropType(server.cropType))}`
}
</script>

<template>
  <section class="quick-crop-recorder" aria-labelledby="quick-crop-title">
    <header class="quick-crop-header">
      <div class="quick-crop-heading">
        <span class="section-kicker">Farm workflow</span>
        <h2 id="quick-crop-title">快速记录</h2>
        <p>{{ groupName }}</p>
      </div>
      <div class="quick-crop-progress" aria-live="polite">
        <strong>{{ recordedCount }} / {{ records.length }}</strong>
        <span>已记录</span>
      </div>
      <button class="button primary quick-crop-done" type="button" @click="emit('done')">
        完成
      </button>
    </header>

    <div class="quick-crop-scroll">
      <div class="quick-crop-list">
        <div v-for="record in records" :key="record.server.id" class="quick-crop-row">
          <div class="quick-crop-server">
            <strong>{{ record.server.serverName }}</strong>
            <span>{{ record.server.accountId || '未填写 ID' }}</span>
            <small v-if="groupPathLabel(record)">{{ groupPathLabel(record) }}</small>
          </div>
          <button
            class="quick-crop-cycle"
            :class="{ unrecorded: record.server.cropType === '' }"
            type="button"
            :aria-label="cropCycleLabel(record.server)"
            :title="cropCycleLabel(record.server)"
            @click="emit('cycle-server-crop', record.server.id)"
          >
            {{ cropTypeToCode(record.server.cropType) }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
