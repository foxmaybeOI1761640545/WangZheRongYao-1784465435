import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatFarmCountdown,
  formatFarmReminderCopyText,
} from '../src/domain/farmReminders.js'
import { createWebFarmReminderMonitor } from '../src/services/webFarmReminderMonitor.js'

const NOW = 1_800_000_000_000

test('网页倒计时格式化未来、跨天和已到时间', () => {
  assert.equal(formatFarmCountdown(NOW + 80 * 60_000, NOW), '1小时20分')
  assert.equal(formatFarmCountdown(NOW + 26 * 60 * 60_000, NOW), '1天2小时')
  assert.equal(formatFarmCountdown(NOW, NOW, '已到浇水时间'), '已到浇水时间')
  assert.equal(formatFarmCountdown(Number.NaN, NOW), '--')
})

test('复制时间支持单项和全部，账号 ID 为空时使用回退文本', () => {
  const server = {
    serverName: '131区',
    accountId: '',
    cropType: '8',
    farmSchedule: {
      schemaVersion: 1,
      cropType: '8',
      calculatedAt: NOW,
      matureLeftMinutes: 200,
      waterLeftMinutes: 20,
      reportedMatureAt: NOW + 200 * 60_000,
      elapsedSinceLastWaterMinutes: 140,
      currentWaterReduceMinutes: 35,
      matureAfterWaterMinutes: 165,
      fastestLeftMinutes: 132,
      savedMinutes: 68,
      nextWaterAt: NOW + 20 * 60_000,
      fastestMatureAt: NOW + 132 * 60_000,
    },
  }

  const water = formatFarmReminderCopyText(server, ['water'])
  const all = formatFarmReminderCopyText(server)
  assert.match(water, /^131区 · 未填写 ID\n浇水：/)
  assert.equal(water.includes('理论最快成熟'), false)
  assert.equal(all.includes('理论最快成熟：'), true)
})

test('页面恢复检查只触发一次，同一提醒不重复通知', () => {
  let current = NOW
  const targetAt = NOW + 60_000
  const plans = [{
    key: 'server-a:water',
    targetAt,
  }]
  const notified = []
  const monitor = createWebFarmReminderMonitor({
    getPlans: () => plans,
    notify: (plan) => {
      notified.push(plan.key)
      return true
    },
    now: () => current,
  })

  current = targetAt - 1
  assert.equal(monitor.check(current), 0)
  current = targetAt + 1
  assert.equal(monitor.check(current), 1)
  assert.equal(monitor.check(current + 60_000), 0)
  assert.deepEqual(notified, ['server-a:water'])
})

test('页面启动前已经过期的目标不会补发旧通知', () => {
  const plans = [{
    key: 'server-a:harvest',
    targetAt: NOW - 1,
  }]
  let notified = 0
  const monitor = createWebFarmReminderMonitor({
    getPlans: () => plans,
    notify: () => {
      notified += 1
      return true
    },
    now: () => NOW,
  })

  assert.equal(monitor.check(NOW + 60_000), 0)
  assert.equal(notified, 0)
})
