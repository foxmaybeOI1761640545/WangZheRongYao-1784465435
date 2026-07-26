import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { FARM_REMINDER_CHANNELS } from '../domain/farmReminders.js'

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function notificationExtra(notification) {
  return notification?.extra ?? notification?.data ?? {}
}

export function createFarmReminderAdapter() {
  async function checkCapability() {
    if (!isAndroidNative()) {
      return {
        capability: 'unsupported',
        displayPermission: 'unsupported',
        exactPermission: 'unsupported',
      }
    }

    const [display, exact] = await Promise.all([
      LocalNotifications.checkPermissions(),
      LocalNotifications.checkExactNotificationSetting(),
    ])
    const displayPermission = display.display
    const exactPermission = exact.exact_alarm
    return {
      capability: displayPermission === 'granted'
        ? (exactPermission === 'granted' ? 'exact' : 'inexact')
        : 'denied',
      displayPermission,
      exactPermission,
    }
  }

  async function ensureChannels() {
    if (!isAndroidNative()) return
    for (const channel of Object.values(FARM_REMINDER_CHANNELS)) {
      await LocalNotifications.createChannel({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        importance: 4,
        visibility: 0,
        vibration: true,
        lights: true,
      })
    }
  }

  async function requestDisplayPermission() {
    if (!isAndroidNative()) return 'unsupported'
    const result = await LocalNotifications.requestPermissions()
    return result.display
  }

  async function openExactNotificationSetting() {
    if (!isAndroidNative()) return 'unsupported'
    const result = await LocalNotifications.changeExactNotificationSetting()
    return result.exact_alarm
  }

  async function schedule(plans, { exact = false } = {}) {
    if (!isAndroidNative() || !plans.length) return []
    const result = await LocalNotifications.schedule({
      notifications: plans.map((plan) => ({
        id: plan.notificationId,
        title: plan.title,
        body: plan.body,
        channelId: plan.channelId,
        autoCancel: true,
        group: 'farm-reminders',
        schedule: {
          at: new Date(plan.targetAt),
          allowWhileIdle: Boolean(exact),
        },
        extra: plan.extra,
      })),
    })
    return result.notifications
  }

  async function cancel(notificationIds) {
    if (!isAndroidNative() || !notificationIds.length) return
    await LocalNotifications.cancel({
      notifications: notificationIds.map((id) => ({ id })),
    })
  }

  async function getPending() {
    if (!isAndroidNative()) return []
    const result = await LocalNotifications.getPending()
    return result.notifications ?? []
  }

  async function removeDelivered(notificationIds) {
    if (!isAndroidNative() || !notificationIds.length) return
    const idSet = new Set(notificationIds)
    const delivered = await LocalNotifications.getDeliveredNotifications()
    const matching = (delivered.notifications ?? [])
      .filter((notification) => idSet.has(Number(notification.id)))
      .map((notification) => ({ id: Number(notification.id) }))
    if (matching.length) {
      await LocalNotifications.removeDeliveredNotifications({
        notifications: matching,
      })
    }
  }

  async function addActionListener(listener) {
    if (!isAndroidNative()) return () => {}
    const handle = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const notification = action?.notification ?? {}
        listener({
          actionId: action?.actionId,
          notificationId: Number(notification.id),
          extra: notificationExtra(notification),
        })
      },
    )
    return () => handle.remove()
  }

  async function addAppStateListener(listener) {
    if (!Capacitor.isNativePlatform()) return () => {}
    const handle = await CapacitorApp.addListener('appStateChange', listener)
    return () => handle.remove()
  }

  return {
    isSupported: isAndroidNative,
    checkCapability,
    ensureChannels,
    requestDisplayPermission,
    openExactNotificationSetting,
    schedule,
    cancel,
    getPending,
    removeDelivered,
    addActionListener,
    addAppStateListener,
  }
}

export function browserNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestBrowserNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

export function showBrowserFarmNotification(plan, onClick) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const notification = new Notification(plan.title, {
    body: plan.body,
    tag: plan.key,
    data: plan.extra,
  })
  notification.onclick = () => {
    window.focus()
    onClick?.(plan)
    notification.close()
  }
  return true
}
