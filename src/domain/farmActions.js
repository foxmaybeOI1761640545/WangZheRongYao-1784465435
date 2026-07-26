import { normaliseCropType } from './cropTypes.js'
import { normaliseFarmSchedule } from './farmCalculator.js'
import { formatFarmCountdown } from './farmReminders.js'

export const WATER_ATTENTION_WINDOW_MS = 30 * 60_000
export const HARVEST_SOON_WINDOW_MS = 2 * 60 * 60_000

export const FARM_ACTION_STATUS = Object.freeze({
  HARVEST_DUE: 'harvest-due',
  WATER: 'water',
  HARVEST_SOON: 'harvest-soon',
  GROWING: 'growing',
  UNSCHEDULED: 'unscheduled',
  UNRECORDED: 'unrecorded',
})

export const FARM_ACTION_PRIORITY = Object.freeze({
  [FARM_ACTION_STATUS.HARVEST_DUE]: 0,
  [FARM_ACTION_STATUS.WATER]: 1,
  [FARM_ACTION_STATUS.HARVEST_SOON]: 2,
  [FARM_ACTION_STATUS.GROWING]: 3,
  [FARM_ACTION_STATUS.UNSCHEDULED]: 4,
  [FARM_ACTION_STATUS.UNRECORDED]: 5,
})

export const FARM_ACTION_STATUS_ORDER = Object.freeze([
  FARM_ACTION_STATUS.HARVEST_DUE,
  FARM_ACTION_STATUS.WATER,
  FARM_ACTION_STATUS.HARVEST_SOON,
  FARM_ACTION_STATUS.GROWING,
  FARM_ACTION_STATUS.UNSCHEDULED,
  FARM_ACTION_STATUS.UNRECORDED,
])

export const FARM_ACTION_STATUS_META = Object.freeze({
  [FARM_ACTION_STATUS.HARVEST_DUE]: Object.freeze({
    label: '可以收获',
    icon: '●',
    cssClass: 'farm-action-harvest-due',
  }),
  [FARM_ACTION_STATUS.WATER]: Object.freeze({
    label: '需要浇水',
    icon: '◆',
    cssClass: 'farm-action-water',
  }),
  [FARM_ACTION_STATUS.HARVEST_SOON]: Object.freeze({
    label: '即将成熟',
    icon: '◐',
    cssClass: 'farm-action-harvest-soon',
  }),
  [FARM_ACTION_STATUS.GROWING]: Object.freeze({
    label: '生长中',
    icon: '↑',
    cssClass: 'farm-action-growing',
  }),
  [FARM_ACTION_STATUS.UNSCHEDULED]: Object.freeze({
    label: '未计算时间',
    icon: '◇',
    cssClass: 'farm-action-unscheduled',
  }),
  [FARM_ACTION_STATUS.UNRECORDED]: Object.freeze({
    label: '未记录作物',
    icon: '—',
    cssClass: 'farm-action-unrecorded',
  }),
})

const PRIMARY_COMMANDS = Object.freeze({
  [FARM_ACTION_STATUS.HARVEST_DUE]: Object.freeze({
    key: 'reset-cycle',
    label: '已收获并重新种植',
  }),
  [FARM_ACTION_STATUS.WATER]: Object.freeze({
    key: 'recalculate',
    label: '浇水后重算',
  }),
  [FARM_ACTION_STATUS.HARVEST_SOON]: Object.freeze({
    key: 'view-time',
    label: '查看时间',
  }),
  [FARM_ACTION_STATUS.GROWING]: Object.freeze({
    key: 'view-time',
    label: '查看时间',
  }),
  [FARM_ACTION_STATUS.UNSCHEDULED]: Object.freeze({
    key: 'calculate',
    label: '计算时间',
  }),
  [FARM_ACTION_STATUS.UNRECORDED]: Object.freeze({
    key: 'set-crop',
    label: '设置作物',
  }),
})

