<script setup>
import { computed } from 'vue'
import {
  farmReminderTargetAt,
  formatFarmCountdown,
} from '../domain/farmReminders.js'
import { formatFarmTargetTime } from '../domain/farmCalculator.js'

const props = defineProps({
  server: { type: Object, required: true },
  waterEnabled: { type: Boolean, default: false },
  harvestEnabled: { type: Boolean, default: false },
  nowMs: { type: Number, required: true },
  capability: { type: Object, required: true },
  nativeAndroid: { type: Boolean, default: false },
  webPermission: { type: String, default: 'default' },
  busy: { type: Boolean, default: false },
  notice: { type: String, default: '' },
  manualCopyText: { type: String, default: '' },
  showApply: { type: Boolean, default: true },
})

const emit = defineEmits([
  'update:water-enabled',
  'update:harvest-enabled',
  'apply',
  'request-exact',
  'copy',
])

const waterTarget = computed(() => farmReminderTargetAt(props.server, 'water'))
const harvestTarget = computed(() => farmReminderTargetAt(props.server, 'harvest'))

function reminderStatus(reminderType, enabled) {
  if (!enabled) return '未开启'
  const targetAt = reminderType === 'water' ? waterTarget.value : harvestTarget.value
  if (targetAt <= props.nowMs) return reminderType === 'water' ? '已到浇水时间' : '已到收获时间'
  if (props.nativeAndroid) {
    if (props.capability.capability === 'exact') return '已开启 · 精确'
    if (props.capability.capability === 'inexact') return '已开启 · 可能延迟'
    return '权限不足'
  }
  if (props.webPermission === 'granted') return '网页提醒已开启'
  return '等待网页通知授权'
}
</script>

<template>
  <section class="farm-reminder-settings" aria-labelledby="farm-reminder-settings-title">
    <div class="farm-reminder-heading">
      <div>
        <span class="section-kicker">Farm reminders</span>
        <h4 id="farm-reminder-settings-title">提醒设置</h4>
      </div>
      <span class="reminder-capability" :class="capability.capability">
        <template v-if="nativeAndroid">
          {{ capability.capability === 'exact' ? '精确提醒可用' : capability.capability === 'inexact' ? '普通提醒，可能延迟' : '系统通知权限不足' }}
        </template>
        <template v-else>网页打开期间提醒</template>
      </span>
    </div>

    <label class="farm-reminder-option">
      <input
        type="checkbox"
        :checked="waterEnabled"
        @change="emit('update:water-enabled', $event.target.checked)"
      />
      <span>
        <strong>浇水提醒</strong>
        <small>
          {{ formatFarmCountdown(waterTarget, nowMs, '已到浇水时间') }}
          · {{ formatFarmTargetTime(waterTarget, nowMs) }}
        </small>
      </span>
      <em>{{ reminderStatus('water', waterEnabled) }}</em>
    </label>

    <label class="farm-reminder-option">
      <input
        type="checkbox"
        :checked="harvestEnabled"
        @change="emit('update:harvest-enabled', $event.target.checked)"
      />
      <span>
        <strong>收获提醒</strong>
        <small>
          {{ formatFarmCountdown(harvestTarget, nowMs, '已到收获时间') }}
          · {{ formatFarmTargetTime(harvestTarget, nowMs) }}
        </small>
      </span>
      <em>{{ reminderStatus('harvest', harvestEnabled) }}</em>
    </label>

    <p class="farm-reminder-boundary">
      <template v-if="nativeAndroid">
        精确权限未开启时仍会尝试普通本地通知，但系统可能延迟送达。
      </template>
      <template v-else>
        网页提醒仅在当前页面保持打开时检查；关闭浏览器后无法保证通知。
      </template>
    </p>

    <p v-if="notice" class="farm-reminder-notice" role="status">{{ notice }}</p>
    <textarea
      v-if="manualCopyText"
      class="farm-manual-copy"
      :value="manualCopyText"
      readonly
      aria-label="可手动复制的农场时间"
      @focus="$event.target.select()"
    ></textarea>

    <div class="farm-reminder-copy-actions">
      <button class="text-button" type="button" @click="emit('copy', 'water')">复制浇水时间</button>
      <button class="text-button" type="button" @click="emit('copy', 'harvest')">复制收获时间</button>
      <button class="text-button" type="button" @click="emit('copy', 'all')">复制全部时间</button>
    </div>

    <div class="farm-reminder-setting-actions">
      <button
        v-if="nativeAndroid && capability.capability !== 'exact'"
        class="button secondary"
        type="button"
        @click="emit('request-exact')"
      >
        打开精确提醒设置
      </button>
      <button
        v-if="showApply"
        class="button primary"
        type="button"
        :disabled="busy"
        @click="emit('apply')"
      >
        {{ nativeAndroid ? '应用提醒设置' : '开启网页提醒' }}
      </button>
    </div>
  </section>
</template>
