import { useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Table as TanTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EmptyState } from './EmptyState'

// Per-column th/td classes (e.g. a sticky actions column with a left shadow).
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    thClassName?: string
    tdClassName?: string
  }
}

type DataTableProps<T> = {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  globalFilter?: string
  onGlobalFilterChange?: (v: string) => void
  emptyTitle?: string
  emptyDescription?: string
  pageSize?: number
  /** Render extra toolbar content; receives the table instance (e.g. for export). */
  toolbar?: (table: TanTable<T>) => ReactNode
  rowClassName?: (row: T) => string
  /** Controlled row selection (checkbox column); provide all three together. */
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  getRowId?: (row: T) => string
  /** Caps the table height and keeps the header row pinned while scrolling. */
  stickyHeader?: boolean
}

export function DataTable<T>({
  data,
  columns,
  globalFilter,
  onGlobalFilterChange,
  emptyTitle = 'No records',
  emptyDescription = 'Nothing matches the current filters.',
  pageSize = 25,
  toolbar,
  rowClassName,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  stickyHeader = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, ...(rowSelection !== undefined && { rowSelection }) },
    onSortingChange: setSorting,
    onGlobalFilterChange,
    onRowSelectionChange,
    enableRowSelection: rowSelection !== undefined,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows
  const { pageIndex } = table.getState().pagination
  const pageCount = table.getPageCount()
  const total = table.getFilteredRowModel().rows.length

  return (
    <div>
      {toolbar && <div className="mb-3">{toolbar(table)}</div>}
      <div className={cn('overflow-x-auto rounded-lg border border-hairline bg-surface', stickyHeader && 'max-h-[70vh] overflow-y-auto')}>
        <table className="w-full text-sm">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className={cn('border-b border-hairline', stickyHeader ? 'bg-page' : 'bg-page/60')}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase whitespace-nowrap',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-ink',
                      header.column.columnDef.meta?.thClassName,
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ArrowUp className="h-3 w-3" />}
                      {header.column.getIsSorted() === 'desc' && <ArrowDown className="h-3 w-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-hairline last:border-0 hover:bg-page/70',
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn('px-3 py-2 align-middle', cell.column.columnDef.meta?.tdClassName)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>
          {total.toLocaleString()} row{total === 1 ? '' : 's'}
          {pageCount > 1 && ` · page ${pageIndex + 1} of ${pageCount}`}
        </span>
        <div className="flex items-center gap-1">
          <Select
            className="h-8 w-auto text-xs"
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </Select>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)} aria-label="First page">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(pageCount - 1)} aria-label="Last page">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
