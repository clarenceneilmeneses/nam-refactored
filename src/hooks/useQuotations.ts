import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAll, supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { SALES_KEY } from './useSales'
import { PRODUCTS_KEY } from './useProducts'
import type { QuotationBatchItem, QuotationRow, QuotationUpdate } from '@/types/database'

export const QUOTATIONS_KEY = ['quotations'] as const

export function useQuotations() {
  return useQuery({
    queryKey: QUOTATIONS_KEY,
    queryFn: () =>
      fetchAll<QuotationRow>((from, to) =>
        supabase.from('quotations').select('*').order('date', { ascending: false }).order('id', { ascending: false }).range(from, to),
      ),
    staleTime: 30_000,
  })
}

export type CreateBatchInput = {
  date: string
  quoteRef: string
  company: string
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
  status: 'Pending' | 'Reserved'
  items: QuotationBatchItem[]
}

/**
 * Saves the Draft Workspace queue: one quotations row per item plus
 * auto-created draft products for unknown items, in a single transaction.
 */
export function useCreateQuotationBatch() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: CreateBatchInput) => {
      const { data, error } = await supabase.rpc('create_quotation_batch', {
        p_date: input.date,
        p_quote_ref: input.quoteRef,
        p_company: input.company,
        p_po_number: input.poNumber,
        p_payment_term: input.paymentTerm,
        p_remarks: input.remarks,
        p_status: input.status,
        p_items: input.items,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (rows, input) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(
        profile?.id,
        'Created Quotation',
        `Saved ${rows.length} item(s) under ${input.quoteRef} for ${input.company} (${input.status})`,
      )
    },
  })
}

/** Deducts stock and marks the quotation Approved (one transaction). */
export function useApproveQuotation() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: QuotationRow) => {
      const { data, error } = await supabase.rpc('approve_quotation', { p_id: row.id })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(profile?.id, 'Approved Quotation', `Approved quotation #${q.id} (${q.quote_ref ?? ''} — ${q.item ?? ''}), stock deducted`)
    },
  })
}

/**
 * Converts a quotation into a sales row (deducting stock unless already
 * Approved) and marks it Converted — one transaction via RPC.
 */
export function useFinalizeQuotation() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ row, date }: { row: QuotationRow; date: string }) => {
      const { data, error } = await supabase.rpc('finalize_quotation', { p_id: row.id, p_date: date })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: SALES_KEY })
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(profile?.id, 'Converted Quotation', `Converted quotation to sale #${sale.id} (${sale.item ?? ''})`)
    },
  })
}

/** Removes a single non-Converted item, restoring stock if it was Approved. */
export function useRemoveQuotationItem() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: QuotationRow) => {
      const { error } = await supabase.rpc('remove_quotation_item', { p_id: row.id })
      if (error) throw new Error(error.message)
      return row
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(profile?.id, 'Deleted Quotation', `Removed item "${row.item ?? ''}" from ${row.quote_ref ?? ''}`)
    },
  })
}

/** Deletes all non-Converted rows of a group, restoring Approved stock. */
export function useDeleteQuotationGroup() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ quoteRef, company }: { quoteRef: string; company: string | null }) => {
      const { data, error } = await supabase.rpc('delete_quotation_group', { p_quote_ref: quoteRef, p_company: company })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (count, { quoteRef, company }) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(profile?.id, 'Deleted Quotation Group', `Deleted ${count} item(s) under ${quoteRef} (${company ?? ''})`)
    },
  })
}

/** Pending ⇄ Reserved bookmark toggle. */
export function useToggleReserve() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: QuotationRow) => {
      const next = row.status === 'Reserved' ? 'Pending' : 'Reserved'
      const { data, error } = await supabase.from('quotations').update({ status: next }).eq('id', row.id).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      logAction(profile?.id, 'Updated Quote Status', `Set quotation #${q.id} (${q.item ?? ''}) to ${q.status}`)
    },
  })
}

/** Edits one item's name/qty/prices; total_amount is recomputed by the caller. */
export function useUpdateQuotationItem() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: QuotationUpdate }) => {
      const { data, error } = await supabase.from('quotations').update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      logAction(profile?.id, 'Updated Quotation', `Updated quotation #${q.id} (${q.quote_ref ?? ''} — ${q.item ?? ''})`)
    },
  })
}

export type UpdateGroupInput = {
  quoteRef: string
  company: string | null
  patch: Pick<QuotationUpdate, 'po_number' | 'payment_term' | 'remarks'>
}

/** Edits PO / terms / remarks for every row sharing the group's ref. */
export function useUpdateQuotationGroup() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ quoteRef, company, patch }: UpdateGroupInput) => {
      let query = supabase.from('quotations').update(patch).eq('quote_ref', quoteRef)
      query = company === null ? query.is('company', null) : query.eq('company', company)
      const { data, error } = await query.select()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (rows, { quoteRef }) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      logAction(profile?.id, 'Updated Quotation Group', `Updated group details of ${quoteRef} (${rows.length} item(s))`)
    },
  })
}

/** Re-points quotations and sales of the merged companies at the target. */
export function useMergeCompanies() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ sources, target }: { sources: string[]; target: string }) => {
      const merged = sources.filter((s) => s !== target)
      if (merged.length === 0) return merged
      const { error: qError } = await supabase.from('quotations').update({ company: target }).in('company', merged)
      if (qError) throw new Error(qError.message)
      const { error: sError } = await supabase.from('sales').update({ company: target }).in('company', merged)
      if (sError) throw new Error(sError.message)
      return merged
    },
    onSuccess: (merged, { target }) => {
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: SALES_KEY })
      logAction(profile?.id, 'Merged Companies', `Merged ${merged.length} company name(s) into "${target}"`)
    },
  })
}
