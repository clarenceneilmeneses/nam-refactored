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
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
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
  /** Re-fetch the profile row (e.g. after the user edits their own name). */
  refreshProfile: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Selectable "home page after login" options, each gated like its route. */
export const HOME_ROUTE_OPTIONS: Array<{ path: string; label: string; perms: PermissionName[] }> = [
  { path: '/', label: 'Dashboard', perms: ['view_dashboard'] },
  { path: '/records', label: 'Records', perms: ['manage_sales', 'view_dashboard'] },
  { path: '/sales/new', label: 'Sales Entry', perms: ['manage_sales'] },
  { path: '/quotations', label: 'Quotations', perms: ['manage_sales'] },
  { path: '/products', label: 'Products', perms: ['manage_products'] },
  { path: '/logistics', label: 'Logistics', perms: ['view_logistics'] },
]

export const KEY_HOME_ROUTE = 'nam-home-route'

/** Stable random id identifying THIS browser (users.current_session_id). */
const KEY_DEVICE_SESSION = 'nam-device-session'

function deviceId(): string {
  let id = localStorage.getItem(KEY_DEVICE_SESSION)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY_DEVICE_SESSION, id)
  }
  return id
}

/**
 * Single-active-device enforcement (09_single_session.sql): every login writes
 * this browser's device id to the user's row, superseding whichever device
 * held it. The id is stable per browser, so repeated claims are idempotent.
 * Errors are swallowed — if the column doesn't exist yet the app keeps
 * working, just without the one-device rule.
 */
async function claimDeviceSession(authId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ current_session_id: deviceId() })
    .eq('auth_id', authId)
  if (error) console.error('Could not claim device session:', error.message)
}

/**
 * Where a user lands after login. A device preference (Settings → System)
 * wins when the user still has permission for it; otherwise falls back to
 * descending privilege. Drivers land on Logistics.
 */
export function landingRoute(permissions: Set<string>): string {
  const pref = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_HOME_ROUTE) : null
  const opt = pref ? HOME_ROUTE_OPTIONS.find((o) => o.path === pref) : undefined
  if (opt && opt.perms.some((p) => permissions.has(p))) return opt.path
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
  const [reloadKey, setReloadKey] = useState(0)

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
      const CORE_COLS = 'id, username, full_name, role_id, auth_id, created_at, roles(name)'
      type UserRowJoined = UserRow & { roles: { name: string } | null }
      const primary = await supabase
        .from('users')
        .select(`${CORE_COLS}, avatar_url`)
        .eq('auth_id', uid)
        .maybeSingle()
      let user = primary.data as UserRowJoined | null
      if (primary.error) {
        // e.g. avatar_url not migrated yet (08_profile.sql) — never let a
        // schema hiccup masquerade as "no profile" and lock the user out.
        console.error('Profile load failed, retrying without avatar_url:', primary.error.message)
        const fallback = await supabase.from('users').select(CORE_COLS).eq('auth_id', uid).maybeSingle()
        user = fallback.data
          ? ({ ...(fallback.data as Omit<UserRowJoined, 'avatar_url'>), avatar_url: null } as UserRowJoined)
          : null
      }
      if (cancelled) return
      if (!user) {
        // Signed in via Supabase Auth but not linked to a legacy profile row.
        setProfile(null)
        setPermissions(new Set())
        setLoading(false)
        return
      }
      const { roles, ...rest } = user
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
  }, [session, reloadKey])

  // One device per account: watch for another login taking over this account
  // (checked on load, on window focus, and every 30s) and sign this device out.
  useEffect(() => {
    if (!session) return
    const authId = session.user.id
    let cancelled = false
    let busy = false
    async function readDbSid(): Promise<{ ok: boolean; sid: string | null }> {
      const { data, error } = await supabase
        .from('users')
        .select('current_session_id')
        .eq('auth_id', authId)
        .maybeSingle()
      if (error || !data) return { ok: false, sid: null } // column missing / offline — skip quietly
      return { ok: true, sid: data.current_session_id }
    }
    async function check() {
      if (busy) return
      busy = true
      try {
        const sid = deviceId()
        const first = await readDbSid()
        if (cancelled || !first.ok) return
        if (!first.sid) {
          // No device holds the account yet (pre-rule session) — claim it.
          await claimDeviceSession(authId)
          return
        }
        if (first.sid === sid) return
        // Mismatch — but a login on THIS device may still be writing its
        // claim. Re-read after a beat and only kick if it's still not ours.
        await new Promise((r) => setTimeout(r, 2000))
        if (cancelled) return
        const second = await readDbSid()
        if (cancelled || !second.ok || !second.sid || second.sid === sid) return
        toast.error('Signed out: this account was signed in on another device.', { duration: 8000 })
        await supabase.auth.signOut({ scope: 'local' })
      } finally {
        busy = false
      }
    }
    check()
    const id = setInterval(check, 30_000)
    const onFocus = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [session])

  const hasPermission = useCallback((perm: PermissionName) => permissions.has(perm), [permissions])

  const refreshProfile = useCallback(() => setReloadKey((k) => k + 1), [])

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoading(false)
    if (!error && data.user) {
      // Take over as the account's single active device; the previous device
      // notices the id change and signs itself out.
      void claimDeviceSession(data.user.id)
      // Audit trail (legacy parity). The profile row hasn't loaded yet, so
      // resolve the legacy users.id here; fire-and-forget, never blocks login.
      void supabase
        .from('users')
        .select('id, username')
        .eq('auth_id', data.user.id)
        .maybeSingle()
        .then(({ data: u }) => {
          if (u) logAction(u.id, 'Logged In', `User "${u.username}" logged in`)
        })
    }
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    // Log before the session is destroyed — the insert needs the
    // authenticated role to pass RLS. logAction swallows failures.
    if (profile) await logAction(profile.id, 'Logged Out', `User "${profile.username}" logged out`)
    // Release the device claim so the next login anywhere starts clean.
    if (session) await supabase.from('users').update({ current_session_id: null }).eq('auth_id', session.user.id)
    await supabase.auth.signOut()
  }, [profile, session])

  const value = useMemo(
    () => ({ session, profile, permissions, loading, hasPermission, signIn, signOut, refreshProfile }),
    [session, profile, permissions, loading, hasPermission, signIn, signOut, refreshProfile],
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
