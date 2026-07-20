<script setup>
import { computed, reactive, ref, watch } from 'vue'

const CONFIG_KEY = 'wangzhe-account-backup-config:v1'
const PAT_STORAGE_KEY = 'wangzhe-account-backup-pat:v1'
const PAT_REMEMBER_KEY = 'wangzhe-account-backup-remember-pat:v1'
const DATA_STORAGE_KEY = 'wangzhe-account-manager:v1'
const SNAPSHOT_APP = 'wangzhe-account-manager'
const SNAPSHOT_SCHEMA_VERSION = 1
const DEFAULT_CONFIG = Object.freeze({
  owner: 'foxmaybeOI1761640545',
  repository: 'WangZheRongYao-1784465435',
  branch: 'backup/1784534225/AccountData',
  rootDirectory: 'AccountData01',
})

const props = defineProps({
  stats: { type: Object, required: true },
})

const emit = defineEmits(['close'])

function cleanText(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')
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

const rememberPat = ref(localStorage.getItem(PAT_REMEMBER_KEY) !== 'false')
const config = reactive(loadConfig())
const pat = ref(rememberPat.value ? (localStorage.getItem(PAT_STORAGE_KEY) || '') : '')
const busy = ref(false)
const importInput = ref(null)
const notice = reactive({ type: '', text: '', url: '' })

watch(
  config,
  (value) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
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
    localStorage.setItem(PAT_REMEMBER_KEY, String(remember))
    if (remember && pat.value.trim()) {
      localStorage.setItem(PAT_STORAGE_KEY, pat.value)
    } else if (!remember) {
      localStorage.removeItem(PAT_STORAGE_KEY)
    }
  },
  { immediate: true },
)

watch(pat, (value) => {
  if (!rememberPat.value) return
  if (value.trim()) localStorage.setItem(PAT_STORAGE_KEY, value)
  else localStorage.removeItem(PAT_STORAGE_KEY)
})

const repositoryUrl = computed(() => {
  const owner = cleanText(config.owner)
  const repository = cleanText(config.repository)
  return owner && repository ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}` : ''
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
  localStorage.removeItem(PAT_STORAGE_KEY)
  pat.value = ''
  setNotice('success', '已清除当前浏览器中保存的 PAT。')
}

function normaliseDirectory(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
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

function encodePath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
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
    const raw = JSON.parse(localStorage.getItem(DATA_STORAGE_KEY) || 'null')
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
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    app: SNAPSHOT_APP,
    exportedAt: new Date().toISOString(),
    stats: { ...props.stats },
    data: readCurrentRoot(),
  }
}

function snapshotJson() {
  return JSON.stringify(createSnapshot(), null, 2)
}

function extractSnapshotRoot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('备份文件不是有效的 JSON 对象。')
  if ('schemaVersion' in payload && payload.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`不支持的备份版本：${payload.schemaVersion}。`)
  }
  if ('app' in payload && payload.app !== SNAPSHOT_APP) {
    throw new Error('该文件不是王者多账号管理器备份。')
  }
  const root = payload.data ?? payload.root ?? payload
  if (!root || root.type !== 'group' || !Array.isArray(root.children)) {
    throw new Error('备份文件缺少有效的根分组数据。')
  }
  return root
}

function timestampName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function downloadExport() {
  resetNotice()
  try {
    const text = snapshotJson()
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
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
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(root))
    setNotice('success', '备份数据已写入本地，页面即将刷新。')
    window.setTimeout(() => {
      window.location.hash = '#/group/root'
      window.location.reload()
    }, 450)
  } catch (error) {
    setNotice('error', error.message || '无法读取该备份文件。')
  }
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
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${pat.value.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
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
    const url = payload.content?.html_url || fallbackUrl
    setNotice('success', `备份成功：${filePath}`, url)
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
        <span><b>JSON</b><small>备份格式</small></span>
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

      <section class="backup-section github-section">
        <div class="backup-section-heading split">
          <div><h3>备份到 GitHub</h3><p>仓库配置和 PAT 都可以保存在当前浏览器，便于下次直接备份。</p></div>
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
          保存 PAT 会提高便利性，但 localStorage 不加密，同源页面脚本可以读取。请仅在个人可信设备使用，并采用只允许该仓库 Contents 读写、设置过期时间的细粒度令牌。PAT 仍不会进入导出 JSON、账号备份文件或提交信息。
        </div>

        <div class="backup-action-row end">
          <button class="button primary" type="button" :disabled="busy" @click="backupToGitHub">
            {{ busy ? '正在备份…' : '立即备份到 GitHub' }}
          </button>
        </div>
      </section>

      <div v-if="notice.text" class="backup-notice" :class="notice.type" role="status">
        <span>{{ notice.text }}</span>
        <a v-if="notice.url" :href="notice.url" target="_blank" rel="noreferrer">查看备份文件</a>
      </div>

      <footer class="backup-footer"><button class="button secondary" type="button" @click="emit('close')">关闭</button></footer>
    </section>
  </div>
</template>

<style scoped>
.backup-backdrop { z-index: 80; padding: 24px; overflow-y: auto; }
.backup-modal { width: min(820px, 100%); max-height: calc(100vh - 48px); margin: auto; overflow-y: auto; border: 1px solid rgba(46, 69, 111, .14); border-radius: 28px; background: #fff; box-shadow: 0 30px 80px rgba(20, 35, 66, .28); }
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
  .backup-modal { max-height: calc(100vh - 20px); border-radius: 20px; }
  .backup-heading { padding: 22px 20px; }
  .backup-summary { padding: 16px 18px 0; gap: 8px; }
  .backup-summary span { padding: 12px 10px; }
  .backup-section { margin: 16px 18px 0; padding: 17px; }
  .backup-section-heading.split { flex-direction: column; }
  .backup-config-grid { grid-template-columns: 1fr; }
  .backup-config-grid .full { grid-column: auto; }
  .backup-action-row .button { width: 100%; }
  .target-preview { grid-template-columns: 1fr; }
  .pat-controls { align-items: flex-start; flex-direction: column; }
  .backup-notice { flex-direction: column; margin: 16px 18px 0; }
  .backup-footer { padding: 18px; }
  .backup-footer .button { width: 100%; }
}
</style>