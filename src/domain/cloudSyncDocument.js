import { normaliseCropType } from './cropTypes.js'
import { normaliseFarmSchedule } from './farmCalculator.js'
import { normaliseFarmReminders } from './farmReminders.js'

export const CLOUD_SYNC_APP = 'wangzhe-account-manager-cloud-sync'
export const CLOUD_SYNC_SCHEMA_VERSION = 1

const SERVER_FIELDS = Object.freeze([
  'serverName',
  'system',
  'platform',
  'accountId',
  'accountLevel',
  'battlePassLevel',
  'farmLevel',
  'cropType',
  'farmSchedule',
  'farmReminders',
  'epicSkins',
  'createdAt',
])

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function finiteTimestamp(value, fallback = 0) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : fallback
}

function cleanId(value) {
  return String(value ?? '').trim()
}

function cleanDeviceId(value) {
  return cleanId(value) || 'unknown-device'
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'en')
}

function normaliseGroupData(data, isRoot = false) {
  return {
    name: isRoot ? '全部账号' : (String(data?.name ?? '').trim() || '未命名分组'),
    createdAt: finiteTimestamp(data?.createdAt),
  }
}

function normaliseServerData(data) {
  const cropType = normaliseCropType(data?.cropType)
  const farmSchedule = normaliseFarmSchedule(data?.farmSchedule, cropType)
  const farmReminders = farmSchedule
    ? normaliseFarmReminders(data?.farmReminders, farmSchedule)
    : null
  return {
    serverName: String(data?.serverName ?? '').trim() || '未命名区服',
    system: data?.system === 'ios' ? 'ios' : 'android',
    platform: data?.platform === 'wechat' ? 'wechat' : 'qq',
    accountId: String(data?.accountId ?? '').trim(),
    accountLevel: Math.max(0, Number.parseInt(data?.accountLevel, 10) || 0),
    battlePassLevel: Math.max(0, Number.parseInt(data?.battlePassLevel, 10) || 0),
    farmLevel: Math.max(0, Number.parseInt(data?.farmLevel, 10) || 0),
    cropType,
    farmSchedule: clone(farmSchedule),
    farmReminders: clone(farmReminders),
    epicSkins: String(data?.epicSkins ?? '').trim(),
    createdAt: finiteTimestamp(data?.createdAt),
  }
}

function nodeData(node) {
  if (node.type === 'group') return normaliseGroupData(node, node.id === 'root')
  const candidate = {}
  SERVER_FIELDS.forEach((field) => {
    candidate[field] = node[field]
  })
  return normaliseServerData(candidate)
}

function normaliseRecord(value, idHint = '') {
  if (!isRecord(value)) return null
  const id = cleanId(value.id || idHint)
  const type = value.type === 'group' || value.type === 'server' ? value.type : ''
  if (!id || !type) return null
  const isRoot = id === 'root'
  if (isRoot && type !== 'group') return null
  return {
    id,
    type,
    parentId: isRoot ? null : (cleanId(value.parentId) || 'root'),
    position: Math.max(0, Number.parseInt(value.position, 10) || 0),
    updatedAt: finiteTimestamp(value.updatedAt),
    updatedBy: cleanDeviceId(value.updatedBy),
    data: type === 'group'
      ? normaliseGroupData(value.data, isRoot)
      : normaliseServerData(value.data),
  }
}

function normaliseTombstone(value, idHint = '') {
  if (!isRecord(value)) return null
  const id = cleanId(value.id || idHint)
  if (!id || id === 'root') return null
  return {
    deletedAt: finiteTimestamp(value.deletedAt),
    deletedBy: cleanDeviceId(value.deletedBy),
  }
}

function recordContent(record) {
  return {
    id: record.id,
    type: record.type,
    parentId: record.parentId,
    position: record.position,
    data: record.data,
  }
}

function sameContent(left, right) {
  return JSON.stringify(recordContent(left)) === JSON.stringify(recordContent(right))
}

