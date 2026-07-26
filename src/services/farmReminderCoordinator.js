import {
  FARM_REMINDER_TYPES,
  farmReminderTargetAt,
  normaliseFarmReminders,
} from '../domain/farmReminders.js'

function safeMessage(error, fallback = '系统提醒操作失败。') {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (!message) return fallback
  return message
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[已隐藏]')
    .replace(/ghp_[A-Za-z0-9]+/g, '[已隐藏]')
    .slice(0, 240)
}

function pendingExtra(notification) {
  return notification?.extra ?? notification?.data ?? {}
}

function isFarmPending(notification) {
  return pendingExtra(notification)?.source === 'farm-reminder'
}

function pendingTargetAt(notification) {
  const extraTarget = Number(pendingExtra(notification)?.targetAt)
  if (Number.isFinite(extraTarget)) return extraTarget
  const scheduleAt = notification?.schedule?.at
  const parsed = scheduleAt instanceof Date
    ? scheduleAt.getTime()
    : new Date(scheduleAt).getTime()
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function samePendingPlan(notification, plan) {
  return Number(notification?.id) === plan.notificationId
    && pendingTargetAt(notification) === plan.targetAt
    && notification?.title === plan.title
    && notification?.body === plan.body
    && pendingExtra(notification)?.serverId === plan.serverId
    && pendingExtra(notification)?.reminderType === plan.reminderType
}

function enabledReminderTargets(store, nowMs) {
  const result = []
  for (const server of store.getAllServersWithReminders()) {
    const reminders = normaliseFarmReminders(
      server.farmReminders,
      server.farmSchedule,
    )
    if (!reminders) continue
    FARM_REMINDER_TYPES.forEach((reminderType) => {
      if (!reminders[reminderType].enabled) return
      const targetAt = farmReminderTargetAt(server, reminderType)
      result.push({
        serverId: server.id,
        reminderType,
        notificationId: reminders[reminderType].notificationId,
        targetAt,
        past: !Number.isFinite(targetAt) || targetAt <= nowMs,
      })
    })
  }
  return result
}

export function createFarmReminderCoordinator({
  store,
  adapter,
  now = () => Date.now(),
}) {
  if (!store || !adapter) throw new Error('提醒协调器缺少 Store 或平台适配器。')

  let lastCapability = {
    capability: 'unsupported',
    displayPermission: 'unsupported',
    exactPermission: 'unsupported',
  }

  async function readCapability() {
    try {
      lastCapability = await adapter.checkCapability()
    } catch (error) {
      lastCapability = {
        capability: adapter.isSupported?.() ? 'denied' : 'unsupported',
        displayPermission: 'unknown',
        exactPermission: 'unknown',
        message: safeMessage(error, '无法读取系统提醒权限。'),
      }
    }
    return lastCapability
  }

  async function cancelNotificationIds(notificationIds) {
    const ids = [...new Set(notificationIds)]
      .map(Number)
      .filter((id) => Number.isInteger(id))
    if (!ids.length || !adapter.isSupported?.()) {
      return { cancelledCount: 0, failed: [] }
    }

    const failed = []
    try {
      await adapter.cancel(ids)
    } catch (error) {
      failed.push({
        serverId: '',
        reminderType: '',
        message: safeMessage(error, '取消系统提醒失败。'),
      })
    }
    try {
      await adapter.removeDelivered(ids)
    } catch (error) {
      failed.push({
        serverId: '',
        reminderType: '',
        message: safeMessage(error, '移除已显示通知失败。'),
      })
    }
    return {
      cancelledCount: failed.length ? 0 : ids.length,
      failed,
    }
  }

  async function synchronise() {
    const nowMs = Number(now())
    const targets = enabledReminderTargets(store, nowMs)
    const desiredPlans = store.getFarmReminderPlans(nowMs)
    const capabilityState = await readCapability()
    const result = {
      ...capabilityState,
      desiredCount: targets.length,
      scheduledCount: 0,
      createdCount: 0,
      cancelledCount: 0,
      skippedPastCount: targets.filter((target) => target.past).length,
      failed: [],
    }

    if (capabilityState.capability === 'unsupported') return result

    let pending = []
    try {
      pending = await adapter.getPending()
    } catch (error) {
      result.failed.push({
        serverId: '',
        reminderType: '',
        message: safeMessage(error, '读取系统提醒失败。'),
      })
      return result
    }

    const farmPending = pending.filter(isFarmPending)
    const desiredById = new Map(
      desiredPlans.map((plan) => [plan.notificationId, plan]),
    )
    const pendingById = new Map(
      farmPending.map((notification) => [Number(notification.id), notification]),
    )

    const cancelIds = farmPending
      .filter((notification) => {
        const plan = desiredById.get(Number(notification.id))
        return !plan || !samePendingPlan(notification, plan)
      })
      .map((notification) => Number(notification.id))

    if (!['exact', 'inexact'].includes(capabilityState.capability)) {
      desiredPlans.forEach((plan) => {
        if (pendingById.has(plan.notificationId)) cancelIds.push(plan.notificationId)
      })
    }

    const cancellation = await cancelNotificationIds(cancelIds)
    result.cancelledCount += cancellation.cancelledCount
    result.failed.push(...cancellation.failed)

    if (!['exact', 'inexact'].includes(capabilityState.capability)) return result

    for (const plan of desiredPlans) {
      const current = pendingById.get(plan.notificationId)
      if (current && samePendingPlan(current, plan) && !cancelIds.includes(plan.notificationId)) {
        result.scheduledCount += 1
        continue
      }
      try {
        await adapter.schedule([plan], {
          exact: capabilityState.capability === 'exact',
        })
        result.createdCount += 1
        result.scheduledCount += 1
      } catch (error) {
        result.failed.push({
          serverId: plan.serverId,
          reminderType: plan.reminderType,
          message: safeMessage(error, '系统提醒未设置。'),
        })
      }
    }

    return result
  }

  async function initialise() {
    if (adapter.isSupported?.()) {
      try {
        await adapter.ensureChannels()
      } catch (error) {
        return {
          ...(await readCapability()),
          desiredCount: 0,
          scheduledCount: 0,
          createdCount: 0,
          cancelledCount: 0,
          skippedPastCount: 0,
          failed: [{
            serverId: '',
            reminderType: '',
            message: safeMessage(error, '创建农场通知频道失败。'),
          }],
        }
      }
    }
    return synchronise()
  }

  return {
    initialise,
    synchronise,
    readCapability,
    cancelNotificationIds,
    getLastCapability: () => ({ ...lastCapability }),
  }
}
