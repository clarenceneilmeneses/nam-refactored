import { useMemo, useState, type ReactNode } from 'react'
import { useSales, SALES_KEY } from '@/hooks/useSales'
import { useCompanyAssignments } from '@/hooks/useCompanyAssignments'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatPeso } from '@/lib/format'
import { buildManagerLookup, categoryKey, companyKey } from '../dashboard/aggregate'
import { NO_DRILLS, type DrillKey, type Drills } from '../dashboard/filters'
import { DrillChips } from '../dashboard/FilterBar'
import { UNASSIGNED } from '../dashboard/palette'
import {
  buildInsights,
  COLLECTION_TARGET_DAYS,
  collectionByMonth,
  filterAnalyticsRows,
  marginByOrderSize,
  momOf,
  monthlySeries,
  onTimeCollection,
  orderValueMarginR,
  repeatClientShare,
  seasonalityYoY,
  seriesAvg,
  seriesPeak,
  topShares,
  weekdayPattern,
  weeklyTrend,
  yearsPresent,
  yoyComparison,
  type Insight,
  type InsightTone,
  type Mom,
  type YearFilter,
} from './analyticsLogic'
import {
  CollectionDaysChart,
  GaugeRing,
  MarginBinsChart,
  SeasonalityChart,
  TrendChart,
  WeekdayChart,
  WeeklyMaChart,
} from './AnalyticsCharts'

const compact = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })
const pesoCompact = (v: number) => `₱${compact.format(v)}`

