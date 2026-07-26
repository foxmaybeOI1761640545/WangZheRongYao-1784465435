import { normaliseCropType } from './cropTypes.js'
import { normaliseFarmSchedule } from './farmCalculator.js'

export const FARM_REMINDER_SCHEMA_VERSION = 1
export const FARM_NOTIFICATION_ID_MAX = 2_147_483_647
export const FARM_REMINDER_TYPES = Object.freeze(['water', 'harvest'])

export const FARM_REMINDER_CHANNELS = Object.freeze({
  water: Object.freeze({
    id: 'farm-water-reminders-v1',
    name: '农场浇水提醒',
    description: '提醒当前账号需要浇水',
  }),
  harvest: Object.freeze({
    id: 'farm-harvest-reminders-v1',
    name: '农场收获提醒',
    description: '提醒当前账号达到理论最快成熟时间',
  }),
})

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isValidFarmNotificationId(value) {
  return Number.isInteger(value) && value >= 1 && value <= FARM_NOTIFICATION_ID_MAX
}

function parseFarmReminders(value, farmSchedule, { allowDuplicateIds = false } = {}) {
  if (!isRecord(value) || value.schemaVersion !== FARM_REMINDER_SCHEMA_VERSION) return null
  const cropType = normaliseCropType(farmSchedule?.cropType)
  const schedule = normaliseFarmSchedule(farmSchedule, cropType)
  if (!schedule) return null

  const updatedAt = Number(value.updatedAt)
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null

  const entries = {}
  for (const reminderType of FARM_REMINDER_TYPES) {
    const entry = value[reminderType]
    if (!isRecord(entry) || typeof entry.enabled !== 'boolean') return null
    const notificationId = Number(entry.notificationId)
    if (!isValidFarmNotificationId(notificationId)) return null
    entries[reminderType] = {
      enabled: entry.enabled,
      notificationId,
    }
  }

  if (
    !allowDuplicateIds
    && entries.water.notificationId === entries.harvest.notificationId
  ) return null

  return {
    schemaVersion: FARM_REMINDER_SCHEMA_VERSION,
    water: entries.water,
    harvest: entries.harvest,
    updatedAt,
  }
}

export function normaliseFarmReminders(value, farmSchedule) {
  return parseFarmReminders(value, farmSchedule)
}

export function farmReminderKey(serverId, reminderType) {
  const cleanServerId = String(serverId ?? '').trim()
  if (!cleanServerId || !FARM_REMINDER_TYPES.includes(reminderType)) return ''
  return `${cleanServerId}:${reminderType}`
}

function notificationIdSeed(key) {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % FARM_NOTIFICATION_ID_MAX + 1
}

function nextAvailableNotificationId(key, usedIds) {
  let candidate = notificationIdSeed(key)
  for (let attempts = 0; attempts < FARM_NOTIFICATION_ID_MAX; attempts += 1) {
    if (!usedIds.has(candidate)) return candidate
    candidate = candidate === FARM_NOTIFICATION_ID_MAX ? 1 : candidate + 1
  }
  throw new Error('没有可用的 Android 农场通知 ID。')
}

export function allocateFarmNotificationIds({
  serverId,
  existing = {},
  usedIds = new Set(),
}) {
  const occupied = new Set(usedIds)
  const allocated = {}

  for (const reminderType of FARM_REMINDER_TYPES) {
    const current = Number(existing?.[reminderType])
    const notificationId = isValidFarmNotificationId(current) && !occupied.has(current)
      ? current
      : nextAvailableNotificationId(farmReminderKey(serverId, reminderType), occupied)
    allocated[reminderType] = notificationId
    occupied.add(notificationId)
  }

  return allocated
}

function walkServers(node, visitor) {
  if (!isRecord(node)) return
  if (node.type === 'server') {
    visitor(node)
    return
  }
  if (node.type !== 'group' || !Array.isArray(node.children)) return
  node.children.forEach((child) => walkServers(child, visitor))
}

export function collectUsedNotificationIds(root, { excludeServerId = '' } = {}) {
  const usedIds = new Set()
  walkServers(root, (server) => {
    if (server.id === excludeServerId) return
    const reminders = parseFarmReminders(
      server.farmReminders,
      server.farmSchedule,
      { allowDuplicateIds: true },
    )
    if (!reminders) return
    FARM_REMINDER_TYPES.forEach((reminderType) => {
      const notificationId = reminders[reminderType].notificationId
      if (isValidFarmNotificationId(notificationId)) usedIds.add(notificationId)
    })
  })
  return usedIds
}

