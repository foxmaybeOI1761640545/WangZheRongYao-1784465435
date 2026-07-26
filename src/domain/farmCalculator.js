import {
  cropTypeToLabel,
  normaliseCropType,
} from './cropTypes.js'

export const FARM_SCHEDULE_SCHEMA_VERSION = 1

export const FARM_CROP_CONFIGS = Object.freeze({
  8: Object.freeze({
    cropType: '8',
    cropName: '8 小时作物',
    baseMinutes: 480,
    waterMaxMinutes: 160,
  }),
  16: Object.freeze({
    cropType: '16',
    cropName: '16 小时作物',
    baseMinutes: 960,
    waterMaxMinutes: 320,
  }),
  32: Object.freeze({
    cropType: '32',
    cropName: '32 小时作物',
    baseMinutes: 1920,
    waterMaxMinutes: 640,
  }),
})

const SCHEDULE_MINUTE_FIELDS = Object.freeze([
  'matureLeftMinutes',
  'waterLeftMinutes',
  'elapsedSinceLastWaterMinutes',
  'currentWaterReduceMinutes',
  'matureAfterWaterMinutes',
  'fastestLeftMinutes',
  'savedMinutes',
])

const SCHEDULE_TIMESTAMP_FIELDS = Object.freeze([
  'calculatedAt',
  'reportedMatureAt',
  'nextWaterAt',
  'fastestMatureAt',
])

export function getFarmCropConfig(cropType) {
  return FARM_CROP_CONFIGS[normaliseCropType(cropType)] ?? null
}

