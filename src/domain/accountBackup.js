import { normaliseCropType } from './cropTypes.js'
import { normaliseFarmSchedule } from './farmCalculator.js'
import { repairFarmReminderIdsInTree } from './farmReminders.js'

export const SNAPSHOT_APP = 'wangzhe-account-manager'
export const SNAPSHOT_SCHEMA_VERSION = 3
export const SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS = Object.freeze([1, 2, 3])

function cloneReminderCandidate(value) {
  if (!value || typeof value !== 'object') return null
  return {
    ...value,
    water: value.water && typeof value.water === 'object' ? { ...value.water } : value.water,
    harvest: value.harvest && typeof value.harvest === 'object' ? { ...value.harvest } : value.harvest,
  }
}

function stableNodeFields(node) {
  const {
    pat,
    token,
    githubToken,
    notificationPermission,
    exactPermission,
    pendingNotifications,
    deliveredNotifications,
    platformError,
    ...stable
  } = node
  return stable
}

function cloneBackupNode(node, schemaVersion) {
  if (!node || typeof node !== 'object') return null

  if (node.type === 'server') {
    const cropType = normaliseCropType(node.cropType)
    const farmSchedule = schemaVersion >= 2
      ? normaliseFarmSchedule(node.farmSchedule, cropType)
      : null
    return {
      ...stableNodeFields(node),
      cropType,
      farmSchedule,
      farmReminders: schemaVersion >= 3 && farmSchedule
        ? cloneReminderCandidate(node.farmReminders)
        : null,
    }
  }

  if (node.type !== 'group' || !Array.isArray(node.children)) return null
  return {
    ...stableNodeFields(node),
    children: node.children
      .map((child) => cloneBackupNode(child, schemaVersion))
      .filter(Boolean),
  }
}

export function normaliseBackupRoot(root, schemaVersion = SNAPSHOT_SCHEMA_VERSION) {
  const normalised = cloneBackupNode(root, schemaVersion)
  if (!normalised || normalised.type !== 'group') {
    throw new Error('备份文件缺少有效的根分组数据。')
  }
  return repairFarmReminderIdsInTree(normalised)
}

export function createBackupSnapshot({
  root,
  stats,
  exportedAt = new Date(),
}) {
  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt)
  if (!Number.isFinite(date.getTime())) throw new Error('导出时间无效。')
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    app: SNAPSHOT_APP,
    exportedAt: date.toISOString(),
    stats: {
      groups: Number(stats?.groups) || 0,
      servers: Number(stats?.servers) || 0,
    },
    data: normaliseBackupRoot(root, SNAPSHOT_SCHEMA_VERSION),
  }
}

export function extractSnapshotRoot(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('备份文件不是有效的 JSON 对象。')
  }

  const schemaVersion = 'schemaVersion' in payload ? Number(payload.schemaVersion) : 1
  if (!SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new Error(`不支持的备份版本：${payload.schemaVersion}。`)
  }
  if ('app' in payload && payload.app !== SNAPSHOT_APP) {
    throw new Error('该文件不是王者多账号管理器备份。')
  }

  const root = payload.data ?? payload.root ?? payload
  return normaliseBackupRoot(root, schemaVersion)
}
