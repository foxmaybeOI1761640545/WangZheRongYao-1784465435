import { computed, reactive, watch } from 'vue'

const STORAGE_KEY = 'wangzhe-account-manager:v1'

export const SYSTEM_OPTIONS = [
  { value: 'android', label: '安卓' },
  { value: 'ios', label: '苹果' },
]

export const PLATFORM_OPTIONS = [
  { value: 'qq', label: 'QQ' },
  { value: 'wechat', label: '微信' },
]

export const CROP_OPTIONS = ['8', '16', '32']

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

function normaliseSystem(value) {
  return SYSTEM_OPTIONS.some((item) => item.value === value) ? value : 'android'
}

function normalisePlatform(value) {
  return PLATFORM_OPTIONS.some((item) => item.value === value) ? value : 'qq'
}

function normaliseCrop(value) {
  const text = String(value ?? '')
  return CROP_OPTIONS.includes(text) ? text : '8'
}

function hydrateNode(rawNode, parentId = null) {
  if (!rawNode || typeof rawNode !== 'object') return null

  if (rawNode.type === 'server') {
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
      cropType: normaliseCrop(rawNode.cropType),
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
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createRoot()
    const parsed = JSON.parse(raw)
    return hydrateNode(parsed) ?? createRoot()
  } catch {
    return createRoot()
  }
}

export function useAccountStore() {
  const state = reactive({ root: loadTree() })

  watch(
    () => state.root,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Storage failures do not block the current session.
      }
    },
    { deep: true },
  )

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
      cropType: normaliseCrop(payload.cropType),
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
    server.cropType = normaliseCrop(payload.cropType)
    server.epicSkins = toText(payload.epicSkins)
    return true
  }

  function deleteNode(id) {
    const node = findNode(id)
    if (!node || node.id === 'root') return false
    const parent = getParent(node)
    if (!parent) return false

    const index = parent.children.findIndex((child) => child.id === id)
    if (index < 0) return false
    parent.children.splice(index, 1)
    return true
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
    findNode,
    getGroup,
    getServer,
    getParent,
    breadcrumbs,
    addGroup,
    addServer,
    renameGroup,
    updateServer,
    deleteNode,
    moveChild,
    canMove,
  }
}
