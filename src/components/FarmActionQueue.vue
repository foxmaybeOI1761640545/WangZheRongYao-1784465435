<script setup>
import { computed, nextTick } from 'vue'
import {
  FARM_ACTION_STATUS,
  FARM_ACTION_STATUS_META,
  FARM_ACTION_STATUS_ORDER,
  farmActionAriaLabel,
  farmActionPrimaryCommand,
} from '../domain/farmActions.js'
import { cropTypeToCode, cropTypeToLabel, nextCropType } from '../domain/cropTypes.js'
import { formatFarmTargetTime } from '../domain/farmCalculator.js'
import { formatFarmCountdown } from '../domain/farmReminders.js'

const props = defineProps({
  records: { type: Array, required: true },
  summary: { type: Object, required: true },
  groupName: { type: String, required: true },
  nowMs: { type: Number, required: true },
  recordableServerCount: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update-view',
  'primary-command',
  'cycle-server-crop',
  'open-quick-recorder',
])

const summaryItems = computed(() => FARM_ACTION_STATUS_ORDER
  .map((status) => ({
    status,
    label: FARM_ACTION_STATUS_META[status].label,
    count: props.summary[status] ?? 0,
  }))
  .filter((item) => item.count > 0))

function groupPathLabel(record) {
  return [props.groupName, ...record.groupPath].filter(Boolean).join(' / ')
}

function cropCycleLabel(server) {
  return `${server.serverName}，当前为${cropTypeToLabel(server.cropType)}，点击切换为${cropTypeToLabel(nextCropType(server.cropType))}`
}

function targetLabel(record) {
  const farmAction = record.farmAction
  if (farmAction.status === FARM_ACTION_STATUS.UNRECORDED) return '请先设置当前作物'
  if (farmAction.status === FARM_ACTION_STATUS.UNSCHEDULED) return '尚未保存农场时间'
  const targetAt = farmAction.targetAt
  if (farmAction.status === FARM_ACTION_STATUS.WATER) {
    return `浇水：${formatFarmCountdown(targetAt, props.nowMs, '已到时间')} · ${formatFarmTargetTime(targetAt, props.nowMs)}`
  }
  return `最快成熟：${formatFarmCountdown(targetAt, props.nowMs, '已到时间')} · ${formatFarmTargetTime(targetAt, props.nowMs)}`
}

function handlePrimary(record, event) {
  const command = farmActionPrimaryCommand(record.farmAction)
  if (!command) return
  if (command.key === 'set-crop') {
    void nextTick(() => {
      event.currentTarget
        ?.closest('.farm-action-card')
        ?.querySelector('.farm-action-crop')
        ?.focus()
    })
    return
  }
  emit('primary-command', {
    serverId: record.server.id,
    command: command.key,
    trigger: event.currentTarget,
  })
}
</script>

<template>
  <section class="content-section farm-action-section" aria-labelledby="farm-action-title">
    <div class="section-heading farm-action-heading">
      <div>
        <span class="section-kicker">Action queue</span>
        <h3 id="farm-action-title">区服账号</h3>
      </div>
      <div class="farm-action-heading-actions">
        <button
          v-if="recordableServerCount"
          class="button secondary quick-record-launch"
          type="button"
          @click="emit('open-quick-recorder')"
        >
          快速记录
        </button>
        <div class="farm-action-view-switch" role="group" aria-label="区服账号查看模式">
          <button class="active" type="button" aria-pressed="true">行动优先</button>
          <button type="button" aria-pressed="false" @click="emit('update-view', 'original')">原顺序</button>
        </div>
      </div>
    </div>

    <div class="farm-action-summary" aria-label="农场行动状态摘要">
      <span v-for="item in summaryItems" :key="item.status">
        {{ item.label }} <strong>{{ item.count }}</strong>
      </span>
    </div>

    <div class="farm-action-list">
      <article
        v-for="record in records"
        :key="record.server.id"
        class="farm-action-card"
        :class="record.farmAction.cssClass"
        :aria-label="farmActionAriaLabel(record.server, record.farmAction)"
      >
        <div class="farm-action-status-row">
          <span class="farm-action-status">
            <span aria-hidden="true">{{ record.farmAction.icon }}</span>
            {{ record.farmAction.label }}
          </span>
          <button
            class="farm-action-crop"
            :class="{ unrecorded: record.server.cropType === '' }"
            type="button"
            :aria-label="cropCycleLabel(record.server)"
            :title="cropCycleLabel(record.server)"
            @click="emit('cycle-server-crop', record.server.id)"
          >
            {{ cropTypeToCode(record.server.cropType) }}
          </button>
        </div>
        <strong class="farm-action-account">
          {{ record.server.serverName }} · {{ record.server.accountId || '未填写 ID' }}
        </strong>
        <small class="farm-action-group-path">{{ groupPathLabel(record) }}</small>
        <p class="farm-action-target">{{ targetLabel(record) }}</p>
        <button
          class="button primary farm-action-primary"
          type="button"
          @click="handlePrimary(record, $event)"
        >
          {{ farmActionPrimaryCommand(record.farmAction)?.label }}
        </button>
      </article>
    </div>
  </section>
</template>