export function repairFarmReminderIdsInTree(root) {
  const usedIds = new Set()
  walkServers(root, (server) => {
    const reminders = parseFarmReminders(
      server.farmReminders,
      server.farmSchedule,
      { allowDuplicateIds: true },
    )
    if (!reminders) {
      server.farmReminders = null
      return
    }

    const notificationIds = allocateFarmNotificationIds({
      serverId: server.id,
      existing: {
        water: reminders.water.notificationId,
        harvest: reminders.harvest.notificationId,
      },
      usedIds,
    })
    reminders.water.notificationId = notificationIds.water
    reminders.harvest.notificationId = notificationIds.harvest
    server.farmReminders = reminders
    usedIds.add(notificationIds.water)
    usedIds.add(notificationIds.harvest)
  })
  return root
}

export function farmReminderTitle(reminderType) {
  if (reminderType === 'water') return '农场浇水提醒'
  if (reminderType === 'harvest') return '农场收获提醒'
  return ''
}

export function farmReminderBody(server, reminderType) {
  const serverName = String(server?.serverName ?? '').trim() || '未命名区服'
  const accountId = String(server?.accountId ?? '').trim() || '未填写 ID'
  if (reminderType === 'water') return `${serverName} · ${accountId} 现在需要浇水`
  if (reminderType === 'harvest') return `${serverName} · ${accountId} 已到理论最快成熟时间`
  return ''
}

export function farmReminderTargetAt(server, reminderType) {
  if (reminderType === 'water') return Number(server?.farmSchedule?.nextWaterAt)
  if (reminderType === 'harvest') return Number(server?.farmSchedule?.fastestMatureAt)
  return Number.NaN
}

export function buildFarmReminderPlans(server, now = Date.now(), { includePast = false } = {}) {
  const cropType = normaliseCropType(server?.cropType)
  const schedule = normaliseFarmSchedule(server?.farmSchedule, cropType)
  const reminders = normaliseFarmReminders(server?.farmReminders, schedule)
  const nowMs = Number(now)
  if (!server?.id || !cropType || !schedule || !reminders || !Number.isFinite(nowMs)) return []

  return FARM_REMINDER_TYPES.flatMap((reminderType) => {
    const preference = reminders[reminderType]
    const targetAt = farmReminderTargetAt(server, reminderType)
    if (
      !preference.enabled
      || !Number.isFinite(targetAt)
      || (!includePast && targetAt <= nowMs)
    ) return []
    return [{
      serverId: server.id,
      reminderType,
      key: farmReminderKey(server.id, reminderType),
      notificationId: preference.notificationId,
      targetAt,
      title: farmReminderTitle(reminderType),
      body: farmReminderBody(server, reminderType),
      channelId: FARM_REMINDER_CHANNELS[reminderType].id,
      extra: {
        schemaVersion: 1,
        source: 'farm-reminder',
        serverId: server.id,
        reminderType,
        targetAt,
      },
    }]
  })
}

export function formatFarmCountdown(targetAt, now = Date.now(), reachedText = '已到时间') {
  const target = Number(targetAt)
  const nowMs = Number(now)
  if (!Number.isFinite(target) || !Number.isFinite(nowMs)) return '--'
  const remainingMs = target - nowMs
  if (remainingMs <= 0) return reachedText

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  return [
    days ? `${days}天` : '',
    hours ? `${hours}小时` : '',
    minutes ? `${minutes}分` : '',
  ].join('')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function fullLocalTime(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return '--'
  return [
    date.getFullYear(),
    '-',
    pad2(date.getMonth() + 1),
    '-',
    pad2(date.getDate()),
    ' ',
    pad2(date.getHours()),
    ':',
    pad2(date.getMinutes()),
  ].join('')
}

export function formatFarmReminderCopyText(server, reminderTypes = FARM_REMINDER_TYPES) {
  const cropType = normaliseCropType(server?.cropType)
  const schedule = normaliseFarmSchedule(server?.farmSchedule, cropType)
  if (!schedule) return ''
  const lines = [
    `${String(server?.serverName ?? '').trim() || '未命名区服'} · ${String(server?.accountId ?? '').trim() || '未填写 ID'}`,
  ]
  if (reminderTypes.includes('water')) {
    lines.push(`浇水：${fullLocalTime(schedule.nextWaterAt)}`)
  }
  if (reminderTypes.includes('harvest')) {
    lines.push(`理论最快成熟：${fullLocalTime(schedule.fastestMatureAt)}`)
  }
  return lines.join('\n')
}

export function cloneFarmReminders(value) {
  if (!value) return null
  return {
    schemaVersion: value.schemaVersion,
    water: { ...value.water },
    harvest: { ...value.harvest },
    updatedAt: value.updatedAt,
  }
}
