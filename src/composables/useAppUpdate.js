import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { reactive, ref } from 'vue'
import { AppUpdate } from '../plugins/AppUpdate.js'

const DEFAULT_REPOSITORY = 'foxmaybeOI1761640545/WangZheRongYao-1784465435'

const state = reactive({
  currentVersionName: '1.0.0',
  currentVersionCode: 1_000_000,
  repository: DEFAULT_REPOSITORY,
  channel: 'beta',
  available: false,
  status: 'idle',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  latestVersionName: '',
  latestVersionCode: 0,
  minimumSupportedVersionCode: 0,
  mandatory: false,
  prerelease: false,
  publishedAt: '',
  releaseNotes: [],
  apkUrl: '',
  sha256: '',
  size: 0,
  releasePageUrl: '',
  downloadedFile: '',
  error: '',
  lastCheckedAt: 0,
})

const initialized = ref(false)
const initializing = ref(false)
const checking = ref(false)
const downloading = ref(false)
const installing = ref(false)
const testing = ref(false)
const message = ref('')
const githubTest = reactive({ tested: false, ok: false, message: '', latencyMs: 0 })
const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

let updateListener = null
let appStateListener = null
let retryInstallOnResume = false

function applyState(nextState = {}) {
  const normalizedNotes = Array.isArray(nextState.releaseNotes) ? nextState.releaseNotes : []
  Object.assign(state, nextState, { releaseNotes: normalizedNotes })
  checking.value = false
  downloading.value = state.status === 'pending' || state.status === 'running'
  if (state.status === 'failed' && state.error) message.value = state.error
}

function readableError(error, fallback) {
  return error?.message || String(error || fallback)
}

async function initialize() {
  if (!isAndroid || initialized.value || initializing.value) return
  initializing.value = true
  try {
    applyState(await AppUpdate.getUpdateState())
    updateListener = await AppUpdate.addListener('updateDownloadState', applyState)
    appStateListener = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive || !retryInstallOnResume) return
      retryInstallOnResume = false
      await installUpdate()
    })
    initialized.value = true
    await checkForUpdate(false)
  } catch (error) {
    message.value = readableError(error, '初始化版本更新失败')
  } finally {
    initializing.value = false
  }
}

async function checkForUpdate(manual = true) {
  if (!isAndroid || checking.value) return state
  checking.value = true
  message.value = manual ? '正在连接 GitHub 检查新版本…' : ''
  try {
    const nextState = await AppUpdate.checkForUpdate({ channel: state.channel, manual })
    applyState(nextState)
    if (manual) message.value = nextState.available
      ? `发现新版本 ${nextState.latestVersionName}`
      : '当前已经是该通道的最新版本'
    return nextState
  } catch (error) {
    message.value = readableError(error, '检查更新失败')
    return state
  } finally {
    checking.value = false
  }
}

async function setChannel(channel) {
  if (!isAndroid) return
  const normalized = channel === 'stable' ? 'stable' : 'beta'
  try {
    applyState(await AppUpdate.setUpdateChannel({ channel: normalized }))
    githubTest.tested = false
    await checkForUpdate(true)
  } catch (error) {
    message.value = readableError(error, '切换更新通道失败')
  }
}

async function testGithubConnection() {
  if (!isAndroid || testing.value) return
  testing.value = true
  githubTest.tested = false
  message.value = '正在测试 GitHub 更新服务…'
  try {
    const result = await AppUpdate.testGithubConnection()
    Object.assign(githubTest, { tested: true, ...result })
    message.value = result.message
  } catch (error) {
    Object.assign(githubTest, {
      tested: true,
      ok: false,
      message: readableError(error, 'GitHub 连接测试失败'),
      latencyMs: 0,
    })
    message.value = githubTest.message
  } finally {
    testing.value = false
  }
}

async function downloadUpdate() {
  if (!isAndroid || downloading.value) return
  downloading.value = true
  message.value = '正在提交更新下载任务…'
  try {
    applyState(await AppUpdate.downloadUpdate())
    message.value = '更新包将在系统下载服务中下载，可以暂时离开此页面'
  } catch (error) {
    message.value = readableError(error, '开始下载失败')
    downloading.value = false
  }
}

async function installUpdate() {
  if (!isAndroid || installing.value) return
  installing.value = true
  message.value = '正在校验更新包并打开系统安装器…'
  try {
    const result = await AppUpdate.installDownloadedUpdate()
    if (result.requiresPermission) {
      retryInstallOnResume = true
      message.value = '请允许此应用安装未知来源应用，返回后会继续打开安装器'
      await AppUpdate.openUnknownSourceSettings()
    } else if (result.started) {
      message.value = '已打开系统安装器，请确认覆盖安装'
    }
  } catch (error) {
    message.value = readableError(error, '无法安装更新')
  } finally {
    installing.value = false
  }
}

async function refreshState() {
  if (!isAndroid) return state
  try {
    applyState(await AppUpdate.getUpdateState())
  } catch (error) {
    message.value = readableError(error, '读取更新状态失败')
  }
  return state
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / (1024 ** index)
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

function releaseDateText(value) {
  if (!value) return '未提供'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function useAppUpdate() {
  return {
    state,
    initialized,
    initializing,
    checking,
    downloading,
    installing,
    testing,
    message,
    githubTest,
    isAndroid,
    initialize,
    refreshState,
    checkForUpdate,
    setChannel,
    testGithubConnection,
    downloadUpdate,
    installUpdate,
    formatBytes,
    releaseDateText,
  }
}
