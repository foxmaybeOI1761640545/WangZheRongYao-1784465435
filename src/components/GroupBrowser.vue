<script setup>
import { computed, nextTick, ref } from 'vue'
import {
  cropTypeToCode,
  cropTypeToLabel,
  nextCropType,
} from '../domain/cropTypes.js'
import { formatFarmTargetTime } from '../domain/farmCalculator.js'
import { formatFarmCountdown } from '../domain/farmReminders.js'
import { analyseFarmActionRecords } from '../domain/farmActions.js'
import FarmActionQueue from './FarmActionQueue.vue'

const props = defineProps({
  group: { type: Object, required: true },
  breadcrumbs: { type: Array, required: true },
  recordableServerCount: { type: Number, default: 0 },
  recursiveServerRecords: { type: Array, default: () => [] },
  actionView: { type: String, default: 'action' },
  nowMs: { type: Number, required: true },
})

const emit = defineEmits([
  'navigate-group',
  'navigate-server',
  'add-group',
  'add-server',
  'open-settings',
  'delete-group',
  'delete-server',
  'cycle-server-crop',
  'open-farm-calculator',
  'open-quick-recorder',
  'update-action-view',
  'farm-action-command',
])

const cropPromptServerId = ref('')
const childGroups = computed(() => props.group.children.filter((item) => item.type === 'group'))
const servers = computed(() => props.group.children.filter((item) => item.type === 'server'))
const isEmpty = computed(() => props.group.children.length === 0)
const actionAnalysis = computed(() => (
  analyseFarmActionRecords(props.recursiveServerRecords, props.nowMs)
))

function cropCycleLabel(server) {
  return `${server.serverName}，当前为${cropTypeToLabel(server.cropType)}，点击切换为${cropTypeToLabel(nextCropType(server.cropType))}`
}

function compactTargetTime(timestamp) {
  return formatFarmTargetTime(timestamp, props.nowMs).replace(/^今日\s+/, '')
}

function openFarmCalculator(server, event) {
  if (server.cropType) {
    cropPromptServerId.value = ''
    emit('open-farm-calculator', server.id)
    return
  }

  cropPromptServerId.value = server.id
  void nextTick(() => {
    const shell = event.currentTarget?.closest('.server-card-shell')
    shell?.querySelector('.crop-cycle-button')?.focus()
  })
}
</script>

