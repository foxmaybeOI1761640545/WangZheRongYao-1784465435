import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_STORAGE_KEY,
  useAccountStore,
} from '../src/composables/useAccountStore.js'
import { createInitialSyncDocument } from '../src/domain/cloudSyncDocument.js'
import {
  CLOUD_SYNC_RECOVERY_KEY,
  CLOUD_SYNC_STATE_KEY,
} from '../src/domain/cloudSyncStorage.js'
import { createCloudSyncService } from '../src/services/cloudSyncService.js'

const WORKSPACE = 'd56cc0d5-623c-40f0-8f66-12e56688bc54'
const NOW = 1_800_000_000_000
const CONFIG = {
  valid: true,
  errors: [],
  workspaceId: WORKSPACE,
  documentSchemaVersion: 1,
  stateTable: 'app_sync_state',
  historyTable: 'app_sync_history',
  saveRpc: 'save_wangzhe_sync_state',
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function rootFixture(serverName = '本地 A 区', children = true) {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    parentId: null,
    createdAt: 1,
    children: children ? [{
      id: 'server-a',
      type: 'server',
      parentId: 'root',
      serverName,
      cropType: '',
      createdAt: 2,
    }] : [],
  }
}

function createStore(storage, root = rootFixture()) {
  storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(root))
  globalThis.localStorage = storage
  return useAccountStore()
}

function bootstrapDocument() {
  return createInitialSyncDocument(rootFixture('', false), {
    workspaceId: WORKSPACE,
    deviceId: 'bootstrap',
    timestamp: 0,
  })
}

function createWindow({ online = true } = {}) {
  const listeners = new Map()
  return {
    navigator: { onLine: online },
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? []
      values.push(listener)
      listeners.set(type, values)
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener))
    },
    dispatch(type) {
      this.navigator.onLine = type === 'online'
      ;(listeners.get(type) ?? []).forEach((listener) => listener())
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length
    },
  }
}

function createFakeSupabase({
  snapshot = bootstrapDocument(),
  revision = 0,
  updatedBy = 'bootstrap',
  rpcConflicts = 0,
  readError = null,
} = {}) {
  const state = {
    row: {
      workspace_id: WORKSPACE,
      revision,
      schema_version: 1,
      snapshot: structuredClone(snapshot),
      updated_at: new Date(NOW).toISOString(),
      updated_by: updatedBy,
    },
    history: [],
    rpcCalls: [],
    reads: 0,
    removedChannels: 0,
    realtimeHandler: null,
    subscriptionHandler: null,
    rpcConflicts,
  }

  function stateQuery() {
    return {
      select() { return this },
      eq() { return this },
      async maybeSingle() {
        state.reads += 1
        return readError
          ? { data: null, error: readError }
          : { data: structuredClone(state.row), error: null }
      },
    }
  }

  function historyQuery() {
    return {
      select() { return this },
      eq() { return this },
      order() { return this },
      async limit() {
        return { data: structuredClone(state.history), error: null }
      },
    }
  }

  const api = {
    state,
    from(table) {
      return table === CONFIG.historyTable ? historyQuery() : stateQuery()
    },
    async rpc(_name, args) {
      state.rpcCalls.push(structuredClone(args))
      if (state.rpcConflicts > 0) {
        state.rpcConflicts -= 1
        state.row.revision += 1
        return {
          data: null,
          error: { code: '40001', message: 'revision mismatch' },
        }
      }
      if (args.p_expected_revision !== state.row.revision) {
        return {
          data: null,
          error: { code: '40001', message: 'revision mismatch' },
        }
      }
      state.history.unshift({
        workspace_id: WORKSPACE,
        revision: state.row.revision,
        schema_version: 1,
        snapshot: structuredClone(state.row.snapshot),
        saved_at: state.row.updated_at,
        saved_by: state.row.updated_by,
      })
      state.row = {
        workspace_id: WORKSPACE,
        revision: state.row.revision + 1,
        schema_version: 1,
        snapshot: structuredClone(args.p_snapshot),
        updated_at: new Date(NOW + state.rpcCalls.length).toISOString(),
        updated_by: args.p_device_id,
      }
      return { data: structuredClone(state.row), error: null }
    },
    channel() {
      return {
        on(_event, _filter, handler) {
          state.realtimeHandler = handler
          return this
        },
        subscribe(handler) {
          state.subscriptionHandler = handler
          handler('SUBSCRIBED')
          return this
        },
      }
    },
    async removeChannel() {
      state.removedChannels += 1
    },
  }
  return api
}

