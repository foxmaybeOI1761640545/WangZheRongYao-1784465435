import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareRecordVersions,
  createInitialSyncDocument,
  createTombstonesForDeletedSubtree,
  diffLocalDocument,
  flattenAccountTree,
  mergeSyncDocuments,
  normaliseSyncDocument,
  rebuildAccountTree,
  validateSyncDocument,
} from '../src/domain/cloudSyncDocument.js'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'

const NOW = 1_800_000_000_000
const WORKSPACE = 'd56cc0d5-623c-40f0-8f66-12e56688bc54'

function rootFixture() {
  const schedule = calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 200,
    waterLeftMinutes: 20,
    now: NOW,
  })
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    parentId: null,
    createdAt: 1,
    children: [
      {
        id: 'group-a',
        type: 'group',
        name: 'A 组',
        parentId: 'root',
        createdAt: 2,
        children: [{
          id: 'server-a',
          type: 'server',
          parentId: 'group-a',
          serverName: '131区',
          system: 'android',
          platform: 'qq',
          accountId: 'alpha',
          accountLevel: 80,
          battlePassLevel: 40,
          farmLevel: 20,
          cropType: '8',
          farmSchedule: schedule,
          farmReminders: {
            schemaVersion: 1,
            water: { enabled: true, notificationId: 101 },
            harvest: { enabled: true, notificationId: 102 },
            updatedAt: NOW,
          },
          epicSkins: '皮肤',
          createdAt: 3,
          runtimePermission: 'granted',
        }],
      },
      {
        id: 'server-b',
        type: 'server',
        parentId: 'root',
        serverName: '132区',
        cropType: '',
        createdAt: 4,
      },
    ],
  }
}

function document(root = rootFixture(), deviceId = 'device-a', timestamp = NOW) {
  return createInitialSyncDocument(root, {
    workspaceId: WORKSPACE,
    deviceId,
    timestamp,
  })
}

test('账号树扁平化和重建保留嵌套顺序、提醒 ID 与稳定业务字段', () => {
  const source = rootFixture()
  const nodes = flattenAccountTree(source, {
    deviceId: 'device-a',
    timestamp: NOW,
  })
  const rebuilt = rebuildAccountTree(document(source))

  assert.deepEqual(Object.keys(nodes), ['root', 'group-a', 'server-a', 'server-b'])
  assert.equal(nodes['server-a'].position, 0)
  assert.deepEqual(
    rebuilt.children.map((entry) => entry.id),
    ['group-a', 'server-b'],
  )
  assert.equal(rebuilt.children[0].children[0].serverName, '131区')
  assert.equal(rebuilt.children[0].children[0].accountId, 'alpha')
  assert.equal('runtimePermission' in rebuilt.children[0].children[0], false)
  assert.equal(rebuilt.children[1].farmSchedule, null)
  assert.equal(rebuilt.children[0].children[0].farmReminders.water.notificationId, 101)
  assert.equal(JSON.stringify(nodes).includes('runtimePermission'), false)
})

test('同步文档校验固定应用、版本和 Workspace', () => {
  const valid = document()
  assert.deepEqual(validateSyncDocument(valid, { workspaceId: WORKSPACE }), {
    valid: true,
    errors: [],
  })
  assert.equal(validateSyncDocument({ ...valid, app: 'other' }).valid, false)
  assert.equal(validateSyncDocument(valid, { workspaceId: 'other' }).valid, false)
})

test('生产 bootstrap 快照可规范化为当前协议', () => {
  const normalised = normaliseSyncDocument({
    schemaVersion: 1,
    workspaceId: WORKSPACE,
    generatedAt: '1970-01-01T00:00:00.000Z',
    nodes: {
      root: {
        id: 'root',
        type: 'group',
        parentId: null,
        sortKey: 0,
        updatedAt: 0,
        updatedBy: 'supabase-bootstrap',
        data: { name: '全部账号', createdAt: 0 },
      },
    },
    tombstones: {},
  }, { workspaceId: WORKSPACE })

  assert.equal(normalised.app, 'wangzhe-account-manager-cloud-sync')
  assert.equal(normalised.nodes.root.position, 0)
  assert.equal(validateSyncDocument(normalised, { workspaceId: WORKSPACE }).valid, true)
})

test('同节点按 updatedAt、再按 updatedBy 确定性决胜', () => {
  const base = document()
  const left = structuredClone(base.nodes['server-a'])
  const right = structuredClone(left)
  right.updatedAt += 1
  assert.equal(compareRecordVersions(right, left) > 0, true)
  left.updatedAt = right.updatedAt
  left.updatedBy = 'device-a'
  right.updatedBy = 'device-z'
  assert.equal(compareRecordVersions(right, left) > 0, true)
})

