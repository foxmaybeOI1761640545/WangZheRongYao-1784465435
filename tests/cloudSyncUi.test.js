import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  SYNC_WORKSPACE_ID,
  validateSupabaseConfig,
} from '../src/config/supabaseConfig.js'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('固定公开配置有效且不包含 Supabase Secret', () => {
  assert.equal(validateSupabaseConfig().valid, true)
  assert.match(SUPABASE_URL, /^https:\/\//)
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/)
  assert.match(SYNC_WORKSPACE_ID, /^[0-9a-f-]{36}$/)
  assert.equal(SUPABASE_PUBLISHABLE_KEY.includes('sb_secret_'), false)
  assert.equal(validateSupabaseConfig({
    url: 'http://invalid.example',
    publishableKey: '',
    workspaceId: 'invalid',
  }).valid, false)
})

test('App 使用单一 Store、非阻塞初始化并完整清理云同步服务', () => {
  const app = read('../src/App.vue')
  assert.equal((app.match(/useAccountStore\(\)/g) ?? []).length, 1)
  assert.match(app, /void cloudSyncService\.initialise\(\)/)
  assert.match(app, /void cloudSyncService\.destroy\(\)/)
  assert.match(app, /cloudSyncService\.flushPending\(\{ bestEffort: true \}\)/)
  assert.doesNotMatch(app, /signIn|signUp|Anonymous Auth|OAuth/)
})

test('同步状态和 BackupCenter 保留 JSON、GitHub，并为危险操作确认', () => {
  const status = read('../src/components/CloudSyncStatus.vue')
  const backup = read('../src/components/BackupCenter.vue')
  assert.match(status, /已同步|status\.message/)
  assert.match(backup, /导出 JSON/)
  assert.match(backup, /从 JSON 恢复/)
  assert.match(backup, /手动 GitHub 历史备份/)
  assert.match(backup, /测试 PAT 与目标配置/)
  assert.match(backup, /从云端重新加载/)
  assert.match(backup, /window\.confirm\('将使用当前云端版本/)
  assert.match(backup, /恢复为新版本/)
  assert.match(backup, /本地恢复点/)
  assert.match(backup, /@media \(max-width: 640px\)/)
  assert.match(status, /min-height: 44px/)
})

test('360/390/430/1366 与 360×500 响应式契约保留可用宽度和动态视口', () => {
  const app = read('../src/App.vue')
  const status = read('../src/components/CloudSyncStatus.vue')
  const backup = read('../src/components/BackupCenter.vue')
  assert.match(app, /@media \(max-width: 720px\)/)
  assert.match(app, /grid-template-rows: auto 44px/)
  assert.match(app, /grid-template-columns: minmax\(104px, 1fr\) 86px/)
  assert.match(status, /min-width: 0/)
  assert.match(status, /overflow: hidden/)
  assert.match(status, /@media \(max-width: 430px\)/)
  assert.match(backup, /width: min\(820px, 100%\)/)
  assert.match(backup, /max-height: calc\(100dvh - 20px\)/)
  assert.match(backup, /overflow-y: auto/)
})

test('SQL 契约使用 RLS、revision 行锁、2MB 上限、50 历史和 Realtime', () => {
  const sql = read('../supabase/migrations/001_cloud_sync.sql')
  assert.match(sql, /enable row level security/)
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /for update/)
  assert.match(sql, /revision mismatch/)
  assert.match(sql, /saved_at/)
  assert.doesNotMatch(sql, /generated always as identity/)
  assert.match(sql, /2097152/)
  assert.match(sql, /limit 50/)
  assert.match(sql, /supabase_realtime/)
  assert.doesNotMatch(sql, /sb_publishable_|sb_secret_|service_role/)
})
