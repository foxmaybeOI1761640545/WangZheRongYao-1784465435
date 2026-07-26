import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

const nowMs = ref(Date.now())
let users = 0
let timerId = null
let visibilityInstalled = false

export function refreshFarmClock() {
  nowMs.value = Date.now()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') refreshFarmClock()
}

function startClock() {
  if (!timerId) timerId = window.setInterval(refreshFarmClock, 30_000)
  if (!visibilityInstalled) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    visibilityInstalled = true
  }
}

function stopClock() {
  if (timerId) {
    window.clearInterval(timerId)
    timerId = null
  }
  if (visibilityInstalled) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    visibilityInstalled = false
  }
}

export function useFarmClock() {
  onMounted(() => {
    users += 1
    refreshFarmClock()
    startClock()
  })
  onBeforeUnmount(() => {
    users = Math.max(0, users - 1)
    if (!users) stopClock()
  })
  return readonly(nowMs)
}
