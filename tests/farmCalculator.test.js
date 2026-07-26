import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateFarmSchedule,
  FARM_CROP_CONFIGS,
  formatFarmDuration,
  formatFarmTargetTime,
  normaliseFarmSchedule,
} from '../src/domain/farmCalculator.js'

const NOW = 1_800_000_000_000

test('8 小时作物按参考公式生成确定 schedule', () => {
  const result = calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 420,
    waterLeftMinutes: 80,
    now: NOW,
  })

  assert.equal(result.baseMinutes, 480)
  assert.equal(result.waterMaxMinutes, 160)
  assert.equal(result.elapsedSinceLastWaterMinutes, 80)
  assert.equal(result.currentWaterReduceMinutes, 20)
  assert.equal(result.matureAfterWaterMinutes, 400)
  assert.equal(result.fastestLeftMinutes, 320)
  assert.equal(result.savedMinutes, 100)
  assert.equal(result.nextWaterAt, NOW + 80 * 60_000)
  assert.equal(result.reportedMatureAt, NOW + 420 * 60_000)
  assert.equal(result.fastestMatureAt, NOW + 320 * 60_000)
})

test('16 小时作物满水时尚未产生本次浇水减少', () => {
  const result = calculateFarmSchedule({
    cropType: '16',
    matureLeftMinutes: 960,
    waterLeftMinutes: FARM_CROP_CONFIGS[16].waterMaxMinutes,
    now: NOW,
  })

  assert.equal(result.elapsedSinceLastWaterMinutes, 0)
  assert.equal(result.currentWaterReduceMinutes, 0)
  assert.equal(result.fastestLeftMinutes, 768)
  assert.equal(result.savedMinutes, 192)
})

test('32 小时作物水分为 0 时应用最大已耗水分', () => {
  const result = calculateFarmSchedule({
    cropType: '32',
    matureLeftMinutes: 1920,
    waterLeftMinutes: 0,
    now: NOW,
  })

  assert.equal(result.elapsedSinceLastWaterMinutes, 640)
  assert.equal(result.currentWaterReduceMinutes, 160)
  assert.equal(result.matureAfterWaterMinutes, 1760)
  assert.equal(result.fastestLeftMinutes, 1408)
  assert.equal(result.savedMinutes, 512)
})

test('fastestMatureAt 按参考项目在秒级向上取整', () => {
  const result = calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 1.01,
    waterLeftMinutes: 160,
    now: NOW,
  })

  assert.equal(result.fastestLeftMinutes, 0.808)
  assert.equal(result.fastestMatureAt, NOW + 49_000)
})

test('计算拒绝越界成熟、水分、零成熟和未记录作物', () => {
  assert.throws(
    () => calculateFarmSchedule({ cropType: '8', matureLeftMinutes: 481, waterLeftMinutes: 0, now: NOW }),
    /不能超过/,
  )
  assert.throws(
    () => calculateFarmSchedule({ cropType: '16', matureLeftMinutes: 1, waterLeftMinutes: 321, now: NOW }),
    /不能超过/,
  )
  assert.throws(
    () => calculateFarmSchedule({ cropType: '32', matureLeftMinutes: 0, waterLeftMinutes: 0, now: NOW }),
    /必须大于 0/,
  )
  assert.throws(
    () => calculateFarmSchedule({ cropType: '', matureLeftMinutes: 1, waterLeftMinutes: 0, now: NOW }),
    /请先设置/,
  )
})

test('计算拒绝非有限分钟和无效 now', () => {
  assert.throws(
    () => calculateFarmSchedule({ cropType: '8', matureLeftMinutes: Number.NaN, waterLeftMinutes: 0, now: NOW }),
    /有限/,
  )
  assert.throws(
    () => calculateFarmSchedule({ cropType: '8', matureLeftMinutes: 1, waterLeftMinutes: -1, now: NOW }),
    /有限非负数/,
  )
  assert.throws(
    () => calculateFarmSchedule({ cropType: '8', matureLeftMinutes: 1, waterLeftMinutes: 0, now: 'invalid' }),
    /有效日期或时间戳/,
  )
})

test('schedule 规范化要求结构完整且作物一致', () => {
  const valid = calculateFarmSchedule({
    cropType: '8',
    matureLeftMinutes: 100,
    waterLeftMinutes: 20,
    now: NOW,
  })
  assert.deepEqual(normaliseFarmSchedule(valid, '8'), valid)
  assert.equal(normaliseFarmSchedule(valid, '16'), null)
  assert.equal(normaliseFarmSchedule({ ...valid, fastestMatureAt: -1 }, '8'), null)
  assert.equal(normaliseFarmSchedule({ ...valid, savedMinutes: Number.NaN }, '8'), null)
})

test('时间与时长格式化集中处理今日、明日和其他日期', () => {
  const now = new Date(2026, 6, 26, 12, 0, 0).getTime()
  assert.equal(
    formatFarmTargetTime(new Date(2026, 6, 26, 22, 43).getTime(), now),
    '今日 22:43',
  )
  assert.equal(
    formatFarmTargetTime(new Date(2026, 6, 27, 8, 10).getTime(), now),
    '明日 08:10',
  )
  assert.equal(
    formatFarmTargetTime(new Date(2026, 6, 29, 8, 10).getTime(), now),
    '07-29 08:10',
  )
  assert.equal(formatFarmDuration(84), '1小时24分钟')
})
