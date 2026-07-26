<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import BackupCenter from './components/BackupCenter.vue'
import FarmCycleResetDialog from './components/FarmCycleResetDialog.vue'
import FarmTimeCalculator from './components/FarmTimeCalculator.vue'
import GroupBrowser from './components/GroupBrowser.vue'
import QuickCropRecorder from './components/QuickCropRecorder.vue'
import ServerDetail from './components/ServerDetail.vue'
import { useFarmClock, refreshFarmClock } from './composables/useFarmClock.js'
import { CROP_OPTIONS } from './domain/cropTypes.js'
import {
  readFarmActionView,
  writeFarmActionView,
} from './domain/farmActionView.js'
import {
  buildFarmReminderPlans,
  formatFarmReminderCopyText,
} from './domain/farmReminders.js'
import {
  PLATFORM_OPTIONS,
  SYSTEM_OPTIONS,
  useAccountStore,
} from './composables/useAccountStore.js'
import {
  browserNotificationPermission,
  createFarmReminderAdapter,
  requestBrowserNotificationPermission,
  showBrowserFarmNotification,
} from './platform/farmReminderAdapter.js'
import {
  cancelVisibleEditor,
  closeVisibleOverlay,
  registerNativeBackHandler,
} from './platform/nativeAppShell.js'
import { createFarmReminderCoordinator } from './services/farmReminderCoordinator.js'
import { createWebFarmReminderMonitor } from './services/webFarmReminderMonitor.js'

const store = useAccountStore()
const route = reactive({ type: 'group', id: 'root' })
const nowMs = useFarmClock()
const reminderAdapter = createFarmReminderAdapter()
const nativeAndroid = reminderAdapter.isSupported()
const reminderCoordinator = createFarmReminderCoordinator({
  store,
  adapter: reminderAdapter,
})

const showGroupDialog = ref(false)
const showServerDialog = ref(false)
const showSettingsDialog = ref(false)
const showBackupDialog = ref(false)
const quickRecording = ref(false)
const quickGroupId = ref('')
const quickBatchMode = ref(false)
const quickBatchResult = ref(null)
const farmCalculatorServerId = ref('')
const farmCycleResetServerId = ref('')
const farmCycleResetBusy = ref(false)
const farmActionView = ref(readFarmActionView())
const reminderBusy = ref(false)
const reminderNotice = ref('')
const manualCopyText = ref('')
const webPermission = ref(browserNotificationPermission())
const reminderPermissionDialog = ref('')
const reminderCapability = reactive({
  capability: nativeAndroid ? 'denied' : 'unsupported',
  displayPermission: nativeAndroid ? 'unknown' : 'unsupported',
  exactPermission: nativeAndroid ? 'unknown' : 'unsupported',
})
let browserScrollPosition = 0
let removeQuickBackHandler = null
let removeReminderActionListener = null
let removeAppStateListener = null
let notificationRequestAttempted = false
let farmCycleResetTrigger = null

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
  cropType: '',
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
  farmCalculatorServerId.value = ''
  quickRecording.value = false
  quickGroupId.value = ''
  window.location.hash = `#/group/${encodeURIComponent(id)}`
}

function navigateServer(id) {
  farmCalculatorServerId.value = ''
  quickRecording.value = false
  quickGroupId.value = ''
  window.location.hash = `#/server/${encodeURIComponent(id)}`
}

function closeTransientUi() {
  showGroupDialog.value = false
  showServerDialog.value = false
  showSettingsDialog.value = false
  showBackupDialog.value = false
  reminderPermissionDialog.value = ''
  farmCycleResetServerId.value = ''
  farmCycleResetBusy.value = false
  farmCycleResetTrigger = null
  farmCalculatorServerId.value = ''
  quickBatchMode.value = false
  quickRecording.value = false
  quickGroupId.value = ''
}