function requireFiniteNumber(value, fieldName, { positive = false } = {}) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${fieldName}必须是有限数字。`)
  if (number < 0) throw new Error(`${fieldName}必须是有限非负数。`)
  if (positive && number <= 0) throw new Error(`${fieldName}必须大于 0。`)
  return number
}

function resolveNow(now) {
  const value = now === undefined ? Date.now() : now
  const timestamp = value instanceof Date ? value.getTime() : Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error('计算时间 now 必须是有效日期或时间戳。')
  }
  return timestamp
}

export function calculateFarmSchedule({
  cropType,
  matureLeftMinutes,
  waterLeftMinutes,
  now,
}) {
  const config = getFarmCropConfig(cropType)
  if (!config) throw new Error('请先设置当前作物类型。')

  const matureLeft = requireFiniteNumber(
    matureLeftMinutes,
    '当前成熟剩余时间',
    { positive: true },
  )
  const waterLeft = requireFiniteNumber(waterLeftMinutes, '当前水分剩余时间')
  if (matureLeft > config.baseMinutes) {
    throw new Error(`当前成熟剩余时间不能超过${config.cropName}的基础成熟时间 ${formatFarmDuration(config.baseMinutes)}。`)
  }
  if (waterLeft > config.waterMaxMinutes) {
    throw new Error(`当前水分剩余时间不能超过${config.cropName}的最大水分维持时间 ${formatFarmDuration(config.waterMaxMinutes)}。`)
  }

  const calculatedAt = resolveNow(now)
  const elapsedSinceLastWaterMinutes = Math.max(
    0,
    Math.min(config.waterMaxMinutes, config.waterMaxMinutes - waterLeft),
  )
  const currentWaterReduceMinutes = Math.min(
    matureLeft,
    elapsedSinceLastWaterMinutes / 4,
  )
  const matureAfterWaterMinutes = Math.max(
    0,
    matureLeft - currentWaterReduceMinutes,
  )
  const fastestLeftMinutes = matureAfterWaterMinutes * 4 / 5
  const savedMinutes = Math.max(
    0,
    Math.min(matureLeft, matureLeft - fastestLeftMinutes),
  )

  return {
    schemaVersion: FARM_SCHEDULE_SCHEMA_VERSION,
    cropType: config.cropType,
    cropName: config.cropName,
    baseMinutes: config.baseMinutes,
    waterMaxMinutes: config.waterMaxMinutes,
    calculatedAt,
    matureLeftMinutes: matureLeft,
    waterLeftMinutes: waterLeft,
    reportedMatureAt: calculatedAt + matureLeft * 60_000,
    elapsedSinceLastWaterMinutes,
    currentWaterReduceMinutes,
    matureAfterWaterMinutes,
    fastestLeftMinutes,
    savedMinutes,
    nextWaterAt: calculatedAt + waterLeft * 60_000,
    fastestMatureAt: calculatedAt + Math.ceil(fastestLeftMinutes * 60) * 1_000,
  }
}

export function normaliseFarmSchedule(value, expectedCropType) {
  if (!value || typeof value !== 'object') return null
  if (value.schemaVersion !== FARM_SCHEDULE_SCHEMA_VERSION) return null

  const cropType = normaliseCropType(value.cropType)
  const expected = normaliseCropType(expectedCropType)
  if (!getFarmCropConfig(cropType) || (expected && cropType !== expected)) return null
  if (!expected && expectedCropType !== undefined) return null

  const minuteValues = {}
  for (const field of SCHEDULE_MINUTE_FIELDS) {
    const number = Number(value[field])
    if (!Number.isFinite(number) || number < 0) return null
    minuteValues[field] = number
  }
  if (minuteValues.matureLeftMinutes <= 0) return null

  const timestampValues = {}
  for (const field of SCHEDULE_TIMESTAMP_FIELDS) {
    const number = Number(value[field])
    if (!Number.isFinite(number) || number <= 0) return null
    timestampValues[field] = number
  }

  const config = getFarmCropConfig(cropType)
  if (
    minuteValues.matureLeftMinutes > config.baseMinutes
    || minuteValues.waterLeftMinutes > config.waterMaxMinutes
  ) return null

  return {
    schemaVersion: FARM_SCHEDULE_SCHEMA_VERSION,
    cropType,
    cropName: config.cropName,
    baseMinutes: config.baseMinutes,
    waterMaxMinutes: config.waterMaxMinutes,
    ...timestampValues,
    ...minuteValues,
  }
}

function localDateParts(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    date: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
  }
}

function localDayNumber(parts) {
  return Date.UTC(parts.year, parts.month, parts.date) / 86_400_000
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function formatFarmTargetTime(timestamp, now = Date.now(), { full = false } = {}) {
  const targetParts = localDateParts(timestamp)
  const nowParts = localDateParts(resolveNow(now))
  if (!targetParts || !nowParts) return '--'

  const time = `${pad2(targetParts.hours)}:${pad2(targetParts.minutes)}`
  if (full) {
    return `${targetParts.year}-${pad2(targetParts.month + 1)}-${pad2(targetParts.date)} ${time}`
  }

  const dayDifference = localDayNumber(targetParts) - localDayNumber(nowParts)
  if (dayDifference === 0) return `今日 ${time}`
  if (dayDifference === 1) return `明日 ${time}`
  return `${pad2(targetParts.month + 1)}-${pad2(targetParts.date)} ${time}`
}

export function formatFarmDuration(minutes) {
  const totalSeconds = Math.max(0, Math.ceil(Number(minutes) * 60))
  if (!Number.isFinite(totalSeconds) || totalSeconds === 0) return '0分钟'
  const hours = Math.floor(totalSeconds / 3_600)
  const mins = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return [
    hours ? `${hours}小时` : '',
    mins ? `${mins}分钟` : '',
    seconds ? `${seconds}秒` : '',
  ].join('')
}

export function farmScheduleSummary(schedule, now = Date.now()) {
  const normalised = normaliseFarmSchedule(schedule, schedule?.cropType)
  if (!normalised) return null
  return {
    cropLabel: cropTypeToLabel(normalised.cropType),
    nextWater: formatFarmTargetTime(normalised.nextWaterAt, now),
    fastestMature: formatFarmTargetTime(normalised.fastestMatureAt, now),
  }
}
