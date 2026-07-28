<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  createBackupSnapshot,
  extractSnapshotRoot,
  SNAPSHOT_SCHEMA_VERSION,
} from '../domain/accountBackup.js'

const CONFIG_KEY = 'wangzhe-account-backup-config:v1'
const PAT_STORAGE_KEY = 'wangzhe-account-backup-pat:v1'
const PAT_REMEMBER_KEY = 'wangzhe-account-backup-remember-pat:v1'
const DATA_STORAGE_KEY = 'wangzhe-account-manager:v1'
const DEFAULT_CONFIG = Object.freeze({
  owner: 'foxmaybeOI1761640545',
  repository: 'WangZheRongYao-1784465435',
  branch: 'backup/1784534225/AccountData',
  rootDirectory: 'AccountData01',
})

const props = defineProps({
  stats: { type: Object, required: true },
  cloudSync: { type: Object, required: true },
  cloudStatus: { type: Object, required: true },
})

const emit = defineEmits(['close', 'import-root'])

function cleanText(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

function safeStorageGet(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage failure does not block current-session use.
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage cleanup failures.
  }
}

function loadConfig() {
  try {
    const saved = JSON.parse(safeStorageGet(CONFIG_KEY, '{}'))
    return {
      owner: cleanText(saved.owner, DEFAULT_CONFIG.owner),
      repository: cleanText(saved.repository, DEFAULT_CONFIG.repository),
      branch: cleanText(saved.branch, DEFAULT_CONFIG.branch),
      rootDirectory: cleanText(saved.rootDirectory, DEFAULT_CONFIG.rootDirectory),
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

const rememberPat = ref(safeStorageGet(PAT_REMEMBER_KEY, 'true') !== 'false')
const config = reactive(loadConfig())
const pat = ref(rememberPat.value ? safeStorageGet(PAT_STORAGE_KEY) : '')
const busy = ref(false)
const testingPat = ref(false)
const cloudBusy = ref(false)
const historyBusy = ref(false)
const cloudHistory = ref([])
const selectedHistoryRevision = ref('')
const selectedRecoveryIndex = ref('')
const importInput = ref(null)
const notice = reactive({ type: '', text: '', url: '' })

watch(
  config,
  (value) => {
    safeStorageSet(CONFIG_KEY, JSON.stringify({
      owner: value.owner,
      repository: value.repository,
      branch: value.branch,
      rootDirectory: value.rootDirectory,
    }))
  },
  { deep: true },
)

watch(
  rememberPat,
  (remember) => {
    safeStorageSet(PAT_REMEMBER_KEY, String(remember))
    if (remember && pat.value.trim()) safeStorageSet(PAT_STORAGE_KEY, pat.value)
    if (!remember) safeStorageRemove(PAT_STORAGE_KEY)
  },
  { immediate: true },
)

watch(pat, (value) => {
  if (!rememberPat.value) return
  if (value.trim()) safeStorageSet(PAT_STORAGE_KEY, value)
  else safeStorageRemove(PAT_STORAGE_KEY)
})

function normaliseDirectory(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

function encodePath(path) {
  return String(path).split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

const repositoryUrl = computed(() => {
  const owner = cleanText(config.owner)
  const repository = cleanText(config.repository)
  return owner && repository
    ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
    : ''
})

const backupDirectoryUrl = computed(() => {
  const owner = cleanText(config.owner)
  const repository = cleanText(config.repository)
  const branch = cleanText(config.branch)
  const rootDirectory = normaliseDirectory(config.rootDirectory)
  if (!owner || !repository || !branch || !rootDirectory) return ''
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tree/${encodePath(branch)}/${encodePath(rootDirectory)}`
})

const backupTarget = computed(() => {
  const root = normaliseDirectory(config.rootDirectory)
  return `${cleanText(config.owner)}/${cleanText(config.repository)} · ${cleanText(config.branch)} · ${root || '(root)'}`
})

function resetNotice() {
  Object.assign(notice, { type: '', text: '', url: '' })
}

function setNotice(type, text, url = '') {
  Object.assign(notice, { type, text, url })
}

function resetDefaults() {
  Object.assign(config, DEFAULT_CONFIG)
  resetNotice()
}

function clearSavedPat() {
  safeStorageRemove(PAT_STORAGE_KEY)
  pat.value = ''
  setNotice('success', '已清除当前浏览器中保存的 PAT。')
}

function validateConfig() {
  const owner = cleanText(config.owner)
  const repository = cleanText(config.repository)
  const branch = cleanText(config.branch)
  const rootDirectory = normaliseDirectory(config.rootDirectory)

  if (!owner || !repository || !branch || !rootDirectory) {
    throw new Error('GitHub 用户名、仓库名、分支名和根目录都不能为空。')
  }
  if (rootDirectory.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('根目录不能包含空路径、`.` 或 `..`。')
  }
  if (/\s/.test(owner) || /\s/.test(repository) || /\s/.test(branch)) {
    throw new Error('GitHub 用户名、仓库名和分支名不能包含空格。')
  }
  if (!pat.value.trim()) {
    throw new Error('请输入具备目标仓库 Contents 写入权限的 PAT。')
  }

  return { owner, repository, branch, rootDirectory }
}

function githubHeaders(token, includeContentType = false) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function readGithubJson(endpoint, token) {
  const response = await fetch(endpoint, {
    headers: githubHeaders(token),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload.message ? `：${payload.message}` : ''
    throw new Error(`GitHub 检查失败（HTTP ${response.status}）${detail}`)
  }
  return payload
}

async function testPat() {
  resetNotice()
  testingPat.value = true

  try {
    const target = validateConfig()
    const token = pat.value.trim()
    const repositoryEndpoint = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}`
    const branchEndpoint = `${repositoryEndpoint}/branches/${encodeURIComponent(target.branch)}`
    const directoryEndpoint = `${repositoryEndpoint}/contents/${encodePath(target.rootDirectory)}?ref=${encodeURIComponent(target.branch)}`

    const [repositoryInfo, branchInfo, directoryInfo] = await Promise.all([
      readGithubJson(repositoryEndpoint, token),
      readGithubJson(branchEndpoint, token),
      readGithubJson(directoryEndpoint, token),
    ])

    const permissions = repositoryInfo.permissions
    const permissionReported = permissions && typeof permissions.push === 'boolean'
    const canWrite = Boolean(permissions?.push || permissions?.admin)
    if (permissionReported && !canWrite) {
      throw new Error('PAT 已通过仓库、分支和目录读取测试，但 GitHub 报告该令牌没有仓库写入权限。请授予 Contents: Read and write。')
    }

    const itemCount = Array.isArray(directoryInfo) ? directoryInfo.length : 1
    const writeResult = permissionReported
      ? '仓库写入权限可用'
      : '读取测试通过，但响应未明确返回写入权限；首次实际备份仍是最终验证'

    setNotice(
      'success',
      `PAT 测试通过：仓库可访问；分支 ${branchInfo.name || target.branch} 存在；目录 ${target.rootDirectory} 可读取（${itemCount} 项）；${writeResult}。`,
      backupDirectoryUrl.value,
    )
  } catch (error) {
    setNotice('error', error.message || 'PAT 测试失败。')
  } finally {
    testingPat.value = false
  }
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function readCurrentRoot() {
  try {
    const raw = JSON.parse(safeStorageGet(DATA_STORAGE_KEY, 'null'))
    if (raw?.type === 'group') return raw
  } catch {
    // Fall through to an empty root snapshot.
  }
  return {
    id: 'root',
    type: 'group',
    name: '全部账号',
    parentId: null,
    createdAt: Date.now(),
    children: [],
  }
}

function createSnapshot() {
  return createBackupSnapshot({
    root: readCurrentRoot(),
    stats: props.stats,
  })
}

function snapshotJson() {
  return JSON.stringify(createSnapshot(), null, 2)
}

function timestampName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function downloadExport() {
  resetNotice()
  try {
    const blob = new Blob([snapshotJson()], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `wangzhe-account-data-${timestampName()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice('success', '已导出 JSON 文件。该文件不包含 PAT 或 GitHub 配置。')
  } catch (error) {
    setNotice('error', error.message || '导出失败。')
  }
}

function openImportPicker() {
  resetNotice()
  importInput.value?.click()
}

async function importFile(event) {
  const [file] = event.target.files || []
  event.target.value = ''
  if (!file) return

  try {
    const payload = JSON.parse(await file.text())
    const confirmed = window.confirm(
      `恢复备份会覆盖当前浏览器中的 ${props.stats.groups} 个分组和 ${props.stats.servers} 个区服。确定继续吗？`,
    )
    if (!confirmed) return

    const root = extractSnapshotRoot(payload)
    emit('import-root', root)
    setNotice('success', '备份数据已写入本地，并已加入云同步队列。')
  } catch (error) {
    setNotice('error', error.message || '无法读取该备份文件。')
  }
}

async function runCloudAction(action, successText) {
  resetNotice()
  cloudBusy.value = true
  try {
    await action()
    setNotice('success', successText)
  } catch (error) {
    setNotice('error', error.message || '云同步操作失败。')
  } finally {
    cloudBusy.value = false
  }
}

function syncNow() {
  return runCloudAction(
    () => props.cloudSync.syncNow(),
    '已完成一次云同步检查。',
  )
}

function reloadFromCloud() {
  if (!window.confirm('将使用当前云端版本替换本机账号树。操作前会自动保存本地恢复点，确定继续吗？')) return
  return runCloudAction(
    () => props.cloudSync.reloadFromCloud(),
    '已从云端重新加载，并保留操作前的本地恢复点。',
  )
}

async function loadCloudHistory() {
  resetNotice()
  historyBusy.value = true
  try {
    cloudHistory.value = await props.cloudSync.listHistory()
    if (!selectedHistoryRevision.value && cloudHistory.value.length) {
      selectedHistoryRevision.value = String(cloudHistory.value[0].revision)
    }
    setNotice('success', `已读取 ${cloudHistory.value.length} 个云端历史版本。`)
  } catch (error) {
    setNotice('error', error.message || '读取云端历史失败。')
  } finally {
    historyBusy.value = false
  }
}

function restoreCloudHistory() {
  const revision = Number(selectedHistoryRevision.value)
  if (!Number.isFinite(revision)) {
    setNotice('error', '请先选择一个云端历史版本。')
    return
  }
  if (!window.confirm(`将把 revision ${revision} 作为新的云端版本恢复。操作前会保存本地恢复点，确定继续吗？`)) return
  return runCloudAction(
    () => props.cloudSync.restoreHistory(revision),
    `已将历史 revision ${revision} 恢复为新的云端版本。`,
  )
}

function toggleCloudPaused() {
  const paused = props.cloudSync.setPaused(!props.cloudStatus.paused)
  setNotice('success', paused ? '本设备自动同步已暂停。' : '本设备自动同步已恢复。')
}

function clearCloudError() {
  props.cloudSync.clearError()
  setNotice('success', '已清除本机同步错误显示。')
}

const recoveries = computed(() => props.cloudSync.getRecoveries())

function exportSelectedRecovery() {
  const recovery = recoveries.value[Number(selectedRecoveryIndex.value)]
  if (!recovery) {
    setNotice('error', '请先选择一个本地恢复点。')
    return
  }
  const blob = new Blob([JSON.stringify(recovery, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `wangzhe-cloud-recovery-${timestampName()}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  setNotice('success', '已导出本地同步恢复点。')
}

function restoreSelectedRecovery() {
  const index = Number(selectedRecoveryIndex.value)
  if (!recoveries.value[index]) {
    setNotice('error', '请先选择一个本地恢复点。')
    return
  }
  if (!window.confirm('将使用选中的本地恢复点替换当前账号树，并作为本地修改同步。确定继续吗？')) return
  return runCloudAction(
    () => props.cloudSync.restoreRecovery(index),
    '已恢复本地同步恢复点，并加入同步队列。',
  )
}

async function backupToGitHub() {
  resetNotice()
  busy.value = true

  try {
    const target = validateConfig()
    const now = new Date()
    const fileName = `account-data-${timestampName(now)}.json`
    const filePath = `${target.rootDirectory}/${fileName}`
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}/contents/${encodePath(filePath)}`
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: githubHeaders(pat.value.trim(), true),
      body: JSON.stringify({
        message: `data(backup): 保存账号数据快照 ${now.toISOString()} | Save account data snapshot`,
        content: encodeBase64Utf8(snapshotJson()),
        branch: target.branch,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.message ? `：${payload.message}` : ''
      throw new Error(`GitHub 备份失败（HTTP ${response.status}）${detail}`)
    }

    const fallbackUrl = `${repositoryUrl.value}/blob/${encodePath(target.branch)}/${encodePath(filePath)}`
    setNotice('success', `备份成功：${filePath}`, payload.content?.html_url || fallbackUrl)
    if (!rememberPat.value) pat.value = ''
  } catch (error) {
    setNotice('error', error.message || 'GitHub 备份失败。')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop backup-backdrop" @click.self="emit('close')">
    <section class="backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
      <header class="backup-heading">
        <div>
          <span class="section-kicker">Data & backup</span>
          <h2 id="backup-title">数据导出与备份</h2>
          <p>本地导出便于离线保存；GitHub 备份会在目标目录中新建时间戳 JSON 文件。</p>
        </div>
        <button class="icon-button" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="backup-summary">
        <span><b>{{ stats.groups }}</b><small>分组</small></span>
        <span><b>{{ stats.servers }}</b><small>区服</small></span>
        <span><b>Schema {{ SNAPSHOT_SCHEMA_VERSION }}</b><small>备份格式</small></span>
      </div>

      <section class="backup-section">
        <div class="backup-section-heading">
          <div><h3>本地文件</h3><p>导出当前完整数据，或从此前导出的文件恢复。</p></div>
        </div>
        <div class="backup-action-row">
          <button class="button primary" type="button" @click="downloadExport">导出 JSON</button>
          <button class="button secondary" type="button" @click="openImportPicker">从 JSON 恢复</button>
          <input ref="importInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importFile" />
        </div>
      </section>

      <section class="backup-section cloud-section">
        <div class="backup-section-heading">
          <div>
            <h3>Supabase 自动同步</h3>
            <p>本地优先；断网时仍可编辑，联网后自动合并并同步。</p>
          </div>
        </div>

        <div class="cloud-summary-grid">
          <span><small>状态</small><strong>{{ cloudStatus.message }}</strong></span>
          <span><small>云端 revision</small><strong>{{ cloudStatus.revision || 0 }}</strong></span>
          <span><small>最后同步</small><strong>{{ cloudStatus.lastSyncedAt || '尚未完成' }}</strong></span>
        </div>
        <p v-if="cloudStatus.error" class="cloud-error">{{ cloudStatus.error }}</p>

        <div class="backup-action-row">
          <button class="button primary" type="button" :disabled="cloudBusy" @click="syncNow">
            {{ cloudBusy ? '处理中…' : '立即同步' }}
          </button>
          <button class="button secondary" type="button" :disabled="cloudBusy" @click="reloadFromCloud">
            从云端重新加载
          </button>
          <button class="button secondary" type="button" :disabled="historyBusy" @click="loadCloudHistory">
            {{ historyBusy ? '读取中…' : '查看最近 50 个版本' }}
          </button>
        </div>

        <div v-if="cloudHistory.length" class="cloud-restore-row">
          <label class="field">
            <span>云端历史版本</span>
            <select v-model="selectedHistoryRevision">
              <option v-for="entry in cloudHistory" :key="entry.revision" :value="String(entry.revision)">
                revision {{ entry.revision }} · {{ entry.saved_at || '未知时间' }}
              </option>
            </select>
          </label>
          <button class="button secondary" type="button" :disabled="cloudBusy" @click="restoreCloudHistory">
            恢复为新版本
          </button>
        </div>

        <details class="cloud-advanced">
          <summary>高级同步选项</summary>
          <div class="backup-action-row">
            <button class="button secondary" type="button" @click="toggleCloudPaused">
              {{ cloudStatus.paused ? '恢复本设备自动同步' : '暂停本设备自动同步' }}
            </button>
            <button class="button secondary" type="button" @click="clearCloudError">
              清除本机同步错误状态
            </button>
          </div>
          <div v-if="recoveries.length" class="cloud-restore-row">
            <label class="field">
              <span>本地恢复点（最多 3 份）</span>
              <select v-model="selectedRecoveryIndex">
                <option value="">请选择</option>
                <option v-for="(entry, index) in recoveries" :key="`${entry.createdAt}-${index}`" :value="String(index)">
                  {{ entry.createdAt }} · {{ entry.reason }}
                </option>
              </select>
            </label>
            <button class="button secondary" type="button" @click="exportSelectedRecovery">导出恢复点</button>
            <button class="button secondary" type="button" @click="restoreSelectedRecovery">恢复本地版本</button>
          </div>
        </details>
      </section>

      <section class="backup-section github-section">
        <div class="backup-section-heading split">
          <div><h3>手动 GitHub 历史备份</h3><p>仓库配置和 PAT 都可以保存在当前浏览器，便于下次直接备份。</p></div>
          <button class="text-button" type="button" @click="resetDefaults">恢复默认配置</button>
        </div>

        <div class="backup-config-grid">
          <label class="field"><span>GitHub 用户名</span><input v-model.trim="config.owner" autocomplete="username" /></label>
          <label class="field"><span>仓库名</span><input v-model.trim="config.repository" /></label>
          <label class="field full"><span>分支名</span><input v-model.trim="config.branch" spellcheck="false" /></label>
          <label class="field full"><span>根目录</span><input v-model.trim="config.rootDirectory" spellcheck="false" /></label>
          <label class="field full">
            <span>Personal Access Token</span>
            <input v-model="pat" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_..." />
          </label>
        </div>

        <div class="target-preview">
          <span>目标</span><strong>{{ backupTarget }}</strong>
          <a v-if="backupDirectoryUrl" :href="backupDirectoryUrl" target="_blank" rel="noreferrer">打开备份目录</a>
        </div>

        <label class="checkbox-row">
          <input v-model="rememberPat" type="checkbox" />
          <span>在当前浏览器保存 PAT，下次无需重新输入</span>
        </label>

        <div class="pat-controls">
          <span>{{ rememberPat ? 'PAT 将保存在此站点的 localStorage 中。' : 'PAT 仅保留到关闭弹窗或备份成功。' }}</span>
          <button class="text-button" type="button" @click="clearSavedPat">清除已保存 PAT</button>
        </div>

        <div class="security-note">
          “测试 PAT”不会创建文件：它只读取仓库、目标分支和目标目录，并检查 GitHub 返回的写入权限标记。保存 PAT 会提高便利性，但 localStorage 不加密；请仅在个人可信设备使用，并采用只允许该仓库 Contents 读写、设置过期时间的细粒度令牌。
        </div>

        <div class="backup-action-row end">
          <button
            class="button secondary"
            type="button"
            :disabled="busy || testingPat"
            @click="testPat"
          >
            {{ testingPat ? '正在测试…' : '测试 PAT 与目标配置' }}
          </button>
          <button
            class="button primary"
            type="button"
            :disabled="busy || testingPat"
            @click="backupToGitHub"
          >
            {{ busy ? '正在备份…' : '立即备份到 GitHub' }}
          </button>
        </div>
      </section>

      <div v-if="notice.text" class="backup-notice" :class="notice.type" role="status">
        <span>{{ notice.text }}</span>
        <a v-if="notice.url" :href="notice.url" target="_blank" rel="noreferrer">打开相关位置</a>
      </div>

      <footer class="backup-footer">
        <button class="button secondary" type="button" @click="emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.backup-backdrop { z-index: 80; padding: 24px; overflow-y: auto; }
.backup-modal { width: min(820px, 100%); max-height: calc(100dvh - 48px); margin: auto; overflow-y: auto; overscroll-behavior: contain; border: 1px solid rgba(46, 69, 111, .14); border-radius: 28px; background: #fff; box-shadow: 0 30px 80px rgba(20, 35, 66, .28); }
.backup-heading { display: flex; justify-content: space-between; gap: 24px; padding: 28px 30px 24px; color: #fff; background: linear-gradient(135deg, #1b2e52, #31588f); }
.backup-heading h2 { margin: 5px 0 8px; font-size: clamp(24px, 4vw, 34px); }
.backup-heading p { max-width: 620px; margin: 0; color: rgba(255, 255, 255, .78); line-height: 1.65; }
.backup-heading .icon-button { flex: 0 0 auto; color: #fff; background: rgba(255, 255, 255, .12); }
.backup-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px 30px 0; }
.backup-summary span { display: flex; flex-direction: column; gap: 4px; padding: 16px; border: 1px solid #dbe4f2; border-radius: 16px; background: #f7f9fd; }
.backup-summary b { color: #1d3157; font-size: 22px; }
.backup-summary small { color: #69758a; }
.backup-section { margin: 20px 30px 0; padding: 22px; border: 1px solid #dbe4f2; border-radius: 20px; background: #fff; }
.github-section { background: #f8faff; }
.cloud-section { background: #f5f9ff; }
.cloud-summary-grid { display: grid; grid-template-columns: .8fr .7fr 1.5fr; gap: 10px; margin-bottom: 16px; }
.cloud-summary-grid span { display: grid; gap: 4px; min-width: 0; padding: 12px; border: 1px solid #dbe5f4; border-radius: 13px; background: #fff; }
.cloud-summary-grid small { color: #718099; }
.cloud-summary-grid strong { overflow-wrap: anywhere; color: #263f69; font-size: 13px; }
.cloud-error { padding: 11px 13px; border-radius: 10px; color: #8a2525; background: #fff0f0; overflow-wrap: anywhere; }
.cloud-restore-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 10px; margin-top: 16px; }
.cloud-restore-row .field { margin: 0; }
.cloud-restore-row .button { width: auto; min-height: 44px; }
.cloud-advanced { margin-top: 16px; padding: 12px; border: 1px solid #dbe5f4; border-radius: 13px; background: #fff; }
.cloud-advanced summary { color: #31588f; cursor: pointer; font-weight: 800; }
.cloud-advanced[open] summary { margin-bottom: 12px; }
.backup-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.backup-section-heading h3 { margin: 0 0 5px; color: #1d3157; }
.backup-section-heading p { margin: 0; color: #6b768a; line-height: 1.55; }
.backup-action-row { display: flex; flex-wrap: wrap; gap: 12px; }
.backup-action-row.end { justify-content: flex-end; margin-top: 18px; }
.backup-action-row .button { width: auto; min-width: 150px; }
.backup-config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.backup-config-grid .field { margin: 0; }
.backup-config-grid .full { grid-column: 1 / -1; }
.text-button { width: auto; padding: 5px 0; color: #31588f; background: transparent; box-shadow: none; white-space: nowrap; }
.target-preview { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 16px; padding: 13px 15px; border-radius: 14px; color: #5e6a80; background: #edf3fc; }
.target-preview strong { overflow-wrap: anywhere; color: #233b65; font-size: 13px; }
.target-preview a, .backup-notice a { color: #275da5; font-weight: 700; }
.checkbox-row { display: flex; align-items: center; gap: 10px; margin-top: 15px; color: #46536a; }
.checkbox-row input { width: auto; accent-color: #31588f; }
.pat-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; color: #657187; font-size: 13px; }
.security-note { margin-top: 14px; padding: 13px 15px; border-left: 4px solid #d29c33; border-radius: 10px; color: #66511f; background: #fff8e7; line-height: 1.6; }
.backup-notice { display: flex; justify-content: space-between; gap: 12px; margin: 20px 30px 0; padding: 14px 16px; border-radius: 14px; line-height: 1.55; }
.backup-notice.success { color: #17623a; background: #eaf8ef; border: 1px solid #bfe6cb; }
.backup-notice.error { color: #8a2525; background: #fff0f0; border: 1px solid #f1c2c2; }
.backup-footer { display: flex; justify-content: flex-end; padding: 22px 30px 28px; }
.backup-footer .button { width: auto; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 640px) {
  .backup-backdrop { padding: 10px; }
  .backup-modal { max-height: calc(100dvh - 20px); border-radius: 20px; }
  .backup-heading { padding: 22px 20px; }
  .backup-summary { padding: 16px 18px 0; gap: 8px; }
  .backup-summary span { padding: 12px 10px; }
  .backup-section { margin: 16px 18px 0; padding: 17px; }
  .backup-section-heading.split { flex-direction: column; }
  .backup-config-grid { grid-template-columns: 1fr; }
  .cloud-summary-grid { grid-template-columns: 1fr; }
  .cloud-restore-row { grid-template-columns: 1fr; }
  .backup-config-grid .full { grid-column: auto; }
  .backup-action-row .button { width: 100%; }
  .target-preview { grid-template-columns: 1fr; }
  .pat-controls { align-items: flex-start; flex-direction: column; }
  .backup-notice { flex-direction: column; margin: 16px 18px 0; }
  .backup-footer { padding: 18px; }
  .backup-footer .button { width: 100%; }
}
</style>