function handleReminderNavigation(serverId) {
  closeTransientUi()
  if (store.getServer(serverId)) navigateServer(serverId)
  else navigateGroup('root')
}

function allWebReminderPlans() {
  return store.getAllServersWithReminders().flatMap((server) => (
    buildFarmReminderPlans(server, 0, { includePast: true })
  ))
}

const webReminderMonitor = createWebFarmReminderMonitor({
  getPlans: allWebReminderPlans,
  notify: (plan) => showBrowserFarmNotification(
    plan,
    () => handleReminderNavigation(plan.serverId),
  ),
})

function applyReminderResult(result, { resumed = false } = {}) {
  const previousCapability = reminderCapability.capability
  Object.assign(reminderCapability, {
    capability: result.capability,
    displayPermission: result.displayPermission,
    exactPermission: result.exactPermission,
  })
  if (result.failed?.length) {
    reminderNotice.value = result.failed[0].message
  } else if (
    resumed
    && previousCapability === 'exact'
    && result.capability === 'inexact'
  ) {
    reminderNotice.value = '精确提醒权限已关闭，部分提醒需要重新设置。'
  }
  return result
}

async function syncFarmReminders({ initialise = false, resumed = false } = {}) {
  if (!nativeAndroid) {
    webPermission.value = browserNotificationPermission()
    if (webPermission.value === 'granted') webReminderMonitor.check(nowMs.value)
    return {
      capability: 'unsupported',
      displayPermission: webPermission.value,
      exactPermission: 'unsupported',
      failed: [],
    }
  }

  reminderBusy.value = true
  try {
    const result = initialise
      ? await reminderCoordinator.initialise()
      : await reminderCoordinator.synchronise()
    return applyReminderResult(result, { resumed })
  } finally {
    reminderBusy.value = false
  }
}

function handleEscape(event) {
  if (event.key !== 'Escape') return
  if (closeVisibleOverlay()) {
    event.preventDefault()
    return
  }
  if (quickBatchMode.value) {
    event.preventDefault()
    quickBatchMode.value = false
    return
  }
  if (quickRecording.value) {
    event.preventDefault()
    closeQuickRecorder()
    return
  }
  if (cancelVisibleEditor()) {
    event.preventDefault()
    return
  }
  if (route.type === 'server' && window.history.length > 1) {
    event.preventDefault()
    window.history.back()
  }
}

