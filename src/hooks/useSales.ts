import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAll, supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { PRODUCTS_KEY } from '@/hooks/useProducts'
import type { DeliverItemInput, DeliverItemResult, SaleInsert, SaleRow, SaleUpdate } from '@/types/database'

export const SALES_KEY = ['sales'] as const

export function useSales() {
  return useQuery({
    queryKey: SALES_KEY,
    queryFn: () =>
      fetchAll<SaleRow>((from, to) =>
        supabase.from('sales').select('*').order('date', { ascending: false }).order('id', { ascending: false }).range(from, to),
      ),
    staleTime: 30_000,
  })
}

type CreateSalesVars = {
  rows: SaleInsert[]
  /** Legacy-style system_logs override, e.g. "Batch Sales Entry". */
  log?: { action: string; description: string }
}

export function useCreateSales() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ rows }: CreateSalesVars) => {
      // create_sales_batch (13_sales_stock.sql) inserts the rows AND deducts
      // products.current_stock in one transaction — a plain insert here would
      // leave inventory untouched.
      const { data, error } = await supabase.rpc('create_sales_batch', { p_rows: rows })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: SALES_KEY })
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      if (vars.log) {
        logAction(profile?.id, vars.log.action, vars.log.description)
      } else {
        const items = data.map((d) => d.item).filter(Boolean).join(', ')
        logAction(profile?.id, 'Added Sale', `Added ${data.length} sale record(s): ${items.slice(0, 300)}`)
      }
    },
  })
}

type UpdateSaleVars = {
  id: number
  patch: SaleUpdate
  /** Legacy-style system_logs override, e.g. "Updated Payment Status". */
  log?: { action: string; description: string }
}

export function useUpdateSale() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateSaleVars) => {
      const { data, error } = await supabase.from('sales').update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    // Optimistic update for snappy inline edits.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: SALES_KEY })
      const previous = queryClient.getQueryData<SaleRow[]>(SALES_KEY)
      queryClient.setQueryData<SaleRow[]>(SALES_KEY, (old) =>
        old?.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(SALES_KEY, ctx.previous)
    },
    onSuccess: (data, vars) => {
      const log = vars.log ?? { action: 'Updated Record', description: `Updated record #${data.id} (${data.item ?? ''})` }
      logAction(profile?.id, log.action, log.description)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SALES_KEY }),
  })
}

export function useDeleteSale() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: SaleRow) => {
      const { error } = await supabase.from('sales').delete().eq('id', row.id)
      if (error) throw new Error(error.message)
      return row
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: SALES_KEY })
      logAction(profile?.id, 'Deleted Record', `Deleted record #${row.id} (${row.item ?? ''}, ${row.company ?? ''})`)
    },
  })
}

/**
 * Bulk "Mark reviewed" for the SI reviewer — one UPDATE across every selected
 * record. The sales_si_privileges trigger re-checks review_si and stamps
 * si_reviewed_by / si_reviewed_at server-side, so a forged client can't
 * approve on someone else's behalf.
 */
export function useBulkReviewSi() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (rows: SaleRow[]) => {
      const { error } = await supabase
        .from('sales')
        .update({
          si_reviewed: true,
          si_reviewed_by: profile?.id ?? null,
          si_reviewed_at: new Date().toISOString(),
        })
        .in('id', rows.map((r) => r.id))
      if (error) throw new Error(error.message)
      return rows
    },
    onSuccess: (rows) => {
      queryClient.invalidateQueries({ queryKey: SALES_KEY })
      const ids = rows.map((r) => `#${r.id}`).join(', ')
      logAction(profile?.id, 'Reviewed SI #', `Bulk reviewed ${rows.length} SI #(s): records ${ids}`.slice(0, 300))
    },
  })
}

/**
 * Single delivery entry point shared by Records (bulk / partial) and
 * Logistics (single full delivery) — calls the deliver_items RPC, which
 * splits partially delivered rows and stamps due dates transactionally.
 */
export function useDeliverItems() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (items: DeliverItemInput[]): Promise<DeliverItemResult[]> => {
      const { data, error } = await supabase.rpc('deliver_items', { p_items: items })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: SALES_KEY })
      for (const r of results) {
        if (r.remainder_qty > 0) {
          logAction(
            profile?.id,
            'Partial Delivery',
            `Delivered ${r.delivered_qty} out of ${r.original_qty} items for ${r.company ?? ''} (Item: ${r.item ?? ''})`,
          )
        } else {
          logAction(
            profile?.id,
            'Full Delivery',
            `Delivered ${r.item ?? ''} (Qty: ${r.delivered_qty}) for ${r.company ?? ''}`,
          )
        }
      }
    },
  })
}
