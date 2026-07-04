import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAll, supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import type { ClientInsert, ClientRow } from '@/types/database'

export const CLIENTS_KEY = ['clients'] as const

export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: () =>
      fetchAll<ClientRow>((from, to) => supabase.from('clients').select('*').order('company_name').range(from, to)),
    staleTime: 60_000,
  })
}

/**
 * Upserts client master data by company name (mirrors legacy
 * save_client.php). Pass id to edit a specific profile (the client
 * manager's ✎ Edit action, where the name itself may change).
 */
export function useSaveClient() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id, ...client }: ClientInsert & { id?: number }) => {
      let targetId = id
      if (!targetId) {
        const { data: existing, error: findError } = await supabase
          .from('clients')
          .select('id')
          .eq('company_name', client.company_name)
          .maybeSingle()
        if (findError) throw new Error(findError.message)
        targetId = existing?.id
      }
      if (targetId) {
        const { data, error } = await supabase.from('clients').update(client).eq('id', targetId).select().single()
        if (error) throw new Error(error.message)
        return data
      }
      const { data, error } = await supabase.from('clients').insert(client).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CLIENTS_KEY })
      logAction(profile?.id, 'Saved Client', `Saved client: ${data.company_name}`)
    },
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: ClientRow) => {
      const { error } = await supabase.from('clients').delete().eq('id', row.id)
      if (error) throw new Error(error.message)
      return row
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: CLIENTS_KEY })
      logAction(profile?.id, 'Deleted Client', `Deleted client profile: ${row.company_name}`)
    },
  })
}
