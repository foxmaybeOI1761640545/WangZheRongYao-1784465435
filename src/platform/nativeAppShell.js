import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

const backHandlers = []
let nativeBackHandle = null
let formKeyboardCleanup = null

/**
 * 注册一个原生返回键处理器。优先级更高的处理器先执行；返回 true 表示已消费事件。
 */
export function registerNativeBackHandler(handler, priority = 0) {
  const entry = { handler, priority }
  backHandlers.push(entry)
  return () => {
    const index = backHandlers.indexOf(entry)
    if (index >= 0) backHandlers.splice(index, 1)
  }
}

async function dispatchBackHandlers() {
  const handlers = [...backHandlers].sort((left, right) => right.priority - left.priority)
  for (const entry of handlers) {
    try {
      if (await entry.handler()) return true
    } catch (error) {
      console.error('native back handler failed', error)
    }
  }
  return false
}

/**
 * 启动 Capacitor 返回键桥接。弹窗和编辑态优先关闭；未消费时使用 WebView 历史返回。
 */
export async function installNativeBackBridge() {
  if (!Capacitor.isNativePlatform() || nativeBackHandle) return

  document.documentElement.classList.add('capacitor-native')
  nativeBackHandle = await CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    if (await dispatchBackHandlers()) return
    if (canGoBack) window.history.back()
  })
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && !element.hidden
}

function isNavigationField(element) {
  if (element instanceof HTMLSelectElement) return !element.disabled
  if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color'].includes(element.type)
}

function formFields(form) {
  return [...form.querySelectorAll('input, select, textarea')]
    .filter((element) => !element.disabled && isVisible(element))
}

function applyEnterKeyHints(root = document) {
  for (const form of root.querySelectorAll?.('form') ?? []) {
    const fields = formFields(form).filter((element) => !(element instanceof HTMLTextAreaElement))
    fields.forEach((field, index) => {
      if (!field.hasAttribute('enterkeyhint')) {
        field.setAttribute('enterkeyhint', index === fields.length - 1 ? 'done' : 'next')
      }
    })
  }
}

/**
 * 统一处理实体键盘和 Android 软键盘 Enter：聚焦并全选下一字段；最后字段提交表单。
 * 多行文本框保留正常换行行为。
 */
export function installFormEnterNavigation() {
  if (formKeyboardCleanup) return formKeyboardCleanup

  const handleKeydown = (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
    const target = event.target
    if (!isNavigationField(target)) return

    const form = target.closest('form')
    if (!form) return
    const fields = formFields(form)
    const currentIndex = fields.indexOf(target)
    if (currentIndex < 0) return

    const next = fields.slice(currentIndex + 1).find((field) => field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)
    event.preventDefault()

    if (next) {
      next.focus({ preventScroll: true })
      if (next instanceof HTMLInputElement) next.select()
      requestAnimationFrame(() => next.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
      return
    }

    if (typeof form.requestSubmit === 'function') form.requestSubmit()
  }

  document.addEventListener('keydown', handleKeydown, true)
  applyEnterKeyHints()
  const observer = new MutationObserver(() => applyEnterKeyHints())
  observer.observe(document.body, { childList: true, subtree: true })

  formKeyboardCleanup = () => {
    document.removeEventListener('keydown', handleKeydown, true)
    observer.disconnect()
    formKeyboardCleanup = null
  }
  return formKeyboardCleanup
}
