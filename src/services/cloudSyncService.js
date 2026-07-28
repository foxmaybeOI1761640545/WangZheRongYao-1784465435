import {
  createInitialSyncDocument,
  diffLocalDocument,
  mergeSyncDocuments,
  normaliseSyncDocument,
  rebuildAccountTree,
  syncDocumentsEqual,
  validateSyncDocument,
} from '../domain/cloudSyncDocument.js'
import {
  getOrCreateCloudDeviceId,
  nextLogicalTimestamp,
  readCloudRecoveries,
  readCloudSyncState,
  saveCloudRecovery,
  writeCloudSyncState,
} from '../domain/cloudSyncStorage.js'

const RETRY_DELAYS = Object.freeze([2_000, 5_000, 15_000, 30_000])
const DEBOUNCE_MS = 1_200
const MAX_WAIT_MS = 5_000

function clone(value) {
  if (value === undefined || value === null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function rowFromResult(value) {
  if (Array.isArray(value)) return value[0] ?? null
  if (value?.current && typeof value.current === 'object') return value.current
  return value && typeof value === 'object' ? value : null
}

function safeError(error, fallback = '云同步请求失败。') {
  const message = error instanceof Error
    ? error.message
    : String(error?.message ?? error ?? '')
  if (!message) return fallback
  return message
    .replace(/([?&](?:apikey|key|token|access_token))=[^&\s]+/gi, '$1=[已隐藏]')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_]+/g, '[已隐藏]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[已隐藏]')
    .replace(/ghp_[A-Za-z0-9]+/g, '[已隐藏]')
    .slice(0, 240)
}

function isRevisionConflict(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return text.includes('revision') && (
    text.includes('mismatch')
    || text.includes('conflict')
    || text.includes('expected')
  )
}

function isEmptyRoot(root) {
  return root?.type === 'group'
    && root?.id === 'root'
    && (!Array.isArray(root.children) || root.children.length === 0)
}

function firstPairMerge(localDocument, remoteDocument) {
  const local = normaliseSyncDocument(localDocument)
  const remote = normaliseSyncDocument(remoteDocument)
  const nodes = clone(remote.nodes)
  Object.entries(local.nodes).forEach(([id, record]) => {
    if (!nodes[id]) nodes[id] = clone(record)
  })
  return normaliseSyncDocument({
    ...remote,
    nodes,
    tombstones: clone(remote.tombstones),
    generatedAt: new Date().toISOString(),
  })
}