function nextValue(nextTimestamp) {
  return typeof nextTimestamp === 'function'
    ? finiteTimestamp(nextTimestamp(), Date.now())
    : finiteTimestamp(nextTimestamp, Date.now())
}

export function compareRecordVersions(left, right) {
  const timestamp = finiteTimestamp(left?.updatedAt) - finiteTimestamp(right?.updatedAt)
  if (timestamp !== 0) return timestamp
  return compareText(left?.updatedBy, right?.updatedBy)
}

export function compareTombstoneVersions(left, right) {
  const timestamp = finiteTimestamp(left?.deletedAt) - finiteTimestamp(right?.deletedAt)
  if (timestamp !== 0) return timestamp
  return compareText(left?.deletedBy, right?.deletedBy)
}

function compareRecordAndTombstone(record, tombstone) {
  const timestamp = finiteTimestamp(record?.updatedAt) - finiteTimestamp(tombstone?.deletedAt)
  if (timestamp !== 0) return timestamp
  return compareText(record?.updatedBy, tombstone?.deletedBy)
}

export function flattenAccountTree(root, {
  deviceId = 'unknown-device',
  timestamp = Date.now(),
  metadata = {},
} = {}) {
  const nodes = {}
  const defaultTimestamp = finiteTimestamp(timestamp, Date.now())

  function walk(node, parentId, position) {
    if (!isRecord(node)) return
    const id = parentId === null ? 'root' : cleanId(node.id)
    const type = node.type === 'server' ? 'server' : 'group'
    if (!id || (id !== 'root' && !parentId)) return
    const saved = metadata[id]
    nodes[id] = normaliseRecord({
      id,
      type,
      parentId,
      position,
      updatedAt: saved?.updatedAt ?? defaultTimestamp,
      updatedBy: saved?.updatedBy ?? deviceId,
      data: nodeData({ ...node, id, type }),
    }, id)
    if (type === 'group') {
      const children = Array.isArray(node.children) ? node.children : []
      children.forEach((child, index) => walk(child, id, index))
    }
  }

  walk(root, null, 0)
  if (!nodes.root) {
    nodes.root = normaliseRecord({
      id: 'root',
      type: 'group',
      parentId: null,
      position: 0,
      updatedAt: defaultTimestamp,
      updatedBy: deviceId,
      data: { name: '全部账号', createdAt: defaultTimestamp },
    })
  }
  return nodes
}

export function normaliseSyncDocument(value, {
  workspaceId = cleanId(value?.workspaceId),
  generatedAt = new Date().toISOString(),
} = {}) {
  const nodes = {}
  const tombstones = {}
  if (isRecord(value?.nodes)) {
    Object.entries(value.nodes).forEach(([id, candidate]) => {
      const record = normaliseRecord(candidate, id)
      if (record) nodes[record.id] = record
    })
  }
  if (isRecord(value?.tombstones)) {
    Object.entries(value.tombstones).forEach(([id, candidate]) => {
      const tombstone = normaliseTombstone(candidate, id)
      if (tombstone) tombstones[id] = tombstone
    })
  }
  if (!nodes.root) {
    const maxTimestamp = Math.max(
      0,
      ...Object.values(nodes).map((record) => record.updatedAt),
      ...Object.values(tombstones).map((entry) => entry.deletedAt),
    )
    nodes.root = normaliseRecord({
      id: 'root',
      type: 'group',
      parentId: null,
      position: 0,
      updatedAt: maxTimestamp,
      updatedBy: 'repair',
      data: { name: '全部账号', createdAt: maxTimestamp },
    })
  }
  delete tombstones.root
  return {
    schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
    app: CLOUD_SYNC_APP,
    workspaceId: cleanId(workspaceId),
    generatedAt: String(value?.generatedAt ?? generatedAt),
    nodes,
    tombstones,
  }
}

