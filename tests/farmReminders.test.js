import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'
import {
  allocateFarmNotificationIds,
  buildFarmReminderPlans,
  collectUsedNotificationIds,
  farmReminderKey,
  normaliseFarmReminders,
  repairFarmReminderIdsInTree,
} from '../src/domain/farmReminders.js'

const NOW = 1_800_000_000_000

function schedule(cropType = '8', waterLeftMinutes = 20) {
  return calculateFarmSchedule({
    cropType,
    matureLeftMinutes: 200,
    waterLeftMinutes,
    now: NOW,
  })
}

function reminders(waterId = 101, harvestId = 102) {
  return {
    schemaVersion: 1,
    water: { enabled: true, notificationId: waterId },
    harvest: { enabled: true, notificationId: harvestId },
    updatedAt: NOW,
  }
}

function serverFixture(id = 'server-a', cropType = '8') {
  return {
    id,
    type: 'server',
    serverName: '131区',
    accountId: '李在思念谁',
    cropType,
    farmSchedule: schedule(cropType),
    farmReminders: reminders(),
  }
}

test('相同账号和类型稳定分配通知 ID，water 与 harvest 不同', () => {
  const first = allocateFarmNotificationIds({ serverId: 'server-a' })
  const second = allocateFarmNotificationIds({ serverId: 'server-a' })

  assert.deepEqual(first, second)
  assert.notEqual(first.water, first.harvest)
  assert.ok(first.water > 0)
  assert.ok(first.harvest > 0)
})

test('分配器保留未冲突 ID，只重新分配冲突或非法项', () => {
  const result = allocateFarmNotificationIds({
    serverId: 'server-b',
    existing: { water: 300, harvest: -1 },
    usedIds: new Set([301]),
  })
  assert.equal(result.water, 300)
  assert.notEqual(result.harvest, 301)

  const conflict = allocateFarmNotificationIds({
    serverId: 'server-b',
    existing: { water: 300, harvest: 400 },
    usedIds: new Set([300]),
  })
  assert.notEqual(conflict.water, 300)
  assert.equal(conflict.harvest, 400)
})

test('全树重复 ID 修复只改变后出现的冲突项', () => {
  const first = serverFixture('server-a')
  first.farmReminders = reminders(111, 112)
  const second = serverFixture('server-b')
  second.farmReminders = reminders(111, 212)
  const root = {
    id: 'root',
    type: 'group',
    children: [first, second],
  }

  repairFarmReminderIdsInTree(root)

  assert.equal(first.farmReminders.water.notificationId, 111)
  assert.equal(first.farmReminders.harvest.notificationId, 112)
  assert.notEqual(second.farmReminders.water.notificationId, 111)
  assert.equal(second.farmReminders.harvest.notificationId, 212)
  assert.equal(collectUsedNotificationIds(root).size, 4)
})

test('farmSchedule 为空或提醒结构非法时规范化为 null', () => {
  assert.equal(normaliseFarmReminders(reminders(), null), null)
  assert.equal(normaliseFarmReminders(reminders(1, 1), schedule()), null)
  assert.equal(normaliseFarmReminders(reminders(0, 2), schedule()), null)
  assert.equal(normaliseFarmReminders({
    ...reminders(),
    water: { enabled: 'true', notificationId: 1 },
  }, schedule()), null)
})

test('计划仅生成启用且尚未到期的目标', () => {
  const server = serverFixture()
  server.farmReminders.harvest.enabled = false

  const plans = buildFarmReminderPlans(server, NOW + 1)
  assert.equal(plans.length, 1)
  assert.equal(plans[0].reminderType, 'water')
  assert.equal(plans[0].targetAt, server.farmSchedule.nextWaterAt)

  assert.deepEqual(
    buildFarmReminderPlans(server, server.farmSchedule.nextWaterAt),
    [],
  )
})

test('通知内容与 extra 最小化且不包含敏感字段', () => {
  const server = serverFixture()
  server.epicSkins = '敏感皮肤'
  server.pat = 'github_pat_secret'
  const [water, harvest] = buildFarmReminderPlans(server, NOW)

  assert.equal(water.key, farmReminderKey(server.id, 'water'))
  assert.equal(water.title, '农场浇水提醒')
  assert.equal(water.body, '131区 · 李在思念谁 现在需要浇水')
  assert.deepEqual(Object.keys(water.extra).sort(), [
    'reminderType',
    'schemaVersion',
    'serverId',
    'source',
    'targetAt',
  ])
  assert.equal(harvest.body, '131区 · 李在思念谁 已到理论最快成熟时间')
  assert.equal(JSON.stringify([water, harvest]).includes('github_pat_'), false)
  assert.equal(JSON.stringify([water, harvest]).includes('敏感皮肤'), false)
})

test('未记录作物或 schedule 作物不匹配不生成计划', () => {
  const server = serverFixture()
  server.cropType = ''
  assert.deepEqual(buildFarmReminderPlans(server, NOW), [])

  server.cropType = '16'
  assert.deepEqual(buildFarmReminderPlans(server, NOW), [])
})
