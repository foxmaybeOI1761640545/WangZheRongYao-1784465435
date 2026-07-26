import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'
import { buildFarmReminderPlans } from '../src/domain/farmReminders.js'
import { createFarmReminderCoordinator } from '../src/services/farmReminderCoordinator.js'

const NOW = 1_800_000_000_000

function serverFixture(id = 'server-a', waterId = 101, harvestId = 102) {
  return {
    id,
    type: 'server',
    serverName: `${id}区`,
    accountId: id,
    cropType: '8',
    farmSchedule: calculateFarmSchedule({
      cropType: '8',
      matureLeftMinutes: 200,
      waterLeftMinutes: 20,
      now: NOW,
    }),
    farmReminders: {
      schemaVersion: 1,
      water: { enabled: true, notificationId: waterId },
      harvest: { enabled: true, notificationId: harvestId },
      updatedAt: NOW,
    },
  }
}

function createStore(servers) {
  return {
    getAllServersWithReminders: () => servers,
    getFarmReminderPlans: (now) => (
      servers.flatMap((server) => buildFarmReminderPlans(server, now))
    ),
  }
}

function createFakeAdapter({
  capability = 'exact',
  pending = [],
  failIds = [],
} = {}) {
  const state = {
    pending: [...pending],
    delivered: [],
    scheduled: [],
    cancelled: [],
    removed: [],
    exactFlags: [],
    failIds: new Set(failIds),
  }
  return {
    state,
    isSupported: () => true,
    ensureChannels: async () => {},
    checkCapability: async () => ({
      capability,
      displayPermission: capability === 'denied' ? 'denied' : 'granted',
      exactPermission: capability === 'exact' ? 'granted' : 'denied',
    }),
    getPending: async () => state.pending,
    schedule: async (plans, options) => {
      const [plan] = plans
      if (state.failIds.has(plan.notificationId)) throw new Error(`schedule ${plan.notificationId} failed`)
      state.scheduled.push(plan.notificationId)
      state.exactFlags.push(options.exact)
      state.pending = state.pending.filter((item) => item.id !== plan.notificationId)
      state.pending.push({
        id: plan.notificationId,
        title: plan.title,
        body: plan.body,
        schedule: { at: new Date(plan.targetAt) },
        extra: plan.extra,
      })
    },
    cancel: async (ids) => {
      state.cancelled.push(...ids)
      const idSet = new Set(ids)
      state.pending = state.pending.filter((item) => !idSet.has(item.id))
    },
    removeDelivered: async (ids) => {
      state.removed.push(...ids)
    },
  }
}

test('缺失提醒被创建，重复校准不会重复安排', async () => {
  const servers = [serverFixture()]
  const adapter = createFakeAdapter()
  const coordinator = createFarmReminderCoordinator({
    store: createStore(servers),
    adapter,
    now: () => NOW,
  })

  const first = await coordinator.synchronise()
  const second = await coordinator.synchronise()

  assert.equal(first.createdCount, 2)
  assert.equal(first.scheduledCount, 2)
  assert.deepEqual(adapter.state.scheduled, [101, 102])
  assert.equal(second.createdCount, 0)
  assert.equal(second.scheduledCount, 2)
})

test('目标变化后取消旧提醒并用相同 ID 重新安排', async () => {
  const server = serverFixture()
  const [oldPlan] = buildFarmReminderPlans(server, NOW)
  const adapter = createFakeAdapter({
    pending: [{
      id: oldPlan.notificationId,
      title: oldPlan.title,
      body: oldPlan.body,
      schedule: { at: new Date(oldPlan.targetAt - 60_000) },
      extra: { ...oldPlan.extra, targetAt: oldPlan.targetAt - 60_000 },
    }],
  })
  server.farmReminders.harvest.enabled = false
  const coordinator = createFarmReminderCoordinator({
    store: createStore([server]),
    adapter,
    now: () => NOW,
  })

  const result = await coordinator.synchronise()

  assert.deepEqual(adapter.state.cancelled, [101])
  assert.deepEqual(adapter.state.scheduled, [101])
  assert.equal(result.createdCount, 1)
})

test('denied 状态不抛异常并取消已有农场通知', async () => {
  const server = serverFixture()
  const plans = buildFarmReminderPlans(server, NOW)
  const adapter = createFakeAdapter({
    capability: 'denied',
    pending: plans.map((plan) => ({
      id: plan.notificationId,
      title: plan.title,
      body: plan.body,
      schedule: { at: new Date(plan.targetAt) },
      extra: plan.extra,
    })),
  })
  const coordinator = createFarmReminderCoordinator({
    store: createStore([server]),
    adapter,
    now: () => NOW,
  })

  const result = await coordinator.synchronise()

  assert.equal(result.capability, 'denied')
  assert.equal(result.scheduledCount, 0)
  assert.deepEqual(adapter.state.cancelled.sort(), [101, 102])
})

test('inexact 回退安排普通提醒，不冒充 exact', async () => {
  const adapter = createFakeAdapter({ capability: 'inexact' })
  const coordinator = createFarmReminderCoordinator({
    store: createStore([serverFixture()]),
    adapter,
    now: () => NOW,
  })

  const result = await coordinator.synchronise()

  assert.equal(result.capability, 'inexact')
  assert.deepEqual(adapter.state.exactFlags, [false, false])
})

test('过期目标跳过并取消对应 pending', async () => {
  const server = serverFixture()
  server.farmSchedule.nextWaterAt = NOW
  server.farmSchedule.fastestMatureAt = NOW - 1
  const adapter = createFakeAdapter({
    pending: [{
      id: 101,
      extra: { source: 'farm-reminder', serverId: server.id, reminderType: 'water', targetAt: NOW },
    }],
  })
  const coordinator = createFarmReminderCoordinator({
    store: createStore([server]),
    adapter,
    now: () => NOW,
  })

  const result = await coordinator.synchronise()

  assert.equal(result.skippedPastCount, 2)
  assert.equal(result.createdCount, 0)
  assert.deepEqual(adapter.state.cancelled, [101])
})

test('单个安排失败不阻止其他提醒', async () => {
  const adapter = createFakeAdapter({ failIds: [101] })
  const coordinator = createFarmReminderCoordinator({
    store: createStore([serverFixture()]),
    adapter,
    now: () => NOW,
  })

  const result = await coordinator.synchronise()

  assert.equal(result.failed.length, 1)
  assert.match(result.failed[0].message, /schedule 101 failed/)
  assert.deepEqual(adapter.state.scheduled, [102])
})

test('删除账号后取消 pending 并移除 delivered', async () => {
  const server = serverFixture()
  const plans = buildFarmReminderPlans(server, NOW)
  const adapter = createFakeAdapter({
    pending: plans.map((plan) => ({
      id: plan.notificationId,
      title: plan.title,
      body: plan.body,
      schedule: { at: new Date(plan.targetAt) },
      extra: plan.extra,
    })),
  })
  const servers = [server]
  const coordinator = createFarmReminderCoordinator({
    store: createStore(servers),
    adapter,
    now: () => NOW,
  })
  servers.splice(0)

  const result = await coordinator.synchronise()

  assert.equal(result.cancelledCount, 2)
  assert.deepEqual(adapter.state.cancelled.sort(), [101, 102])
  assert.deepEqual(adapter.state.removed.sort(), [101, 102])
})
