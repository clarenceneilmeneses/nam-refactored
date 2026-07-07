import { type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { useTheme } from '@/hooks/useTheme'
import { formatPeso } from '@/lib/format'
import { CHART_THEMES, categoryColor, managerColor, managerPillText, type ChartTheme } from './palette'
import type { CategoryPerf, CompanyPerf, ManagerPerf, NamedTotal, TimelinePoint } from './aggregate'

const compact = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })

export function pesoCompact(v: number) {
  return `₱${compact.format(v)}`
}

/** Resolves the validated chart theme for the active light/dark mode. */
export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme()
  return CHART_THEMES[resolved]
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export type LegendItem = { label: string; color: string; dashed?: boolean }

/** Bottom legend with point-style (dot) markers; dashed items get a dash mark instead. */
export function ChartLegend({ items, className = '' }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 ${className}`}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
          {item.dashed ? (
            <svg width="16" height="4" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" stroke={item.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          ) : (
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  )
}

/** Donut with a GA-style headline in the hole. Overlay is pointer-transparent so tooltips still work. */
function DonutCenter({ value, caption, children }: { value: ReactNode; caption: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] leading-tight font-bold tabular-nums text-ink">{value}</span>
        <span className="text-[11px] font-medium text-ink-muted">{caption}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 1. Sales Performance

export function SalesPerformanceChart({
  data,
  minTarget,
  maxTarget,
}: {
  data: TimelinePoint[]
  minTarget: number
  maxTarget: number
}) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} minTickGap={24} />
          <YAxis
            yAxisId="revenue"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={pesoCompact}
            width={56}
          />
          <YAxis
            yAxisId="margin"
            orientation="right"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
            width={44}
          />
          <Tooltip
            contentStyle={theme.tooltip}
            cursor={{ fill: theme.cursorFill }}
            formatter={(value, name) =>
              name === 'Profit Margin'
                ? [`${Number(value).toFixed(1)}%`, String(name)]
                : [formatPeso(Number(value)), String(name)]
            }
          />
          <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill={theme.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Line
            yAxisId="margin"
            dataKey="margin"
            name="Profit Margin"
            type="monotone"
            stroke={theme.margin}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
          />
          <ReferenceLine yAxisId="revenue" y={maxTarget} stroke={theme.good} strokeWidth={1.5} strokeDasharray="6 6" />
          <ReferenceLine yAxisId="revenue" y={minTarget} stroke={theme.critical} strokeWidth={1.5} strokeDasharray="6 6" />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-2"
        items={[
          { label: 'Revenue', color: theme.primary },
          { label: 'Profit Margin', color: theme.margin, dashed: true },
          { label: 'Max Target', color: theme.good, dashed: true },
          { label: 'Min Target', color: theme.critical, dashed: true },
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 2. Logistics Status

export function LogisticsDonut({ delivered, pending }: { delivered: number; pending: number }) {
  const theme = useChartTheme()
  const total = delivered + pending
  const data = [
    { name: 'Delivered', value: delivered, color: theme.good },
    { name: 'Pending', value: pending, color: theme.warning },
  ]
  return (
    <div>
      <DonutCenter value={`${total ? Math.round((delivered / total) * 100) : 0}%`} caption={`Delivered · ${total.toLocaleString()} orders`}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="72%" outerRadius="94%" stroke={theme.surface} strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={theme.tooltip}
              formatter={(value, name) => [`${Number(value).toLocaleString()} orders`, String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </DonutCenter>
      <ChartLegend className="mt-2" items={data.map((d) => ({ label: d.name, color: d.color }))} />
    </div>
  )
}

// ---------------------------------------------------------------- 3. Company Performance

function CompanyTooltip(props: TooltipContentProps & { theme: ChartTheme }) {
  const { active, payload, theme } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as CompanyPerf
  return (
    <div style={theme.tooltip} className="px-3 py-2">
      <p className="font-medium">{entry.company}</p>
      <p className="tabular-nums">{formatPeso(entry.total)}</p>
      <p style={{ color: theme.ink }}>Account Manager: {entry.manager}</p>
    </div>
  )
}

export function CompanyPerformanceChart({
  data,
  minTarget,
  maxTarget,
  onToggle,
}: {
  data: CompanyPerf[]
  minTarget: number
  maxTarget: number
  onToggle: (company: string) => void
}) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  const managers = [...new Set(data.map((d) => d.manager))]
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {managers.map((m) => (
          <span
            key={m}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: managerColor(m), color: managerPillText(m) }}
          >
            {m}
          </span>
        ))}
        <span className="ml-auto">
          <ChartLegend
            items={[
              { label: 'Max Target', color: theme.good, dashed: true },
              { label: 'Min Target', color: theme.critical, dashed: true },
            ]}
          />
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div style={{ width: Math.max(800, data.length * 60), height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 12 }}>
              <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="company"
                tick={{ ...axisTick, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: theme.baseline }}
                tickFormatter={(name: string) => name.split(' ')[0]}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={64}
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
              <Tooltip content={(p) => <CompanyTooltip {...p} theme={theme} />} cursor={{ fill: theme.cursorFill }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40} onClick={(_, index) => onToggle(data[index].company)}>
                {data.map((entry) => (
                  <Cell key={entry.company} fill={managerColor(entry.manager)} cursor="pointer" />
                ))}
              </Bar>
              <ReferenceLine y={maxTarget} stroke={theme.good} strokeWidth={1.5} strokeDasharray="6 6" />
              <ReferenceLine y={minTarget} stroke={theme.critical} strokeWidth={1.5} strokeDasharray="6 6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 4. Account Managers

function ManagerTooltip(props: TooltipContentProps & { theme: ChartTheme }) {
  const { active, payload, theme } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as ManagerPerf
  return (
    <div style={theme.tooltip} className="px-3 py-2">
      <p className="font-medium">{entry.manager}</p>
      <p className="tabular-nums">
        {formatPeso(entry.total)} ({entry.companies} {entry.companies === 1 ? 'Company' : 'Companies'})
      </p>
    </div>
  )
}

export function ManagersChart({ data, onToggle }: { data: ManagerPerf[]; onToggle: (manager: string) => void }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 44 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={theme.grid} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} tickFormatter={pesoCompact} />
        <YAxis
          type="category"
          dataKey="manager"
          width={92}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(name: string) => truncate(name, 12)}
        />
        <Tooltip content={(p) => <ManagerTooltip {...p} theme={theme} />} cursor={{ fill: theme.cursorFill }} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={20} onClick={(_, index) => onToggle(data[index].manager)}>
          {data.map((entry) => (
            <Cell key={entry.manager} fill={managerColor(entry.manager)} cursor="pointer" />
          ))}
          <LabelList
            dataKey="total"
            position="right"
            formatter={(v) => pesoCompact(Number(v))}
            style={{ fill: theme.label, fontSize: 10 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------- 5. By Category

export function CategoryDonut({
  data,
  activeCategory,
  onToggle,
}: {
  data: CategoryPerf[]
  activeCategory: string | null
  onToggle: (category: string) => void
}) {
  const theme = useChartTheme()
  const total = data.reduce((sum, d) => sum + d.total, 0)
  return (
    <div>
      <DonutCenter value={pesoCompact(total)} caption="Total">
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="category"
              innerRadius="72%"
              outerRadius="95%"
              stroke={theme.surface}
              strokeWidth={2}
              onClick={(_, index) => onToggle(data[index].category)}
              cursor="pointer"
            >
              {data.map((entry, i) => (
                <Cell key={entry.category} fill={categoryColor(theme, i)} />
              ))}
            </Pie>
            <Tooltip contentStyle={theme.tooltip} formatter={(value, name) => [formatPeso(Number(value)), String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </DonutCenter>
      <div className="slim-scrollbar mt-2 max-h-[130px] space-y-0.5 overflow-y-auto pr-1">
        {data.map((entry, i) => (
          <button
            key={entry.category}
            type="button"
            onClick={() => onToggle(entry.category)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-ink/5 ${
              activeCategory === entry.category ? 'bg-ink/5 font-medium' : ''
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(theme, i) }} />
            <span className="min-w-0 flex-1 truncate text-ink-secondary">{entry.category}</span>
            <span className="tabular-nums text-ink">{formatPeso(entry.total)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 6. Collection Status

export function CollectionDonut({ paid, unpaid }: { paid: number; unpaid: number }) {
  const theme = useChartTheme()
  const total = paid + unpaid
  const data = [
    { name: 'Paid', value: paid, color: theme.good },
    { name: 'Unpaid', value: unpaid, color: theme.critical },
  ]
  return (
    <div>
      <DonutCenter value={`${total ? Math.round((paid / total) * 100) : 0}%`} caption="Collected">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" stroke={theme.surface} strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={theme.tooltip} formatter={(value, name) => [formatPeso(Number(value)), String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </DonutCenter>
      <ChartLegend className="mt-2" items={data.map((d) => ({ label: d.name, color: d.color }))} />
    </div>
  )
}

// ---------------------------------------------------------------- 7 & 8. Top Products / Supplier Costs

export function NamedTotalsBarChart({ data, tone = 'products' }: { data: NamedTotal[]; tone?: 'products' | 'costs' }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  const fill = tone === 'costs' ? theme.costs : theme.products
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={theme.grid} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} tickFormatter={pesoCompact} />
        <YAxis
          type="category"
          dataKey="name"
          width={104}
          tick={{ ...axisTick, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(name: string) => truncate(name, 15)}
        />
        <Tooltip contentStyle={theme.tooltip} formatter={(value) => [formatPeso(Number(value)), 'Total']} cursor={{ fill: theme.cursorFill }} />
        <Bar dataKey="total" fill={fill} radius={[0, 4, 4, 0]} barSize={16}>
          <LabelList
            dataKey="total"
            position="right"
            formatter={(v) => pesoCompact(Number(v))}
            style={{ fill: theme.label, fontSize: 10 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
