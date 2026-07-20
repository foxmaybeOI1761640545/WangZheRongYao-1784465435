import { ref, watch } from 'vue'

/**
 * 创建一个自动写入 localStorage 的响应式状态。
 *
 * 这是一个最小化 composable 示例，演示如何把可复用状态逻辑
 * 从页面组件中抽离。真实项目中可按相同方式封装请求、主题或权限逻辑。
 */
export function usePersistentState(key, initialValue) {
  const state = ref(readStoredValue(key, initialValue))

  watch(
    state,
    (value) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { deep: true },
  )

  return state
}

function readStoredValue(key, fallbackValue) {
  const storedValue = localStorage.getItem(key)
  if (storedValue === null) return fallbackValue

  try {
    return JSON.parse(storedValue)
  } catch {
    localStorage.removeItem(key)
    return fallbackValue
  }
}
