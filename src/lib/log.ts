import { supabase } from './supabase'
import { queryClient } from './queryClient'

/**
 * Writes an audit row to system_logs, mirroring the legacy app's logging.
 * Failures are swallowed deliberately — logging must never block a mutation.
 * user_id is the legacy users.id (resolved from the signed-in profile).
 */
export async function logAction(userId: number | null | undefined, action: string, description: string) {
  if (!userId) return
  try {
    const { error } = await supabase.from('system_logs').insert({ user_id: userId, action, description, ip_address: null })
    // Mark the Logs page stale so the new entry shows up on its next visit.
    if (!error) queryClient.invalidateQueries({ queryKey: ['system_logs'] })
  } catch {
    // ignore
  }
}