export function createCloudSyncService({
  store,
  supabase,
  config,
  storage = globalThis.localStorage,
  windowApi = globalThis.window,
  now = () => Date.now(),
  onRemoteApplied = async () => {},
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  debounceMs = DEBOUNCE_MS,
  maxWaitMs = MAX_WAIT_MS,
  retryDelays = RETRY_DELAYS,
}) {
  if (!store) throw new Error('云同步服务缺少账号 Store。')

  const listeners = new Set()
  const deviceId = getOrCreateCloudDeviceId(storage)
  const workspaceId = config.workspaceId
  const state = readCloudSyncState(storage, workspaceId)
  const status = {
    state: config.valid ? (state.dirty ? 'pending' : 'idle') : 'invalid-config',
    message: config.valid
      ? (state.dirty ? '等待同步' : '准备同步')
      : '云同步配置无效',
    revision: state.lastRevision,
    lastSyncedAt: state.lastSyncedAt,
    deviceIdShort: deviceId.slice(0, 8),
    error: '',
    online: windowApi?.navigator?.onLine !== false,
    paused: state.paused,
    merged: false,
  }
  let destroyed = false
  let initialised = false
  let channel = null
  let unsubscribeMutations = null
  let debounceTimer = null
  let maxWaitTimer = null
  let retryTimer = null
  let retryIndex = 0
  let activeSync = null

  function emitStatus(patch = {}) {
    Object.assign(status, patch)
    listeners.forEach((listener) => listener(clone(status)))
  }

  function persist() {
    writeCloudSyncState(storage, state)
  }

  function logicalNow() {
    const timestamp = nextLogicalTimestamp(state, Number(now()))
    persist()
    return timestamp
  }

  function markDirty(document) {
    state.workingDocument = clone(document)
    state.dirty = true
    persist()
    emitStatus({
      state: status.online ? 'pending' : 'offline',
      message: status.online ? '等待同步' : '离线修改已保存',
      error: '',
    })
  }

  function clearTimers() {
    if (debounceTimer) clearTimer(debounceTimer)
    if (maxWaitTimer) clearTimer(maxWaitTimer)
    if (retryTimer) clearTimer(retryTimer)
    debounceTimer = null
    maxWaitTimer = null
    retryTimer = null
  }

  function scheduleRetry() {
    if (destroyed || state.paused || retryTimer || !status.online) return
    const delay = retryDelays[Math.min(retryIndex, retryDelays.length - 1)]
    retryIndex = Math.min(retryIndex + 1, retryDelays.length - 1)
    retryTimer = setTimer(() => {
      retryTimer = null
      void flushPending()
    }, delay)
  }

  function scheduleFlush() {
    if (destroyed || state.paused || !config.valid) return
    if (debounceTimer) clearTimer(debounceTimer)
    debounceTimer = setTimer(() => {
      debounceTimer = null
      if (maxWaitTimer) clearTimer(maxWaitTimer)
      maxWaitTimer = null
      void flushPending()
    }, debounceMs)
    if (!maxWaitTimer) {
      maxWaitTimer = setTimer(() => {
        maxWaitTimer = null
        if (debounceTimer) clearTimer(debounceTimer)
        debounceTimer = null
        void flushPending()
      }, maxWaitMs)
    }
  }

  function buildWorkingDocument() {
    const base = state.workingDocument
      || state.lastCloudDocument
      || createInitialSyncDocument(store.exportRoot(), {
        workspaceId,
        deviceId,
        timestamp: logicalNow(),
      })
    return diffLocalDocument(base, store.exportRoot(), {
      workspaceId,
      deviceId,
      nextTimestamp: logicalNow,
    })
  }

  function handleMutation(event) {
    if (destroyed || event?.source === 'cloud' || event?.source === 'cloud-history') return
    const document = buildWorkingDocument()
    markDirty(document)
    scheduleFlush()
  }

  async function readRemoteRow() {
    const { data, error } = await supabase
      .from(config.stateTable)
      .select('workspace_id,revision,schema_version,snapshot,updated_at,updated_by')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  function rowDocument(row) {
    const document = normaliseSyncDocument(row?.snapshot, { workspaceId })
    const validation = validateSyncDocument(document, { workspaceId })
    if (!validation.valid) throw new Error(validation.errors[0])
    return document
  }

  async function applyDocument(document, source = 'cloud', {
    recoveryReason = '',
  } = {}) {
    const root = rebuildAccountTree(document)
    const current = store.exportRoot()
    if (JSON.stringify(root) === JSON.stringify(current)) return false
    if (recoveryReason) saveRecovery(recoveryReason)
    store.replaceRoot(root, { source })
    await onRemoteApplied({ source, root: store.exportRoot() })
    return true
  }

  function acceptRemote(row, document) {
    state.lastRevision = Math.max(0, Number(row?.revision) || 0)
    state.lastCloudDocument = clone(document)
    status.revision = state.lastRevision
  }

  async function resolveConflict() {
    const row = await readRemoteRow()
    if (!row) return false
    const remote = rowDocument(row)
    const local = state.workingDocument || buildWorkingDocument()
    const merged = mergeSyncDocuments(local, remote, { workspaceId })
    acceptRemote(row, remote)
    state.workingDocument = merged
    state.dirty = !syncDocumentsEqual(merged, remote)
    persist()
    await applyDocument(merged, 'cloud', {
      recoveryReason: 'before-conflict-merge',
    })
    return true
  }

  async function saveWorkingDocument() {
    const working = state.workingDocument || buildWorkingDocument()
    const { data, error } = await supabase.rpc(config.saveRpc, {
      p_workspace_id: workspaceId,
      p_expected_revision: state.lastRevision,
      p_schema_version: config.documentSchemaVersion,
      p_snapshot: working,
      p_device_id: deviceId,
    })
    if (error) throw error
    const row = rowFromResult(data)
    state.lastRevision = Math.max(
      state.lastRevision + 1,
      Number(row?.revision) || 0,
    )
    state.lastCloudDocument = clone(working)
    state.workingDocument = clone(working)
    state.dirty = false
    state.lastSyncedAt = row?.updated_at || new Date(now()).toISOString()
    persist()
    retryIndex = 0
    emitStatus({
      state: 'synced',
      message: '已同步',
      revision: state.lastRevision,
      lastSyncedAt: state.lastSyncedAt,
      error: '',
      merged: false,
    })
    return clone(status)
  }

  async function saveWithConflictRetries() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await saveWorkingDocument()
      } catch (error) {
        if (isRevisionConflict(error) && attempt < 2) {
          await resolveConflict()
          continue
        }
        throw error
      }
    }
    return clone(status)
  }

  async function flushPending({ bestEffort = false } = {}) {
    if (destroyed || !config.valid || !supabase || state.paused || !state.dirty) {
      return clone(status)
    }
    if (!status.online) {
      emitStatus({ state: 'offline', message: '离线修改已保存' })
      return clone(status)
    }
    if (activeSync) return activeSync
    activeSync = (async () => {
      emitStatus({ state: 'syncing', message: '同步中', error: '' })
      try {
        return await saveWithConflictRetries()
      } catch (error) {
        const message = safeError(error)
        state.dirty = true
        persist()
        emitStatus({
          state: status.online ? 'error' : 'offline',
          message: status.online ? '同步失败，稍后重试' : '离线修改已保存',
          error: message,
        })
        if (!bestEffort) scheduleRetry()
        return clone(status)
      }
    })().finally(() => {
      activeSync = null
    })
    return activeSync
  }

  async function pullAndMerge({ firstPair = false } = {}) {
    if (destroyed || !config.valid || !supabase || state.paused) return clone(status)
    if (!status.online) {
      emitStatus({ state: 'offline', message: state.dirty ? '离线修改已保存' : '当前离线' })
      return clone(status)
    }
    if (activeSync) return activeSync
    activeSync = (async () => {
      emitStatus({ state: 'syncing', message: '同步中', error: '' })
      try {
        const row = await readRemoteRow()
        if (!row) {
          const initial = createInitialSyncDocument(store.exportRoot(), {
            workspaceId,
            deviceId,
            timestamp: logicalNow(),
          })
          state.lastRevision = 0
          markDirty(initial)
          return await saveWithConflictRetries()
        }

        const remote = rowDocument(row)
        const localEmpty = isEmptyRoot(store.exportRoot())
        let merged
        if (firstPair && state.lastRevision === 0) {
          saveRecovery('first-cloud-pairing')
          if (localEmpty) merged = remote
          else {
            const local = createInitialSyncDocument(store.exportRoot(), {
              workspaceId,
              deviceId,
              timestamp: logicalNow(),
            })
            merged = firstPairMerge(local, remote)
          }
        } else {
          const local = state.dirty
            ? (state.workingDocument || buildWorkingDocument())
            : diffLocalDocument(
              state.lastCloudDocument || remote,
              store.exportRoot(),
              {
                workspaceId,
                deviceId,
                nextTimestamp: logicalNow,
              },
            )
          merged = mergeSyncDocuments(local, remote, { workspaceId })
        }

        acceptRemote(row, remote)
        const applied = await applyDocument(merged, 'cloud', {
          recoveryReason: firstPair ? '' : 'before-cloud-merge',
        })
        state.workingDocument = clone(merged)
        state.dirty = !syncDocumentsEqual(merged, remote)
        state.lastSyncedAt = row.updated_at || state.lastSyncedAt
        persist()

        if (state.dirty) {
          emitStatus({
            state: 'pending',
            message: applied ? '已合并其他设备修改' : '等待同步',
            merged: applied,
          })
          return await saveWithConflictRetries()
        }
        retryIndex = 0
        emitStatus({
          state: 'synced',
          message: applied ? '已合并其他设备修改' : '已同步',
          revision: state.lastRevision,
          lastSyncedAt: state.lastSyncedAt,
          error: '',
          merged: applied,
        })
        return clone(status)
      } catch (error) {
        const message = safeError(error)
        emitStatus({
          state: 'error',
          message: '同步失败，稍后重试',
          error: message,
        })
        scheduleRetry()
        return clone(status)
      }
    })().finally(() => {
      activeSync = null
    })
    return activeSync
  }

  function setupRealtime() {
    if (channel || destroyed || !supabase?.channel) return
    channel = supabase
      .channel(`wangzhe-sync-${workspaceId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: config.stateTable,
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        const row = payload?.new ?? {}
        const revision = Number(row.revision) || 0
        if (row.updated_by === deviceId) {
          if (revision > state.lastRevision) {
            state.lastRevision = revision
            status.revision = revision
            persist()
          }
          return
        }
        if (revision > state.lastRevision) void pullAndMerge()
      })
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'CHANNEL_ERROR') {
          emitStatus({ error: 'Realtime 连接失败，将继续使用定时重试。' })
        }
      })
  }

  function handleOnline() {
    status.online = true
    emitStatus({
      online: true,
      state: state.dirty ? 'pending' : 'idle',
      message: state.dirty ? '等待同步' : '准备同步',
    })
    void pullAndMerge()
  }

  function handleOffline() {
    emitStatus({
      online: false,
      state: 'offline',
      message: state.dirty ? '离线修改已保存' : '当前离线',
    })
  }

  async function initialise() {
    if (initialised || destroyed) return clone(status)
    initialised = true
    if (!config.valid || !supabase) {
      emitStatus({
        state: 'invalid-config',
        message: '云同步配置无效',
        error: config.errors?.[0] || '',
      })
      return clone(status)
    }
    unsubscribeMutations = store.subscribeToMutations(handleMutation)
    windowApi?.addEventListener?.('online', handleOnline)
    windowApi?.addEventListener?.('offline', handleOffline)
    if (state.paused) {
      emitStatus({ state: 'paused', message: '本设备自动同步已暂停', paused: true })
      return clone(status)
    }
    const result = await pullAndMerge({ firstPair: state.lastRevision === 0 })
    setupRealtime()
    return result
  }

  async function syncNow() {
    if (state.paused) return clone(status)
    const document = buildWorkingDocument()
    if (!state.lastCloudDocument || !syncDocumentsEqual(document, state.lastCloudDocument)) {
      markDirty(document)
    }
    return state.dirty ? flushPending() : pullAndMerge()
  }

  async function listHistory() {
    if (!supabase || !config.valid) return []
    const { data, error } = await supabase
      .from(config.historyTable)
      .select('workspace_id,revision,schema_version,snapshot,saved_at,saved_by')
      .eq('workspace_id', workspaceId)
      .order('revision', { ascending: false })
      .limit(50)
    if (error) throw new Error(safeError(error, '读取云端历史失败。'))
    return Array.isArray(data) ? data : []
  }

  async function reloadFromCloud() {
    const row = await readRemoteRow()
    if (!row) throw new Error('云端尚无同步数据。')
    saveRecovery('before-cloud-reload')
    const remote = rowDocument(row)
    await applyDocument(remote, 'cloud')
    acceptRemote(row, remote)
    state.workingDocument = clone(remote)
    state.dirty = false
    state.lastSyncedAt = row.updated_at || new Date(now()).toISOString()
    persist()
    emitStatus({
      state: 'synced',
      message: '已从云端重新加载',
      revision: state.lastRevision,
      lastSyncedAt: state.lastSyncedAt,
      error: '',
    })
    return clone(status)
  }

  async function restoreHistory(revision) {
    const history = await listHistory()
    const selected = history.find((entry) => Number(entry.revision) === Number(revision))
    if (!selected) throw new Error('未找到选中的云端历史版本。')
    const currentRow = await readRemoteRow()
    if (!currentRow) throw new Error('云端尚无同步数据。')
    const currentDocument = rowDocument(currentRow)
    saveRecovery('before-cloud-history-restore')
    const document = rowDocument({ snapshot: selected.snapshot })
    await applyDocument(document, 'cloud-history')
    acceptRemote(currentRow, currentDocument)
    state.workingDocument = clone(document)
    state.dirty = true
    persist()
    return flushPending()
  }

  function saveRecovery(reason) {
    return saveCloudRecovery(storage, {
      reason,
      root: store.exportRoot(),
      document: state.workingDocument || state.lastCloudDocument,
      createdAt: new Date(now()).toISOString(),
    })
  }

  function getRecoveries() {
    return readCloudRecoveries(storage)
  }

  async function restoreRecovery(index) {
    const recovery = getRecoveries()[Number(index)]
    if (!recovery?.root) throw new Error('未找到本地恢复点。')
    saveRecovery('before-local-recovery-restore')
    store.replaceRoot(recovery.root, { source: 'local-import' })
    return syncNow()
  }

  function setPaused(paused) {
    state.paused = Boolean(paused)
    persist()
    emitStatus({
      paused: state.paused,
      state: state.paused ? 'paused' : (state.dirty ? 'pending' : 'idle'),
      message: state.paused
        ? '本设备自动同步已暂停'
        : (state.dirty ? '等待同步' : '准备同步'),
    })
    if (!state.paused) {
      setupRealtime()
      void pullAndMerge()
    }
    return state.paused
  }

  function clearError() {
    emitStatus({
      error: '',
      state: state.dirty ? 'pending' : 'idle',
      message: state.dirty ? '等待同步' : '准备同步',
    })
  }

  async function destroy() {
    if (destroyed) return
    destroyed = true
    clearTimers()
    unsubscribeMutations?.()
    windowApi?.removeEventListener?.('online', handleOnline)
    windowApi?.removeEventListener?.('offline', handleOffline)
    if (channel && supabase?.removeChannel) await supabase.removeChannel(channel)
    channel = null
  }

  return {
    initialise,
    destroy,
    syncNow,
    pullAndMerge,
    flushPending,
    listHistory,
    restoreHistory,
    reloadFromCloud,
    getStatus: () => clone(status),
    subscribeStatus(listener) {
      listeners.add(listener)
      listener(clone(status))
      return () => listeners.delete(listener)
    },
    setPaused,
    clearError,
    saveRecovery,
    getRecoveries,
    restoreRecovery,
    getDeviceId: () => deviceId,
  }
}
