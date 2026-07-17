import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAll, supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { formatPeso } from '@/lib/format'
import type { ProductInsert, ProductRow, ProductUpdate } from '@/types/database'

export const PRODUCTS_KEY = ['products'] as const

export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: () =>
      fetchAll<ProductRow>((from, to) => supabase.from('products').select('*').order('name').range(from, to)),
    staleTime: 60_000,
  })
}

/**
 * Async product lookup for the Sales Entry item autocomplete:
 * name ilike %q% limit 10 (mirrors legacy get_item.php).
 */
export function useProductSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: [...PRODUCTS_KEY, 'search', q.toLowerCase()],
    enabled: q.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(10)
      if (error) throw new Error(error.message)
      return data as ProductRow[]
    },
    // Keep the previous suggestions while the next keystroke's query runs.
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })
}

/**
 * Persists a UOM edit from the formal quote via the set_product_unit RPC
 * (16_product_unit_rpc.sql). A plain function (not a mutation hook) because
 * the quote preview persists as it unmounts, where a mutation observer's
 * callbacks would be dropped. Silently a no-op server-side when the item
 * doesn't match a product.
 */
export async function saveProductUnit(item: string, unit: string): Promise<void> {
  const { error } = await supabase.rpc('set_product_unit', { p_item: item, p_unit: unit })
  if (error) throw new Error(error.message)
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: ProductInsert) => {
      const { data, error } = await supabase.from('products').insert(row).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(profile?.id, 'Saved Product', `Saved Product: ${data.name} (Price: ${formatPeso(data.nam_price)})`)
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: ProductUpdate }) => {
      const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(
        profile?.id,
        'Saved Product',
        `Saved Product: ${data.name} (Stock: ${data.current_stock ?? 0}, Price: ${formatPeso(data.nam_price)})`,
      )
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (row: ProductRow) => {
      const { error } = await supabase.from('products').delete().eq('id', row.id)
      if (error) throw new Error(error.message)
      return row
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(profile?.id, 'Deleted Product', `Deleted Product: ${row.name}`)
    },
  })
}

/**
 * Merge duplicate products: stock from the duplicates is added to the
 * canonical product, then the duplicates are deleted (mirrors legacy
 * merge_products.php behaviour).
 */
export function useMergeProducts() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ canonical, duplicates }: { canonical: ProductRow; duplicates: ProductRow[] }) => {
      const extraStock = duplicates.reduce((sum, d) => sum + (d.current_stock ?? 0), 0)
      const { error: upError } = await supabase
        .from('products')
        .update({ current_stock: (canonical.current_stock ?? 0) + extraStock })
        .eq('id', canonical.id)
      if (upError) throw new Error(upError.message)
      const { error: delError } = await supabase
        .from('products')
        .delete()
        .in('id', duplicates.map((d) => d.id))
      if (delError) throw new Error(delError.message)
      return { canonical, duplicates }
    },
    onSuccess: ({ canonical, duplicates }) => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
      logAction(
        profile?.id,
        'Merged Products',
        `Merged ${duplicates.length} duplicate(s) into "${canonical.name}": ${duplicates.map((d) => d.name).join(', ').slice(0, 300)}`,
      )
    },
  })
}
