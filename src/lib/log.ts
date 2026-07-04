import { supabase } from './supabase'

/**
 * Writes an audit row to system_logs, mirroring the legacy app's logging.
 * Failures are swallowed deliberately — logging must never block a mutation.
 * user_id is the legacy users.id (resolved from the signed-in profile).
 */
export async function logAction(userId: number | null | undefined, action: string, description: string) {
  if (!userId) return
  try {
    await supabase.from('system_logs').insert({ user_id: userId, action, description, ip_address: null })
  } catch {
    // ignore
  }
}
