import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_STORAGE_KEY,
  useAccountStore,
} from '../src/composables/useAccountStore.js'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'

const NOW = 1_800_000_000_000

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function schedule(matureLeftMinutes = 200) {
  return calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes,
    waterLeftMinutes: 20,
    now: NOW,
  })
}

function reminders() {
  return {
    schemaVersion: 1,
    water: { enabled: true, notificationId: 101 },
    harvest: { enabled: false, notificationId: 102 },
    updatedAt: NOW,
  }
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
        serverName: 'A区',
        cropType: '8',
        farmSchedule: schedule(),
        farmReminders: reminders(),
      },
      {
        id: 'server-b',
        type: 'server',
        serverName: 'B区',
        cropType: '8',
        farmSchedule: schedule(),
        farmReminders: {
          ...reminders(),
          water: { enabled: true, notificationId: 201 },
          harvest: { enabled: true, notificationId: 202 },
        },
      },
    ],
  }
}

function createStore() {
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(rootFixture()),
  })
  return useAccountStore()
}

test('旧账号和新账号缺失 farmReminders 时默认 null', () => {
  const root = rootFixture()
  delete root.children[0].farmReminders
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(root),
  })
  const store = useAccountStore()

  assert.equal(store.getServer('server-a').farmReminders, null)
  const added = store.addServer('root', { serverName: '新区', cropType: '8' })
  assert.equal(added.farmReminders, null)
})

test('相同作物保留提醒，作物变化同时清除 schedule 与提醒', () => {
  const store = createStore()
  const before = JSON.parse(JSON.stringify(store.getServer('server-a').farmReminders))

  store.setServerCropType('server-a', '8')
  assert.deepEqual(store.getServer('server-a').farmReminders, before)

  store.setServerCropType('server-a', '16')
  assert.equal(store.getServer('server-a').farmSchedule, null)
  assert.equal(store.getServer('server-a').farmReminders, null)
})

test('重新计算保留提醒偏好和稳定 ID', () => {
  const store = createStore()
  const before = JSON.parse(JSON.stringify(store.getServer('server-a').farmReminders))
  const nextSchedule = calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 300,
    waterLeftMinutes: 40,
    now: NOW + 1_000,
  })

  store.setServerFarmSchedule('server-a', nextSchedule)

  assert.deepEqual(store.getServer('server-a').farmReminders, before)
  assert.equal(
    store.getFarmReminderPlans(NOW)[0].targetAt,
    nextSchedule.nextWaterAt,
  )
})

test('提醒偏好原子保存分配稳定 ID，全部关闭时清空', () => {
  const store = createStore()
  store.clearServerFarmReminders('server-a')

  const first = store.setServerFarmReminderPreferences('server-a', {
    waterEnabled: true,
    harvestEnabled: false,
  })
  const firstIds = [...first.notificationIds]
  const second = store.setServerFarmReminderPreferences('server-a', {
    waterEnabled: false,
    harvestEnabled: true,
  })

  assert.deepEqual(second.notificationIds, firstIds)
  assert.equal(store.getServer('server-a').farmReminders.harvest.enabled, true)

  store.setServerFarmReminderPreferences('server-a', {
    waterEnabled: false,
    harvestEnabled: false,
  })
  assert.equal(store.getServer('server-a').farmReminders, null)
})

test('批量修改快照包含提醒，撤销恢复作物、schedule 和提醒', () => {
  const store = createStore()
  const before = JSON.parse(JSON.stringify(store.getServer('server-a')))

  const result = store.setServersCropType(['server-a'], '16')
  assert.deepEqual(result.changes[0].previousFarmReminders, before.farmReminders)
  assert.equal(store.getServer('server-a').farmReminders, null)

  store.restoreServersCropState(result.changes)
  assert.deepEqual(store.getServer('server-a'), before)
})

test('删除账号返回自身通知 ID，不影响其他账号', () => {
  const store = createStore()
  const beforeB = JSON.parse(JSON.stringify(store.getServer('server-b')))

  const deleted = store.deleteNode('server-a')

  assert.deepEqual(deleted.notificationIds.sort(), [101, 102])
  assert.deepEqual(deleted.serverIds, ['server-a'])
  assert.deepEqual(store.getServer('server-b'), beforeB)
})
