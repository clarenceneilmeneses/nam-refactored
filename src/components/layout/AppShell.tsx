import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  ClipboardList,
  FilePlus2,
  LineChart,
  FileSpreadsheet,
  FileText,
  History,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAvatarUrl } from '@/hooks/useProfile'
import { useSettings } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { SUPER_ADMIN_ROLE_ID } from '@/components/layout/PermissionGate'
import { Avatar } from '@/components/shared/Avatar'
import { SidebarClock } from '@/components/layout/SidebarClock'
import { cn } from '@/lib/utils'
import type { PermissionName } from '@/types/database'
import namLogo from '@/assets/nam-logo.png'
import namMark from '@/assets/nam-mark.png'
import namLogoDark from '@/assets/nam-logo-dark.png'
import namMarkDark from '@/assets/nam-mark-dark.png'

type NavItem = {
  to: string
  label: string
  icon: typeof BarChart3
  perms: PermissionName[]
  /** Role-gated instead of permission-gated (e.g. CSV Import & Data Management). */
  superAdminOnly?: boolean
  /** Kept in the app but hidden from the sidebar — flip off to restore. */
  hidden?: boolean
}

type NavSection = {
  heading?: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: BarChart3, perms: ['view_dashboard'] },
      { to: '/analytics', label: 'Analytics', icon: LineChart, perms: ['view_dashboard'] },
    ],
  },
  {
    heading: 'Sales',
    items: [
      { to: '/sales/new', label: 'Sales Entry', icon: FilePlus2, perms: ['manage_sales'] },
      { to: '/records', label: 'Records', icon: ClipboardList, perms: ['manage_sales', 'view_dashboard'] },
      { to: '/quotations', label: 'Quotations', icon: FileText, perms: ['manage_sales'] },
      // Hidden per request — remove `hidden: true` to bring Finance back to the sidebar.
      { to: '/finance', label: 'Finance', icon: Wallet, perms: ['manage_finance', 'view_dashboard'], hidden: true },
    ],
  },
  {
    heading: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: Package, perms: ['manage_products'] },
      { to: '/logistics', label: 'Logistics', icon: Truck, perms: ['view_logistics'] },
    ],
  },
  {
    heading: 'Administration',
    // Super Admin (role id 1) only, not permission-gated — matches legacy.
    items: [
      { to: '/import', label: 'CSV Import', icon: FileSpreadsheet, perms: [], superAdminOnly: true },
      { to: '/admin/users', label: 'Users', icon: Users, perms: [], superAdminOnly: true },
      { to: '/admin/roles', label: 'Roles', icon: ShieldCheck, perms: [], superAdminOnly: true },
      { to: '/admin/logs', label: 'Logs', icon: History, perms: [], superAdminOnly: true },
    ],
  },
]

function manilaGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }).format(new Date()),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function AppShell() {
  const { session, profile, loading, hasPermission, signOut } = useAuth()
  const avatarUrl = useAvatarUrl()
  const { startCollapsed } = useSettings()
  const { resolved } = useTheme()
  const [collapsed, setCollapsed] = useState(startCollapsed)

  const logoSrc = resolved === 'dark' ? namLogoDark : namLogo
  const markSrc = resolved === 'dark' ? namMarkDark : namMark
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading…</div>
    )
  }
  if (!session) return <Navigate to="/login" replace />

  if (!profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-ink">Your account isn’t linked to a staff profile yet.</p>
        <p className="max-w-md text-xs text-ink-muted">
          An administrator must set your <code>auth_id</code> on the <code>users</code> table (see SETUP.md, step 3).
        </p>
        <button
          className="text-xs text-accent underline cursor-pointer"
          onClick={async () => {
            await signOut()
            navigate('/login')
          }}
        >
          Sign out
        </button>
      </div>
    )
  }

  const visibleSections = NAV.map((section) => ({
    heading: section.heading,
    items: section.items.filter((item) =>
      item.hidden
        ? false
        : item.superAdminOnly
          ? profile.role_id === SUPER_ADMIN_ROLE_ID
          : item.perms.some((p) => hasPermission(p)),
    ),
  })).filter((section) => section.items.length > 0)

  const navLinks = (
    <nav className="no-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {visibleSections.map((section, i) => (
        <div key={section.heading ?? `section-${i}`} className="flex flex-col gap-0.5">
          {collapsed
            ? i > 0 && <div className="mx-2 my-2 border-t border-hairline" />
            : section.heading && (
                <p className="px-3 pt-4 pb-1 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                  {section.heading}
                </p>
              )}
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors duration-150 hover:bg-ink/5 hover:text-ink',
                  isActive && 'bg-accent-soft/60 font-medium text-accent-strong hover:bg-accent-soft/60',
                  collapsed && 'justify-center px-2',
                )
              }
              title={item.label}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // Greeting + identity, now pinned to the top of the sidebar.
  const renderUserBlock = (isCollapsed: boolean) => (
    <div className={cn('flex items-center gap-3 border-b border-hairline p-3', isCollapsed && 'justify-center px-0')}>
      <Avatar url={avatarUrl} name={profile.full_name} fallback={profile.username} className="h-9 w-9 text-xs" />
      {!isCollapsed && (
        <div className="min-w-0">
          <p className="text-[11px] text-ink-muted">{manilaGreeting()},</p>
          <p className="truncate text-sm font-medium text-ink">{profile.full_name || profile.username}</p>
          <p className="truncate text-[11px] text-ink-muted">{profile.role_name ?? '—'}</p>
        </div>
      )}
    </div>
  )

  const renderFooter = (isCollapsed: boolean) => (
    <div className="border-t border-hairline p-2">
      <NavLink
        to="/settings"
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors duration-150 hover:bg-ink/5 hover:text-ink',
            isActive && 'bg-accent-soft/60 font-medium text-accent-strong hover:bg-accent-soft/60',
            isCollapsed && 'justify-center px-2',
          )
        }
        title="Settings"
      >
        <Settings className="h-4 w-4 shrink-0" />
        {!isCollapsed && 'Settings'}
      </NavLink>
      <button
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors duration-150 hover:bg-ink/5 hover:text-ink cursor-pointer',
          isCollapsed && 'justify-center px-2',
        )}
        onClick={handleSignOut}
        title="Sign out"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!isCollapsed && 'Sign out'}
      </button>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'm-3 hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-e2 md:flex',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <div className={cn('flex items-center justify-center border-b border-hairline p-3', collapsed && 'px-0 py-3')}>
          {collapsed ? (
            <img src={markSrc} alt="NAM Builders and Supply Corp." className="h-8 w-8 object-contain" />
          ) : (
            <img src={logoSrc} alt="NAM Builders and Supply Corp." className="w-40" />
          )}
        </div>
        {renderUserBlock(collapsed)}
        <SidebarClock collapsed={collapsed} />
        {navLinks}
        <button
          className={cn(
            'mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-ink-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink cursor-pointer',
            collapsed && 'justify-center px-2',
          )}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
          {!collapsed && 'Collapse'}
        </button>
        {renderFooter(collapsed)}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline p-3">
              <img src={logoSrc} alt="NAM Builders and Supply Corp." className="w-36" />
              <button onClick={() => setMobileOpen(false)} className="p-1 text-ink-muted cursor-pointer" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderUserBlock(false)}
            <SidebarClock collapsed={false} />
            {navLinks}
            {renderFooter(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 md:hidden">
          <button className="p-1 text-ink-secondary cursor-pointer" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <img src={markSrc} alt="NAM Builders and Supply Corp." className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold">NAM Supply</span>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