export function validateSyncDocument(value, { workspaceId = '' } = {}) {
  const errors = []
  if (!isRecord(value)) errors.push('同步文档必须是 JSON 对象。')
  if (Number(value?.schemaVersion) !== CLOUD_SYNC_SCHEMA_VERSION) {
    errors.push('同步文档版本不受支持。')
  }
  if (value?.app !== CLOUD_SYNC_APP) errors.push('同步文档应用标识无效。')
  if (workspaceId && value?.workspaceId !== workspaceId) {
    errors.push('同步文档 Workspace 不匹配。')
  }
  if (!isRecord(value?.nodes) || !value?.nodes?.root) {
    errors.push('同步文档缺少根节点。')
  }
  return { valid: errors.length === 0, errors }
}

export function createInitialSyncDocument(root, {
  workspaceId,
  deviceId,
  timestamp = Date.now(),
} = {}) {
  return normaliseSyncDocument({
    schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
    app: CLOUD_SYNC_APP,
    workspaceId,
    generatedAt: new Date(timestamp).toISOString(),
    nodes: flattenAccountTree(root, { deviceId, timestamp }),
    tombstones: {},
  }, { workspaceId })
}

export function createTombstonesForDeletedSubtree(document, nodeId, {
  deletedAt = Date.now(),
  deletedBy = 'unknown-device',
} = {}) {
  const result = normaliseSyncDocument(clone(document))
  const targets = new Set([cleanId(nodeId)])
  let changed = true
  while (changed) {
    changed = false
    Object.values(result.nodes).forEach((record) => {
      if (targets.has(record.parentId) && !targets.has(record.id)) {
        targets.add(record.id)
        changed = true
      }
    })
  }
  targets.delete('root')
  targets.delete('')
  targets.forEach((id) => {
    const candidate = {
      deletedAt: finiteTimestamp(deletedAt, Date.now()),
      deletedBy: cleanDeviceId(deletedBy),
    }
    if (
      !result.tombstones[id]
      || compareTombstoneVersions(candidate, result.tombstones[id]) > 0
    ) {
      result.tombstones[id] = candidate
    }
    delete result.nodes[id]
  })
  result.generatedAt = new Date(finiteTimestamp(deletedAt, Date.now())).toISOString()
  return result
}

export function diffLocalDocument(baseDocument, localRoot, {
  workspaceId = baseDocument?.workspaceId,
  deviceId = 'unknown-device',
  nextTimestamp = Date.now(),
} = {}) {
  const base = normaliseSyncDocument(baseDocument, { workspaceId })
  const localNodes = flattenAccountTree(localRoot, {
    deviceId,
    timestamp: 0,
    metadata: base.nodes,
  })
  const result = normaliseSyncDocument(clone(base), { workspaceId })

  Object.entries(localNodes).forEach(([id, localRecord]) => {
    const baseRecord = base.nodes[id]
    if (!baseRecord || !sameContent(baseRecord, localRecord)) {
      localRecord.updatedAt = nextValue(nextTimestamp)
      localRecord.updatedBy = cleanDeviceId(deviceId)
      delete result.tombstones[id]
    }
    result.nodes[id] = localRecord
  })

  Object.keys(base.nodes).forEach((id) => {
    if (id === 'root' || localNodes[id]) return
    const tombstoneTime = nextValue(nextTimestamp)
    const deleted = createTombstonesForDeletedSubtree(result, id, {
      deletedAt: tombstoneTime,
      deletedBy: deviceId,
    })
    result.nodes = deleted.nodes
    result.tombstones = deleted.tombstones
  })

  result.generatedAt = new Date().toISOString()
  return result
}

