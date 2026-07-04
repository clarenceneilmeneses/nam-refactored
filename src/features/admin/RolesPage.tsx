import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Roles</h1>
          <p className="text-xs text-ink-muted">
            Permissions are enforced at the database (RLS) — changes apply on each user’s next data
            fetch, so affected users may need to refresh.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> Add Role
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(roles ?? []).map((role) => {
          const perms = permsByRole.get(role.id) ?? []
          const count = userCounts.get(role.id) ?? 0
          return (
            <Card key={role.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-1.5">
                    {role.id === SUPER_ADMIN_ROLE_ID && <span aria-hidden>👑</span>}
                    {role.name}
                  </CardTitle>
                  <CardDescription>{role.description || 'No description'}</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="neutral" title={`${count} user(s) have this role`}>
                    <UsersRound className="h-3 w-3" /> {count}
                  </Badge>
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
                    disabled={role.id === SUPER_ADMIN_ROLE_ID}
                    title={role.id === SUPER_ADMIN_ROLE_ID ? 'The Super Admin role cannot be deleted' : undefined}
                    onClick={() => setDeleting(role)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {perms.length === 0 ? (
                  <p className="text-xs text-ink-muted">No permissions</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {perms.map((perm) => (
                      <Badge key={perm.id} variant="accent" title={perm.description ?? undefined}>
                        <ShieldCheck className="h-3 w-3" /> {perm.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

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
