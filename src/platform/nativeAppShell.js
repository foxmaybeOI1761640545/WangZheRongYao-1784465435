import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

const backHandlers = []
let nativeBackHandle = null
let formKeyboardCleanup = null

/** 注册原生返回键处理器；优先级更高的处理器先执行。 */
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

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && !element.hidden
}

/** 优先关闭最上层弹窗，复用页面已有关闭按钮，避免复制组件状态。 */
function closeVisibleOverlay() {
  const overlays = [...document.querySelectorAll('.modal-backdrop')].filter(isVisible)
  const overlay = overlays.at(-1)
  if (!overlay) return false

  const closeButton = overlay.querySelector(
    '[aria-label^="关闭"], [aria-label*="关闭"], .modal-heading .icon-button, .backup-close',
  )
  if (closeButton instanceof HTMLElement) {
    closeButton.click()
    return true
  }
  return false
}

/** 完整编辑表单不是弹窗；返回键先触发“取消”，再允许离开详情页。 */
function cancelVisibleEditor() {
  const editor = document.querySelector('.editor-panel')
  if (!isVisible(editor)) return false
  const cancelButton = [...editor.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '取消')
  if (!(cancelButton instanceof HTMLElement)) return false
  cancelButton.click()
  return true
}

/**
 * 启动 Capacitor 返回键桥接：弹窗 → 编辑态 → 注册处理器 → WebView 历史。
 * 根页面没有可返回历史时不强制退出，避免误触关闭应用。
 */
export async function installNativeBackBridge() {
  if (!Capacitor.isNativePlatform() || nativeBackHandle) return

  document.documentElement.classList.add('capacitor-native')
  nativeBackHandle = await CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    if (closeVisibleOverlay()) return
    if (cancelVisibleEditor()) return
    if (await dispatchBackHandlers()) return
    if (canGoBack) window.history.back()
  })
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
 * Android 软键盘和实体键盘 Enter：前往下一字段并全选；最后字段提交表单。
 * 多行文本框保留换行行为。
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

    const next = fields.slice(currentIndex + 1)
      .find((field) => field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)
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
