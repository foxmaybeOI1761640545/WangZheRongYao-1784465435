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
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
  }
}

function schedule(cropType, matureLeftMinutes = 100) {
  return calculateFarmSchedule({
    cropType,
    matureLeftMinutes,
    waterLeftMinutes: 20,
    now: NOW,
  })
}

function rootFixture() {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    parentId: null,
    createdAt: 1,
    children: [
      {
        id: 'server-a',
        type: 'server',
        parentId: 'root',
        serverName: 'A区',
        cropType: '8',
        farmSchedule: schedule('8'),
        createdAt: 2,
      },
      {
        id: 'server-b',
        type: 'server',
        parentId: 'root',
        serverName: 'B区',
        cropType: '16',
        farmSchedule: schedule('16'),
        createdAt: 3,
      },
      {
        id: 'server-c',
        type: 'server',
        parentId: 'root',
        serverName: 'C区',
        cropType: '32',
        farmSchedule: schedule('32'),
        createdAt: 4,
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

test('旧账号缺失 farmSchedule 时水合为 null，新账号同样默认 null', () => {
  const root = rootFixture()
  delete root.children[0].farmSchedule
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(root),
  })
  const store = useAccountStore()

  assert.equal(store.getServer('server-a').farmSchedule, null)
  const added = store.addServer('root', { serverName: '新区', cropType: '8' })
  assert.equal(added.farmSchedule, null)
})

test('作物实际变化清除 schedule，相同作物保留 schedule', () => {
  const store = createStore()
  const server = store.getServer('server-a')
  const originalSchedule = { ...server.farmSchedule }

  assert.equal(store.setServerCropType('server-a', '8'), '8')
  assert.deepEqual(server.farmSchedule, originalSchedule)

  assert.equal(store.setServerCropType('server-a', '16'), '16')
  assert.equal(server.farmSchedule, null)
})

test('详情完整更新同样集中执行作物变化清理规则', () => {
  const store = createStore()
  const server = store.getServer('server-a')
  const payload = { ...server, accountId: 'updated' }

  assert.equal(store.updateServer('server-a', payload), true)
  assert.notEqual(server.farmSchedule, null)
  assert.equal(server.accountId, 'updated')

  assert.equal(store.updateServer('server-a', { ...payload, cropType: '32' }), true)
  assert.equal(server.cropType, '32')
  assert.equal(server.farmSchedule, null)
})

test('批量修改去重，只修改选中账号并按规则统计 skipped', () => {
  const store = createStore()
  const serverASchedule = { ...store.getServer('server-a').farmSchedule }
  const serverCSnapshot = JSON.parse(JSON.stringify(store.getServer('server-c')))
  const result = store.setServersCropType(
    ['server-a', 'server-a', 'server-b', 'missing'],
    '8',
  )

  assert.deepEqual(
    {
      requestedCount: result.requestedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      cropType: result.cropType,
    },
    {
      requestedCount: 3,
      updatedCount: 1,
      skippedCount: 2,
      cropType: '8',
    },
  )
  assert.equal(result.changes[0].serverId, 'server-b')
  assert.equal(result.changes[0].previousCropType, '16')
  assert.notEqual(result.changes[0].previousFarmSchedule, null)
  assert.deepEqual(store.getServer('server-a').farmSchedule, serverASchedule)
  assert.equal(store.getServer('server-b').farmSchedule, null)
  assert.deepEqual(store.getServer('server-c'), serverCSnapshot)
})

test('批量撤销恢复原作物和 schedule，未选中账号不受影响', () => {
  const store = createStore()
  const beforeB = JSON.parse(JSON.stringify(store.getServer('server-b')))
  const beforeC = JSON.parse(JSON.stringify(store.getServer('server-c')))
  const result = store.setServersCropType(['server-b'], '8')

  const restored = store.restoreServersCropState(result.changes)
  assert.deepEqual(restored, { restoredCount: 1, skippedCount: 0 })
  assert.deepEqual(store.getServer('server-b'), beforeB)
  assert.deepEqual(store.getServer('server-c'), beforeC)
})

test('未选择账号时批量操作不执行', () => {
  const store = createStore()
  const before = JSON.stringify(store.root.value)
  const result = store.setServersCropType([], '8')

  assert.deepEqual(result, {
    requestedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    cropType: '8',
    changes: [],
  })
  assert.equal(JSON.stringify(store.root.value), before)
})

test('schedule 原子保存要求账号存在、作物已记录且作物一致', () => {
  const store = createStore()
  const valid = schedule('8', 200)

  assert.deepEqual(store.setServerFarmSchedule('server-a', valid), valid)
  assert.equal(store.setServerFarmSchedule('server-a', schedule('16')), null)
  assert.equal(store.setServerFarmSchedule('missing', valid), null)

  store.setServerCropType('server-a', '')
  assert.equal(store.setServerFarmSchedule('server-a', valid), null)
  assert.equal(store.clearServerFarmSchedule('server-a'), true)
  assert.equal(store.clearServerFarmSchedule('missing'), false)
})
