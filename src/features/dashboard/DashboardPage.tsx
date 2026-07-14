import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Settings, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { formatPeso, formatPesoWhole } from '@/lib/format'
import {
  NO_DRILLS,
  defaultFilters,
  toggleDrill,
  type DashboardFilters,
  type DrillKey,
  type Growth,
} from './filters'
import { useDashboardData } from './useDashboardData'
import { DrillChips, FilterBar } from './FilterBar'
import { SalesMatrix } from './SalesMatrix'
import { Sparkline } from './Sparkline'
import {
  CategoryDonut,
  CollectionDonut,
  CompanyPerformanceChart,
  LogisticsDonut,
  ManagersChart,
  NamedTotalsBarChart,
  SalesPerformanceChart,
} from './charts'

export function DashboardPage() {
  const { profile } = useAuth()
  const [filters, setFilters] = useState<DashboardFilters>(() => defaultFilters())
  const [bonusPct, setBonusPct] = useState(1)
  const { data, stockAlerts, isLoading, isFetching, productsLoading, error, refetch } = useDashboardData(filters)

  if (error) {
    return <EmptyState title="Couldn’t load dashboard" description={error.message} />
  }

  const drill = (key: DrillKey) => (value: string) =>
    setFilters((f) => ({ ...f, drills: toggleDrill(f.drills, key, value) }))
  const removeDrill = (key: DrillKey) => setFilters((f) => ({ ...f, drills: { ...f.drills, [key]: null } }))
  const clearDrills = () => setFilters((f) => ({ ...f, drills: NO_DRILLS }))

  const t = data.totals
  const isSuperAdmin = profile?.role_id === 1
  const noRows = data.timeline.length === 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Dashboard"
        subtitle="Live — updates as sales are added or edited. Click bars and slices to cross-filter."
      />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        revenue={t.revenue}
        bonusPct={bonusPct}
        onBonusPctChange={setBonusPct}
        onApply={refetch}
        isFetching={isFetching}
      />

      <DrillChips drills={filters.drills} onRemove={removeDrill} onClearAll={clearDrills} />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          tone="accent"
          icon="trending_up"
          label="Total Revenue"
          value={isLoading ? <Skeleton className="h-7 w-28" /> : <AnimatedNumber value={t.revenue} format={formatPeso} />}
          hint={
            !isLoading && (
              <>
                <Sparkline points={data.timeline.map((p) => p.revenue)} className="mb-1.5 h-7 w-full text-accent" />
                {data.growth && <GrowthBadge growth={data.growth.revenue} />}
                <div className="mt-1">
                  <TargetBadge percent={data.target.percent} amount={data.target.amount} />
                </div>
              </>
            )
          }
        />
        <StatCard
          tone="good"
          icon="account_balance_wallet"
          label="Net Profit"
          value={isLoading ? <Skeleton className="h-7 w-28" /> : <AnimatedNumber value={t.profit} format={formatPeso} />}
          hint={
            !isLoading && (
              <>
                <Sparkline points={data.timeline.map((p) => p.profit)} className="mb-1.5 h-7 w-full text-good-text" />
                {data.growth && <GrowthBadge growth={data.growth.profit} />}
                <p className="mt-1 text-xs text-ink-secondary">Margin: {t.margin.toFixed(1)}%</p>
              </>
            )
          }
        />
        <StatCard
          tone="accent"
          icon="payments"
          label="Total Collected"
          value={isLoading ? <Skeleton className="h-7 w-28" /> : <AnimatedNumber value={t.collected} format={formatPeso} />}
          hint={!isLoading && <p className="text-xs font-medium text-critical">Unpaid: {formatPeso(t.unpaid)}</p>}
        />
        <StatCard
          tone="warning"
          icon="receipt_long"
          label="Avg. Order Value"
          value={isLoading ? <Skeleton className="h-7 w-28" /> : <AnimatedNumber value={t.avgOrder} format={formatPeso} />}
          hint={!isLoading && <p className="text-xs text-ink-secondary">{t.orders.toLocaleString()} Orders</p>}
        />
        <StatCard
          tone="critical"
          icon="warning"
          label="Stock Alerts"
          value={
            productsLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <AnimatedNumber value={stockAlerts} format={(v) => Math.round(v).toLocaleString()} />
            )
          }
          hint={
            <Link to="/products" className="font-medium text-accent-strong hover:underline">
              View Inventory →
            </Link>
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-4">
        <ChartCard title="Sales Performance" className="col-span-12 xl:col-span-8" loading={isLoading} isEmpty={noRows}>
          <SalesPerformanceChart data={data.timeline} minTarget={filters.minTarget} maxTarget={filters.maxTarget} />
        </ChartCard>

        <ChartCard
          title="Logistics Status"
          className="col-span-12 xl:col-span-4"
          loading={isLoading}
          isEmpty={data.logistics.delivered + data.logistics.pending === 0}
        >
          <LogisticsDonut delivered={data.logistics.delivered} pending={data.logistics.pending} />
        </ChartCard>

        <ChartCard
          title="Company Performance"
          className="col-span-12 xl:col-span-8"
          loading={isLoading}
          isEmpty={data.companies.length === 0}
          action={
            <span className="flex items-center gap-3">
              <span className="text-[11px] text-ink-muted">Click bar to filter</span>
              {isSuperAdmin && (
                <Link
                  to="/admin/assignments"
                  className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-page"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Setup
                </Link>
              )}
            </span>
          }
        >
          <CompanyPerformanceChart
            data={data.companies}
            minTarget={filters.minTarget}
            maxTarget={filters.maxTarget}
            onToggle={drill('company')}
          />
        </ChartCard>

        <ChartCard
          title="Account Managers"
          className="col-span-12 xl:col-span-4"
          loading={isLoading}
          isEmpty={data.managers.length === 0}
          action={<span className="text-[11px] text-ink-muted">Click bar to filter</span>}
        >
          <ManagersChart data={data.managers} onToggle={drill('manager')} />
        </ChartCard>

        <ChartCard
          title="By Category"
          className="col-span-12 sm:col-span-6 xl:col-span-3"
          loading={isLoading}
          isEmpty={data.categories.length === 0}
        >
          <CategoryDonut data={data.categories} activeCategory={filters.drills.category} onToggle={drill('category')} />
        </ChartCard>

        <ChartCard
          title="Collection Status"
          className="col-span-12 sm:col-span-6 xl:col-span-3"
          loading={isLoading}
          isEmpty={data.collection.paid + data.collection.unpaid === 0}
        >
          <CollectionDonut paid={data.collection.paid} unpaid={data.collection.unpaid} />
        </ChartCard>

        <ChartCard
          title="Top Products"
          className="col-span-12 sm:col-span-6 xl:col-span-3"
          loading={isLoading}
          isEmpty={data.topProducts.length === 0}
        >
          <NamedTotalsBarChart data={data.topProducts} tone="products" />
        </ChartCard>

        <ChartCard
          title="Supplier Costs"
          className="col-span-12 sm:col-span-6 xl:col-span-3"
          loading={isLoading}
          isEmpty={data.supplierCosts.length === 0}
        >
          <NamedTotalsBarChart data={data.supplierCosts} tone="costs" />
        </ChartCard>
      </div>

      {/* Detailed Sales Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Sales Matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : data.matrix.length === 0 ? (
            <EmptyState title="No sales in this range" />
          ) : (
            <SalesMatrix data={data.matrix} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GrowthBadge({ growth }: { growth: Growth }) {
  const up = growth.percent >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <div className="mt-1">
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
          up ? 'bg-good/15 text-good-text' : 'bg-critical/15 text-critical-text'
        }`}
      >
        <Icon className="h-3 w-3" />
        {Math.abs(growth.percent).toFixed(1)}% ({growth.amount >= 0 ? '+' : '−'}
        {formatPeso(Math.abs(growth.amount))})
      </span>
      <p className="mt-0.5 text-[10px] font-medium tracking-wide text-ink-muted uppercase">VS Previous Period</p>
    </div>
  )
}

function TargetBadge({ percent, amount }: { percent: number; amount: number }) {
  const met = percent >= 100
  const Icon = met ? TrendingUp : Target
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
        met ? 'bg-good/15 text-good-text' : 'bg-accent-soft text-accent-strong'
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.round(percent)}% of {formatPesoWhole(amount)} Target
    </span>
  )
}

function ChartCard({
  title,
  className,
  action,
  loading,
  isEmpty,
  children,
}: {
  title: string
  className?: string
  action?: ReactNode
  loading: boolean
  isEmpty: boolean
  children: ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[280px] w-full" /> : isEmpty ? <EmptyState title="No data in this range" /> : children}
      </CardContent>
    </Card>
  )
}
