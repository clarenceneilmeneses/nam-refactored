import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Postgres changes on a table and invalidates the matching
 * query key — replaces the legacy dashboard's 30-second polling.
 */
export function useRealtimeInvalidate(table: string, queryKey: readonly unknown[]) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        queryClient.invalidateQueries({ queryKey })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(queryKey), queryClient])
}
