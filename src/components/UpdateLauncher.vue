<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAppUpdate } from '../composables/useAppUpdate.js'

const panelOpen = ref(false)
const updater = useAppUpdate()
const { state, checking, downloading, installing, testing, message, githubTest, isAndroid } = updater

const statusText = computed(() => ({
  idle: '尚未下载',
  pending: '等待系统下载服务',
  running: '正在下载更新包',
  downloaded: '更新包已下载并通过校验',
  failed: '更新包下载或校验失败',
}[state.status] || state.status))

const progressText = computed(() => {
  const downloaded = updater.formatBytes(state.downloadedBytes)
  const total = state.totalBytes > 0 ? updater.formatBytes(state.totalBytes) : '未知大小'
  return `${state.progress || 0}% · ${downloaded} / ${total}`
})

async function runPrimaryAction() {
  if (state.status === 'downloaded') await updater.installUpdate()
  else if (state.available) await updater.downloadUpdate()
}

onMounted(() => updater.initialize())

watch(() => [state.available, state.latestVersionCode], ([available, code]) => {
  if (!available || !code) return
  const key = `wangzhe-update-prompted-${code}`
  if (sessionStorage.getItem(key) !== '1') {
    panelOpen.value = true
    sessionStorage.setItem(key, '1')
  }
})
</script>

<template>
  <Teleport v-if="isAndroid" to=".app-header-tools">
    <button
      class="update-launch"
      :class="{ available: state.available }"
      type="button"
      @click="panelOpen = true"
    >
      {{ state.available ? '新版本' : '更新' }}
    </button>
  </Teleport>

  <Teleport to="body">
    <div v-if="panelOpen" class="modal-backdrop update-backdrop" @click.self="panelOpen = false">
      <section class="modal update-modal" role="dialog" aria-modal="true">
        <div class="modal-heading">
          <div><span class="section-kicker">Android update</span><h3>版本更新</h3></div>
          <button class="icon-button" type="button" aria-label="关闭" @click="panelOpen = false">×</button>
        </div>

        <div class="version-summary">
          <div><span>当前版本</span><strong>v{{ state.currentVersionName }}</strong><small>{{ state.currentVersionCode }}</small></div>
          <div :class="{ highlighted: state.available }">
            <span>{{ state.available ? '可用版本' : '更新状态' }}</span>
            <strong>{{ state.available ? `v${state.latestVersionName}` : '已是最新' }}</strong>
            <small>{{ state.available ? state.latestVersionCode : statusText }}</small>
          </div>
        </div>

        <label class="channel-row">
          <span><b>更新通道</b><small>Beta 检查当前分支预发布；Stable 只检查正式 Release。</small></span>
          <select :value="state.channel" :disabled="checking" @change="updater.setChannel($event.target.value)">
            <option value="beta">Beta</option>
            <option value="stable">Stable</option>
          </select>
        </label>

        <div class="repository-card">
          <span>GitHub 更新仓库</span>
          <strong>{{ state.repository || '未配置' }}</strong>
        </div>

        <div class="action-grid">
          <button class="button secondary" type="button" :disabled="testing" @click="updater.testGithubConnection">
            {{ testing ? '测试中…' : '测试 GitHub' }}
          </button>
          <button class="button secondary" type="button" :disabled="checking" @click="updater.checkForUpdate(true)">
            {{ checking ? '检查中…' : '立即检查更新' }}
          </button>
        </div>

        <p v-if="githubTest.tested" class="result" :class="githubTest.ok ? 'success' : 'error'">
          {{ githubTest.message }}<span v-if="githubTest.latencyMs">（{{ githubTest.latencyMs }} ms）</span>
        </p>

        <section v-if="state.available" class="available-card">
          <div class="available-heading">
            <div><span>发现新版本</span><strong>v{{ state.latestVersionName }}</strong></div>
            <b>{{ state.prerelease ? 'Beta' : 'Stable' }}</b>
          </div>

          <p v-if="state.mandatory" class="warning">该版本已低于最低支持版本，建议立即更新。</p>
          <p>发布时间：{{ updater.releaseDateText(state.publishedAt) }} · APK：{{ updater.formatBytes(state.size) }}</p>

          <ul v-if="state.releaseNotes.length" class="release-notes">
            <li v-for="note in state.releaseNotes" :key="note">{{ note }}</li>
          </ul>

          <div v-if="state.status === 'pending' || state.status === 'running'" class="progress-box">
            <span>{{ statusText }}</span><strong>{{ progressText }}</strong>
            <progress :value="state.progress || 0" max="100"></progress>
          </div>

          <p v-if="state.status === 'failed' && state.error" class="result error">{{ state.error }}</p>

          <div class="action-grid">
            <button
              class="button primary"
              type="button"
              :disabled="downloading || installing || state.status === 'pending' || state.status === 'running'"
              @click="runPrimaryAction"
            >
              {{ state.status === 'downloaded' ? (installing ? '正在打开安装器…' : '安装更新') : (downloading ? '正在开始下载…' : '下载更新') }}
            </button>
            <a v-if="state.releasePageUrl" class="button secondary release-link" :href="state.releasePageUrl" target="_blank" rel="noopener noreferrer">
              打开 Release 页面
            </a>
          </div>
        </section>

        <p v-else class="up-to-date">当前通道没有更高版本。</p>
        <p v-if="message" class="result info">{{ message }}</p>
        <p class="security-note">下载完成后会校验 SHA-256、包名、版本码和固定签名证书，任一项不匹配都不会继续安装。</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.update-backdrop{z-index:120}.update-modal{width:min(600px,100%);max-height:min(86dvh,760px);overflow-y:auto}.version-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.version-summary>div,.channel-row,.repository-card,.available-card,.up-to-date,.security-note{border:1px solid #dce4f2;border-radius:14px;background:#f8faff}.version-summary>div{display:grid;gap:3px;padding:13px}.version-summary .highlighted{border-color:#9db6ec;background:#eef4ff}.version-summary span,.repository-card span,.available-heading span{color:#6e7c94;font-size:12px}.version-summary strong,.available-heading strong{color:#18376f;font-size:22px}.channel-row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;margin-top:10px;padding:12px}.channel-row>span{display:grid;gap:3px}.channel-row small{color:#738097}.channel-row select{min-width:100px}.repository-card{display:grid;gap:4px;margin-top:10px;padding:12px;overflow-wrap:anywhere}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.result{margin:10px 0 0;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.5}.result.success{color:#17623e;background:#ebf8f0}.result.error{color:#962f40;background:#fff0f2}.result.info{color:#244778;background:#eef4ff}.available-card{margin-top:12px;padding:14px;background:#fff}.available-heading{display:flex;align-items:center;justify-content:space-between}.available-heading>div{display:grid}.available-heading>b{padding:5px 9px;border-radius:999px;color:#234c9b;background:#eaf1ff}.warning{padding:9px 11px;border-left:4px solid #d49a23;color:#7a5311;background:#fff6df}.release-notes{padding-left:20px;line-height:1.65;color:#4e5d75}.progress-box{display:grid;gap:7px}.progress-box progress{width:100%;accent-color:#315fca}.release-link{text-align:center;text-decoration:none}.up-to-date,.security-note{margin:12px 0 0;padding:12px;text-align:center;color:#607087}.security-note{color:#6b5a2c;background:#fff8e7;font-size:12px;line-height:1.55}@media(max-width:520px){.update-modal{max-height:calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))}.action-grid{grid-template-columns:1fr}}
</style>
