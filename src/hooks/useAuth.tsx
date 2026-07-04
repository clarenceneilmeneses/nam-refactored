import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { PermissionName, UserRow } from '@/types/database'

export type Profile = UserRow & { role_name: string | null }

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  permissions: Set<string>
  loading: boolean
  hasPermission: (perm: PermissionName) => boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Where a user lands after login, by descending privilege. Drivers land on Logistics. */
export function landingRoute(permissions: Set<string>): string {
  if (permissions.has('view_dashboard')) return '/'
  if (permissions.has('manage_sales')) return '/records'
  if (permissions.has('view_logistics')) return '/logistics'
  if (permissions.has('manage_finance')) return '/finance'
  return '/'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setPermissions(new Set())
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function load() {
      const uid = session!.user.id
      const { data: user } = await supabase
        .from('users')
        .select('id, username, full_name, role_id, auth_id, created_at, roles(name)')
        .eq('auth_id', uid)
        .maybeSingle()
      if (cancelled) return
      if (!user) {
        // Signed in via Supabase Auth but not linked to a legacy profile row.
        setProfile(null)
        setPermissions(new Set())
        setLoading(false)
        return
      }
      const { roles, ...rest } = user as UserRow & { roles: { name: string } | null }
      setProfile({ ...rest, role_name: roles?.name ?? null })
      if (rest.role_id) {
        const { data: perms } = await supabase
          .from('role_permissions')
          .select('permissions(name)')
          .eq('role_id', rest.role_id)
        if (cancelled) return
        const names = (perms ?? [])
          .map((p) => (p as unknown as { permissions: { name: string } | null }).permissions?.name)
          .filter((n): n is string => !!n)
        setPermissions(new Set(names))
      } else {
        setPermissions(new Set())
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session])

  const hasPermission = useCallback((perm: PermissionName) => permissions.has(perm), [permissions])

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoading(false)
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ session, profile, permissions, loading, hasPermission, signIn, signOut }),
    [session, profile, permissions, loading, hasPermission, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function usePermissions() {
  const { permissions, hasPermission } = useAuth()
  return { permissions, hasPermission }
}
