import { useEffect, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
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
  /**
   * Value that identifies the page's own filters (search boxes, dropdowns that
   * narrow `data` before it gets here). Changing it sends the reader back to
   * page 1, which is what they expect when they re-filter. Editing a record
   * must NOT change it — that's the whole point, see autoResetPageIndex below.
   */
  resetPageKey?: unknown
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
  resetPageKey,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter, ...(rowSelection !== undefined && { rowSelection }) },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange,
    onRowSelectionChange,
    enableRowSelection: rowSelection !== undefined,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Off by default in this app: `data` gets a new identity on every query
    // refetch (saving one record, a realtime invalidate), and the default would
    // yank someone editing a row on page 7 back to page 1. Page changes are
    // driven deliberately instead — by resetPageKey, the global filter, and the
    // out-of-range clamp below.
    autoResetPageIndex: false,
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows
  const { pageIndex } = table.getState().pagination
  const pageCount = table.getPageCount()
  const total = table.getFilteredRowModel().rows.length

  // Re-filtering starts over at page 1 (both the page's own filters and the
  // table-level search box).
  useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }))
  }, [resetPageKey, globalFilter])

  // Rows can disappear under the reader (a filter narrows, someone deletes the
  // last row on the page). Without auto-reset that would strand them on a blank
  // page, so fall back to the last page that still exists.
  useEffect(() => {
    if (pageCount > 0 && pageIndex > pageCount - 1) {
      setPagination((p) => ({ ...p, pageIndex: pageCount - 1 }))
    }
  }, [pageIndex, pageCount])

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
                    // Solid hover color (page 70% over surface): pinned cells use
                    // bg-inherit, so a translucent tr background would let the
                    // columns scrolling underneath them show through.
                    'border-b border-hairline last:border-0 hover:bg-[color-mix(in_srgb,var(--color-page)_70%,var(--color-surface))]',
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
