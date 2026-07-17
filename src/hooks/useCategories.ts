import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import { CATEGORIES } from '@/lib/categories'
import type { CategoryRow } from '@/types/database'

export const CATEGORIES_KEY = ['categories'] as const

/**
 * Category names for every category dropdown, DB-backed (14_categories.sql).
 * Ordered by id so the legacy ten keep their familiar order and user-added
 * categories append below. Falls back to the fixed legacy list until the
 * query resolves (or if the migration hasn't been run yet).
 */
export function useCategories() {
  const query = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('id')
      if (error) throw new Error(error.message)
      return data as CategoryRow[]
    },
    staleTime: 60_000,
  })
  const names: string[] = query.data?.length ? query.data.map((c) => c.name) : [...CATEGORIES]
  return { ...query, names }
}

/** Adds a category (Products tab "+ New"); names are stored uppercase like the legacy list. */
export function useCreateCategory() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim().toUpperCase()
      if (!clean) throw new Error('Category name is required')
      const { data, error } = await supabase.from('categories').insert({ name: clean }).select().single()
      if (error) throw new Error(error.code === '23505' ? `Category "${clean}" already exists` : error.message)
      return data as CategoryRow
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      logAction(profile?.id, 'Added Category', `Added Category: ${data.name}`)
    },
  })
}
