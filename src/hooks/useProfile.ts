import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'

export const AVATAR_BUCKET = 'avatars'

/** The current user's uploaded avatar (users.avatar_url). */
export function useAvatarUrl(): string | null {
  const { profile } = useAuth()
  return profile?.avatar_url ?? null
}

/** Self-service display-name change (users row). */
export function useUpdateProfileName() {
  const { profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fullName: string) => {
      if (!profile) throw new Error('Not signed in')
      const { data, error } = await supabase
        .from('users')
        .update({ full_name: fullName })
        .eq('id', profile.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (user) => {
      refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['users'] })
      logAction(profile?.id, 'Updated Profile', `Updated own display name to "${user.full_name ?? ''}"`)
    },
  })
}

/** Self-service password change via Supabase Auth. */
export function useUpdatePassword() {
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      logAction(profile?.id, 'Changed Password', 'Changed own account password')
    },
  })
}

/**
 * Uploads a profile photo to the `avatars` storage bucket and records its URL
 * on the user's row (users.avatar_url) so it also shows on the admin Users
 * list. Requires the bucket + column + RLS from 08_profile.sql.
 */
export function useUploadAvatar() {
  const { session, profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: Blob) => {
      const uid = session?.user.id
      if (!uid || !profile) throw new Error('Not signed in')
      const ext = (file.type.split('/')[1] || 'png').toLowerCase()
      const path = `${uid}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}` // cache-bust so the new photo shows immediately
      const { error: rowErr } = await supabase.from('users').update({ avatar_url: url }).eq('id', profile.id)
      if (rowErr) throw new Error(rowErr.message)
      return url
    },
    onSuccess: () => {
      refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['users'] })
      logAction(profile?.id, 'Updated Profile', 'Updated profile photo')
    },
  })
}
