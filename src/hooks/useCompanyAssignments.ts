import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAll, supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import type { CompanyAssignmentRow } from '@/types/database'

export const ASSIGNMENTS_KEY = ['company_assignments'] as const

/** Company → account-manager assignments (drives dashboard manager rollups). */
export function useCompanyAssignments() {
  return useQuery({
    queryKey: ASSIGNMENTS_KEY,
    queryFn: () =>
      fetchAll<CompanyAssignmentRow>((from, to) =>
        supabase.from('company_assignments').select('*').order('company_name').range(from, to),
      ),
    staleTime: 60_000,
  })
}

/** Upsert on company_name — reassigning overwrites (legacy ON DUPLICATE KEY UPDATE). */
export function useAssignCompany() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ company, manager }: { company: string; manager: string }) => {
      const { data, error } = await supabase
        .from('company_assignments')
        .upsert({ company_name: company, employee_name: manager }, { onConflict: 'company_name' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as CompanyAssignmentRow
    },
    onSuccess: (row) => {
      // Recolors the dashboard's manager chart/drilldowns on next render.
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
      logAction(profile?.id, 'Assigned Company', `Assigned ${row.company_name} to ${row.employee_name}`)
    },
  })
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: CompanyAssignmentRow) => {
      const { error } = await supabase.from('company_assignments').delete().eq('id', row.id)
      if (error) throw new Error(error.message)
      return row
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
      logAction(profile?.id, 'Removed Assignment', `Unassigned ${row.company_name} from ${row.employee_name}`)
    },
  })
}