export function AnalyticsPage() {
  const sales = useSales()
  const assignments = useCompanyAssignments()
  useRealtimeInvalidate('sales', SALES_KEY)

  const [year, setYear] = useState<YearFilter>('all')
  const [drills, setDrills] = useState<Drills>(NO_DRILLS)

  const rows = useMemo(() => sales.data ?? [], [sales.data])
  const lookup = useMemo(() => buildManagerLookup(assignments.data ?? []), [assignments.data])

  const options = useMemo(
    () => ({
      years: yearsPresent(rows),
      companies: [...new Set(rows.map(companyKey))].sort((a, b) => a.localeCompare(b)),
      categories: [...new Set(rows.map(categoryKey))].sort((a, b) => a.localeCompare(b)),
      managers: [...new Set([...lookup.values(), UNASSIGNED])].sort((a, b) => a.localeCompare(b)),
    }),
    [rows, lookup],
  )

  const d = useMemo(() => {
    // Year-scoped set for period metrics; drills-only set for the long-run charts
    // (seasonality and the weekly moving average need the full history).
    const yearRows = filterAnalyticsRows(rows, year, drills, lookup)
    const historyRows = year === 'all' ? yearRows : filterAnalyticsRows(rows, 'all', drills, lookup)
    const monthly = monthlySeries(yearRows)
    const seasonality = seasonalityYoY(historyRows)
    const collection = collectionByMonth(yearRows)
    const paidInvoices = collection.reduce((s, p) => s + p.invoices, 0)
    const computed = {
      yearRows,
      monthly,
      momRevenue: momOf(monthly, (p) => p.revenue),
      momOrders: momOf(monthly, (p) => p.orders),
      momMargin: momOf(monthly, (p) => p.margin),
      weekday: weekdayPattern(yearRows),
      seasonality,
      yoy: yoyComparison(seasonality),
      collection,
      avgCollectionDays: paidInvoices > 0 ? collection.reduce((s, p) => s + p.avgDays * p.invoices, 0) / paidInvoices : null,
      onTime: onTimeCollection(yearRows),
      repeat: repeatClientShare(yearRows),
      bins: marginByOrderSize(yearRows),
      r: orderValueMarginR(yearRows),
      weekly: weeklyTrend(historyRows),
      shares: topShares(yearRows, lookup),
    }
    return { ...computed, insights: buildInsights(computed) }
  }, [rows, lookup, year, drills])

  const isLoading = sales.isLoading || assignments.isLoading
  const error = (sales.error ?? assignments.error) as Error | null
  if (error) {
    return <EmptyState title="Couldn’t load analytics" description={error.message} />
  }

  const setDrill = (key: DrillKey, value: string) => setDrills((prev) => ({ ...prev, [key]: value || null }))
  const noData = d.monthly.length === 0

  const peakMonth = seriesPeak(d.monthly, (p) => p.revenue)
  const peakDay = d.weekday.find((w) => w.peak)
  const totalRevenue = d.monthly.reduce((s, p) => s + p.revenue, 0)
  const totalProfit = d.monthly.reduce((s, p) => s + p.profit, 0)
  const totalOrders = d.monthly.reduce((s, p) => s + p.orders, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        subtitle="Trends, seasonality and patterns across the sales history — complements the Executive Dashboard snapshot."
      />

      {/* Dimension filters — every chart below recomputes from these. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 p-4">
          <FilterField label="Year">
            <Select className="w-36" value={year} onChange={(e) => setYear(e.target.value as YearFilter)} aria-label="Year">
              <option value="all">All Years</option>
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Company">
            <Select
              className="w-52"
              value={drills.company ?? ''}
              onChange={(e) => setDrill('company', e.target.value)}
              aria-label="Company"
            >
              <option value="">All Companies</option>
              {options.companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Category">
            <Select
              className="w-52"
              value={drills.category ?? ''}
              onChange={(e) => setDrill('category', e.target.value)}
              aria-label="Category"
            >
              <option value="">All Categories</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Account Manager">
            <Select
              className="w-44"
              value={drills.manager ?? ''}
              onChange={(e) => setDrill('manager', e.target.value)}
              aria-label="Account manager"
            >
              <option value="">All Managers</option>
              {options.managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </FilterField>
        </CardContent>
      </Card>

      <DrillChips
        drills={drills}
        onRemove={(key) => setDrills((prev) => ({ ...prev, [key]: null }))}
        onClearAll={() => setDrills(NO_DRILLS)}
      />

      {/* Monthly trends with MoM deltas */}
      <div className="grid grid-cols-12 gap-4">
        <AnalyticsCard
          className="col-span-12 md:col-span-4"
          title="Revenue by Month"
          subtitle={
            peakMonth
              ? `Avg ${pesoCompact(seriesAvg(d.monthly, (p) => p.revenue))}/mo · peak ${peakMonth.label} (${pesoCompact(peakMonth.revenue)})`
              : undefined
          }
          badge={<MomBadge mom={d.momRevenue} text={(m) => `${m.percent >= 0 ? '+' : '−'}${Math.abs(m.percent).toFixed(1)}%`} />}
          loading={isLoading}
          isEmpty={noData}
        >
          <TrendChart
            data={d.monthly.map((p) => ({ label: p.label, value: p.revenue }))}
            avg={seriesAvg(d.monthly, (p) => p.revenue)}
            tickFormat={pesoCompact}
            tooltipFormat={(v) => formatPeso(v)}
            name="Revenue"
          />
        </AnalyticsCard>

        <AnalyticsCard
          className="col-span-12 md:col-span-4"
          title="Orders by Month"
          subtitle={`Avg ${Math.round(seriesAvg(d.monthly, (p) => p.orders)).toLocaleString()}/mo · ${totalOrders.toLocaleString()} total`}
          badge={<MomBadge mom={d.momOrders} text={(m) => `${m.amount >= 0 ? '+' : '−'}${Math.abs(m.amount).toLocaleString()}`} />}
          loading={isLoading}
          isEmpty={noData}
        >
          <TrendChart
            data={d.monthly.map((p) => ({ label: p.label, value: p.orders }))}
            avg={seriesAvg(d.monthly, (p) => p.orders)}
            tickFormat={(v) => v.toLocaleString()}
            tooltipFormat={(v) => `${v.toLocaleString()} orders`}
            name="Orders"
          />
        </AnalyticsCard>

        <AnalyticsCard
          className="col-span-12 md:col-span-4"
          title="Profit Margin by Month"
          subtitle={`Avg ${seriesAvg(d.monthly, (p) => p.margin).toFixed(1)}% · ${formatPeso(totalProfit)} total profit`}
          badge={<MomBadge mom={d.momMargin} text={(m) => `${m.amount >= 0 ? '+' : '−'}${Math.abs(m.amount).toFixed(1)} pts`} />}
          loading={isLoading}
          isEmpty={noData}
        >
          <TrendChart
            data={d.monthly.map((p) => ({ label: p.label, value: p.margin }))}
            avg={seriesAvg(d.monthly, (p) => p.margin)}
            tickFormat={(v) => `${v}%`}
            tooltipFormat={(v) => `${v.toFixed(1)}%`}
            name="Margin"
          />
        </AnalyticsCard>

        {/* Seasonality + weekday pattern */}
        <AnalyticsCard
          className="col-span-12 xl:col-span-8"
          title="Seasonality: Year over Year"
          subtitle={
            d.seasonality ? `${d.seasonality.currentYear} vs ${d.seasonality.previousYear}, revenue per calendar month` : undefined
          }
          badge={
            d.yoy &&
            d.seasonality && (
              <DeltaBadge
                positive={d.yoy.percent >= 0}
                text={`${d.yoy.percent >= 0 ? '+' : '−'}${Math.abs(d.yoy.percent).toFixed(1)}% vs ${d.seasonality.previousYear}`}
              />
            )
          }
          loading={isLoading}
          isEmpty={!d.seasonality}
        >
          {d.seasonality && <SeasonalityChart seasonality={d.seasonality} />}
        </AnalyticsCard>

        <AnalyticsCard
          className="col-span-12 xl:col-span-4"
          title="Revenue by Day of Week"
          subtitle={peakDay ? `Peak ${peakDay.day} · pale bars run below the daily average (dashed)` : undefined}
          loading={isLoading}
          isEmpty={noData}
        >
          <WeekdayChart data={d.weekday} />
        </AnalyticsCard>

        {/* Collection discipline + pricing pattern */}
        <AnalyticsCard
          className="col-span-12 xl:col-span-6"
          title="Days to Collect Payment"
          subtitle={
            d.avgCollectionDays !== null
              ? `Avg ${d.avgCollectionDays.toFixed(1)} days from sale to payment vs the ${COLLECTION_TARGET_DAYS}-day target`
              : undefined
          }
          loading={isLoading}
          isEmpty={d.collection.length === 0}
        >
          <CollectionDaysChart data={d.collection} target={COLLECTION_TARGET_DAYS} />
        </AnalyticsCard>

        <AnalyticsCard
          className="col-span-12 xl:col-span-6"
          title="Order Size vs Margin"
          subtitle={d.r !== null ? describeR(d.r) : 'Average margin per order-value bracket'}
          loading={isLoading}
          isEmpty={d.bins.length === 0}
        >
          <MarginBinsChart bins={d.bins} />
        </AnalyticsCard>

        {/* Weekly momentum + gauges/concentration */}
        <AnalyticsCard
          className="col-span-12 xl:col-span-8"
          title="Weekly Revenue Momentum"
          subtitle="Each dot is a week, colored against the week before; the solid line is the 4-week moving average"
          loading={isLoading}
          isEmpty={d.weekly.length === 0}
        >
          <WeeklyMaChart data={d.weekly} />
        </AnalyticsCard>

        <AnalyticsCard
          className="col-span-12 xl:col-span-4"
          title="Collections & Client Mix"
          loading={isLoading}
          isEmpty={noData}
        >
          <div className="flex justify-around">
            <GaugeRing
              percent={d.onTime.percent}
              caption="On-Time Collection"
              detail={`${d.onTime.onTime.toLocaleString()} of ${d.onTime.total.toLocaleString()} dated invoices`}
              color="good"
            />
            <GaugeRing
              percent={d.repeat.percent}
              caption="Repeat-Client Revenue"
              detail={`${d.repeat.repeatClients.toLocaleString()} returning clients`}
              color="primary"
            />
          </div>
          <div className="mt-4 space-y-3">
            {d.shares.map((s) => (
              <ShareBar key={s.kind} kind={`Top ${s.kind}`} name={s.name} percent={s.percent} total={s.total} />
            ))}
          </div>
        </AnalyticsCard>

        {/* Plain-language findings */}
        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Key Insights</CardTitle>
            <CardDescription>
              What the charts above are saying, in plain language
              {!isLoading && !noData && (
                <>
                  {' '}
                  — this selection covers {totalOrders.toLocaleString()} orders, {formatPeso(totalRevenue)} in revenue and{' '}
                  {formatPeso(totalProfit)} profit
                  {totalRevenue > 0 && <> ({((totalProfit / totalRevenue) * 100).toFixed(1)}% margin)</>}.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : noData ? (
              <EmptyState title="No data for this selection" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {d.insights.map((insight) => (
                  <InsightTile key={insight.headline} insight={insight} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Icon circle wears the tone; text stays in ink tokens (status is never color-alone). */
const INSIGHT_TONE: Record<InsightTone, string> = {
  neutral: 'bg-ink/8 text-ink-secondary',
  good: 'bg-good/15 text-good-text',
  warning: 'bg-warning/15 text-warning-text',
  critical: 'bg-critical/15 text-critical-text',
}

function InsightTile({ insight }: { insight: Insight }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline p-3.5">
      <span
        className={`material-symbols-rounded flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] ${INSIGHT_TONE[insight.tone]}`}
        aria-hidden
      >
        {insight.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{insight.headline}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{insight.detail}</p>
      </div>
    </div>
  )
}

function describeR(r: number): string {
  const strength = Math.abs(r) < 0.2 ? 'no meaningful' : Math.abs(r) < 0.5 ? 'a mild' : 'a strong'
  const direction = Math.abs(r) < 0.2 ? '' : r > 0 ? ' positive' : ' negative'
  return `Order size has ${strength}${direction} effect on margin`
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</span>
      {children}
    </div>
  )
}

function MomBadge({ mom, text }: { mom: Mom | null; text: (m: Mom) => string }) {
  if (!mom) return null
  return <DeltaBadge positive={mom.amount >= 0} text={`${text(mom)} vs prior month`} />
}

function DeltaBadge({ positive, text }: { positive: boolean; text: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap ${
        positive ? 'bg-good/15 text-good-text' : 'bg-critical/15 text-critical-text'
      }`}
    >
      {text}
    </span>
  )
}

/** Notion-flat share bar: label row + accent track, all token colors. */
function ShareBar({ kind, name, percent, total }: { kind: string; name: string; percent: number; total: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium tracking-wide text-ink-muted uppercase">{kind}</span>
        <span className="tabular-nums text-ink-secondary">
          {percent.toFixed(1)}% · {formatPeso(total)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-sm font-medium text-ink">{name}</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  )
}

function AnalyticsCard({
  title,
  subtitle,
  badge,
  className,
  loading,
  isEmpty,
  children,
}: {
  title: string
  subtitle?: string
  badge?: ReactNode
  className?: string
  loading: boolean
  isEmpty: boolean
  children: ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {subtitle && !loading && !isEmpty && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {!loading && !isEmpty && badge}
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[200px] w-full" /> : isEmpty ? <EmptyState title="No data for this selection" /> : children}
      </CardContent>
    </Card>
  )
}
