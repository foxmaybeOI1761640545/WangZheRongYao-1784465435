<script setup>
import { computed } from 'vue'

const props = defineProps({
  group: { type: Object, required: true },
  breadcrumbs: { type: Array, required: true },
})

const emit = defineEmits([
  'navigate-group',
  'navigate-server',
  'add-group',
  'add-server',
  'open-settings',
  'delete-group',
  'delete-server',
])

const childGroups = computed(() => props.group.children.filter((item) => item.type === 'group'))
const servers = computed(() => props.group.children.filter((item) => item.type === 'server'))
const isEmpty = computed(() => props.group.children.length === 0)

function cropCode(value) {
  return ({ 8: '8', 16: '1', 32: '3' })[String(value)] ?? '8'
}
</script>

<template>
  <section class="browser-view">
    <div class="browser-fixed-region">
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
          <div class="view-stat-lines" aria-label="当前分组统计">
            <span>分组：{{ childGroups.length }}</span>
            <span>区服：{{ servers.length }}</span>
          </div>
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

      <div v-if="isEmpty" class="empty-state">
        <div class="empty-icon">◎</div>
        <h3>当前分组还没有内容</h3>
        <p>可以先建立“安卓Q”“苹果微”等分组，也可以直接添加区服卡片。</p>
        <div class="empty-actions">
          <button class="button secondary" type="button" @click="emit('add-group')">新建分组</button>
          <button class="button primary" type="button" @click="emit('add-server')">添加区服</button>
        </div>
      </div>
    </div>

    <div v-if="!isEmpty" class="browser-scroll-region">
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

      <section v-if="servers.length" class="content-section server-section">
        <div class="section-heading server-section-heading">
          <div>
            <span class="section-kicker">Servers</span>
            <h3>区服账号</h3>
          </div>
          <span class="count-badge">{{ servers.length }}</span>
        </div>

        <div class="server-grid server-list-grid">
          <div v-for="server in servers" :key="server.id" class="server-card-shell compact-server-shell">
            <button
              class="server-card compact-server-card"
              type="button"
              @click="emit('navigate-server', server.id)"
            >
              <span class="compact-server-name">{{ server.serverName }}</span>
              <span class="compact-account-id">ID：{{ server.accountId || '未填写' }}</span>
              <span class="compact-server-bottom">
                <span class="compact-farm-level">
                  <span class="server-status-diamond" aria-hidden="true"></span>
                  <span>农场等级 {{ server.farmLevel }}</span>
                </span>
                <span
                  class="compact-crop-code"
                  :aria-label="`${server.cropType} 小时作物`"
                  :title="`${server.cropType} 小时作物`"
                >
                  {{ cropCode(server.cropType) }}
                </span>
              </span>
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