function createService({
  root = rootFixture(),
  supabase = createFakeSupabase(),
  online = true,
  storage = createStorage(),
  onRemoteApplied = async () => {},
  timers = {},
} = {}) {
  const store = createStore(storage, root)
  const windowApi = createWindow({ online })
  let currentNow = NOW
  const service = createCloudSyncService({
    store,
    supabase,
    config: CONFIG,
    storage,
    windowApi,
    now: () => currentNow++,
    onRemoteApplied,
    ...timers,
  })
  return { service, store, supabase, storage, windowApi }
}

test('bootstrap 云端由本地账号树初始化', async () => {
  const fixture = createService()
  await fixture.service.initialise()
  assert.equal(fixture.supabase.state.rpcCalls.length, 1)
  assert.equal(
    fixture.supabase.state.row.snapshot.nodes['server-a'].data.serverName,
    '本地 A 区',
  )
  assert.equal(fixture.service.getStatus().state, 'synced')
  await fixture.service.destroy()
})

test('空本地从云端恢复，首次配对同 ID 冲突默认云端优先并保留仅本地节点', async () => {
  const remoteRoot = rootFixture('云端 A 区')
  remoteRoot.children.push({
    id: 'server-cloud',
    type: 'server',
    parentId: 'root',
    serverName: '仅云端',
    cropType: '',
  })
  const remote = createInitialSyncDocument(remoteRoot, {
    workspaceId: WORKSPACE,
    deviceId: 'device-cloud',
    timestamp: NOW - 100,
  })
  const empty = createService({
    root: rootFixture('', false),
    supabase: createFakeSupabase({ snapshot: remote, revision: 2 }),
  })
  await empty.service.initialise()
  assert.equal(empty.store.getServer('server-a').serverName, '云端 A 区')
  assert.equal(empty.store.getServer('server-cloud').serverName, '仅云端')
  await empty.service.destroy()

  const localRoot = rootFixture('本地冲突')
  localRoot.children.push({
    id: 'server-local',
    type: 'server',
    parentId: 'root',
    serverName: '仅本地',
    cropType: '',
  })
  const paired = createService({
    root: localRoot,
    supabase: createFakeSupabase({ snapshot: remote, revision: 2 }),
  })
  await paired.service.initialise()
  assert.equal(paired.store.getServer('server-a').serverName, '云端 A 区')
  assert.equal(paired.store.getServer('server-local').serverName, '仅本地')
  assert.equal(paired.supabase.state.rpcCalls.length, 1)
  await paired.service.destroy()
})

test('离线修改持久化 dirty，online 后自动补同步', async () => {
  const fixture = createService({ online: false })
  await fixture.service.initialise()
  fixture.store.setServerCropType('server-a', '8')
  const saved = JSON.parse(fixture.storage.getItem(CLOUD_SYNC_STATE_KEY))
  assert.equal(saved.dirty, true)
  assert.equal(fixture.service.getStatus().message, '离线修改已保存')
  assert.equal(fixture.supabase.state.rpcCalls.length, 0)

  fixture.windowApi.dispatch('online')
  await new Promise((resolve) => setImmediate(resolve))
  await fixture.service.flushPending()
  assert.equal(fixture.supabase.state.rpcCalls.length > 0, true)
  assert.equal(fixture.service.getStatus().state, 'synced')
  await fixture.service.destroy()
})

test('revision conflict 自动拉取合并重试，第三次冲突后保留 dirty', async () => {
  const retrying = createService({
    supabase: createFakeSupabase({ rpcConflicts: 1 }),
  })
  await retrying.service.initialise()
  assert.equal(retrying.supabase.state.rpcCalls.length, 2)
  assert.equal(retrying.service.getStatus().state, 'synced')
  await retrying.service.destroy()

  const failing = createService({
    supabase: createFakeSupabase({ rpcConflicts: 3 }),
    timers: {
      setTimer: () => 1,
      clearTimer: () => {},
    },
  })
  await failing.service.initialise()
  const saved = JSON.parse(failing.storage.getItem(CLOUD_SYNC_STATE_KEY))
  assert.equal(failing.supabase.state.rpcCalls.length, 3)
  assert.equal(saved.dirty, true)
  assert.equal(failing.service.getStatus().state, 'error')
  await failing.service.destroy()
})

