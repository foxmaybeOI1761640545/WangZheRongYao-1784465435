import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBackupSnapshot,
  extractSnapshotRoot,
  SNAPSHOT_SCHEMA_VERSION,
} from '../src/domain/accountBackup.js'
import { calculateFarmSchedule } from '../src/domain/farmCalculator.js'

const NOW = 1_800_000_000_000

function rootFixture() {
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
        cropType: '8',
        farmSchedule: calculateFarmSchedule({
          cropType: '8',
          matureLeftMinutes: 200,
          waterLeftMinutes: 40,
          now: NOW,
        }),
      },
      {
        id: 'server-16',
        type: 'server',
        parentId: 'root',
        serverName: '16区',
        cropType: '16',
      },
      {
        id: 'server-32',
        type: 'server',
        parentId: 'root',
        serverName: '32区',
        cropType: '32',
      },
      {
        id: 'server-empty',
        type: 'server',
        parentId: 'root',
        serverName: '未记录区',
        cropType: '',
      },
    ],
  }
}

test('Schema 1 导入自动为所有账号增加 null schedule', () => {
  const root = rootFixture()
  root.children.forEach((server) => delete server.farmSchedule)
  const migrated = extractSnapshotRoot({
    schemaVersion: 1,
    app: 'wangzhe-account-manager',
    data: root,
  })

  assert.deepEqual(migrated.children.map((server) => server.cropType), ['8', '16', '32', ''])
  assert.deepEqual(migrated.children.map((server) => server.farmSchedule), [null, null, null, null])
})

test('Schema 2 导入恢复合法 schedule 并丢弃非法或作物不一致数据', () => {
  const root = rootFixture()
  root.children[1].farmSchedule = {
    ...root.children[0].farmSchedule,
    cropType: '8',
  }
  root.children[2].farmSchedule = {
    ...calculateFarmSchedule({
      cropType: '32',
      matureLeftMinutes: 300,
      waterLeftMinutes: 50,
      now: NOW,
    }),
    fastestMatureAt: -1,
  }

  const migrated = extractSnapshotRoot({
    schemaVersion: 2,
    app: 'wangzhe-account-manager',
    data: root,
  })

  assert.equal(migrated.children[0].farmSchedule.cropType, '8')
  assert.equal(migrated.children[1].farmSchedule, null)
  assert.equal(migrated.children[2].farmSchedule, null)
  assert.equal(migrated.children[3].farmSchedule, null)
})

test('Schema 3 导出再导入完整保留计算结果且不包含 PAT', () => {
  const snapshot = createBackupSnapshot({
    root: rootFixture(),
    stats: { groups: 0, servers: 4 },
    exportedAt: '2026-07-26T00:00:00.000Z',
  })
  const roundTrip = extractSnapshotRoot(JSON.parse(JSON.stringify(snapshot)))

  assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION)
  assert.equal(snapshot.exportedAt, '2026-07-26T00:00:00.000Z')
  assert.deepEqual(roundTrip.children[0].farmSchedule, snapshot.data.children[0].farmSchedule)
  assert.deepEqual(roundTrip.children.map((server) => server.cropType), ['8', '16', '32', ''])
  assert.equal(JSON.stringify(snapshot).includes('github_pat_'), false)
})

test('不支持的 Schema 和错误应用标识会明确拒绝', () => {
  assert.throws(
    () => extractSnapshotRoot({ schemaVersion: 4, data: rootFixture() }),
    /不支持的备份版本/,
  )
  assert.throws(
    () => extractSnapshotRoot({ schemaVersion: 2, app: 'other-app', data: rootFixture() }),
    /不是王者多账号管理器备份/,
  )
})