export function mergeSyncDocuments(leftDocument, rightDocument, {
  workspaceId = leftDocument?.workspaceId || rightDocument?.workspaceId,
} = {}) {
  const left = normaliseSyncDocument(leftDocument, { workspaceId })
  const right = normaliseSyncDocument(rightDocument, { workspaceId })
  const nodes = {}
  const tombstones = {}
  const ids = new Set([
    ...Object.keys(left.nodes),
    ...Object.keys(right.nodes),
    ...Object.keys(left.tombstones),
    ...Object.keys(right.tombstones),
  ])

  ids.forEach((id) => {
    const leftRecord = left.nodes[id]
    const rightRecord = right.nodes[id]
    const record = leftRecord && rightRecord
      ? (compareRecordVersions(leftRecord, rightRecord) >= 0 ? leftRecord : rightRecord)
      : (leftRecord || rightRecord)
    const leftTombstone = left.tombstones[id]
    const rightTombstone = right.tombstones[id]
    const tombstone = leftTombstone && rightTombstone
      ? (compareTombstoneVersions(leftTombstone, rightTombstone) >= 0
        ? leftTombstone
        : rightTombstone)
      : (leftTombstone || rightTombstone)

    if (id === 'root') {
      if (record) nodes.root = clone(record)
      return
    }
    if (record && tombstone) {
      if (compareRecordAndTombstone(record, tombstone) > 0) nodes[id] = clone(record)
      else tombstones[id] = clone(tombstone)
    } else if (record) {
      nodes[id] = clone(record)
    } else if (tombstone) {
      tombstones[id] = clone(tombstone)
    }
  })

  return normaliseSyncDocument({
    schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
    app: CLOUD_SYNC_APP,
    workspaceId,
    generatedAt: new Date().toISOString(),
    nodes,
    tombstones,
  }, { workspaceId })
}

export function rebuildAccountTree(document) {
  const normalised = normaliseSyncDocument(document)
  const records = Object.fromEntries(
    Object.entries(normalised.nodes).map(([id, record]) => [id, clone(record)]),
  )
  const root = records.root
  root.parentId = null

  function validParent(record) {
    if (record.id === 'root') return null
    const parent = records[record.parentId]
    if (!parent || parent.type !== 'group' || parent.id === record.id) return 'root'
    const seen = new Set([record.id])
    let cursor = parent
    while (cursor && cursor.id !== 'root') {
      if (seen.has(cursor.id)) return 'root'
      seen.add(cursor.id)
      cursor = records[cursor.parentId]
      if (!cursor || cursor.type !== 'group') return 'root'
    }
    return parent.id
  }

  const repairedParents = {}
  Object.values(records).forEach((record) => {
    if (record.id !== 'root') repairedParents[record.id] = validParent(record)
  })
  Object.entries(repairedParents).forEach(([id, parentId]) => {
    records[id].parentId = parentId
  })

  const childrenByParent = new Map()
  Object.values(records).forEach((record) => {
    if (record.id === 'root') return
    const list = childrenByParent.get(record.parentId) ?? []
    list.push(record)
    childrenByParent.set(record.parentId, list)
  })
  childrenByParent.forEach((list) => {
    list.sort((left, right) => (
      left.position - right.position
      || left.updatedAt - right.updatedAt
      || compareText(left.id, right.id)
    ))
  })

  function build(record) {
    if (record.type === 'server') {
      return {
        id: record.id,
        type: 'server',
        parentId: record.parentId,
        ...normaliseServerData(record.data),
      }
    }
    return {
      id: record.id,
      type: 'group',
      name: record.id === 'root' ? '全部账号' : record.data.name,
      parentId: record.id === 'root' ? null : record.parentId,
      createdAt: finiteTimestamp(record.data.createdAt),
      children: (childrenByParent.get(record.id) ?? []).map(build),
    }
  }

  return build(root)
}

export function syncDocumentsEqual(left, right) {
  const clean = (document) => {
    const normalised = normaliseSyncDocument(document)
    delete normalised.generatedAt
    return normalised
  }
  return JSON.stringify(clean(left)) === JSON.stringify(clean(right))
}
