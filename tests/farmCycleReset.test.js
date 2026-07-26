import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_STORAGE_KEY,
  useAccountStore,
} from '../src/composables/useAccountStore.js'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'
import { createFarmReminderCoordinator } from '../src/services/farmReminderCoordinator.js'
import { createWebFarmReminderMonitor } from '../src/services/webFarmReminderMonitor.js'

const NOW = 1_800_000_000_000

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function schedule(now = NOW) {
  return calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 200,
    waterLeftMinutes: 20,
    now,
  })
}

function rootFixture() {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    children: [
      {
        id: 'server-a',
        type: 'server',
        parentId: 'root',
        serverName: '131区',
        accountId: '李在思念谁',
        accountLevel: 88,
        battlePassLevel: 40,
        farmLevel: 20,
        cropType: '8',
        farmSchedule: schedule(),
        farmReminders: {
          schemaVersion: 1,
          water: { enabled: true, notificationId: 101 },
          harvest: { enabled: true, notificationId: 102 },
          updatedAt: NOW,
        },
        epicSkins: '皮肤',
        createdAt: 123,
      },
      {
        id: 'server-b',
        type: 'server',
        parentId: 'root',
        serverName: '132区',
        cropType: '8',
        farmSchedule: schedule(),
        farmReminders: {
          schemaVersion: 1,
          water: { enabled: true, notificationId: 201 },
          harvest: { enabled: true, notificationId: 202 },
          updatedAt: NOW,
        },
      },
      {
        id: 'server-empty',
        type: 'server',
        parentId: 'root',
        serverName: '未记录区',
        cropType: '',
        farmSchedule: null,
        farmReminders: null,
      },
    ],
  }
}

function createStore() {
  const storage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(rootFixture()),
  })
  globalThis.localStorage = storage
  return { store: useAccountStore(), storage }
}

test('原子重置保留作物和账号资料，清除 schedule/reminders 并返回旧通知 ID', () => {
  const { store } = createStore()
  const before = JSON.parse(JSON.stringify(store.getServer('server-a')))
  const result = store.startNextFarmCycle('server-a')
  const after = store.getServer('server-a')

  assert.equal(result.success, true)
  assert.equal(result.cropType, '8')
  assert.deepEqual(result.notificationIds, [101, 102])
  assert.deepEqual(result.previousFarmSchedule, before.farmSchedule)
  assert.deepEqual(result.previousFarmReminders, before.farmReminders)
  assert.equal(after.cropType, before.cropType)
  assert.equal(after.id, before.id)
  assert.equal(after.accountId, before.accountId)
  assert.equal(after.accountLevel, before.accountLevel)
  assert.equal(after.farmLevel, before.farmLevel)
  assert.equal(after.epicSkins, before.epicSkins)
  assert.equal(after.createdAt, before.createdAt)
  assert.equal(after.farmSchedule, null)
  assert.equal(after.farmReminders, null)
})

test('原子重置通过同步 watcher 立即写入 localStorage', () => {
  const { store, storage } = createStore()
  store.startNextFarmCycle('server-a')
  const persisted = JSON.parse(storage.getItem(ACCOUNT_STORAGE_KEY))
  const server = persisted.children.find((item) => item.id === 'server-a')
  assert.equal(server.cropType, '8')
  assert.equal(server.farmSchedule, null)
  assert.equal(server.farmReminders, null)
})

test('找不到账号或未记录作物时安全失败且不改变树', () => {
  const { store } = createStore()
  const before = JSON.stringify(store.root.value)
  assert.deepEqual(store.startNextFarmCycle('missing'), {
    success: false,
    serverId: 'missing',
    reason: 'server-not-found',
  })
  assert.deepEqual(store.startNextFarmCycle('server-empty'), {
    success: false,
    serverId: 'server-empty',
    reason: 'crop-unrecorded',
  })
  assert.equal(JSON.stringify(store.root.value), before)
})

test('协调器只取消目标账号 pending，并同时移除 delivered', async () => {
  const { store } = createStore()
  const state = { cancelled: [], removed: [] }
  const adapter = {
    isSupported: () => true,
    checkCapability: async () => ({
      capability: 'exact',
      displayPermission: 'granted',
      exactPermission: 'granted',
    }),
    getPending: async () => [],
    cancel: async (ids) => state.cancelled.push(...ids),
    removeDelivered: async (ids) => state.removed.push(...ids),
    schedule: async () => {},
  }
  const coordinator = createFarmReminderCoordinator({ store, adapter, now: () => NOW })
  const result = store.startNextFarmCycle('server-a')
  const cancellation = await coordinator.cancelNotificationIds(result.notificationIds)
  await coordinator.synchronise()

  assert.deepEqual(state.cancelled, [101, 102])
  assert.deepEqual(state.removed, [101, 102])
  assert.equal(cancellation.cancelledCount, 2)
  assert.equal(state.cancelled.includes(201), false)
  assert.equal(store.getFarmReminderPlans(NOW).some((plan) => plan.serverId === 'server-a'), false)
})

test('系统取消失败时本地重置仍然完成且返回轻量失败信息', async () => {
  const { store } = createStore()
  const adapter = {
    isSupported: () => true,
    cancel: async () => { throw new Error('cancel failed') },
    removeDelivered: async () => { throw new Error('remove failed') },
  }
  const coordinator = createFarmReminderCoordinator({ store, adapter })
  const result = store.startNextFarmCycle('server-a')
  const cancellation = await coordinator.cancelNotificationIds(result.notificationIds)

  assert.equal(store.getServer('server-a').farmSchedule, null)
  assert.equal(store.getServer('server-a').farmReminders, null)
  assert.equal(cancellation.failed.length, 2)
})

test('新一轮保存 schedule 后可以重新创建提醒意图和计划', () => {
  const { store } = createStore()
  store.startNextFarmCycle('server-a')
  assert.notEqual(store.setServerFarmSchedule('server-a', schedule(NOW + 60_000)), null)
  const saved = store.setServerFarmReminderPreferences('server-a', {
    waterEnabled: true,
    harvestEnabled: true,
  })
  assert.equal(saved.farmReminders.water.enabled, true)
  assert.equal(store.getFarmReminderPlans(NOW).filter((plan) => plan.serverId === 'server-a').length, 2)
})

test('网页监控只清除目标账号去重状态，新一轮目标仍可触发', () => {
  let current = NOW
  let targetAt = NOW + 60_000
  const plans = [
    { key: 'server-a:water', targetAt },
    { key: 'server-b:water', targetAt },
  ]
  const notified = []
  const monitor = createWebFarmReminderMonitor({
    getPlans: () => plans,
    notify: (plan) => {
      notified.push(`${plan.key}:${plan.targetAt}`)
      return true
    },
    now: () => current,
  })
  current = targetAt + 1
  assert.equal(monitor.check(current), 2)
  assert.equal(monitor.forgetServer('server-a'), 1)

  targetAt += 60_000
  plans[0] = { key: 'server-a:water', targetAt }
  current = targetAt + 1
  assert.equal(monitor.check(current), 1)
  assert.equal(notified.filter((value) => value.startsWith('server-a:')).length, 2)
  assert.equal(monitor.hasSeen(plans[1]), true)
})
