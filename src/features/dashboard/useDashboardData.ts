import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SALES_KEY, useSales } from '@/hooks/useSales'
import { ASSIGNMENTS_KEY, useCompanyAssignments } from '@/hooks/useCompanyAssignments'
import { PRODUCTS_KEY, useProducts } from '@/hooks/useProducts'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import {
  buildManagerLookup,
  categoryPerformance,
  collectionSplit,
  companyPerformance,
  filterRows,
  logisticsSplit,
  managerPerformance,
  salesMatrix,
  supplierCosts,
  timelineSeries,
  topProducts,
  totals,
  type CategoryPerf,
  type CompanyPerf,
  type ManagerPerf,
  type MatrixCategory,
  type NamedTotal,
  type TimelinePoint,
  type Totals,
} from './aggregate'
import {
  growthOf,
  previousMonthRange,
  resolveRange,
  scaledTarget,
  showsGrowth,
  type DashboardFilters,
  type Growth,
  type ResolvedRange,
} from './filters'

export type DashboardData = {
  range: ResolvedRange
  totals: Totals
  /** null when the period doesn't show growth badges */
  growth: { revenue: Growth; profit: Growth } | null
  target: { amount: number; percent: number }
  timeline: TimelinePoint[]
  logistics: { delivered: number; pending: number }
  companies: CompanyPerf[]
  managers: ManagerPerf[]
  categories: CategoryPerf[]
  collection: { paid: number; unpaid: number }
  topProducts: NamedTotal[]
  supplierCosts: NamedTotal[]
  matrix: MatrixCategory[]
}

/**
 * One hook drives every KPI, chart, and the matrix. Sales are fetched once
 * (parallel typed queries at this dataset's scale) and aggregated client-side,
 * so drills, targets, and the bonus widget update without another round trip.
 * Realtime on `sales` replaces the legacy 30-second polling.
 */
export function useDashboardData(filters: DashboardFilters) {
  const sales = useSales()
  const assignments = useCompanyAssignments()
  const products = useProducts()
  const queryClient = useQueryClient()
  useRealtimeInvalidate('sales', SALES_KEY)

  const data: DashboardData = useMemo(() => {
    const rows = sales.data ?? []
    const lookup = buildManagerLookup(assignments.data ?? [])
    const range = resolveRange(filters)
    const filtered = filterRows(rows, range, filters.drills, lookup)
    const kpi = totals(filtered)

    let growth: DashboardData['growth'] = null
    if (showsGrowth(filters.period)) {
      const prev = totals(filterRows(rows, previousMonthRange(range.start), filters.drills, lookup))
      growth = { revenue: growthOf(kpi.revenue, prev.revenue), profit: growthOf(kpi.profit, prev.profit) }
    }

    const targetAmount = scaledTarget(filters, range)
    return {
      range,
      totals: kpi,
      growth,
      target: { amount: targetAmount, percent: targetAmount > 0 ? (kpi.revenue / targetAmount) * 100 : 0 },
      timeline: timelineSeries(filtered, range.groupBy),
      logistics: logisticsSplit(filtered),
      companies: companyPerformance(filtered, lookup),
      managers: managerPerformance(filtered, lookup),
      categories: categoryPerformance(filtered),
      collection: collectionSplit(filtered),
      topProducts: topProducts(filtered),
      supplierCosts: supplierCosts(filtered),
      matrix: salesMatrix(filtered),
    }
  }, [sales.data, assignments.data, filters])

  // Live inventory — deliberately outside the date/drill filters.
  const stockAlerts = useMemo(
    () =>
      (products.data ?? []).filter(
        (p) => p.current_stock !== null && p.reorder_level !== null && p.current_stock <= p.reorder_level,
      ).length,
    [products.data],
  )

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SALES_KEY })
    queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
    queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
  }, [queryClient])

  return {
    data,
    stockAlerts,
    isLoading: sales.isLoading || assignments.isLoading,
    isFetching: sales.isFetching,
    productsLoading: products.isLoading,
    error: (sales.error ?? assignments.error ?? products.error) as Error | null,
    refetch,
  }
}
