<script setup>
import { computed } from 'vue'
import {
  cropTypeToCode,
  cropTypeToLabel,
  nextCropType,
} from '../domain/cropTypes.js'

const props = defineProps({
  group: { type: Object, required: true },
  breadcrumbs: { type: Array, required: true },
  recordableServerCount: { type: Number, default: 0 },
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
  'open-quick-recorder',
])

const childGroups = computed(() => props.group.children.filter((item) => item.type === 'group'))
const servers = computed(() => props.group.children.filter((item) => item.type === 'server'))
const isEmpty = computed(() => props.group.children.length === 0)

function cropCycleLabel(server) {
  return `${server.serverName}，当前为${cropTypeToLabel(server.cropType)}，点击切换为${cropTypeToLabel(nextCropType(server.cropType))}`
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

      <section v-if="servers.length || recordableServerCount" class="content-section server-section">
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
