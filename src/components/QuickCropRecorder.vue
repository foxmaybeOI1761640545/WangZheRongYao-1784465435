<script setup>
import { computed, ref, watch } from 'vue'
import {
  CROP_OPTIONS,
  cropTypeToCode,
  cropTypeToLabel,
  nextCropType,
} from '../domain/cropTypes.js'

const props = defineProps({
  groupName: { type: String, required: true },
  records: { type: Array, required: true },
  batchMode: { type: Boolean, default: false },
  lastBatchResult: { type: Object, default: null },
})

const emit = defineEmits([
  'cycle-server-crop',
  'apply-batch',
  'undo-batch',
  'update:batch-mode',
  'done',
])

const selectedIds = ref([])
const targetCropType = ref(null)
const pendingTarget = ref(undefined)

const recordedCount = computed(() => (
  props.records.filter(({ server }) => server.cropType !== '').length
))
const selectedCount = computed(() => selectedIds.value.length)
const allSelected = computed(() => (
  props.records.length > 0 && selectedCount.value === props.records.length
))
const selectedIdSet = computed(() => new Set(selectedIds.value))

watch(() => props.batchMode, (batchMode) => {
  if (batchMode) return
  selectedIds.value = []
  targetCropType.value = null
  pendingTarget.value = undefined
})

watch(() => props.records.map(({ server }) => server.id), (ids) => {
  const available = new Set(ids)
  selectedIds.value = selectedIds.value.filter((id) => available.has(id))
})

function groupPathLabel(record) {
  return record.groupPath.join(' / ')
}

function cropCycleLabel(server) {
  return `${server.serverName}，当前为${cropTypeToLabel(server.cropType)}，点击切换为${cropTypeToLabel(nextCropType(server.cropType))}`
}

function toggleSelected(serverId) {
  if (!props.batchMode) return
  const next = new Set(selectedIds.value)
  if (next.has(serverId)) next.delete(serverId)
  else next.add(serverId)
  selectedIds.value = [...next]
}

function selectAll() {
  selectedIds.value = props.records.map(({ server }) => server.id)
}

function clearSelection() {
  selectedIds.value = []
}

function enterBatchMode() {
  selectedIds.value = []
  targetCropType.value = null
  emit('update:batch-mode', true)
}

function cancelBatchMode() {
  emit('update:batch-mode', false)
}

function targetActionLabel() {
  if (targetCropType.value === null) return '请选择目标作物'
  const label = cropTypeToLabel(targetCropType.value)
  return `将 ${selectedCount.value} 个账号设为${targetCropType.value ? ` ${label}` : '未记录'}`
}

function requestBatchApply() {
  if (!selectedCount.value) return
  pendingTarget.value = targetCropType.value
}

function confirmBatchApply() {
  emit('apply-batch', {
    serverIds: [...selectedIds.value],
    cropType: pendingTarget.value,
  })
  pendingTarget.value = undefined
}
</script>

