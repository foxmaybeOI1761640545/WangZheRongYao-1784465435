import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBackupSnapshot,
  extractSnapshotRoot,
  SNAPSHOT_SCHEMA_VERSION,
} from '../src/domain/accountBackup.js'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'

const NOW = 1_800_000_000_000

function schedule() {
  return calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 200,
    waterLeftMinutes: 20,
    now: NOW,
  })
}

function reminders(waterId, harvestId) {
  return {
    schemaVersion: 1,
    water: { enabled: true, notificationId: waterId },
    harvest: { enabled: true, notificationId: harvestId },
    updatedAt: NOW,
  }
}

function rootFixture() {
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    children: [
      {
        id: 'server-a',
        type: 'server',
        serverName: 'A区',
        cropType: '8',
        farmSchedule: schedule(),
        farmReminders: reminders(101, 102),
      },
      {
        id: 'server-b',
        type: 'server',
        serverName: 'B区',
        cropType: '8',
        farmSchedule: schedule(),
        farmReminders: reminders(101, 202),
      },
    ],
  }
}

test('Schema 1 → 3：schedule 与 reminders 均为空', () => {
  const root = rootFixture()
  const migrated = extractSnapshotRoot({
    schemaVersion: 1,
    app: 'wangzhe-account-manager',
    data: root,
  })
  migrated.children.forEach((server) => {
    assert.equal(server.farmSchedule, null)
    assert.equal(server.farmReminders, null)
  })
})

test('Schema 2 → 3：保留合法 schedule，不导入提醒字段', () => {
  const migrated = extractSnapshotRoot({
    schemaVersion: 2,
    app: 'wangzhe-account-manager',
    data: rootFixture(),
  })
  migrated.children.forEach((server) => {
    assert.notEqual(server.farmSchedule, null)
    assert.equal(server.farmReminders, null)
  })
})

test('Schema 3 恢复提醒并修复重复 ID，未冲突 ID 不变', () => {
  const migrated = extractSnapshotRoot({
    schemaVersion: 3,
    app: 'wangzhe-account-manager',
    data: rootFixture(),
  })
  const [first, second] = migrated.children

  assert.equal(first.farmReminders.water.notificationId, 101)
  assert.equal(first.farmReminders.harvest.notificationId, 102)
  assert.notEqual(second.farmReminders.water.notificationId, 101)
  assert.equal(second.farmReminders.harvest.notificationId, 202)
})

test('Schema 3 丢弃无 schedule、非法 ID 和非法 enabled 的提醒', () => {
  const root = rootFixture()
  root.children[0].farmSchedule = null
  root.children[1].farmReminders.water.notificationId = 2_147_483_648
  const third = {
    ...root.children[1],
    id: 'server-c',
    farmReminders: {
      ...reminders(301, 302),
      harvest: { enabled: 'true', notificationId: 302 },
    },
  }
  root.children.push(third)

  const migrated = extractSnapshotRoot({
    schemaVersion: 3,
    app: 'wangzhe-account-manager',
    data: root,
  })
  assert.deepEqual(
    migrated.children.map((server) => server.farmReminders),
    [null, null, null],
  )
})

test('Schema 3 导出再导入保留意图且排除权限、pending 和 PAT', () => {
  const root = rootFixture()
  root.notificationPermission = 'granted'
  root.pendingNotifications = [{ id: 1 }]
  root.pat = 'github_pat_secret'
  const snapshot = createBackupSnapshot({
    root,
    stats: { groups: 0, servers: 2 },
    exportedAt: '2026-07-26T00:00:00.000Z',
  })
  const text = JSON.stringify(snapshot)
  const restored = extractSnapshotRoot(JSON.parse(text))

  assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION)
  assert.equal(SNAPSHOT_SCHEMA_VERSION, 3)
  assert.equal(restored.children[0].farmReminders.water.enabled, true)
  assert.equal(text.includes('github_pat_'), false)
  assert.equal(text.includes('notificationPermission'), false)
  assert.equal(text.includes('pendingNotifications'), false)
})