<template>
  <section class="browser-view">
    <div class="browser-fixed-top">
      <nav class="breadcrumbs" aria-label="当前位置">
        <template v-for="(item, index) in breadcrumbs" :key="item.id">
          <span v-if="index" class="breadcrumb-separator">/</span>
          <button
            class="breadcrumb-button"
            :class="{ current: index === breadcrumbs.length - 1 }"
            type="button"
            @click="emit('navigate-group', item.id)"
          >
            {{ item.name }}
          </button>
        </template>
      </nav>

      <header class="view-header">
        <div class="view-summary">
          <p class="eyebrow">Account groups</p>
          <h2>{{ group.name }}</h2>
          <p class="view-description summary-lines">
            <span>分组：{{ childGroups.length }}</span>
            <span>区服：{{ servers.length }}</span>
          </p>
        </div>

        <div class="header-actions">
          <button class="button secondary" type="button" @click="emit('open-settings')">
            分组设置
          </button>
          <button class="button secondary" type="button" @click="emit('add-group')">
            新建分组
          </button>
          <button class="button primary" type="button" @click="emit('add-server')">
            添加区服
          </button>
        </div>
      </header>
    </div>

    <div class="browser-scroll-region">
      <div v-if="isEmpty" class="empty-state">
        <div class="empty-icon">◎</div>
        <h3>当前分组还没有内容</h3>
        <p>可以先建立“安卓Q”“苹果微”等分组，也可以直接添加区服卡片。</p>
        <div class="empty-actions">
          <button class="button secondary" type="button" @click="emit('add-group')">新建分组</button>
          <button class="button primary" type="button" @click="emit('add-server')">添加区服</button>
        </div>
      </div>

      <FarmActionQueue
        v-if="actionView === 'action' && actionAnalysis.records.length"
        :records="actionAnalysis.records"
        :summary="actionAnalysis.summary"
        :group-name="group.name"
        :now-ms="nowMs"
        :recordable-server-count="recordableServerCount"
        @update-view="emit('update-action-view', $event)"
        @primary-command="emit('farm-action-command', $event)"
        @cycle-server-crop="emit('cycle-server-crop', $event)"
        @open-quick-recorder="emit('open-quick-recorder')"
      />

      <section v-if="childGroups.length" class="content-section">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Groups first</span>
            <h3>子分组</h3>
          </div>
          <span class="count-badge">{{ childGroups.length }}</span>
        </div>

        <div class="group-list">
          <div v-for="item in childGroups" :key="item.id" class="group-card-shell">
            <button
              class="group-card"
              type="button"
              @click="emit('navigate-group', item.id)"
            >
              <span class="group-card-icon">▦</span>
              <span class="group-card-copy">
                <strong>{{ item.name }}</strong>
                <small>
                  {{ item.children.filter((child) => child.type === 'group').length }} 个分组 ·
                  {{ item.children.filter((child) => child.type === 'server').length }} 个区服
                </small>
              </span>
              <span class="group-card-arrow">›</span>
            </button>
            <button
              class="card-delete group-card-delete"
              type="button"
              :aria-label="`删除分组 ${item.name}`"
              :title="`删除分组 ${item.name}`"
              @click="emit('delete-group', item.id)"
            >
              ×
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="actionView === 'original' && (servers.length || recordableServerCount)"
        class="content-section server-section"
      >
        <div class="section-heading">
          <div>
            <span class="section-kicker">Servers</span>
            <h3>区服账号</h3>
          </div>
          <div class="section-heading-actions">
            <button
              v-if="recordableServerCount"
              class="button secondary quick-record-launch"
              type="button"
              @click="emit('open-quick-recorder')"
            >
              快速记录
            </button>
            <div class="farm-action-view-switch" role="group" aria-label="区服账号查看模式">
              <button type="button" aria-pressed="false" @click="emit('update-action-view', 'action')">
                行动优先
              </button>
              <button class="active" type="button" aria-pressed="true">原顺序</button>
            </div>
            <span class="count-badge">{{ servers.length }}</span>
          </div>
        </div>

        <div v-if="servers.length" class="server-grid server-list-grid">
          <div v-for="server in servers" :key="server.id" class="server-card-shell compact-server-shell">
            <button
              class="server-card compact-server-card server-card-main"
              type="button"
              @click="emit('navigate-server', server.id)"
            >
              <strong class="compact-server-name">{{ server.serverName }}</strong>
              <span class="compact-account-id">ID：{{ server.accountId || '未填写' }}</span>
              <span class="compact-card-divider" aria-hidden="true"></span>
              <span class="compact-server-bottom">
                <span class="compact-farm-level">
                  <span class="server-status-diamond" aria-hidden="true"></span>
                  <span>农场等级 {{ server.farmLevel }}</span>
                </span>
              </span>
            </button>
            <button
              class="compact-farm-time"
              type="button"
              :aria-label="server.cropType ? `计算或查看 ${server.serverName} 的农场时间` : `${server.serverName} 尚未设置作物，请先设置当前作物类型`"
              @click.stop="openFarmCalculator(server, $event)"
            >
              <span v-if="cropPromptServerId === server.id && !server.cropType" class="farm-time-prompt">
                请先设置当前作物类型
              </span>
              <template v-else-if="server.farmSchedule">
                <span>
                  浇水 {{ formatFarmCountdown(server.farmSchedule.nextWaterAt, nowMs, '已到浇水时间') }}
                  <small>{{ compactTargetTime(server.farmSchedule.nextWaterAt) }}</small>
                </span>
                <span>
                  最快 {{ formatFarmCountdown(server.farmSchedule.fastestMatureAt, nowMs, '已到最快成熟时间') }}
                  <small>{{ compactTargetTime(server.farmSchedule.fastestMatureAt) }}</small>
                </span>
              </template>
              <span v-else>计算时间</span>
            </button>
            <button
              class="compact-crop-code crop-cycle-button"
              :class="{ unrecorded: server.cropType === '' }"
              type="button"
              :aria-label="cropCycleLabel(server)"
              :title="cropCycleLabel(server)"
              @click.stop="emit('cycle-server-crop', server.id)"
            >
              {{ cropTypeToCode(server.cropType) }}
            </button>
            <button
              class="card-delete server-card-delete"
              type="button"
              :aria-label="`删除区服账号 ${server.serverName}`"
              :title="`删除区服账号 ${server.serverName}`"
              @click="emit('delete-server', server.id)"
            >
              ×
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
