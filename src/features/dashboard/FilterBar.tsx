import { type ReactNode } from 'react'
import { Building2, PieChart, RefreshCw, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatPeso } from '@/lib/format'
import {
  GROUP_BY_OPTIONS,
  PERIOD_OPTIONS,
  hasActiveDrills,
  type DashboardFilters,
  type DrillKey,
  type Drills,
  type GroupBy,
  type Period,
} from './filters'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</span>
      {children}
    </div>
  )
}

export function FilterBar({
  filters,
  onChange,
  revenue,
  bonusPct,
  onBonusPctChange,
  onApply,
  isFetching,
}: {
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
  /** Currently filtered revenue — drives the live bonus amount. */
  revenue: number
  bonusPct: number
  onBonusPctChange: (pct: number) => void
  onApply: () => void
  isFetching: boolean
}) {
  const set = (patch: Partial<DashboardFilters>) => onChange({ ...filters, ...patch })

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 p-4">
        <Field label="Time Period">
          <Select
            className="w-48"
            value={filters.period}
            onChange={(e) => set({ period: e.target.value as Period })}
            aria-label="Time period"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        {filters.period === 'custom_month' && (
          <Field label="Month">
            <Input
              type="month"
              className="w-40"
              value={filters.monthPick}
              onChange={(e) => e.target.value && set({ monthPick: e.target.value })}
              aria-label="Specific month"
            />
          </Field>
        )}

        {filters.period === 'custom' && (
          <>
            <Field label="Start Date">
              <Input
                type="date"
                className="w-38"
                value={filters.rangeStart}
                onChange={(e) => e.target.value && set({ rangeStart: e.target.value })}
                aria-label="Start date"
              />
            </Field>
            <Field label="End Date">
              <Input
                type="date"
                className="w-38"
                value={filters.rangeEnd}
                onChange={(e) => e.target.value && set({ rangeEnd: e.target.value })}
                aria-label="End date"
              />
            </Field>
            <Field label="Group Chart By">
              <Select
                className="w-32"
                value={filters.groupBy}
                onChange={(e) => set({ groupBy: e.target.value as GroupBy })}
                aria-label="Group chart by"
              >
                {GROUP_BY_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field label="Min Target">
          <Input
            type="number"
            className="w-32"
            step={10_000}
            min={0}
            value={filters.minTarget}
            onChange={(e) => set({ minTarget: Number(e.target.value) || 0 })}
            aria-label="Minimum target"
          />
        </Field>
        <Field label="Max Target">
          <Input
            type="number"
            className="w-32"
            step={10_000}
            min={0}
            value={filters.maxTarget}
            onChange={(e) => set({ maxTarget: Number(e.target.value) || 0 })}
            aria-label="Maximum target"
          />
        </Field>

        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            Performance Bonus
            <Input
              type="number"
              className="h-7 w-20 text-xs"
              step={0.1}
              min={0}
              value={bonusPct}
              onChange={(e) => onBonusPctChange(Number(e.target.value) || 0)}
              aria-label="Bonus percent"
            />
            %
          </span>
          <span className="text-xl font-bold tabular-nums text-accent-strong">{formatPeso((revenue * bonusPct) / 100)}</span>
          <span className="text-[11px] text-ink-muted">Calculated from currently filtered revenue</span>
        </div>

        <Button onClick={onApply} className="ml-auto">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Apply
        </Button>
      </CardContent>
    </Card>
  )
}

const DRILL_ICONS: Record<DrillKey, typeof Building2> = {
  company: Building2,
  category: PieChart,
  manager: Users,
}

export function DrillChips({
  drills,
  onRemove,
  onClearAll,
}: {
  drills: Drills
  onRemove: (key: DrillKey) => void
  onClearAll: () => void
}) {
  if (!hasActiveDrills(drills)) return null
  const keys = (['company', 'category', 'manager'] as DrillKey[]).filter((k) => drills[k] !== null)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-ink-secondary">Filtered By:</span>
      {keys.map((key) => {
        const Icon = DRILL_ICONS[key]
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-strong"
          >
            <Icon className="h-3 w-3" />
            {drills[key]}
            <button
              type="button"
              onClick={() => onRemove(key)}
              aria-label={`Remove ${key} filter`}
              className="cursor-pointer rounded-full hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}
      <button type="button" onClick={onClearAll} className="cursor-pointer font-medium text-critical hover:underline">
        Clear All
      </button>
    </div>
  )
}
