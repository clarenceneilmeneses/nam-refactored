import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, landingRoute } from '@/hooks/useAuth'
import type { PermissionName } from '@/types/database'

type GateProps = {
  perm: PermissionName | PermissionName[]
  children: ReactNode
  fallback?: ReactNode
}

/** Hides UI (buttons, nav items, sections) the user lacks permission for. */
export function PermissionGate({ perm, children, fallback = null }: GateProps) {
  const { hasPermission } = useAuth()
  const perms = Array.isArray(perm) ? perm : [perm]
  return perms.some((p) => hasPermission(p)) ? <>{children}</> : <>{fallback}</>
}

/** Route-level guard: redirects unauthorized users to their landing page. */
export function RequirePermission({ perm, children }: { perm: PermissionName | PermissionName[]; children: ReactNode }) {
  const { hasPermission, permissions, loading } = useAuth()
  if (loading) return null
  const perms = Array.isArray(perm) ? perm : [perm]
  if (!perms.some((p) => hasPermission(p))) {
    return <Navigate to={landingRoute(permissions)} replace />
  }
  return <>{children}</>
}

export const SUPER_ADMIN_ROLE_ID = 1

/** Route-level guard for Super Admin-only pages (role, not permission based). */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { profile, permissions, loading } = useAuth()
  if (loading) return null
  if (profile?.role_id !== SUPER_ADMIN_ROLE_ID) {
    return <Navigate to={landingRoute(permissions)} replace />
  }
  return <>{children}</>
}
