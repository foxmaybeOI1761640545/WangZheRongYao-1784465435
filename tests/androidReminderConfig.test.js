import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appManifest = readFileSync(
  new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
)
const pluginManifest = readFileSync(
  new URL(
    '../node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml',
    import.meta.url,
  ),
  'utf8',
)

test('app requests user-controlled exact alarm access without restricted alarm permission', () => {
  assert.match(appManifest, /android\.permission\.SCHEDULE_EXACT_ALARM/)
  assert.doesNotMatch(appManifest, /android\.permission\.USE_EXACT_ALARM/)
  assert.doesNotMatch(appManifest, /android\.permission\.POST_NOTIFICATIONS/)
})

test('local notification plugin contributes permissions and restore receivers', () => {
  for (const permission of [
    'POST_NOTIFICATIONS',
    'RECEIVE_BOOT_COMPLETED',
    'WAKE_LOCK',
  ]) {
    assert.match(pluginManifest, new RegExp(`android\\.permission\\.${permission}`))
  }

  for (const receiver of [
    'TimedNotificationPublisher',
    'NotificationDismissReceiver',
    'LocalNotificationRestoreReceiver',
  ]) {
    assert.match(pluginManifest, new RegExp(receiver))
  }

  for (const action of [
    'LOCKED_BOOT_COMPLETED',
    'BOOT_COMPLETED',
    'QUICKBOOT_POWERON',
  ]) {
    assert.match(pluginManifest, new RegExp(action))
  }
})
