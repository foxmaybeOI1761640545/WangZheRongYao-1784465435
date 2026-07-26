export function createWebFarmReminderMonitor({
  getPlans,
  notify,
  now = () => Date.now(),
}) {
  const startedAt = Number(now())
  const seen = new Set()

  function occurrenceKey(plan) {
    return `${plan.key}:${plan.targetAt}`
  }

  function prime(at = now()) {
    const nowMs = Number(at)
    for (const plan of getPlans()) {
      if (plan.targetAt <= nowMs) seen.add(occurrenceKey(plan))
    }
  }

  function check(at = now()) {
    const nowMs = Number(at)
    let notifiedCount = 0
    for (const plan of getPlans()) {
      const key = occurrenceKey(plan)
      if (
        seen.has(key)
        || plan.targetAt > nowMs
        || plan.targetAt <= startedAt
      ) continue
      seen.add(key)
      if (notify(plan)) notifiedCount += 1
    }
    return notifiedCount
  }

  prime(startedAt)

  return {
    prime,
    check,
    hasSeen: (plan) => seen.has(occurrenceKey(plan)),
  }
}