onMounted(async () => {
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('keydown', handleEscape)
  removeQuickBackHandler = registerNativeBackHandler(() => {
    if (quickBatchMode.value) {
      quickBatchMode.value = false
      return true
    }
    if (!quickRecording.value) return false
    closeQuickRecorder()
    return true
  }, 100)
  if (!window.location.hash) navigateGroup('root')
  else syncRoute()

  try {
    removeReminderActionListener = await reminderAdapter.addActionListener(({ extra }) => {
      if (
        extra?.source === 'farm-reminder'
        && Number(extra?.schemaVersion) === 1
        && typeof extra?.serverId === 'string'
      ) {
        handleReminderNavigation(extra.serverId)
      }
    })
  } catch {
    reminderNotice.value = '通知点击监听初始化失败；已保存的提醒计划不受影响。'
  }
  try {
    removeAppStateListener = await reminderAdapter.addAppStateListener(({ isActive }) => {
      if (!isActive) return
      refreshFarmClock()
      void syncFarmReminders({ resumed: true })
    })
  } catch {
    reminderNotice.value = '前台恢复监听初始化失败，请重新打开应用以校准提醒。'
  }
  await syncFarmReminders({ initialise: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncRoute)
  window.removeEventListener('keydown', handleEscape)
  removeQuickBackHandler?.()
  removeReminderActionListener?.()
  removeAppStateListener?.()
})

watch(nowMs, () => {
  if (!nativeAndroid && webPermission.value === 'granted') {
    webReminderMonitor.check(nowMs.value)
  }
})

const currentGroup = computed(() => store.getGroup(route.id) ?? store.root.value)
const currentServer = computed(() => store.getServer(route.id))
const currentBreadcrumbs = computed(() => store.breadcrumbs(route.id))
const currentGroupServerRecords = computed(() => store.getServersInGroup(currentGroup.value.id))
const quickServerRecords = computed(() => (
  store.getServersInGroup(quickGroupId.value || currentGroup.value.id)
))
const farmCalculatorServer = computed(() => store.getServer(farmCalculatorServerId.value))
const farmCycleResetServer = computed(() => store.getServer(farmCycleResetServerId.value))
const settingsGroups = computed(() => currentGroup.value.children.filter((item) => item.type === 'group'))
const settingsServers = computed(() => currentGroup.value.children.filter((item) => item.type === 'server'))

function openQuickRecorder() {
  const scrollRegion = document.querySelector('.browser-scroll-region')
  browserScrollPosition = scrollRegion instanceof HTMLElement ? scrollRegion.scrollTop : 0
  quickGroupId.value = currentGroup.value.id
  quickBatchMode.value = false
  quickBatchResult.value = null
  quickRecording.value = true
}

function closeQuickRecorder({ restoreScroll = true } = {}) {
  const originGroupId = quickGroupId.value
  quickRecording.value = false
  quickGroupId.value = ''
  quickBatchMode.value = false
  quickBatchResult.value = null
  if (!restoreScroll || route.type !== 'group' || route.id !== originGroupId) return

  void nextTick(() => {
    requestAnimationFrame(() => {
      const scrollRegion = document.querySelector('.browser-scroll-region')
      if (scrollRegion instanceof HTMLElement) scrollRegion.scrollTop = browserScrollPosition
    })
  })
}

function cycleServerCropType(serverId) {
  store.cycleServerCropType(serverId)
  void syncFarmReminders()
}

function applyBatchCropType({ serverIds, cropType }) {
  quickBatchResult.value = store.setServersCropType(serverIds, cropType)
  quickBatchMode.value = false
  void syncFarmReminders()
}

function undoBatchCropType() {
  if (!quickBatchResult.value) return
  store.restoreServersCropState(quickBatchResult.value.changes)
  quickBatchResult.value = null
  void syncFarmReminders()
}

function openFarmCalculator(serverId, { preserveNotice = false } = {}) {
  const server = store.getServer(serverId)
  if (!server?.cropType) return
  if (!preserveNotice) reminderNotice.value = ''
  manualCopyText.value = ''
  farmCalculatorServerId.value = server.id
}

function updateFarmActionView(value) {
  farmActionView.value = writeFarmActionView(value)
}

function openFarmCycleReset({ serverId, trigger }) {
  const server = store.getServer(serverId)
  if (!server?.cropType || !server.farmSchedule) return
  farmCycleResetTrigger = trigger instanceof HTMLElement ? trigger : null
  farmCycleResetServerId.value = server.id
}

function closeFarmCycleReset({ restoreFocus = true } = {}) {
  const trigger = farmCycleResetTrigger
  farmCycleResetServerId.value = ''
  farmCycleResetTrigger = null
  if (!restoreFocus || !(trigger instanceof HTMLElement)) return
  void nextTick(() => {
    if (trigger.isConnected) trigger.focus()
  })
}

function handleFarmActionCommand(payload) {
  if (payload?.command === 'reset-cycle') {
    openFarmCycleReset(payload)
    return
  }
  if (['recalculate', 'view-time', 'calculate'].includes(payload?.command)) {
    openFarmCalculator(payload.serverId)
  }
}

async function confirmStartNextFarmCycle() {
  const serverId = farmCycleResetServerId.value
  if (!serverId || farmCycleResetBusy.value) return
  farmCycleResetBusy.value = true
  try {
    const result = store.startNextFarmCycle(serverId)
    if (!result.success) {
      reminderNotice.value = result.reason === 'crop-unrecorded'
        ? '当前账号尚未记录作物，无法开始同作物下一轮。'
        : '目标账号不存在，无法开始下一轮。'
      closeFarmCycleReset()
      return
    }

    webReminderMonitor.forgetServer(serverId)
    let cancellationFailed = []
    let synchronisationFailed = []
    try {
      const cancellation = await reminderCoordinator.cancelNotificationIds(
        result.notificationIds,
      )
      cancellationFailed = cancellation.failed
      const syncResult = await syncFarmReminders()
      synchronisationFailed = syncResult.failed ?? []
    } catch {
      cancellationFailed = [{
        message: '上一轮系统提醒清理失败；本地数据已重置，应用恢复前台时会再次校准。',
      }]
    }

    closeFarmCycleReset({ restoreFocus: false })
    openFarmCalculator(serverId, { preserveNotice: true })
    if (cancellationFailed.length || synchronisationFailed.length) {
      reminderNotice.value = cancellationFailed[0]?.message
        ?? synchronisationFailed[0]?.message
        ?? '上一轮系统提醒清理失败；本地数据已重置，应用恢复前台时会再次校准。'
    } else {
      reminderNotice.value = '上一轮时间和提醒已清除，请输入新一轮时间。'
    }
  } finally {
    farmCycleResetBusy.value = false
  }
}

function closeFarmCalculator() {
  farmCalculatorServerId.value = ''
  reminderNotice.value = ''
  manualCopyText.value = ''
}

async function saveFarmScheduleOnly(schedule) {
  const serverId = farmCalculatorServerId.value
  if (!serverId) return
  const saved = store.setServerFarmSchedule(serverId, schedule)
  if (!saved) return
  await syncFarmReminders()
  closeFarmCalculator()
}

function saveReminderPreferences(serverId, {
  waterEnabled,
  harvestEnabled,
}) {
  return store.setServerFarmReminderPreferences(serverId, {
    waterEnabled,
    harvestEnabled,
  })
}

async function finishReminderPermissionFlow() {
  if (nativeAndroid) {
    const capability = await reminderCoordinator.readCapability()
    Object.assign(reminderCapability, capability)
    if (capability.displayPermission !== 'granted') {
      if (!notificationRequestAttempted) {
        reminderPermissionDialog.value = 'display'
      } else {
        reminderNotice.value = '通知权限未授予，计算结果已保存，但系统提醒未设置。'
      }
      return
    }
    const result = await syncFarmReminders()
    if (result.skippedPast?.length && !result.failed.length) {
      reminderNotice.value = '已保存提醒设置；已到期的时间不会补发系统通知。'
    } else if (result.capability === 'inexact' && !result.failed.length) {
      reminderNotice.value = '提醒已按普通模式设置，系统可能延迟送达；可手动打开精确提醒设置。'
    } else if (!result.failed.length) {
      reminderNotice.value = '农场提醒已设置。'
    }
    return
  }

  webPermission.value = browserNotificationPermission()
  if (webPermission.value === 'default' && !notificationRequestAttempted) {
    reminderPermissionDialog.value = 'display'
    return
  }
  if (webPermission.value !== 'granted') {
    reminderNotice.value = '网页通知权限未授予；页面内倒计时和复制时间仍可使用。'
    return
  }
  webReminderMonitor.prime(nowMs.value)
  reminderNotice.value = '网页提醒已开启；仅在当前页面保持打开时检查到期时间。'
}

async function saveFarmScheduleWithReminders({
  schedule,
  waterEnabled,
  harvestEnabled,
}) {
  const serverId = farmCalculatorServerId.value
  if (!serverId || !store.setServerFarmSchedule(serverId, schedule)) return
  saveReminderPreferences(serverId, { waterEnabled, harvestEnabled })
  if (!waterEnabled && !harvestEnabled) {
    await syncFarmReminders()
    reminderNotice.value = '农场时间已保存，系统提醒已关闭。'
    return
  }
  await finishReminderPermissionFlow()
}

async function updateFarmReminders({
  waterEnabled,
  harvestEnabled,
}) {
  const serverId = farmCalculatorServerId.value
  if (!serverId) return
  const saved = saveReminderPreferences(serverId, {
    waterEnabled,
    harvestEnabled,
  })
  if (!saved) {
    reminderNotice.value = '请先保存有效的农场时间。'
    return
  }
  if (!waterEnabled && !harvestEnabled) {
    await syncFarmReminders()
    reminderNotice.value = '系统提醒已关闭；农场时间仍然保留。'
    return
  }
  await finishReminderPermissionFlow()
}

function requestExactReminderSetting() {
  if (!nativeAndroid) return
  reminderPermissionDialog.value = 'exact'
}

async function confirmReminderPermissionDialog() {
  const dialog = reminderPermissionDialog.value
  reminderPermissionDialog.value = ''
  reminderBusy.value = true
  try {
    if (dialog === 'exact') {
      await reminderAdapter.openExactNotificationSetting()
      const result = await syncFarmReminders({ resumed: true })
      if (result.capability === 'exact') reminderNotice.value = '精确提醒权限已开启。'
      return
    }

    notificationRequestAttempted = true
    if (nativeAndroid) {
      const permission = await reminderAdapter.requestDisplayPermission()
      if (permission !== 'granted') {
        reminderNotice.value = '通知权限被拒绝，计算结果已保留；系统提醒未设置。'
        await syncFarmReminders()
        return
      }
      await finishReminderPermissionFlow()
      return
    }

    webPermission.value = await requestBrowserNotificationPermission()
    if (webPermission.value === 'granted') {
      webReminderMonitor.prime(nowMs.value)
      reminderNotice.value = '网页提醒已开启；关闭页面后无法保证通知。'
    } else {
      reminderNotice.value = '网页通知权限被拒绝；页面内倒计时仍然可用。'
    }
  } catch (error) {
    reminderNotice.value = error instanceof Error
      ? error.message
      : '提醒权限操作失败。'
  } finally {
    reminderBusy.value = false
  }
}

async function copyFarmTime(reminderType) {
  const server = farmCalculatorServer.value
  if (!server) return
  const types = reminderType === 'all'
    ? ['water', 'harvest']
    : [reminderType]
  const text = formatFarmReminderCopyText(server, types)
  if (!text) {
    reminderNotice.value = '当前没有可复制的农场时间。'
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    manualCopyText.value = ''
    reminderNotice.value = '农场时间已复制。'
  } catch {
    manualCopyText.value = text
    reminderNotice.value = '自动复制失败，请在下方文本框中手动复制。'
  }
}

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
    cropType: '',
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
  if (currentServer.value) {
    store.updateServer(currentServer.value.id, payload)
    void syncFarmReminders()
  }
}

