import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_STORAGE_KEY,
  useAccountStore,
} from '../src/composables/useAccountStore.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function rootFixture() {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    children: [{
      id: 'server-a',
      type: 'server',
      parentId: 'root',
      serverName: 'A区',
      cropType: '',
      createdAt: 2,
    }],
  }
}

function createStore() {
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(rootFixture()),
  })
  return useAccountStore()
}

test('exportRoot 返回脱离 Vue Proxy 的深拷贝且 storage key 不变', () => {
  const store = createStore()
  const exported = store.exportRoot()
  exported.children[0].serverName = 'changed outside'
  assert.equal(store.getServer('server-a').serverName, 'A区')
  assert.notEqual(localStorage.getItem(ACCOUNT_STORAGE_KEY), null)
})

test('本地修改先持久化再通知 mutation subscriber', () => {
  const store = createStore()
  const events = []
  store.subscribeToMutations((event) => {
    events.push({
      source: event.source,
      persisted: JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY)),
    })
  })
  store.renameGroup('missing', 'no-op')
  store.setServerCropType('server-a', '8')
  assert.equal(events.length, 1)
  assert.equal(events[0].source, 'local')
  assert.equal(events[0].persisted.children[0].cropType, '8')
})

test('云端 replaceRoot 水合并修复 root，但不产生上传循环', () => {
  const store = createStore()
  const events = []
  store.subscribeToMutations((event) => events.push(event))
  const replaced = store.replaceRoot({
    id: 'wrong-root',
    type: 'group',
    name: 'wrong',
    children: [{
      id: 'server-b',
      type: 'server',
      serverName: 'B区',
      cropType: 'invalid',
    }],
  }, { source: 'cloud' })
  assert.equal(replaced.id, 'root')
  assert.equal(replaced.name, '全部账号')
  assert.equal(store.getServer('server-b').cropType, '')
  assert.equal(events.length, 0)
  assert.equal(JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY)).id, 'root')
})

test('JSON import replaceRoot 被视为本地修改并可取消订阅', () => {
  const store = createStore()
  const events = []
  const listener = (event) => events.push(event.source)
  const unsubscribe = store.subscribeToMutations(listener)
  store.replaceRoot(rootFixture(), { source: 'local-import' })
  assert.deepEqual(events, ['local-import'])
  unsubscribe()
  store.setServerCropType('server-a', '8')
  assert.deepEqual(events, ['local-import'])
})

test('replaceRoot 继续水合旧字段并修复重复提醒 ID', () => {
  const store = createStore()
  const schedule = {
    schemaVersion: 1,
    cropType: '8',
    calculatedAt: 1_800_000_000_000,
    matureLeftMinutes: 200,
    waterLeftMinutes: 20,
    reportedMatureAt: 1_800_012_000_000,
    elapsedSinceLastWaterMinutes: 140,
    currentWaterReduceMinutes: 35,
    matureAfterWaterMinutes: 165,
    fastestLeftMinutes: 132,
    savedMinutes: 68,
    nextWaterAt: 1_800_001_200_000,
    fastestMatureAt: 1_800_007_920_000,
  }
  const reminder = {
    schemaVersion: 1,
    water: { enabled: true, notificationId: 101 },
    harvest: { enabled: true, notificationId: 102 },
    updatedAt: 1_800_000_000_000,
  }
  store.replaceRoot({
    id: 'root',
    type: 'group',
    children: [
      { id: 'a', type: 'server', serverName: 'A', cropType: '8', farmSchedule: schedule, farmReminders: reminder },
      { id: 'b', type: 'server', serverName: 'B', cropType: '8', farmSchedule: schedule, farmReminders: reminder },
    ],
  }, { source: 'cloud' })
  assert.equal(store.getServer('a').farmReminders.water.notificationId, 101)
  assert.notEqual(store.getServer('b').farmReminders.water.notificationId, 101)
})
