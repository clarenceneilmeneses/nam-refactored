import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Trash2, UserRoundCheck } from 'lucide-react'
import { useSales } from '@/hooks/useSales'
import { useUsers } from '@/hooks/useAdmin'
import { useAssignCompany, useCompanyAssignments, useDeleteAssignment } from '@/hooks/useCompanyAssignments'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import type { CompanyAssignmentRow } from '@/types/database'

/** Legacy assignments.php — maps companies to account managers; powers the
 *  dashboard's manager chart, colors, and drilldowns. */
export function AssignmentsPage() {
  const { data: sales } = useSales()
  const { data: users } = useUsers()
  const { data: assignments, isLoading, error } = useCompanyAssignments()
  const assign = useAssignCompany()
  const deleteAssignment = useDeleteAssignment()

  const [company, setCompany] = useState('')
  const [manager, setManager] = useState('')
  const [removing, setRemoving] = useState<CompanyAssignmentRow | null>(null)

  const companies = useMemo(
    () =>
      [...new Set((sales ?? []).map((s) => s.company?.trim()).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [sales],
  )
  const managers = useMemo(
    () =>
      [...new Set((users ?? []).map((u) => u.full_name?.trim()).filter((n): n is string => !!n))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [users],
  )
  const assignedManager = useMemo(
    () => new Map((assignments ?? []).map((a) => [a.company_name, a.employee_name])),
    [assignments],
  )

  async function onAssign() {
    if (!company || !manager) {
      toast.error('Choose both a company and an account manager')
      return
    }
    try {
      await assign.mutateAsync({ company, manager })
      toast.success(`Successfully assigned ${company} to ${manager}`)
      setCompany('')
      setManager('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (error) return <p className="text-sm text-critical">Couldn’t load assignments: {(error as Error).message}</p>

  return (
    <div className="space-y-4">
      <PageHeader
        title="Account-Manager Assignments"
        subtitle="Map companies to account managers — this drives the dashboard’s manager chart, colors, and drilldowns."
        actions={
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Assign a Company</CardTitle>
          <CardDescription>Reassigning a company overwrites its current account manager.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-72 space-y-1">
              <Label htmlFor="as-company">Company</Label>
              <Select id="as-company" value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {assignedManager.get(c) ? ` — currently ${assignedManager.get(c)}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-56 space-y-1">
              <Label htmlFor="as-manager">Account Manager</Label>
              <Select id="as-manager" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="">Select a manager…</option>
                {managers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={onAssign} disabled={assign.isPending}>
              <UserRoundCheck className="h-4 w-4" /> {assign.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {(assignments ?? []).length === 0 ? (
              <EmptyState title="No assignments yet" description="Assign a company above to get started." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-page/60 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Account Manager</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(assignments ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-page/70">
                      <td className="px-3 py-2 font-medium">{row.company_name || '—'}</td>
                      <td className="px-3 py-2">{row.employee_name || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-critical"
                            aria-label={`Unassign ${row.company_name}`}
                            onClick={() => setRemoving(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove Assignment"
        description={`Unassign ${removing?.company_name} from ${removing?.employee_name}? The company drops out of the manager rollups on the dashboard.`}
        confirmLabel="Unassign"
        destructive
        busy={deleteAssignment.isPending}
        onConfirm={async () => {
          if (!removing) return
          try {
            await deleteAssignment.mutateAsync(removing)
            toast.success(`Removed assignment for ${removing.company_name}`)
            setRemoving(null)
          } catch (e) {
            toast.error((e as Error).message)
          }
        }}
      />
    </div>
  )
}
