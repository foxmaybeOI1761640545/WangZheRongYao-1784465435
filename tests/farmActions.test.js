import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'
import {
  ACCOUNT_STORAGE_KEY,
  useAccountStore,
} from '../src/composables/useAccountStore.js'
import {
  analyseFarmActionRecords,
  classifyFarmAction,
  FARM_ACTION_STATUS,
  farmActionAriaLabel,
  farmActionPrimaryCommand,
  HARVEST_SOON_WINDOW_MS,
  sortFarmActionRecords,
  summariseFarmActions,
  WATER_ATTENTION_WINDOW_MS,
} from '../src/domain/farmActions.js'

const NOW = 1_800_000_000_000

function schedule(cropType = '8', {
  waterAt = NOW + 3 * 60 * 60_000,
  harvestAt = NOW + 4 * 60 * 60_000,
} = {}) {
  return {
    ...calculateFarmSchedule({
      cropType,
      matureLeftMinutes: cropType === '32' ? 1_000 : 300,
      waterLeftMinutes: 20,
      now: NOW,
    }),
    nextWaterAt: waterAt,
    fastestMatureAt: harvestAt,
  }
}

function server(id, {
  cropType = '8',
  farmSchedule = schedule(cropType),
} = {}) {
  return {
    id,
    type: 'server',
    serverName: `${id}区`,
    accountId: id,
    cropType,
    farmSchedule,
  }
}

test('未记录作物优先忽略历史异常 schedule', () => {
  const result = classifyFarmAction(server('unrecorded', {
    cropType: '',
    farmSchedule: schedule('8', { harvestAt: NOW - 1 }),
  }), NOW)
  assert.equal(result.status, FARM_ACTION_STATUS.UNRECORDED)
  assert.equal(result.priority, 5)
})

test('合法作物缺少或包含非法 schedule 时归类为未计时', () => {
  assert.equal(
    classifyFarmAction(server('missing', { farmSchedule: null }), NOW).status,
    FARM_ACTION_STATUS.UNSCHEDULED,
  )
  assert.equal(
    classifyFarmAction(server('invalid', {
      farmSchedule: { schemaVersion: 1, cropType: '8' },
    }), NOW).status,
    FARM_ACTION_STATUS.UNSCHEDULED,
  )
})

test('已经成熟拥有最高优先级，即使浇水也已到期', () => {
  const result = classifyFarmAction(server('due', {
    farmSchedule: schedule('8', {
      waterAt: NOW - 60_000,
      harvestAt: NOW,
    }),
  }), NOW)
  assert.equal(result.status, FARM_ACTION_STATUS.HARVEST_DUE)
  assert.equal(result.priority, 0)
})

test('浇水状态覆盖已到期、30 分钟边界和动态文案', () => {
  const due = classifyFarmAction(server('water-due', {
    farmSchedule: schedule('8', { waterAt: NOW }),
  }), NOW)
  const boundary = classifyFarmAction(server('water-boundary', {
    farmSchedule: schedule('8', {
      waterAt: NOW + WATER_ATTENTION_WINDOW_MS,
    }),
  }), NOW)
  assert.equal(due.status, FARM_ACTION_STATUS.WATER)
  assert.equal(due.label, '需要浇水')
  assert.equal(boundary.status, FARM_ACTION_STATUS.WATER)
  assert.equal(boundary.label, '30分后浇水')
})

test('超过 30 分钟时浇水不抢占即将成熟', () => {
  const result = classifyFarmAction(server('harvest-soon', {
    farmSchedule: schedule('8', {
      waterAt: NOW + WATER_ATTENTION_WINDOW_MS + 1,
      harvestAt: NOW + 60 * 60_000,
    }),
  }), NOW)
  assert.equal(result.status, FARM_ACTION_STATUS.HARVEST_SOON)
})

test('2 小时整边界为即将成熟，超过边界为正常生长', () => {
  const boundary = classifyFarmAction(server('soon-boundary', {
    farmSchedule: schedule('8', {
      harvestAt: NOW + HARVEST_SOON_WINDOW_MS,
    }),
  }), NOW)
  const growing = classifyFarmAction(server('growing', {
    farmSchedule: schedule('8', {
      harvestAt: NOW + HARVEST_SOON_WINDOW_MS + 1,
    }),
  }), NOW)
  assert.equal(boundary.status, FARM_ACTION_STATUS.HARVEST_SOON)
  assert.equal(growing.status, FARM_ACTION_STATUS.GROWING)
})

test('非法 now 明确拒绝，32 小时作物按同一规则分类', () => {
  assert.throws(() => classifyFarmAction(server('invalid-now'), Number.NaN), /nowMs/)
  assert.equal(
    classifyFarmAction(server('crop-32', {
      cropType: '32',
      farmSchedule: schedule('32', { harvestAt: NOW + 60 * 60_000 }),
    }), NOW).status,
    FARM_ACTION_STATUS.HARVEST_SOON,
  )
})