test('不同节点并行修改合并保留双方且不修改输入', () => {
  const left = document()
  const right = structuredClone(left)
  const leftBefore = structuredClone(left)
  const rightBefore = structuredClone(right)
  left.nodes['server-a'].data.accountId = 'left'
  left.nodes['server-a'].updatedAt = NOW + 1
  right.nodes['server-b'].data.serverName = 'right'
  right.nodes['server-b'].updatedAt = NOW + 2

  const merged = mergeSyncDocuments(left, right, { workspaceId: WORKSPACE })
  assert.equal(merged.nodes['server-a'].data.accountId, 'left')
  assert.equal(merged.nodes['server-b'].data.serverName, 'right')
  assert.deepEqual(leftBefore.nodes.root, left.nodes.root)
  assert.deepEqual(rightBefore.nodes.root, right.nodes.root)
})

test('删除墓碑阻止旧节点复活，较新记录可以明确恢复', () => {
  const base = document()
  const deleted = createTombstonesForDeletedSubtree(base, 'server-a', {
    deletedAt: NOW + 10,
    deletedBy: 'device-b',
  })
  const mergedOld = mergeSyncDocuments(base, deleted)
  assert.equal(mergedOld.nodes['server-a'], undefined)
  assert.equal(mergedOld.tombstones['server-a'].deletedAt, NOW + 10)

  const restored = structuredClone(base)
  restored.nodes['server-a'].updatedAt = NOW + 11
  restored.nodes['server-a'].updatedBy = 'device-c'
  const mergedNew = mergeSyncDocuments(deleted, restored)
  assert.equal(mergedNew.nodes['server-a'].id, 'server-a')
  assert.equal(mergedNew.tombstones['server-a'], undefined)
})

test('删除分组为分组和全部后代生成墓碑', () => {
  const deleted = createTombstonesForDeletedSubtree(document(), 'group-a', {
    deletedAt: NOW + 1,
    deletedBy: 'device-a',
  })
  assert.deepEqual(Object.keys(deleted.tombstones).sort(), ['group-a', 'server-a'])
  assert.equal(deleted.nodes['group-a'], undefined)
  assert.equal(deleted.nodes['server-a'], undefined)
})

test('非法父节点、非分组父节点和 parent 环都安全移动到 root', () => {
  const value = document()
  value.nodes['group-a'].parentId = 'server-a'
  value.nodes['server-a'].parentId = 'missing'
  value.nodes['server-b'].parentId = 'server-b'
  const rebuilt = rebuildAccountTree(value)
  const ids = rebuilt.children.map((entry) => entry.id).sort()
  assert.deepEqual(ids, ['group-a', 'server-a', 'server-b'])

  value.nodes['group-a'].parentId = 'group-b'
  value.nodes['group-b'] = {
    ...value.nodes['group-a'],
    id: 'group-b',
    parentId: 'group-a',
    data: { name: 'B 组', createdAt: 5 },
  }
  const cycleRebuilt = rebuildAccountTree(value)
  assert.equal(cycleRebuilt.children.some((entry) => entry.id === 'group-a'), true)
  assert.equal(cycleRebuilt.children.some((entry) => entry.id === 'group-b'), true)
})

test('相同 position 按 updatedAt 和 id 稳定排序', () => {
  const value = document()
  value.nodes['group-a'].parentId = 'root'
  value.nodes['group-a'].position = 0
  value.nodes['server-b'].position = 0
  value.nodes['group-a'].updatedAt = NOW + 2
  value.nodes['server-b'].updatedAt = NOW + 1
  assert.deepEqual(
    rebuildAccountTree(value).children.map((entry) => entry.id),
    ['server-b', 'group-a'],
  )
})

test('本地 diff 只更新时间真正变化的节点并为删除建立墓碑', () => {
  const base = document()
  const root = rebuildAccountTree(base)
  root.children[0].children[0].accountId = 'changed'
  root.children.splice(1, 1)
  let timestamp = NOW + 10
  const next = diffLocalDocument(base, root, {
    workspaceId: WORKSPACE,
    deviceId: 'device-b',
    nextTimestamp: () => timestamp++,
  })
  assert.equal(next.nodes['server-a'].data.accountId, 'changed')
  assert.equal(next.nodes['server-a'].updatedBy, 'device-b')
  assert.equal(next.nodes['group-a'].updatedAt, base.nodes['group-a'].updatedAt)
  assert.equal(next.nodes['server-b'], undefined)
  assert.equal(next.tombstones['server-b'].deletedBy, 'device-b')
})