<template>
  <section class="quick-crop-recorder" aria-labelledby="quick-crop-title">
    <header class="quick-crop-header" :class="{ 'batch-active': batchMode }">
      <div class="quick-crop-heading">
        <span class="section-kicker">Farm workflow</span>
        <h2 id="quick-crop-title">{{ batchMode ? '批量调整' : '快速记录' }}</h2>
        <p>{{ groupName }}</p>
      </div>
      <div class="quick-crop-progress" aria-live="polite">
        <strong>{{ batchMode ? selectedCount : recordedCount }} / {{ records.length }}</strong>
        <span>{{ batchMode ? '已选择' : '已记录' }}</span>
      </div>
      <button
        v-if="batchMode"
        class="button secondary quick-crop-done"
        type="button"
        @click="cancelBatchMode"
      >
        取消
      </button>
      <button v-else class="button primary quick-crop-done" type="button" @click="emit('done')">
        完成
      </button>
    </header>

    <div class="quick-crop-scroll">
      <section v-if="batchMode" class="batch-crop-toolbar" aria-label="批量作物操作">
        <div class="batch-selection-actions">
          <button class="text-button" type="button" :disabled="allSelected" @click="selectAll">全选当前范围</button>
          <button class="text-button" type="button" :disabled="!selectedCount" @click="clearSelection">清空选择</button>
        </div>
        <div class="batch-crop-targets" role="group" aria-label="批量目标作物">
          <span>设为：</span>
          <button
            v-for="item in CROP_OPTIONS"
            :key="item.value || 'unrecorded'"
            type="button"
            :class="{ active: targetCropType === item.value }"
            :aria-pressed="targetCropType === item.value"
            @click="targetCropType = item.value"
          >
            {{ cropTypeToCode(item.value) }}
          </button>
        </div>
        <button
          class="button primary batch-apply-button"
          type="button"
          :disabled="!selectedCount || targetCropType === null"
          @click="requestBatchApply"
        >
          {{ targetActionLabel() }}
        </button>
      </section>

      <div v-else class="quick-crop-secondary-actions">
        <button class="button secondary" type="button" @click="enterBatchMode">批量调整</button>
        <span
          v-if="lastBatchResult"
          class="batch-undo-message"
          role="status"
        >
          <span v-if="lastBatchResult.updatedCount">
            已将 {{ lastBatchResult.updatedCount }} 个账号设置为{{ cropTypeToLabel(lastBatchResult.cropType) }}
          </span>
          <span v-else>所选账号已经是目标作物，无需修改</span>
          <button
            v-if="lastBatchResult.updatedCount"
            class="text-button"
            type="button"
            @click="emit('undo-batch')"
          >
            撤销
          </button>
        </span>
      </div>

      <div class="quick-crop-list" :class="{ 'batch-list': batchMode }">
        <div
          v-for="record in records"
          :key="record.server.id"
          class="quick-crop-row"
          :class="{ selected: selectedIdSet.has(record.server.id), selectable: batchMode }"
          @click="toggleSelected(record.server.id)"
        >
          <input
            v-if="batchMode"
            class="batch-server-checkbox"
            type="checkbox"
            :checked="selectedIdSet.has(record.server.id)"
            :aria-label="`选择 ${record.server.serverName}`"
            @click.stop="toggleSelected(record.server.id)"
          />
          <div class="quick-crop-server">
            <strong>{{ record.server.serverName }}</strong>
            <span>{{ record.server.accountId || '未填写 ID' }}</span>
            <small v-if="groupPathLabel(record)">{{ groupPathLabel(record) }}</small>
          </div>
          <span
            v-if="batchMode"
            class="quick-crop-cycle readonly"
            :class="{ unrecorded: record.server.cropType === '' }"
            :aria-label="`${record.server.serverName} 当前为${cropTypeToLabel(record.server.cropType)}`"
          >
            {{ cropTypeToCode(record.server.cropType) }}
          </span>
          <button
            v-else
            class="quick-crop-cycle"
            :class="{ unrecorded: record.server.cropType === '' }"
            type="button"
            :aria-label="cropCycleLabel(record.server)"
            :title="cropCycleLabel(record.server)"
            @click.stop="emit('cycle-server-crop', record.server.id)"
          >
            {{ cropTypeToCode(record.server.cropType) }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="pendingTarget !== undefined" class="modal-backdrop" @click.self="pendingTarget = undefined">
        <section class="modal batch-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="batch-confirm-title">
          <div class="modal-heading">
            <div>
              <span class="section-kicker">Batch crop</span>
              <h3 id="batch-confirm-title">确认批量调整</h3>
            </div>
            <button class="icon-button" type="button" aria-label="关闭批量确认" @click="pendingTarget = undefined">×</button>
          </div>
          <p>
            确定将所选 {{ selectedCount }} 个账号统一设置为
            <strong>{{ cropTypeToLabel(pendingTarget) }}</strong>吗？
          </p>
          <dl class="batch-confirm-summary">
            <div><dt>账号数量</dt><dd>{{ selectedCount }}</dd></div>
            <div><dt>目标作物</dt><dd>{{ cropTypeToLabel(pendingTarget) }}</dd></div>
            <div><dt>当前范围</dt><dd>{{ groupName }}</dd></div>
          </dl>
          <p class="batch-clear-warning">修改作物后，对应账号原有的农场时间计算将被清除。</p>
          <div class="modal-actions">
            <button class="button secondary" type="button" @click="pendingTarget = undefined">取消</button>
            <button class="button primary" type="button" @click="confirmBatchApply">确认批量调整</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
