import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  validateSupabaseConfig,
} from '../config/supabaseConfig.js'

let client = null

export function getSupabaseClient() {
  if (!validateSupabaseConfig().valid) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
