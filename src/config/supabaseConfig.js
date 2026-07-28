export const SUPABASE_URL = 'https://xhmolvlavddxbiziinaf.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hFmEESXfOFQ_LuVBwT6zkQ_4bj_hV_r'
export const SYNC_WORKSPACE_ID = 'd56cc0d5-623c-40f0-8f66-12e56688bc54'
export const SYNC_DOCUMENT_SCHEMA_VERSION = 1
export const SYNC_STATE_TABLE = 'app_sync_state'
export const SYNC_HISTORY_TABLE = 'app_sync_history'
export const SYNC_SAVE_RPC = 'save_wangzhe_sync_state'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validateSupabaseConfig(config = {
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
  workspaceId: SYNC_WORKSPACE_ID,
}) {
  const errors = []
  try {
    const url = new URL(config.url)
    if (url.protocol !== 'https:') errors.push('项目地址必须使用 HTTPS。')
  } catch {
    errors.push('项目地址格式无效。')
  }
  if (!String(config.publishableKey ?? '').trim()) {
    errors.push('Publishable Key 不能为空。')
  }
  if (!UUID_PATTERN.test(String(config.workspaceId ?? '').trim())) {
    errors.push('Workspace ID 格式无效。')
  }
  return {
    valid: errors.length === 0,
    errors,
  }
}