function deleteServerById(id) {
  const server = store.getServer(id)
  if (!server || !window.confirm(`确定删除“${server.serverName}”及其全部资料吗？此操作无法撤销。`)) return
  const parentId = server.parentId || 'root'
  const deleted = store.deleteNode(server.id)
  if (deleted?.notificationIds?.length) {
    void reminderCoordinator.cancelNotificationIds(deleted.notificationIds)
  }
  void syncFarmReminders()
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
  const deleted = store.deleteNode(group.id)
  if (deleted?.notificationIds?.length) {
    void reminderCoordinator.cancelNotificationIds(deleted.notificationIds)
  }
  void syncFarmReminders()
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
      <QuickCropRecorder
        v-if="quickRecording"
        :group-name="currentGroup.name"
        :records="quickServerRecords"
        :batch-mode="quickBatchMode"
        :last-batch-result="quickBatchResult"
        @cycle-server-crop="cycleServerCropType"
        @apply-batch="applyBatchCropType"
        @undo-batch="undoBatchCropType"
        @update:batch-mode="quickBatchMode = $event"
        @done="closeQuickRecorder"
      />

      <GroupBrowser
        v-else-if="route.type === 'group'"
        :group="currentGroup"
        :breadcrumbs="currentBreadcrumbs"
        :recordable-server-count="currentGroupServerRecords.length"
        :recursive-server-records="currentGroupServerRecords"
        :action-view="farmActionView"
        :now-ms="nowMs"
        @navigate-group="navigateGroup"
        @navigate-server="navigateServer"
        @add-group="openAddGroup"
        @add-server="openAddServer"
        @open-settings="showSettingsDialog = true"
        @delete-group="deleteGroupById"
        @delete-server="deleteServerById"
        @cycle-server-crop="cycleServerCropType"
        @open-farm-calculator="openFarmCalculator"
        @open-quick-recorder="openQuickRecorder"
        @update-action-view="updateFarmActionView"
        @farm-action-command="handleFarmActionCommand"
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

  <FarmTimeCalculator
    v-if="farmCalculatorServer"
    :server="farmCalculatorServer"
    :now-ms="nowMs"
    :reminder-capability="reminderCapability"
    :native-android="nativeAndroid"
    :web-permission="webPermission"
    :reminder-busy="reminderBusy"
    :reminder-notice="reminderNotice"
    :manual-copy-text="manualCopyText"
    @close="closeFarmCalculator"
    @save-time="saveFarmScheduleOnly"
    @save-reminders="saveFarmScheduleWithReminders"
    @update-reminders="updateFarmReminders"
    @request-exact="requestExactReminderSetting"
    @copy="copyFarmTime"
  />

  <FarmCycleResetDialog
    v-if="farmCycleResetServer"
    :server="farmCycleResetServer"
    :busy="farmCycleResetBusy"
    @close="closeFarmCycleReset"
    @confirm="confirmStartNextFarmCycle"
  />

  <div
    v-if="reminderPermissionDialog"
    class="modal-backdrop reminder-permission-backdrop"
    @click.self="reminderPermissionDialog = ''"
  >
    <section
      class="modal reminder-permission-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-permission-title"
    >
      <div class="modal-heading">
        <div>
          <span class="section-kicker">Permission</span>
          <h3 id="reminder-permission-title">
            {{ reminderPermissionDialog === 'exact' ? '开启精确提醒' : nativeAndroid ? '允许系统通知' : '允许网页通知' }}
          </h3>
        </div>
        <button class="icon-button" type="button" aria-label="关闭提醒权限说明" @click="reminderPermissionDialog = ''">×</button>
      </div>
      <template v-if="reminderPermissionDialog === 'exact'">
        <p>
          Android 会打开“闹钟和提醒”系统设置。只有你点击继续后才会跳转；关闭精确权限时，
          提醒仍会尝试以普通模式安排，但可能延迟。
        </p>
      </template>
      <template v-else>
        <p>
          {{ nativeAndroid
            ? '通知权限用于在浇水和理论最快成熟时间显示本地系统通知。拒绝不会删除已保存的计算结果，也不会自动跳转设置。'
            : '网页通知只在当前页面保持打开时用于提示浇水和收获时间；关闭浏览器后无法保证通知。' }}
        </p>
      </template>
      <div class="modal-actions">
        <button class="button secondary" type="button" @click="reminderPermissionDialog = ''">暂不开启</button>
        <button class="button primary" type="button" :disabled="reminderBusy" @click="confirmReminderPermissionDialog">
          {{ reminderPermissionDialog === 'exact' ? '打开系统设置' : '继续请求权限' }}
        </button>
      </div>
    </section>
  </div>

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
            <option v-for="item in CROP_OPTIONS" :key="item.value || 'unrecorded'" :value="item.value">
              {{ item.label }}
            </option>
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
