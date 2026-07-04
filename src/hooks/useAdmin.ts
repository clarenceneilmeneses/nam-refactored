import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAll, supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { useAuth } from '@/hooks/useAuth'
import type { PermissionRow, RolePermissionRow, RoleRow, SystemLogRow, UserRow } from '@/types/database'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, role_id, auth_id, created_at')
        .order('id')
      if (error) throw new Error(error.message)
      return data as UserRow[]
    },
  })
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('id')
      if (error) throw new Error(error.message)
      return data as RoleRow[]
    },
  })
}

export function usePermissionList() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('*').order('id')
      if (error) throw new Error(error.message)
      return data as PermissionRow[]
    },
  })
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ['role_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('*')
      if (error) throw new Error(error.message)
      return data as RolePermissionRow[]
    },
  })
}

// ---------- Users (07_admin_rpc.sql — Auth login + users row together) ----------

export type CreateUserInput = {
  username: string
  password: string
  full_name: string
  role_id: number
  /** Real email if given; otherwise the login becomes username@nam.local. */
  email?: string | null
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_username: input.username,
        p_password: input.password,
        p_full_name: input.full_name,
        p_role_id: input.role_id,
        p_email: input.email ?? null,
      })
      if (error) throw new Error(error.message)
      return data as UserRow
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      logAction(profile?.id, 'Created User', `Created user "${user.username}" (${user.full_name ?? ''})`)
    },
  })
}

export type UpdateUserInput = {
  id: number
  username: string
  full_name: string
  role_id: number
  /** Blank keeps the old password (legacy behaviour); filled resets it. */
  password?: string
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: UpdateUserInput) => {
      const { data, error } = await supabase.rpc('admin_update_user', {
        p_id: input.id,
        p_username: input.username,
        p_full_name: input.full_name,
        p_role_id: input.role_id,
        p_password: input.password || null,
      })
      if (error) throw new Error(error.message)
      return { user: data as UserRow, passwordReset: !!input.password }
    },
    onSuccess: ({ user, passwordReset }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      logAction(
        profile?.id,
        'Updated User',
        `Updated user "${user.username}"${passwordReset ? ' and reset their password' : ''}`,
      )
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (user: UserRow) => {
      const { error } = await supabase.rpc('admin_delete_user', { p_id: user.id })
      if (error) throw new Error(error.message)
      return user
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      logAction(profile?.id, 'Deleted User', `Deleted user "${user.username}" (${user.full_name ?? ''})`)
    },
  })
}

// ---------- Roles ----------

export type SaveRoleInput = {
  /** Present = edit; absent = create. */
  id?: number
  name: string
  description: string
  /** Full replacement set (legacy delete-then-insert semantics). */
  permissionIds: number[]
}

export function useSaveRole() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: SaveRoleInput) => {
      let role: RoleRow
      if (input.id != null) {
        const { data, error } = await supabase
          .from('roles')
          .update({ name: input.name, description: input.description || null })
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        role = data
        const { error: delError } = await supabase.from('role_permissions').delete().eq('role_id', role.id)
        if (delError) throw new Error(delError.message)
      } else {
        const { data, error } = await supabase
          .from('roles')
          .insert({ name: input.name, description: input.description || null })
          .select()
          .single()
        if (error) throw new Error(error.message)
        role = data
      }
      if (input.permissionIds.length > 0) {
        const { error } = await supabase
          .from('role_permissions')
          .insert(input.permissionIds.map((permission_id) => ({ role_id: role.id, permission_id })))
        if (error) throw new Error(error.message)
      }
      return { role, created: input.id == null }
    },
    onSuccess: ({ role, created }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['role_permissions'] })
      logAction(
        profile?.id,
        created ? 'Created Role' : 'Updated Role',
        `${created ? 'Created' : 'Updated'} role "${role.name}" and its permissions`,
      )
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (role: RoleRow) => {
      // users.role_id has no ON DELETE action — unassign first (legacy warns,
      // then leaves those users with no role).
      const { error: userError } = await supabase.from('users').update({ role_id: null }).eq('role_id', role.id)
      if (userError) throw new Error(userError.message)
      const { error: permError } = await supabase.from('role_permissions').delete().eq('role_id', role.id)
      if (permError) throw new Error(permError.message)
      const { error } = await supabase.from('roles').delete().eq('id', role.id)
      if (error) throw new Error(error.message)
      return role
    },
    onSuccess: (role) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['role_permissions'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      logAction(profile?.id, 'Deleted Role', `Deleted role "${role.name}"`)
    },
  })
}

// ---------- Logs ----------

export function useSystemLogs() {
  return useQuery({
    queryKey: ['system_logs'],
    queryFn: () =>
      fetchAll<SystemLogRow>((from, to) =>
        supabase.from('system_logs').select('*').order('id', { ascending: false }).range(from, to),
      ),
    staleTime: 30_000,
  })
}
