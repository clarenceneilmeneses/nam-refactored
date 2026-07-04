import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Crown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useCreateUser, useDeleteUser, useRoles, useUpdateUser, useUsers } from '@/hooks/useAdmin'
import { useAuth } from '@/hooks/useAuth'
import { SUPER_ADMIN_ROLE_ID } from '@/components/layout/PermissionGate'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Avatar } from '@/components/shared/Avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TableSkeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import type { RoleRow, UserRow } from '@/types/database'

type UserSort = 'newest' | 'name' | 'role'

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers()
  const { data: roles } = useRoles()
  const deleteUser = useDeleteUser()
  const { profile } = useAuth()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [sort, setSort] = useState<UserSort>('newest')
  // Hidden by default — the numeric ID clutters the table; toggle persists.
  const [showId, setShowId] = useState(() => localStorage.getItem('nam-users-show-id') === 'true')

  const toggleShowId = (on: boolean) => {
    localStorage.setItem('nam-users-show-id', String(on))
    setShowId(on)
  }

  const roleNames = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r.name])), [roles])
  const superAdminCount = useMemo(
    () => (users ?? []).filter((u) => u.role_id === SUPER_ADMIN_ROLE_ID).length,
    [users],
  )
  const noLoginCount = useMemo(() => (users ?? []).filter((u) => !u.auth_id).length, [users])

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = (users ?? []).filter((u) => {
      if (roleFilter !== 'all' && String(u.role_id ?? '') !== roleFilter) return false
      if (!q) return true
      return u.username.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) => {
      if (sort === 'name') return (a.full_name || a.username).localeCompare(b.full_name || b.username)
      if (sort === 'role') {
        const ra = roleNames.get(a.role_id ?? -1) ?? '~'
        const rb = roleNames.get(b.role_id ?? -1) ?? '~'
        return ra.localeCompare(rb) || a.username.localeCompare(b.username)
      }
      return b.id - a.id // newest
    })
    return list
  }, [users, search, roleFilter, sort, roleNames])

  if (error) return <p className="text-sm text-critical">Couldn’t load users: {(error as Error).message}</p>

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Staff accounts and their roles. New users can sign in right away."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Add User
          </Button>
        }
      />

      {!isLoading && (users?.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard tone="accent" icon="group" label="Total users" value={(users?.length ?? 0).toLocaleString()} />
          <StatCard tone={superAdminCount > 1 ? 'warning' : 'neutral'} icon="admin_panel_settings" label="Super Admins" value={superAdminCount.toLocaleString()} />
          <StatCard tone={noLoginCount > 0 ? 'warning' : 'neutral'} icon="person_off" label="Without login yet" value={noLoginCount.toLocaleString()} />
        </div>
      )}

      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
            <Input
              className="pl-8"
              placeholder="Search username or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select className="w-auto shrink-0" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="all">All roles</option>
            {(roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <Select className="w-auto shrink-0" value={sort} onChange={(e) => setSort(e.target.value as UserSort)} aria-label="Sort users">
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="role">Role</option>
          </Select>
          <label className="flex shrink-0 items-center gap-2 pl-1 text-xs font-medium text-ink-secondary select-none">
            <Switch checked={showId} onChange={toggleShowId} label="Show ID column" />
            Show ID
          </label>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          title="No users found"
          description={search || roleFilter !== 'all' ? 'Try a different search or filter.' : 'Add a user to get started.'}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-page/60 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                  {showId && <th className="px-3 py-2">ID</th>}
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Full Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const isSelf = profile?.id === user.id
                  const isLastSuperAdmin = user.role_id === SUPER_ADMIN_ROLE_ID && superAdminCount <= 1
                  return (
                    <tr key={user.id} className="border-b border-hairline last:border-0 hover:bg-page/70">
                      {showId && <td className="px-3 py-2 text-ink-muted tabular-nums">{user.id}</td>}
                      <td className="px-3 py-2 font-medium">
                        <span className="flex items-center gap-2">
                          <Avatar url={user.avatar_url} name={user.full_name} fallback={user.username} className="h-7 w-7 text-[10px]" />
                          <span>{user.username}</span>
                          {isSelf && <Badge variant="accent">you</Badge>}
                          {!user.auth_id && (
                            <Badge variant="serious" title="No Supabase Auth login yet — edit the user and set a password to create one">
                              no login
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2">{user.full_name || '—'}</td>
                      <td className="px-3 py-2">
                        {user.role_id === SUPER_ADMIN_ROLE_ID ? (
                          <Badge className="bg-warning/15 text-warning-text">
                            <Crown className="h-3 w-3" /> {roleNames.get(user.role_id) ?? 'Super Admin'}
                          </Badge>
                        ) : user.role_id != null && roleNames.has(user.role_id) ? (
                          <Badge variant="neutral">{roleNames.get(user.role_id)}</Badge>
                        ) : (
                          <Badge variant="neutral" className="text-ink-muted">No Role</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink-muted">{formatDate(user.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Edit ${user.username}`}
                            onClick={() => {
                              setEditing(user)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-critical"
                            aria-label={`Delete ${user.username}`}
                            disabled={isSelf || isLastSuperAdmin}
                            title={
                              isSelf
                                ? 'You cannot delete your own account'
                                : isLastSuperAdmin
                                  ? 'Cannot delete the last Super Admin'
                                  : undefined
                            }
                            onClick={() => setDeleting(user)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <UserFormDialog open={formOpen} onClose={() => setFormOpen(false)} user={editing} roles={roles ?? []} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete User"
        description={`Delete "${deleting?.username}" (${deleting?.full_name || 'no name'})? Their login is removed immediately; their audit-log history is kept.`}
        confirmLabel="Delete User"
        destructive
        busy={deleteUser.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteUser.mutateAsync(deleting)
            toast.success(`Deleted user "${deleting.username}"`)
            setDeleting(null)
          } catch (e) {
            toast.error((e as Error).message)
          }
        }}
      />
    </div>
  )
}

type Draft = {
  username: string
  full_name: string
  role_id: string
  password: string
  email: string
}

const blank: Draft = { username: '', full_name: '', role_id: '', password: '', email: '' }

function UserFormDialog({
  open,
  onClose,
  user,
  roles,
}: {
  open: boolean
  onClose: () => void
  /** Present = edit; absent = add-new. */
  user: UserRow | null
  roles: RoleRow[]
}) {
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const [draft, setDraft] = useState<Draft>(blank)
  const busy = createUser.isPending || updateUser.isPending

  useEffect(() => {
    if (!open) return
    setDraft(
      user
        ? {
            username: user.username,
            full_name: user.full_name ?? '',
            role_id: user.role_id != null ? String(user.role_id) : '',
            password: '',
            email: '',
          }
        : blank,
    )
  }, [open, user])

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function onSave() {
    if (!draft.username.trim()) {
      toast.error('Username is required')
      return
    }
    if (!draft.role_id) {
      toast.error('Please choose a role')
      return
    }
    if (!user && draft.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    try {
      if (user) {
        await updateUser.mutateAsync({
          id: user.id,
          username: draft.username.trim(),
          full_name: draft.full_name.trim(),
          role_id: Number(draft.role_id),
          password: draft.password || undefined,
        })
        toast.success(`User "${draft.username.trim()}" updated${draft.password ? ' (password reset)' : ''}`)
      } else {
        await createUser.mutateAsync({
          username: draft.username.trim(),
          password: draft.password,
          full_name: draft.full_name.trim(),
          role_id: Number(draft.role_id),
          email: draft.email.trim() || null,
        })
        toast.success(`User "${draft.username.trim()}" created`)
      }
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? 'Edit User' : 'Add User'}
      description={
        user
          ? 'Leave the password blank to keep the current one.'
          : 'Creates the Supabase Auth login and the staff profile together.'
      }
      className="max-w-md"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="uf-username">Username *</Label>
            <Input id="uf-username" value={draft.username} autoFocus onChange={(e) => set('username', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="uf-fullname">Full Name</Label>
            <Input id="uf-fullname" value={draft.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="uf-role">Role *</Label>
          <Select id="uf-role" value={draft.role_id} onChange={(e) => set('role_id', e.target.value)}>
            <option value="">Select a role…</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="uf-password">{user ? 'New Password' : 'Password *'}</Label>
          <Input
            id="uf-password"
            type="password"
            value={draft.password}
            placeholder={user ? 'Leave blank to keep current password' : 'At least 6 characters'}
            autoComplete="new-password"
            onChange={(e) => set('password', e.target.value)}
          />
          {user && !user.auth_id && (
            <p className="text-xs text-ink-muted">
              This user has no login yet — setting a password creates one ({draft.username.trim().toLowerCase() || 'username'}@nam.local).
            </p>
          )}
        </div>
        {!user && (
          <div className="space-y-1">
            <Label htmlFor="uf-email">Email</Label>
            <Input
              id="uf-email"
              type="email"
              value={draft.email}
              placeholder={`Optional — defaults to ${draft.username.trim().toLowerCase() || 'username'}@nam.local`}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : user ? 'Save Changes' : 'Create User'}
        </Button>
      </div>
    </Dialog>
  )
}