test('六种状态按固定优先级排序且相同状态保持递归原顺序', () => {
  const records = [
    { server: server('unrecorded', { cropType: '', farmSchedule: null }), groupPath: ['A'] },
    { server: server('growing'), groupPath: ['B'] },
    { server: server('water-1', { farmSchedule: schedule('8', { waterAt: NOW + 10 * 60_000 }) }), groupPath: ['C'] },
    { server: server('unscheduled', { farmSchedule: null }), groupPath: ['D'] },
    { server: server('due', { farmSchedule: schedule('8', { harvestAt: NOW }) }), groupPath: ['E'] },
    { server: server('water-2', { farmSchedule: schedule('8', { waterAt: NOW + 5 * 60_000 }) }), groupPath: ['F'] },
    { server: server('soon', { farmSchedule: schedule('8', { harvestAt: NOW + 60 * 60_000 }) }), groupPath: ['G'] },
  ]
  const before = structuredClone(records)
  const sorted = sortFarmActionRecords(records, NOW)

  assert.deepEqual(sorted.map(({ server: item }) => item.id), [
    'due',
    'water-1',
    'water-2',
    'soon',
    'growing',
    'unscheduled',
    'unrecorded',
  ])
  assert.deepEqual(records, before)
  assert.equal(Object.hasOwn(records[0], 'farmAction'), false)
  assert.deepEqual(sorted[1].groupPath, ['C'])
})

test('共享 now 更新后同一账号从生长提升到收获，key 仍为 server.id', () => {
  const records = [{
    server: server('moving', {
      farmSchedule: schedule('8', {
        waterAt: NOW + 10 * 60 * 60_000,
        harvestAt: NOW + 3 * 60 * 60_000,
      }),
    }),
    groupPath: [],
  }]
  const first = analyseFarmActionRecords(records, NOW)
  const later = analyseFarmActionRecords(records, NOW + 3 * 60 * 60_000)
  assert.equal(first.records[0].farmAction.status, FARM_ACTION_STATUS.GROWING)
  assert.equal(later.records[0].farmAction.status, FARM_ACTION_STATUS.HARVEST_DUE)
  assert.equal(first.records[0].server.id, later.records[0].server.id)
})

test('摘要只使用分类结果并保证数量总和等于记录数', () => {
  const records = [
    { server: server('one', { farmSchedule: schedule('8', { harvestAt: NOW }) }), groupPath: [] },
    { server: server('two', { farmSchedule: null }), groupPath: ['子分组'] },
    { server: server('three', { cropType: '', farmSchedule: null }), groupPath: ['子分组'] },
  ]
  const summary = summariseFarmActions(records, NOW)
  assert.equal(summary.total, 3)
  assert.equal(summary[FARM_ACTION_STATUS.HARVEST_DUE], 1)
  assert.equal(summary[FARM_ACTION_STATUS.UNSCHEDULED], 1)
  assert.equal(summary[FARM_ACTION_STATUS.UNRECORDED], 1)
  assert.equal(summariseFarmActions([], NOW).total, 0)
})

test('主要操作与无障碍名称按状态确定', () => {
  const dueServer = server('131', {
    farmSchedule: schedule('8', { harvestAt: NOW }),
  })
  dueServer.serverName = '131区'
  dueServer.accountId = '李在思念谁'
  const due = classifyFarmAction(dueServer, NOW)
  assert.deepEqual(farmActionPrimaryCommand(due), {
    key: 'reset-cycle',
    label: '已收获并重新种植',
  })
  assert.equal(
    farmActionAriaLabel(dueServer, due),
    '131区，李在思念谁，可以收获',
  )
  assert.equal(
    farmActionPrimaryCommand(FARM_ACTION_STATUS.UNRECORDED).key,
    'set-crop',
  )
})

test('根分组使用全部递归账号，子分组只使用自身子树', () => {
  const root = {
    id: 'root',
    type: 'group',
    name: '全部账号',
    children: [
      server('root-server'),
      {
        id: 'group-a',
        type: 'group',
        name: '安卓Q',
        children: [
          server('group-a-server'),
          {
            id: 'group-b',
            type: 'group',
            name: '主账号',
            children: [server('group-b-server')],
          },
        ],
      },
    ],
  }
  const values = new Map([[ACCOUNT_STORAGE_KEY, JSON.stringify(root)]])
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  const store = useAccountStore()
  assert.deepEqual(
    store.getServersInGroup('root').map(({ server: item }) => item.id),
    ['root-server', 'group-a-server', 'group-b-server'],
  )
  assert.deepEqual(
    store.getServersInGroup('group-a').map(({ server: item, groupPath }) => ({
      id: item.id,
      path: groupPath.join('/'),
    })),
    [
      { id: 'group-a-server', path: '' },
      { id: 'group-b-server', path: '主账号' },
    ],
  )
})
