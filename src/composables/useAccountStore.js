import { computed, reactive, toRaw, watch } from 'vue'
import {
  CROP_TYPES,
  nextCropType,
  normaliseCropType,
} from '../domain/cropTypes.js'
import { normaliseFarmSchedule } from '../domain/farmCalculator.js'
import {
  allocateFarmNotificationIds,
  buildFarmReminderPlans,
  cloneFarmReminders,
  collectUsedNotificationIds,
  FARM_REMINDER_SCHEMA_VERSION,
  FARM_REMINDER_TYPES,
  normaliseFarmReminders,
  repairFarmReminderIdsInTree,
} from '../domain/farmReminders.js'

export const ACCOUNT_STORAGE_KEY = 'wangzhe-account-manager:v1'

export const SYSTEM_OPTIONS = [
  { value: 'android', label: '安卓' },
  { value: 'ios', label: '苹果' },
]

export const PLATFORM_OPTIONS = [
  { value: 'qq', label: 'QQ' },
  { value: 'wechat', label: '微信' },
]

export const CROP_OPTIONS = CROP_TYPES

function createRoot() {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    parentId: null,
    createdAt: Date.now(),
    children: [],
  }
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toLevel(value) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function toText(value) {
  return String(value ?? '').trim()
}

function cloneFarmSchedule(value) {
  return value ? { ...value } : null
}

function cloneReminderCandidate(value) {
  if (!value || typeof value !== 'object') return null
  return {
    ...value,
    water: value.water && typeof value.water === 'object' ? { ...value.water } : value.water,
    harvest: value.harvest && typeof value.harvest === 'object' ? { ...value.harvest } : value.harvest,
  }
}

function normaliseSystem(value) {
  return SYSTEM_OPTIONS.some((item) => item.value === value) ? value : 'android'
}

function normalisePlatform(value) {
  return PLATFORM_OPTIONS.some((item) => item.value === value) ? value : 'qq'
}

function hydrateNode(rawNode, parentId = null) {
  if (!rawNode || typeof rawNode !== 'object') return null

  if (rawNode.type === 'server') {
    const cropType = normaliseCropType(rawNode.cropType)
    const farmSchedule = normaliseFarmSchedule(rawNode.farmSchedule, cropType)
    return {
      id: toText(rawNode.id) || createId('server'),
      type: 'server',
      parentId,
      serverName: toText(rawNode.serverName) || '未命名区服',
      system: normaliseSystem(rawNode.system),
      platform: normalisePlatform(rawNode.platform),
      accountId: toText(rawNode.accountId),
      accountLevel: toLevel(rawNode.accountLevel),
      battlePassLevel: toLevel(rawNode.battlePassLevel),
      farmLevel: toLevel(rawNode.farmLevel),
      cropType,
      farmSchedule,
      farmReminders: farmSchedule
        ? cloneReminderCandidate(rawNode.farmReminders)
        : null,
      epicSkins: toText(rawNode.epicSkins),
      createdAt: Number(rawNode.createdAt) || Date.now(),
    }
  }

  const id = parentId === null ? 'root' : (toText(rawNode.id) || createId('group'))
  const group = {
    id,
    type: 'group',
    name: parentId === null ? '全部账号' : (toText(rawNode.name) || '未命名分组'),
    parentId,
    createdAt: Number(rawNode.createdAt) || Date.now(),
    children: [],
  }

  if (Array.isArray(rawNode.children)) {
    group.children = rawNode.children
      .map((child) => hydrateNode(child, group.id))
      .filter(Boolean)
  }

  return group
}

function loadTree() {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (!raw) return createRoot()
    const parsed = JSON.parse(raw)
    return repairFarmReminderIdsInTree(hydrateNode(parsed) ?? createRoot())
  } catch {
    return createRoot()
  }
}