test('本机 Realtime 更新只更新 revision，其他设备更新触发 pull', async () => {
  const fixture = createService()
  await fixture.service.initialise()
  const ownId = fixture.service.getDeviceId()
  const beforeReads = fixture.supabase.state.reads
  fixture.supabase.state.row.revision = fixture.service.getStatus().revision + 1
  fixture.supabase.state.row.updated_by = ownId
  fixture.supabase.state.realtimeHandler({
    new: {
      revision: fixture.supabase.state.row.revision,
      updated_by: ownId,
    },
  })
  assert.equal(fixture.supabase.state.reads, beforeReads)

  fixture.supabase.state.row.updated_by = 'other-device'
  fixture.supabase.state.row.revision += 1
  fixture.supabase.state.realtimeHandler({
    new: {
      revision: fixture.supabase.state.row.revision,
      updated_by: 'other-device',
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(fixture.supabase.state.reads > beforeReads, true)
  await fixture.service.destroy()
})

test('debounce 重置但 maxWait 保持，destroy 清理频道、监听和 timer', async () => {
  const callbacks = new Map()
  const cleared = []
  let timerId = 0
  const timers = {
    setTimer(callback, delay) {
      timerId += 1
      callbacks.set(timerId, { callback, delay })
      return timerId
    },
    clearTimer(id) {
      cleared.push(id)
      callbacks.delete(id)
    },
    debounceMs: 1_200,
    maxWaitMs: 5_000,
  }
  const fixture = createService({ timers })
  await fixture.service.initialise()
  fixture.store.setServerCropType('server-a', '8')
  fixture.store.setServerCropType('server-a', '16')
  assert.equal([...callbacks.values()].some((entry) => entry.delay === 1_200), true)
  assert.equal([...callbacks.values()].filter((entry) => entry.delay === 5_000).length, 1)
  assert.equal(cleared.length > 0, true)
  assert.equal(fixture.windowApi.listenerCount('online'), 1)
  await fixture.service.destroy()
  assert.equal(fixture.supabase.state.removedChannels, 1)
  assert.equal(fixture.windowApi.listenerCount('online'), 0)
  assert.equal(callbacks.size, 0)
})

test('项目暂停或 HTTP 读取错误不影响本地编辑', async () => {
  const fixture = createService({
    supabase: createFakeSupabase({
      readError: { message: 'project paused (HTTP 503)' },
    }),
    timers: {
      setTimer: () => 1,
      clearTimer: () => {},
    },
  })
  await fixture.service.initialise()
  assert.equal(fixture.service.getStatus().state, 'error')
  assert.doesNotThrow(() => fixture.store.setServerCropType('server-a', '8'))
  assert.equal(fixture.store.getServer('server-a').cropType, '8')
  assert.equal(JSON.parse(fixture.storage.getItem(CLOUD_SYNC_STATE_KEY)).dirty, true)
  await fixture.service.destroy()
})

test('历史读取使用生产字段，恢复前读取当前 revision 并通过同一 RPC 新建版本', async () => {
  const currentRoot = rootFixture('当前云端')
  const oldRoot = rootFixture('历史版本')
  const currentDocument = createInitialSyncDocument(currentRoot, {
    workspaceId: WORKSPACE,
    deviceId: 'cloud-current',
    timestamp: NOW - 10,
  })
  const oldDocument = createInitialSyncDocument(oldRoot, {
    workspaceId: WORKSPACE,
    deviceId: 'cloud-history',
    timestamp: NOW - 100,
  })
  const supabase = createFakeSupabase({
    snapshot: currentDocument,
    revision: 7,
    updatedBy: 'cloud-current',
  })
  supabase.state.history.push({
    workspace_id: WORKSPACE,
    revision: 3,
    schema_version: 1,
    snapshot: oldDocument,
    saved_at: new Date(NOW - 100).toISOString(),
    saved_by: 'cloud-history',
  })
  const fixture = createService({ root: currentRoot, supabase })
  await fixture.service.initialise()
  const readsBeforeRestore = supabase.state.reads

  await fixture.service.restoreHistory(3)

  const restoreCall = supabase.state.rpcCalls.at(-1)
  assert.equal(supabase.state.reads, readsBeforeRestore + 1)
  assert.equal(restoreCall.p_expected_revision, 7)
  assert.equal(restoreCall.p_snapshot.nodes['server-a'].data.serverName, '历史版本')
  assert.equal(fixture.store.getServer('server-a').serverName, '历史版本')
  assert.equal(fixture.service.getStatus().revision, 8)
  assert.equal(
    JSON.parse(fixture.storage.getItem(CLOUD_SYNC_RECOVERY_KEY)).length > 0,
    true,
  )
  await fixture.service.destroy()
})