function resolveNowMs(nowMs) {
  const value = Number(nowMs)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('行动状态 nowMs 必须是有效时间戳。')
  }
  return value
}

function action(status, overrides = {}) {
  const meta = FARM_ACTION_STATUS_META[status]
  return {
    status,
    priority: FARM_ACTION_PRIORITY[status],
    label: meta.label,
    icon: meta.icon,
    cssClass: meta.cssClass,
    targetType: '',
    targetAt: null,
    ...overrides,
  }
}

export function classifyFarmAction(server, nowMs) {
  const now = resolveNowMs(nowMs)
  const cropType = normaliseCropType(server?.cropType)
  if (!cropType) return action(FARM_ACTION_STATUS.UNRECORDED)

  const schedule = normaliseFarmSchedule(server?.farmSchedule, cropType)
  if (!schedule) return action(FARM_ACTION_STATUS.UNSCHEDULED)

  if (schedule.fastestMatureAt <= now) {
    return action(FARM_ACTION_STATUS.HARVEST_DUE, {
      targetType: 'harvest',
      targetAt: schedule.fastestMatureAt,
    })
  }

  if (schedule.nextWaterAt <= now + WATER_ATTENTION_WINDOW_MS) {
    return action(FARM_ACTION_STATUS.WATER, {
      label: schedule.nextWaterAt <= now
        ? '需要浇水'
        : `${formatFarmCountdown(schedule.nextWaterAt, now)}后浇水`,
      targetType: 'water',
      targetAt: schedule.nextWaterAt,
    })
  }

  if (schedule.fastestMatureAt <= now + HARVEST_SOON_WINDOW_MS) {
    return action(FARM_ACTION_STATUS.HARVEST_SOON, {
      targetType: 'harvest',
      targetAt: schedule.fastestMatureAt,
    })
  }

  return action(FARM_ACTION_STATUS.GROWING, {
    targetType: 'harvest',
    targetAt: schedule.fastestMatureAt,
  })
}

function emptySummary() {
  return {
    total: 0,
    [FARM_ACTION_STATUS.HARVEST_DUE]: 0,
    [FARM_ACTION_STATUS.WATER]: 0,
    [FARM_ACTION_STATUS.HARVEST_SOON]: 0,
    [FARM_ACTION_STATUS.GROWING]: 0,
    [FARM_ACTION_STATUS.UNSCHEDULED]: 0,
    [FARM_ACTION_STATUS.UNRECORDED]: 0,
  }
}

export function analyseFarmActionRecords(records, nowMs) {
  const source = Array.isArray(records) ? records : []
  const summary = emptySummary()
  const classified = source.map((record, originalIndex) => {
    const farmAction = classifyFarmAction(record?.server, nowMs)
    summary.total += 1
    summary[farmAction.status] += 1
    return {
      ...record,
      originalIndex,
      farmAction,
    }
  })
  const sortedRecords = [...classified].sort((left, right) => (
    left.farmAction.priority - right.farmAction.priority
    || left.originalIndex - right.originalIndex
  ))
  return { records: sortedRecords, summary }
}

export function sortFarmActionRecords(records, nowMs) {
  return analyseFarmActionRecords(records, nowMs).records
}

export function summariseFarmActions(records, nowMs) {
  return analyseFarmActionRecords(records, nowMs).summary
}

export function farmActionStatusLabel(farmAction) {
  return String(
    farmAction?.label
    ?? FARM_ACTION_STATUS_META[farmAction?.status]?.label
    ?? '',
  )
}

export function farmActionAriaLabel(server, farmAction) {
  const serverName = String(server?.serverName ?? '').trim() || '未命名区服'
  const accountId = String(server?.accountId ?? '').trim() || '未填写 ID'
  return `${serverName}，${accountId}，${farmActionStatusLabel(farmAction)}`
}

export function farmActionPrimaryCommand(farmAction) {
  const status = typeof farmAction === 'string' ? farmAction : farmAction?.status
  return PRIMARY_COMMANDS[status] ?? null
}
