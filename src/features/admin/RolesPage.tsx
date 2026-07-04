import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Crown, Pencil, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import {
  useDeleteRole,
  usePermissionList,
  useRolePermissions,
  useRoles,
  useSaveRole,
  useUsers,
} from '@/hooks/useAdmin'
import { SUPER_ADMIN_ROLE_ID } from '@/components/layout/PermissionGate'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableSkeleton } from '@/components/ui/skeleton'
import type { PermissionRow, RoleRow } from '@/types/database'

export function RolesPage() {
  const { data: roles, isLoading, error } = useRoles()
  const { data: permissions } = usePermissionList()
  const { data: rolePerms } = useRolePermissions()
  const { data: users } = useUsers()
  const deleteRole = useDeleteRole()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [deleting, setDeleting] = useState<RoleRow | null>(null)

  const userCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const u of users ?? []) {
      if (u.role_id != null) counts.set(u.role_id, (counts.get(u.role_id) ?? 0) + 1)
    }
    return counts
  }, [users])

  const permsByRole = useMemo(() => {
    const byId = new Map((permissions ?? []).map((p) => [p.id, p]))
    const map = new Map<number, PermissionRow[]>()
    for (const rp of rolePerms ?? []) {
      const perm = byId.get(rp.permission_id)
      if (!perm) continue
      const list = map.get(rp.role_id) ?? []
      list.push(perm)
      map.set(rp.role_id, list)
    }
    return map
  }, [permissions, rolePerms])

  if (error) return <p className="text-sm text-critical">Couldn’t load roles: {(error as Error).message}</p>
  if (isLoading || !permissions || !rolePerms) return <TableSkeleton />

  const deletingCount = deleting ? (userCounts.get(deleting.id) ?? 0) : 0
  const permCols = [...permissions].sort((a, b) => a.id - b.id)
  const roleList = roles ?? []
  const unusedRoles = roleList.filter((r) => (userCounts.get(r.id) ?? 0) === 0).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles"
        subtitle="Permissions are enforced at the database (RLS) — changes apply on each user’s next data fetch, so affected users may need to refresh."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Add Role
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard tone="accent" icon="shield" label="Roles" value={roleList.length.toLocaleString()} />
        <StatCard tone="neutral" icon="key" label="Permissions" value={permCols.length.toLocaleString()} />
        <StatCard tone={unusedRoles > 0 ? 'warning' : 'neutral'} icon="group" label="Roles with no users" value={unusedRoles.toLocaleString()} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-page/60 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <th className="px-3 py-2">Role</th>
                <th className="px-2 py-2 text-center">Users</th>
                {permCols.map((perm) => (
                  <th key={perm.id} className="px-2 py-2 text-center font-mono normal-case" title={perm.description ?? undefined}>
                    {perm.name}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleList.map((role) => {
                const isSuper = role.id === SUPER_ADMIN_ROLE_ID
                const granted = new Set((permsByRole.get(role.id) ?? []).map((p) => p.id))
                const count = userCounts.get(role.id) ?? 0
                return (
                  <tr key={role.id} className="border-b border-hairline last:border-0 hover:bg-page/70">
                    <td className="px-3 py-2 align-top">
                      <p className="flex items-center gap-1.5 font-medium">
                        {isSuper && <Crown className="h-3.5 w-3.5 text-warning-text" aria-hidden />}
                        {role.name}
                      </p>
                      <p className="text-xs text-ink-muted">{role.description || 'No description'}</p>
                    </td>
                    <td className="px-2 py-2 text-center align-top">
                      <Badge variant="neutral" title={`${count} user(s) have this role`}>
                        <UsersRound className="h-3 w-3" /> {count}
                      </Badge>
                    </td>
                    {permCols.map((perm) => {
                      const has = isSuper || granted.has(perm.id)
                      return (
                        <td key={perm.id} className="px-2 py-2 text-center align-middle">
                          {has ? (
                            <ShieldCheck className="mx-auto h-4 w-4 text-accent" aria-label="granted" />
                          ) : (
                            <span className="text-ink-muted" aria-label="not granted">–</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Edit ${role.name}`}
                          onClick={() => {
                            setEditing(role)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-critical"
                          aria-label={`Delete ${role.name}`}
                          disabled={isSuper}
                          title={isSuper ? 'The Super Admin role cannot be deleted' : undefined}
                          onClick={() => setDeleting(role)}
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

      <RoleFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        role={editing}
        permissions={permissions}
        currentPermIds={editing ? (permsByRole.get(editing.id) ?? []).map((p) => p.id) : []}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete Role"
        description={
          deletingCount > 0
            ? `${deletingCount} user(s) still have the "${deleting?.name}" role — deleting it leaves them with no role (and no access) until they are reassigned. Delete anyway?`
            : `Delete the "${deleting?.name}" role and its permissions?`
        }
        confirmLabel="Delete Role"
        destructive
        busy={deleteRole.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteRole.mutateAsync(deleting)
            toast.success(`Deleted role "${deleting.name}"`)
            setDeleting(null)
          } catch (e) {
            toast.error((e as Error).message)
          }
        }}
      />
    </div>
  )
}

function RoleFormDialog({
  open,
  onClose,
  role,
  permissions,
  currentPermIds,
}: {
  open: boolean
  onClose: () => void
  /** Present = edit; absent = add-new. */
  role: RoleRow | null
  permissions: PermissionRow[]
  currentPermIds: number[]
}) {
  const saveRole = useSaveRole()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setChecked(new Set(currentPermIds))
    // currentPermIds is derived data — re-seeding on open/role is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role])

  async function onSave() {
    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }
    try {
      await saveRole.mutateAsync({
        id: role?.id,
        name: name.trim(),
        description: description.trim(),
        permissionIds: [...checked],
      })
      toast.success(`Role "${name.trim()}" saved`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={role ? 'Edit Role' : 'Add Role'}
      description="Saving replaces the role’s permission set."
      className="max-w-md"
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="rf-name">Role Name *</Label>
          <Input id="rf-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rf-desc">Description</Label>
          <Input id="rf-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Permissions</Label>
          <div className="space-y-1.5 rounded-md border border-hairline p-3">
            {permissions.map((perm) => (
              <label key={perm.id} className="flex items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#2a78d6]"
                  checked={checked.has(perm.id)}
                  onChange={(e) =>
                    setChecked((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(perm.id)
                      else next.delete(perm.id)
                      return next
                    })
                  }
                />
                <span className="font-mono text-xs">{perm.name}</span>
                {perm.description && <span className="text-xs text-ink-muted">— {perm.description}</span>}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saveRole.isPending}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saveRole.isPending}>
          {saveRole.isPending ? 'Saving…' : 'Save Role'}
        </Button>
      </div>
    </Dialog>
  )
}
