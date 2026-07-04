import { useMemo, useState } from 'react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useSystemLogs, useUsers } from '@/hooks/useAdmin'
import { DataTable } from '@/components/shared/DataTable'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { formatDateTimeManila } from '@/lib/format'
import type { SystemLogRow } from '@/types/database'

/**
 * Rows are pre-enriched with the rendered strings (Manila timestamp, resolved
 * user name) so the global text filter searches what the user actually sees.
 */
type LogRow = SystemLogRow & { whenText: string; userName: string; userDeleted: boolean }

const col = createColumnHelper<LogRow>()

const columns = [
  col.accessor('whenText', {
    header: 'Date & Time',
    cell: (c) => <span className="whitespace-nowrap text-ink-secondary">{c.getValue()}</span>,
    // id order = insertion order; sorting the formatted string would be alphabetical.
    sortingFn: (a, b) => a.original.id - b.original.id,
    sortDescFirst: true,
  }),
  col.accessor('userName', {
    header: 'User',
    cell: (c) =>
      c.row.original.userDeleted ? (
        <span className="text-ink-muted" title="This user has been deleted">{c.getValue()}</span>
      ) : (
        c.getValue()
      ),
  }),
  col.accessor('action', { header: 'Action', cell: (c) => <Badge variant="neutral">{c.getValue()}</Badge> }),
  col.accessor('description', {
    header: 'Description',
    cell: (c) => (
      <span className="block max-w-xl truncate" title={c.getValue() ?? ''}>
        {c.getValue() || '—'}
      </span>
    ),
  }),
  col.accessor('ip_address', {
    header: 'IP Address',
    cell: (c) => <span className="text-xs text-ink-muted tabular-nums">{c.getValue() || '—'}</span>,
    meta: { thClassName: 'text-right', tdClassName: 'text-right' },
  }),
] as ColumnDef<LogRow, unknown>[]

export function LogsPage() {
  const { data: logs, isLoading, error } = useSystemLogs()
  const { data: users } = useUsers()
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const userNames = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.full_name || u.username])), [users])
  const actions = useMemo(() => [...new Set((logs ?? []).map((l) => l.action))].sort(), [logs])

  const rows = useMemo<LogRow[]>(
    () =>
      (logs ?? [])
        .filter(
          (l) =>
            (!userFilter || String(l.user_id) === userFilter) &&
            (!actionFilter || l.action === actionFilter),
        )
        .map((l) => ({
          ...l,
          whenText: formatDateTimeManila(l.created_at),
          // 13k+ legacy logs reference users deleted long ago — still render them.
          userName: userNames.get(l.user_id) ?? `User #${l.user_id}`,
          userDeleted: !userNames.has(l.user_id),
        })),
    [logs, userFilter, actionFilter, userNames],
  )

  if (error) return <p className="text-sm text-critical">Couldn’t load logs: {(error as Error).message}</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">System Logs</h1>
        <p className="text-xs text-ink-muted">
          {(logs ?? []).length.toLocaleString()} audit entries (read-only, Asia/Manila time)
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-ink-muted" />
          <Input className="w-64 pl-8" placeholder="Search logs…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="User filter">
          <option value="">All users</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.username}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Action filter">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          pageSize={100}
          stickyHeader
          emptyTitle="No log entries"
          emptyDescription="Nothing matches the current search/filters."
        />
      )}
    </div>
  )
}
