export const CLOUD_SYNC_DEVICE_ID_KEY = 'wangzhe-cloud-sync:device-id:v1'
export const CLOUD_SYNC_STATE_KEY = 'wangzhe-cloud-sync:state:v1'
export const CLOUD_SYNC_RECOVERY_KEY = 'wangzhe-cloud-sync:recovery:v1'
export const CLOUD_SYNC_RECOVERY_LIMIT = 3

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function safeGet(storage, key) {
  try {
    return storage?.getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function fallbackUuid(random = Math.random, now = Date.now) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256))
  const timestamp = Number(now())
  for (let index = 0; index < 6; index += 1) {
    bytes[index] ^= (timestamp / (2 ** (index * 8))) & 0xff
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

export function getOrCreateCloudDeviceId(storage = globalThis.localStorage, {
  cryptoApi = globalThis.crypto,
  random,
  now,
} = {}) {
  const saved = String(safeGet(storage, CLOUD_SYNC_DEVICE_ID_KEY) ?? '').trim()
  if (saved) return saved
  const created = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : fallbackUuid(random, now)
  safeSet(storage, CLOUD_SYNC_DEVICE_ID_KEY, created)
  return created
}

export function createDefaultCloudSyncState(workspaceId = '') {
  return {
    workspaceId,
    lastRevision: 0,
    lastSyncedAt: '',
    lastLogicalTimestamp: 0,
    dirty: false,
    paused: false,
    lastCloudDocument: null,
    workingDocument: null,
  }
}

export function readCloudSyncState(
  storage = globalThis.localStorage,
  workspaceId = '',
) {
  const fallback = createDefaultCloudSyncState(workspaceId)
  try {
    const parsed = JSON.parse(safeGet(storage, CLOUD_SYNC_STATE_KEY) || 'null')
    if (!parsed || parsed.workspaceId !== workspaceId) return fallback
    return {
      ...fallback,
      ...parsed,
      workspaceId,
      lastRevision: Math.max(0, Number.parseInt(parsed.lastRevision, 10) || 0),
      lastLogicalTimestamp: Math.max(
        0,
        Number.parseInt(parsed.lastLogicalTimestamp, 10) || 0,
      ),
      dirty: Boolean(parsed.dirty),
      paused: Boolean(parsed.paused),
    }
  } catch {
    return fallback
  }
}

export function writeCloudSyncState(storage, state) {
  return safeSet(storage, CLOUD_SYNC_STATE_KEY, JSON.stringify(state))
}

export function nextLogicalTimestamp(state, now = Date.now()) {
  const next = Math.max(
    Number(now) || Date.now(),
    Number(state.lastLogicalTimestamp || 0) + 1,
  )
  state.lastLogicalTimestamp = next
  return next
}

export function readCloudRecoveries(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(safeGet(storage, CLOUD_SYNC_RECOVERY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.slice(0, CLOUD_SYNC_RECOVERY_LIMIT) : []
  } catch {
    return []
  }
}

export function saveCloudRecovery(storage, {
  reason,
  root,
  document = null,
  createdAt = new Date().toISOString(),
}) {
  const recoveries = readCloudRecoveries(storage)
  recoveries.unshift({
    schemaVersion: 1,
    reason: String(reason ?? 'cloud-sync'),
    createdAt,
    root: clone(root),
    document: document ? clone(document) : null,
  })
  const trimmed = recoveries.slice(0, CLOUD_SYNC_RECOVERY_LIMIT)
  safeSet(storage, CLOUD_SYNC_RECOVERY_KEY, JSON.stringify(trimmed))
  return trimmed
}
