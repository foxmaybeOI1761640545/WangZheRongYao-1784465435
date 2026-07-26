import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CROP_TYPES,
  cropTypeToCode,
  cropTypeToLabel,
  nextCropType,
  normaliseCropType,
} from '../src/domain/cropTypes.js'
import {
  ACCOUNT_STORAGE_KEY,
  useAccountStore,
} from '../src/composables/useAccountStore.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
  }
}

function legacyRoot() {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    parentId: null,
    createdAt: 1,
    children: [
      {
        id: 'server-8',
        type: 'server',
        parentId: 'root',
        serverName: '8区',
        accountId: 'alpha',
        accountLevel: 10,
        battlePassLevel: 20,
        farmLevel: 30,
        cropType: '8',
        createdAt: 2,
      },
      {
        id: 'group-a',
        type: 'group',
        name: '子分组 A',
        parentId: 'root',
        createdAt: 3,
        children: [
          {
            id: 'server-16',
            type: 'server',
            parentId: 'group-a',
            serverName: '16区',
            accountId: 'beta',
            cropType: '16',
            createdAt: 4,
          },
          {
            id: 'server-missing',
            type: 'server',
            parentId: 'group-a',
            serverName: '未记录区',
            accountId: 'gamma',
            createdAt: 5,
          },
        ],
      },
      {
        id: 'server-32',
        type: 'server',
        parentId: 'root',
        serverName: '32区',
        accountId: 'delta',
        cropType: '32',
        createdAt: 6,
      },
    ],
  }
}

test('作物值、显示代码和循环顺序保持统一', () => {
  assert.deepEqual(CROP_TYPES, ['', '8', '16', '32'])
  assert.deepEqual(CROP_TYPES.map(cropTypeToCode), ['---', '8', '1', '3'])
  assert.deepEqual(CROP_TYPES.map(nextCropType), ['8', '16', '32', ''])
  assert.equal(cropTypeToLabel(''), '未记录')
  assert.equal(cropTypeToLabel('16'), '16 小时作物')
  assert.equal(normaliseCropType(32), '32')
  assert.equal(normaliseCropType('unexpected'), '')
})

test('旧数据保留 8/16/32，缺失作物值规范化为未记录', () => {
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(legacyRoot()),
  })
  const store = useAccountStore()

  assert.equal(store.getServer('server-8').cropType, '8')
  assert.equal(store.getServer('server-16').cropType, '16')
  assert.equal(store.getServer('server-32').cropType, '32')
  assert.equal(store.getServer('server-missing').cropType, '')
})

test('原子作物更新只修改目标字段并立即持久化', () => {
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(legacyRoot()),
  })
  const store = useAccountStore()
  const server = store.getServer('server-8')
  const original = JSON.parse(JSON.stringify(server))

  assert.equal(store.setServerCropType('server-8', ''), '')
  assert.equal(server.cropType, '')
  assert.equal(server.accountId, original.accountId)
  assert.equal(server.createdAt, original.createdAt)
  assert.equal(JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY)).children[0].cropType, '')

  assert.equal(store.cycleServerCropType('server-8'), '8')
  assert.equal(store.cycleServerCropType('server-8'), '16')
  assert.equal(store.setServerCropType('missing-id', '32'), null)
  assert.equal(store.cycleServerCropType('missing-id'), null)
})

test('新增账号默认未记录，递归列表保留分组和账号顺序', () => {
  globalThis.localStorage = createStorage({
    [ACCOUNT_STORAGE_KEY]: JSON.stringify(legacyRoot()),
  })
  const store = useAccountStore()
  const added = store.addServer('group-a', {
    serverName: '新账号',
    accountId: 'new',
  })

  assert.equal(added.cropType, '')
  assert.deepEqual(
    store.getServersInGroup('root').map(({ server, groupPath }) => ({
      id: server.id,
      path: groupPath.join('/'),
    })),
    [
      { id: 'server-8', path: '' },
      { id: 'server-32', path: '' },
      { id: 'server-16', path: '子分组 A' },
      { id: 'server-missing', path: '子分组 A' },
      { id: added.id, path: '子分组 A' },
    ],
  )
})
