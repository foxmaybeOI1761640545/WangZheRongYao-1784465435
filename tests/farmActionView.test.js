import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createBackupSnapshot } from '../src/domain/accountBackup.js'
import {
  FARM_ACTION_VIEW,
  FARM_ACTION_VIEW_STORAGE_KEY,
  normaliseFarmActionView,
  readFarmActionView,
  writeFarmActionView,
} from '../src/domain/farmActionView.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

test('行动优先为默认模式，非法偏好回退 action', () => {
  assert.equal(normaliseFarmActionView(undefined), FARM_ACTION_VIEW.ACTION)
  assert.equal(normaliseFarmActionView('invalid'), FARM_ACTION_VIEW.ACTION)
  assert.equal(normaliseFarmActionView('original'), FARM_ACTION_VIEW.ORIGINAL)
  assert.equal(readFarmActionView(createStorage()), FARM_ACTION_VIEW.ACTION)
})

test('视图偏好只写入独立 UI localStorage key', () => {
  const storage = createStorage()
  assert.equal(writeFarmActionView('original', storage), 'original')
  assert.equal(storage.getItem(FARM_ACTION_VIEW_STORAGE_KEY), 'original')
  assert.equal(storage.getItem('wangzhe-account-manager:v1'), null)
})

test('备份使用稳定字段白名单，不导出行动、排序、时钟或临时确认状态', () => {
  const snapshot = createBackupSnapshot({
    root: {
      id: 'root',
      type: 'group',
      name: '全部账号',
      farmActionView: 'original',
      nowMs: 123,
      children: [{
        id: 'server-a',
        type: 'server',
        parentId: 'root',
        serverName: 'A区',
        cropType: '',
        farmActionStatus: 'harvest-due',
        farmAction: { priority: 0 },
        originalIndex: 1,
        actionThresholds: { water: 30 },
        farmCycleResetState: { open: true },
      }],
    },
    stats: { groups: 0, servers: 1 },
  })
  const text = JSON.stringify(snapshot)
  for (const forbidden of [
    'farmActionView',
    'nowMs',
    'farmActionStatus',
    'farmAction',
    'originalIndex',
    'actionThresholds',
    'farmCycleResetState',
  ]) {
    assert.equal(text.includes(forbidden), false)
  }
  assert.equal(snapshot.schemaVersion, 3)
})

test('行动队列使用递归记录、server.id key 和单一共享 now，不创建卡片定时器', () => {
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  const groupBrowser = readFileSync(
    new URL('../src/components/GroupBrowser.vue', import.meta.url),
    'utf8',
  )
  const queue = readFileSync(
    new URL('../src/components/FarmActionQueue.vue', import.meta.url),
    'utf8',
  )
  assert.match(app, /:recursive-server-records="currentGroupServerRecords"/)
  assert.match(groupBrowser, /analyseFarmActionRecords\(props\.recursiveServerRecords, props\.nowMs\)/)
  assert.match(queue, /:key="record\.server\.id"/)
  assert.doesNotMatch(queue, /setInterval/)
})

test('原顺序模式保留直属账号、删除和原有农场操作', () => {
  const source = readFileSync(
    new URL('../src/components/GroupBrowser.vue', import.meta.url),
    'utf8',
  )
  assert.match(source, /actionView === 'original'/)
  assert.match(source, /v-for="server in servers"/)
  assert.match(source, /delete-server/)
  assert.match(source, /openFarmCalculator\(server, \$event\)/)
})

test('确认框具备安全默认焦点、关闭入口和防重复提交', () => {
  const source = readFileSync(
    new URL('../src/components/FarmCycleResetDialog.vue', import.meta.url),
    'utf8',
  )
  assert.match(source, /cancelButton\.value\?\.focus\(\)/)
  assert.match(source, /aria-label="关闭已收获并重新种植确认"/)
  assert.match(source, /:disabled="busy"/)
  assert.doesNotMatch(source, /@click\.self="emit\('confirm'\)"/)
})

test('Phase4 CSS 为主要操作提供 44px 触控区和窄屏换行', () => {
  const source = readFileSync(
    new URL('../src/farm-workflow-phase4.css', import.meta.url),
    'utf8',
  )
  assert.match(source, /\.farm-action-primary[\s\S]*min-height: 44px/)
  assert.match(source, /\.farm-action-crop[\s\S]*width: 44px[\s\S]*height: 44px/)
  assert.match(source, /@media \(max-width: 430px\)/)
  assert.match(source, /flex-wrap: wrap/)
})