export function useAccountStore() {
  const state = reactive({ root: loadTree() })
  const mutationSubscribers = new Set()
  let mutationEventsSuppressed = 0
  let mutationSource = 'local'

  watch(
    () => state.root,
    (value) => {
      try {
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Storage failures do not block the current session.
      }
      if (mutationEventsSuppressed === 0) {
        const event = {
          source: mutationSource,
          root: exportRoot(),
        }
        mutationSubscribers.forEach((subscriber) => subscriber(event))
      }
    },
    { deep: true, flush: 'sync' },
  )

  function exportRoot() {
    const root = toRaw(state.root)
    if (typeof structuredClone === 'function') return structuredClone(root)
    return JSON.parse(JSON.stringify(root))
  }

  function withMutationEventsSuppressed(callback) {
    mutationEventsSuppressed += 1
    try {
      return callback()
    } finally {
      mutationEventsSuppressed -= 1
    }
  }

  function replaceRoot(rawRoot, { source = 'local-import' } = {}) {
    const hydrated = repairFarmReminderIdsInTree(
      hydrateNode(rawRoot) ?? createRoot(),
    )
    const previousSource = mutationSource
    mutationSource = source
    try {
      if (source === 'cloud' || source === 'cloud-history') {
        withMutationEventsSuppressed(() => {
          state.root = hydrated
        })
      } else {
        state.root = hydrated
      }
    } finally {
      mutationSource = previousSource
    }
    return exportRoot()
  }

  function subscribeToMutations(subscriber) {
    if (typeof subscriber !== 'function') return () => {}
    mutationSubscribers.add(subscriber)
    return () => mutationSubscribers.delete(subscriber)
  }

  function unsubscribeFromMutations(subscriber) {
    if (subscriber) return mutationSubscribers.delete(subscriber)
    mutationSubscribers.clear()
    return true
  }

  function findNode(id, node = state.root) {
    if (node.id === id) return node
    if (node.type !== 'group') return null

    for (const child of node.children) {
      const found = findNode(id, child)
      if (found) return found
    }
    return null
  }

  function findPath(id, node = state.root, path = []) {
    const nextPath = [...path, node]
    if (node.id === id) return nextPath
    if (node.type !== 'group') return null

    for (const child of node.children) {
      const found = findPath(id, child, nextPath)
      if (found) return found
    }
    return null
  }

  function getGroup(id) {
    const node = findNode(id)
    return node?.type === 'group' ? node : null
  }

  function getServer(id) {
    const node = findNode(id)
    return node?.type === 'server' ? node : null
  }

  function normaliseServerReminderCandidate(server, candidate) {
    const parsed = normaliseFarmReminders(candidate, server.farmSchedule)
    if (!parsed) return null
    const usedIds = collectUsedNotificationIds(state.root, {
      excludeServerId: server.id,
    })
    const notificationIds = allocateFarmNotificationIds({
      serverId: server.id,
      existing: {
        water: parsed.water.notificationId,
        harvest: parsed.harvest.notificationId,
      },
      usedIds,
    })
    return {
      ...parsed,
      water: {
        ...parsed.water,
        notificationId: notificationIds.water,
      },
      harvest: {
        ...parsed.harvest,
        notificationId: notificationIds.harvest,
      },
    }
  }

  function getParent(node) {
    return node?.parentId ? getGroup(node.parentId) : null
  }

  function addGroup(parentId, name) {
    const parent = getGroup(parentId)
    const cleanName = toText(name)
    if (!parent || !cleanName) return null

    const group = {
      id: createId('group'),
      type: 'group',
      name: cleanName,
      parentId: parent.id,
      createdAt: Date.now(),
      children: [],
    }
    parent.children.push(group)
    return group
  }

  function addServer(parentId, payload) {
    const parent = getGroup(parentId)
    const serverName = toText(payload.serverName)
    if (!parent || !serverName) return null

    const server = {
      id: createId('server'),
      type: 'server',
      parentId: parent.id,
      serverName,
      system: normaliseSystem(payload.system),
      platform: normalisePlatform(payload.platform),
      accountId: toText(payload.accountId),
      accountLevel: toLevel(payload.accountLevel),
      battlePassLevel: toLevel(payload.battlePassLevel),
      farmLevel: toLevel(payload.farmLevel),
      cropType: normaliseCropType(payload.cropType),
      farmSchedule: null,
      farmReminders: null,
      epicSkins: toText(payload.epicSkins),
      createdAt: Date.now(),
    }
    parent.children.push(server)
    return server
  }

  function renameGroup(id, name) {
    const group = getGroup(id)
    const cleanName = toText(name)
    if (!group || group.id === 'root' || !cleanName) return false
    group.name = cleanName
    return true
  }

  function updateServer(id, payload) {
    const server = getServer(id)
    if (!server) return false

    server.serverName = toText(payload.serverName) || server.serverName
    server.system = normaliseSystem(payload.system)
    server.platform = normalisePlatform(payload.platform)
    server.accountId = toText(payload.accountId)
    server.accountLevel = toLevel(payload.accountLevel)
    server.battlePassLevel = toLevel(payload.battlePassLevel)
    server.farmLevel = toLevel(payload.farmLevel)
    const nextCrop = normaliseCropType(payload.cropType)
    if (nextCrop !== server.cropType) {
      server.cropType = nextCrop
      server.farmSchedule = null
      server.farmReminders = null
    }
    server.epicSkins = toText(payload.epicSkins)
    return true
  }

  function setServerCropType(id, cropType) {
    const server = getServer(id)
    if (!server) return null
    const nextCrop = normaliseCropType(cropType)
    if (nextCrop !== server.cropType) {
      server.cropType = nextCrop
      server.farmSchedule = null
      server.farmReminders = null
    }
    return server.cropType
  }

  function cycleServerCropType(id) {
    const server = getServer(id)
    if (!server) return null
    return setServerCropType(id, nextCropType(server.cropType))
  }

  function setServersCropType(serverIds, cropType) {
    const uniqueIds = [...new Set(
      Array.isArray(serverIds)
        ? serverIds.map((id) => toText(id)).filter(Boolean)
        : [],
    )]
    const nextCrop = normaliseCropType(cropType)
    const changes = []

    uniqueIds.forEach((serverId) => {
      const server = getServer(serverId)
      if (!server || server.cropType === nextCrop) return
      changes.push({
        serverId,
        previousCropType: server.cropType,
        nextCropType: nextCrop,
        previousFarmSchedule: cloneFarmSchedule(server.farmSchedule),
        previousFarmReminders: cloneFarmReminders(server.farmReminders),
      })
      server.cropType = nextCrop
      server.farmSchedule = null
      server.farmReminders = null
    })

    return {
      requestedCount: uniqueIds.length,
      updatedCount: changes.length,
      skippedCount: uniqueIds.length - changes.length,
      cropType: nextCrop,
      changes,
    }
  }

  function restoreServersCropState(changes) {
    if (!Array.isArray(changes)) return { restoredCount: 0, skippedCount: 0 }
    const uniqueChanges = new Map()
    changes.forEach((change) => {
      const serverId = toText(change?.serverId)
      if (serverId && !uniqueChanges.has(serverId)) uniqueChanges.set(serverId, change)
    })

    let restoredCount = 0
    uniqueChanges.forEach((change, serverId) => {
      const server = getServer(serverId)
      if (!server) return
      const previousCropType = normaliseCropType(change.previousCropType)
      server.cropType = previousCropType
      server.farmSchedule = normaliseFarmSchedule(
        change.previousFarmSchedule,
        previousCropType,
      )
      server.farmReminders = normaliseServerReminderCandidate(
        server,
        change.previousFarmReminders,
      )
      restoredCount += 1
    })

    return {
      restoredCount,
      skippedCount: uniqueChanges.size - restoredCount,
    }
  }

  function setServerFarmSchedule(id, schedule) {
    const server = getServer(id)
    if (!server || !server.cropType) return null
    const normalised = normaliseFarmSchedule(schedule, server.cropType)
    if (!normalised) return null
    server.farmSchedule = normalised
    server.farmReminders = normaliseServerReminderCandidate(
      server,
      server.farmReminders,
    )
    return cloneFarmSchedule(normalised)
  }

  function clearServerFarmSchedule(id) {
    const server = getServer(id)
    if (!server) return false
    server.farmSchedule = null
    server.farmReminders = null
    return true
  }

  function startNextFarmCycle(id) {
    const server = getServer(id)
    if (!server) {
      return { success: false, serverId: toText(id), reason: 'server-not-found' }
    }
    if (!normaliseCropType(server.cropType)) {
      return { success: false, serverId: server.id, reason: 'crop-unrecorded' }
    }

    const previousFarmSchedule = cloneFarmSchedule(server.farmSchedule)
    const previousFarmReminders = cloneFarmReminders(server.farmReminders)
    const notificationIds = previousFarmReminders
      ? FARM_REMINDER_TYPES
        .map((type) => Number(previousFarmReminders[type]?.notificationId))
        .filter((notificationId) => Number.isInteger(notificationId))
      : []

    server.farmSchedule = null
    server.farmReminders = null
    return {
      success: true,
      serverId: server.id,
      cropType: server.cropType,
      previousFarmSchedule,
      previousFarmReminders,
      notificationIds,
    }
  }

  function setServerFarmReminderPreferences(id, {
    waterEnabled,
    harvestEnabled,
  }) {
    const server = getServer(id)
    const schedule = normaliseFarmSchedule(server?.farmSchedule, server?.cropType)
    if (!server || !schedule) return null

    const water = Boolean(waterEnabled)
    const harvest = Boolean(harvestEnabled)
    const previousFarmReminders = cloneFarmReminders(server.farmReminders)
    if (!water && !harvest) {
      server.farmReminders = null
      return {
        serverId: server.id,
        previousFarmReminders,
        farmReminders: null,
        notificationIds: previousFarmReminders
          ? FARM_REMINDER_TYPES.map((type) => previousFarmReminders[type].notificationId)
          : [],
      }
    }

    const usedIds = collectUsedNotificationIds(state.root, {
      excludeServerId: server.id,
    })
    const notificationIds = allocateFarmNotificationIds({
      serverId: server.id,
      existing: {
        water: server.farmReminders?.water?.notificationId,
        harvest: server.farmReminders?.harvest?.notificationId,
      },
      usedIds,
    })
    const next = {
      schemaVersion: FARM_REMINDER_SCHEMA_VERSION,
      water: {
        enabled: water,
        notificationId: notificationIds.water,
      },
      harvest: {
        enabled: harvest,
        notificationId: notificationIds.harvest,
      },
      updatedAt: Date.now(),
    }
    server.farmReminders = normaliseFarmReminders(next, schedule)
    return {
      serverId: server.id,
      previousFarmReminders,
      farmReminders: cloneFarmReminders(server.farmReminders),
      notificationIds: [notificationIds.water, notificationIds.harvest],
    }
  }

  function clearServerFarmReminders(id) {
    const server = getServer(id)
    if (!server) return null
    const previousFarmReminders = cloneFarmReminders(server.farmReminders)
    server.farmReminders = null
    return {
      serverId: server.id,
      previousFarmReminders,
      notificationIds: previousFarmReminders
        ? FARM_REMINDER_TYPES.map((type) => previousFarmReminders[type].notificationId)
        : [],
    }
  }

  function getAllServersWithReminders() {
    return getServersInGroup('root')
      .map(({ server }) => server)
      .filter((server) => normaliseFarmReminders(
        server.farmReminders,
        server.farmSchedule,
      ))
  }

  function getFarmReminderPlans(now = Date.now()) {
    return getAllServersWithReminders()
      .flatMap((server) => buildFarmReminderPlans(server, now))
  }

  function getServersInGroup(groupId) {
    const group = getGroup(groupId)
    if (!group) return []

    const result = []

    function walk(currentGroup, groupPath) {
      const directServers = currentGroup.children.filter((item) => item.type === 'server')
      directServers.forEach((server) => {
        result.push({
          server,
          groupPath: [...groupPath],
        })
      })

      const childGroups = currentGroup.children.filter((item) => item.type === 'group')
      childGroups.forEach((childGroup) => {
        walk(childGroup, [...groupPath, childGroup.name])
      })
    }

    walk(group, [])
    return result
  }

  function collectDeletedReminderState(node) {
    const serverIds = []
    const notificationIds = []

    function walk(current) {
      if (current.type === 'server') {
        serverIds.push(current.id)
        const reminders = normaliseFarmReminders(
          current.farmReminders,
          current.farmSchedule,
        )
        if (reminders) {
          FARM_REMINDER_TYPES.forEach((type) => {
            notificationIds.push(reminders[type].notificationId)
          })
        }
        return
      }
      if (current.type === 'group') current.children.forEach(walk)
    }

    walk(node)
    return { serverIds, notificationIds }
  }

  function deleteNode(id) {
    const node = findNode(id)
    if (!node || node.id === 'root') return false
    const parent = getParent(node)
    if (!parent) return false

    const index = parent.children.findIndex((child) => child.id === id)
    if (index < 0) return false
    const reminderState = collectDeletedReminderState(node)
    parent.children.splice(index, 1)
    return {
      deleted: true,
      nodeId: id,
      ...reminderState,
    }
  }

  function moveChild(parentId, childId, direction) {
    const parent = getGroup(parentId)
    if (!parent) return false

    const child = parent.children.find((item) => item.id === childId)
    if (!child) return false

    const sameType = parent.children.filter((item) => item.type === child.type)
    const currentTypeIndex = sameType.findIndex((item) => item.id === childId)
    const nextTypeIndex = currentTypeIndex + direction
    if (nextTypeIndex < 0 || nextTypeIndex >= sameType.length) return false

    const currentIndex = parent.children.findIndex((item) => item.id === childId)
    const targetId = sameType[nextTypeIndex].id
    const targetIndex = parent.children.findIndex((item) => item.id === targetId)
    ;[parent.children[currentIndex], parent.children[targetIndex]] = [
      parent.children[targetIndex],
      parent.children[currentIndex],
    ]
    return true
  }

  function canMove(parentId, childId, direction) {
    const parent = getGroup(parentId)
    const child = parent?.children.find((item) => item.id === childId)
    if (!parent || !child) return false
    const sameType = parent.children.filter((item) => item.type === child.type)
    const index = sameType.findIndex((item) => item.id === childId)
    return index + direction >= 0 && index + direction < sameType.length
  }

  function breadcrumbs(id) {
    return findPath(id) ?? [state.root]
  }

  const stats = computed(() => {
    let groups = 0
    let servers = 0

    function walk(node) {
      if (node.type === 'group') {
        if (node.id !== 'root') groups += 1
        node.children.forEach(walk)
      } else {
        servers += 1
      }
    }

    walk(state.root)
    return { groups, servers }
  })

  return {
    root: computed(() => state.root),
    stats,
    exportRoot,
    replaceRoot,
    subscribeToMutations,
    unsubscribeFromMutations,
    withMutationEventsSuppressed,
    findNode,
    getGroup,
    getServer,
    getParent,
    breadcrumbs,
    addGroup,
    addServer,
    renameGroup,
    updateServer,
    setServerCropType,
    cycleServerCropType,
    setServersCropType,
    restoreServersCropState,
    setServerFarmSchedule,
    clearServerFarmSchedule,
    startNextFarmCycle,
    setServerFarmReminderPreferences,
    clearServerFarmReminders,
    getFarmReminderPlans,
    getAllServersWithReminders,
    getServersInGroup,
    deleteNode,
    moveChild,
    canMove,
  }
}
