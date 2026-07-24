<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import BackupCenter from './components/BackupCenter.vue'
import GroupBrowser from './components/GroupBrowser.vue'
import ServerDetail from './components/ServerDetail.vue'
import {
  CROP_OPTIONS,
  PLATFORM_OPTIONS,
  SYSTEM_OPTIONS,
  useAccountStore,
} from './composables/useAccountStore.js'

const store = useAccountStore()
const route = reactive({ type: 'group', id: 'root' })

const showGroupDialog = ref(false)
const showServerDialog = ref(false)
const showSettingsDialog = ref(false)
const showBackupDialog = ref(false)

const groupForm = reactive({ name: '' })
const settingsForm = reactive({ name: '' })
const serverForm = reactive({
  serverName: '',
  system: 'android',
  platform: 'qq',
  accountId: '',
  accountLevel: 0,
  battlePassLevel: 0,
  farmLevel: 0,
  cropType: '8',
  epicSkins: '',
})

function readRoute() {
  const match = window.location.hash.match(/^#\/(group|server)\/([^/]+)$/)
  if (!match) return { type: 'group', id: 'root' }
  return { type: match[1], id: decodeURIComponent(match[2]) }
}

function syncRoute() {
  Object.assign(route, readRoute())
  const node = route.type === 'group' ? store.getGroup(route.id) : store.getServer(route.id)
  if (!node) navigateGroup('root')
}

function navigateGroup(id) {
  window.location.hash = `#/group/${encodeURIComponent(id)}`
}

function navigateServer(id) {
  window.location.hash = `#/server/${encodeURIComponent(id)}`
}

onMounted(() => {
  window.addEventListener('hashchange', syncRoute)
  if (!window.location.hash) navigateGroup('root')
  else syncRoute()
})

onBeforeUnmount(() => window.removeEventListener('hashchange', syncRoute))

const currentGroup = computed(() => store.getGroup(route.id) ?? store.root.value)
const currentServer = computed(() => store.getServer(route.id))
const currentBreadcrumbs = computed(() => store.breadcrumbs(route.id))
const settingsGroups = computed(() => currentGroup.value.children.filter((item) => item.type === 'group'))
const settingsServers = computed(() => currentGroup.value.children.filter((item) => item.type === 'server'))

watch(showSettingsDialog, (open) => {
  if (open) settingsForm.name = currentGroup.value.name
})

function openAddGroup() {
  groupForm.name = ''
  showGroupDialog.value = true
}

function submitGroup() {
  const group = store.addGroup(currentGroup.value.id, groupForm.name)
  if (group) showGroupDialog.value = false
}

function resetServerForm() {
  Object.assign(serverForm, {
    serverName: '',
    system: 'android',
    platform: 'qq',
    accountId: '',
    accountLevel: 0,
    battlePassLevel: 0,
    farmLevel: 0,
    cropType: '8',
    epicSkins: '',
  })
}

function openAddServer() {
  resetServerForm()
  showServerDialog.value = true
}

function submitServer() {
  const server = store.addServer(currentGroup.value.id, serverForm)
  if (!server) return
  showServerDialog.value = false
  navigateServer(server.id)
}

function saveServer(payload) {
  if (currentServer.value) store.updateServer(currentServer.value.id, payload)
}

function deleteServerById(id) {
  const server = store.getServer(id)
  if (!server || !window.confirm(`确定删除“${server.serverName}”及其全部资料吗？此操作无法撤销。`)) return
  const parentId = server.parentId || 'root'
  store.deleteNode(server.id)
  if (route.type === 'server' && route.id === id) navigateGroup(parentId)
}

function deleteServer() {
  if (currentServer.value) deleteServerById(currentServer.value.id)
}

function deleteGroupById(id) {
  const group = store.getGroup(id)
  if (!group || group.id === 'root') return
  const groupCount = group.children.filter((item) => item.type === 'group').length
  const serverCount = group.children.filter((item) => item.type === 'server').length
  const detail = groupCount || serverCount
    ? `其中直接包含 ${groupCount} 个分组和 ${serverCount} 个区服。`
    : '该分组当前为空。'
  if (!window.confirm(`确定删除分组“${group.name}”及其全部下级内容吗？${detail}此操作无法撤销。`)) return
  const parentId = group.parentId || 'root'
  store.deleteNode(group.id)
  if (route.type === 'group' && route.id === id) navigateGroup(parentId)
}

function saveGroupName() {
  if (currentGroup.value.id !== 'root') store.renameGroup(currentGroup.value.id, settingsForm.name)
}

function deleteCurrentGroup() {
  const id = currentGroup.value.id
  if (id === 'root') return
  deleteGroupById(id)
  showSettingsDialog.value = false
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <button class="brand" type="button" @click="navigateGroup('root')">
        <span class="brand-mark">M</span>
        <span class="brand-copy">
          <strong>王者多账号管理器</strong>
          <small>本地分组 · 区服资料 · 导出备份</small>
        </span>
      </button>

      <div class="app-header-tools">
        <button class="button secondary backup-launch" type="button" @click="showBackupDialog = true">
          数据与备份
        </button>
        <div class="global-stats">
          <span><b>{{ store.stats.value.groups }}</b><small>分组</small></span>
          <span><b>{{ store.stats.value.servers }}</b><small>区服</small></span>
        </div>
      </div>
    </header>

    <main class="main-surface">
      <GroupBrowser
        v-if="route.type === 'group'"
        :group="currentGroup"
        :breadcrumbs="currentBreadcrumbs"
        @navigate-group="navigateGroup"
        @navigate-server="navigateServer"
        @add-group="openAddGroup"
        @add-server="openAddServer"
        @open-settings="showSettingsDialog = true"
        @delete-group="deleteGroupById"
        @delete-server="deleteServerById"
      />

      <ServerDetail
        v-else-if="currentServer"
        :server="currentServer"
        :breadcrumbs="currentBreadcrumbs"
        @navigate-group="navigateGroup"
        @save="saveServer"
        @delete="deleteServer"
      />
    </main>

    <footer class="app-footer">
      资料默认保存在当前浏览器中；建议定期导出 JSON 或备份到独立 GitHub 分支。
    </footer>
  </div>

  <BackupCenter
    v-if="showBackupDialog"
    :stats="store.stats.value"
    @close="showBackupDialog = false"
  />

  <div v-if="showGroupDialog" class="modal-backdrop" @click.self="showGroupDialog = false">
    <form class="modal" @submit.prevent="submitGroup">
      <div class="modal-heading">
        <div><span class="section-kicker">New group</span><h3>新建子分组</h3></div>
        <button class="icon-button" type="button" aria-label="关闭" @click="showGroupDialog = false">×</button>
      </div>
      <p class="modal-description">将在“{{ currentGroup.name }}”下创建新的分组。</p>
      <label class="field full">
        <span>分组名称</span>
        <input v-model="groupForm.name" required autofocus placeholder="例如：安卓Q、1xxxxxxxxx" />
      </label>
      <div class="modal-actions">
        <button class="button secondary" type="button" @click="showGroupDialog = false">取消</button>
        <button class="button primary" type="submit">创建分组</button>
      </div>
    </form>
  </div>

  <div v-if="showServerDialog" class="modal-backdrop" @click.self="showServerDialog = false">
    <form class="modal wide" @submit.prevent="submitServer">
      <div class="modal-heading">
        <div><span class="section-kicker">New server</span><h3>添加区服账号</h3></div>
        <button class="icon-button" type="button" aria-label="关闭" @click="showServerDialog = false">×</button>
      </div>
      <p class="modal-description">区服将添加到“{{ currentGroup.name }}”，保存后自动打开详情页。</p>

      <div class="form-grid">
        <label class="field full">
          <span>服务器（区）名称</span>
          <input v-model="serverForm.serverName" required autofocus placeholder="例如：158区" />
        </label>
        <label class="field">
          <span>系统</span>
          <select v-model="serverForm.system">
            <option v-for="item in SYSTEM_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="field">
          <span>登录平台</span>
          <select v-model="serverForm.platform">
            <option v-for="item in PLATFORM_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="field full">
          <span>账号 ID</span>
          <input v-model="serverForm.accountId" placeholder="可以稍后在详情页补充" />
        </label>
        <label class="field">
          <span>账号等级</span>
          <input v-model.number="serverForm.accountLevel" type="number" min="0" inputmode="numeric" />
        </label>
        <label class="field">
          <span>战令等级</span>
          <input v-model.number="serverForm.battlePassLevel" type="number" min="0" inputmode="numeric" />
        </label>
        <label class="field">
          <span>农场等级</span>
          <input v-model.number="serverForm.farmLevel" type="number" min="0" inputmode="numeric" />
        </label>
        <label class="field">
          <span>当前作物类型</span>
          <select v-model="serverForm.cropType">
            <option v-for="item in CROP_OPTIONS" :key="item" :value="item">{{ item }} 小时作物</option>
          </select>
        </label>
        <label class="field full">
          <span>史诗级以上皮肤</span>
          <textarea v-model="serverForm.epicSkins" rows="4" placeholder="每行填写一个，或使用逗号分隔"></textarea>
        </label>
      </div>

      <div class="modal-actions">
        <button class="button secondary" type="button" @click="showServerDialog = false">取消</button>
        <button class="button primary" type="submit">保存并打开</button>
      </div>
    </form>
  </div>

  <div v-if="showSettingsDialog" class="modal-backdrop" @click.self="showSettingsDialog = false">
    <section class="modal settings-modal">
      <div class="modal-heading">
        <div><span class="section-kicker">Group settings</span><h3>分组设置</h3></div>
        <button class="icon-button" type="button" aria-label="关闭" @click="showSettingsDialog = false">×</button>
      </div>

      <div v-if="currentGroup.id !== 'root'" class="settings-name-row">
        <label class="field"><span>分组名称</span><input v-model="settingsForm.name" /></label>
        <button class="button secondary" type="button" @click="saveGroupName">保存名称</button>
      </div>
      <p v-else class="modal-description">根分组名称固定为“全部账号”。</p>

      <div class="order-section">
        <div class="section-heading compact"><div><span class="section-kicker">Groups first</span><h3>子分组顺序</h3></div></div>
        <div v-if="settingsGroups.length" class="order-list">
          <div v-for="item in settingsGroups" :key="item.id" class="order-item">
            <span class="order-kind">分组</span><strong>{{ item.name }}</strong>
            <span class="order-controls">
              <button class="mini-button" type="button" :disabled="!store.canMove(currentGroup.id, item.id, -1)" @click="store.moveChild(currentGroup.id, item.id, -1)">↑</button>
              <button class="mini-button" type="button" :disabled="!store.canMove(currentGroup.id, item.id, 1)" @click="store.moveChild(currentGroup.id, item.id, 1)">↓</button>
              <button class="mini-button danger-mini" type="button" :aria-label="`删除分组 ${item.name}`" @click="deleteGroupById(item.id)">删</button>
            </span>
          </div>
        </div>
        <p v-else class="empty-line">暂无子分组</p>
      </div>

      <div class="order-section">
        <div class="section-heading compact"><div><span class="section-kicker">Two-column cards</span><h3>区服卡片顺序</h3></div></div>
        <div v-if="settingsServers.length" class="order-list">
          <div v-for="item in settingsServers" :key="item.id" class="order-item">
            <span class="order-kind server">区服</span><strong>{{ item.serverName }}</strong>
            <span class="order-controls">
              <button class="mini-button" type="button" :disabled="!store.canMove(currentGroup.id, item.id, -1)" @click="store.moveChild(currentGroup.id, item.id, -1)">↑</button>
              <button class="mini-button" type="button" :disabled="!store.canMove(currentGroup.id, item.id, 1)" @click="store.moveChild(currentGroup.id, item.id, 1)">↓</button>
              <button class="mini-button danger-mini" type="button" :aria-label="`删除区服 ${item.serverName}`" @click="deleteServerById(item.id)">删</button>
            </span>
          </div>
        </div>
        <p v-else class="empty-line">暂无区服卡片</p>
      </div>

      <div class="settings-footer">
        <button v-if="currentGroup.id !== 'root'" class="button danger ghost" type="button" @click="deleteCurrentGroup">删除当前分组</button>
        <span class="action-spacer"></span>
        <button class="button primary" type="button" @click="showSettingsDialog = false">完成</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.app-header-tools {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  justify-content: end;
  gap: 12px;
  min-width: 0;
}

.backup-launch {
  width: auto;
  min-width: 122px;
  white-space: nowrap;
}

.danger-mini {
  color: #a62f40;
  border-color: #efc8cf;
  background: #fff2f4;
}

@media (max-width: 720px) {
  .app-header-tools {
    gap: 8px;
  }

  .backup-launch {
    min-width: 108px;
    padding-inline: 10px;
  }
}
</style>
