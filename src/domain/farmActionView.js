export const FARM_ACTION_VIEW_STORAGE_KEY = 'wangzhe-account-manager:farm-action-view:v1'
export const FARM_ACTION_VIEW = Object.freeze({
  ACTION: 'action',
  ORIGINAL: 'original',
})

export function normaliseFarmActionView(value) {
  return value === FARM_ACTION_VIEW.ORIGINAL
    ? FARM_ACTION_VIEW.ORIGINAL
    : FARM_ACTION_VIEW.ACTION
}

export function readFarmActionView(storage = globalThis.localStorage) {
  try {
    return normaliseFarmActionView(storage?.getItem(FARM_ACTION_VIEW_STORAGE_KEY))
  } catch {
    return FARM_ACTION_VIEW.ACTION
  }
}

export function writeFarmActionView(value, storage = globalThis.localStorage) {
  const normalised = normaliseFarmActionView(value)
  try {
    storage?.setItem(FARM_ACTION_VIEW_STORAGE_KEY, normalised)
  } catch {
    // UI preference storage failures must not affect account data.
  }
  return normalised
}
