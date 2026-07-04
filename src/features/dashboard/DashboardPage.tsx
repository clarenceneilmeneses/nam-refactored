import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Coins,
  ReceiptText,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
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
import { GREEN, INDIGO, RED, SKY } from './palette'
import {
  CategoryDonut,
  CollectionDonut,
  CompanyPerformanceChart,
  LogisticsDonut,
  ManagersChart,
  NamedTotalsBarChart,
  SalesPerformanceChart,
} from './charts'

const BLUE = '#3b82f6'
const YELLOW_KPI = '#f59e0b'

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
      <div>
        <h1 className="text-lg font-semibold">Executive Dashboard</h1>
        <p className="text-xs text-ink-muted">Live — updates as sales are added or edited. Click bars and slices to cross-filter.</p>
      </div>

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
        <KpiCard accent={INDIGO} icon={TrendingUp} label="Total Revenue" value={formatPeso(t.revenue)} loading={isLoading}>
          {data.growth && <GrowthBadge growth={data.growth.revenue} />}
          <div className="mt-1">
            <TargetBadge percent={data.target.percent} amount={data.target.amount} />
          </div>
        </KpiCard>
        <KpiCard accent={GREEN} icon={Wallet} label="Net Profit" value={formatPeso(t.profit)} loading={isLoading}>
          {data.growth && <GrowthBadge growth={data.growth.profit} />}
          <p className="mt-1 text-xs text-ink-secondary">Margin: {t.margin.toFixed(1)}%</p>
        </KpiCard>
        <KpiCard accent={BLUE} icon={Coins} label="Total Collected" value={formatPeso(t.collected)} loading={isLoading}>
          <p className="mt-1 text-xs font-medium" style={{ color: RED }}>
            Unpaid: {formatPeso(t.unpaid)}
          </p>
        </KpiCard>
        <KpiCard accent={YELLOW_KPI} icon={ReceiptText} label="Avg. Order Value" value={formatPeso(t.avgOrder)} loading={isLoading}>
          <p className="mt-1 text-xs text-ink-secondary">{t.orders.toLocaleString()} Orders</p>
        </KpiCard>
        <KpiCard
          accent={RED}
          icon={AlertTriangle}
          label="Stock Alerts"
          value={stockAlerts.toLocaleString()}
          loading={productsLoading}
        >
          <Link to="/products" className="mt-1 inline-block text-xs font-medium text-accent-strong hover:underline">
            View Inventory →
          </Link>
        </KpiCard>
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
          <NamedTotalsBarChart data={data.topProducts} color={SKY} />
        </ChartCard>

        <ChartCard
          title="Supplier Costs"
          className="col-span-12 sm:col-span-6 xl:col-span-3"
          loading={isLoading}
          isEmpty={data.supplierCosts.length === 0}
        >
          <NamedTotalsBarChart data={data.supplierCosts} color={RED} />
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

function KpiCard({
  accent,
  icon: Icon,
  label,
  value,
  loading,
  children,
}: {
  accent: string
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  loading: boolean
  children?: ReactNode
}) {
  return (
    <Card
      className="relative overflow-hidden border-l-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderLeftColor: accent }}
    >
      <CardContent className="relative min-h-[92px] p-4">
        <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-32" />
        ) : (
          <>
            <p className="mt-0.5 truncate text-2xl font-bold tabular-nums">{value}</p>
            {children}
          </>
        )}
        <Icon
          className="pointer-events-none absolute -right-2 -bottom-3 h-16 w-16 opacity-10"
          style={{ color: accent }}
        />
      </CardContent>
    </Card>
  )
}

function GrowthBadge({ growth }: { growth: Growth }) {
  const up = growth.percent >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <div className="mt-1">
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
        style={up ? { backgroundColor: '#dcfce7', color: '#15803d' } : { backgroundColor: '#fee2e2', color: '#b91c1c' }}
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
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
      style={met ? { backgroundColor: '#dcfce7', color: '#15803d' } : { backgroundColor: '#e0e7ff', color: '#4338ca' }}
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
