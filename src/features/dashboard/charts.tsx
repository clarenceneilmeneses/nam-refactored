import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
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
import { CHART_INK } from '@/lib/chart-palette'
import { formatPeso } from '@/lib/format'
import { CATEGORY_PALETTE, GREEN, INDIGO, RED, SKY, YELLOW, managerColor, managerPillText } from './palette'
import type { CategoryPerf, CompanyPerf, ManagerPerf, NamedTotal, TimelinePoint } from './aggregate'

const compact = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })
const axisTick = { fill: CHART_INK.muted, fontSize: 11 }

function pesoCompact(v: number) {
  return `₱${compact.format(v)}`
}

const tooltipStyle = {
  backgroundColor: '#fcfcfb',
  border: '1px solid #e1e0d9',
  borderRadius: 8,
  fontSize: 12,
  color: '#0b0b0b',
}

const tooltipCursor = { fill: 'rgba(11,11,11,0.04)' }

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

type LegendItem = { label: string; color: string; dashed?: boolean }

/** Bottom legend with point-style (dot) markers; dashed items get a dash mark instead. */
function ChartLegend({ items, className = '' }: { items: LegendItem[]; className?: string }) {
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
  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: 12 }}>
          <CartesianGrid stroke={CHART_INK.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.baseline }}
            minTickGap={24}
            label={{ value: 'Timeline', position: 'insideBottom', offset: -12, fill: CHART_INK.muted, fontSize: 11 }}
          />
          <YAxis
            yAxisId="revenue"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={pesoCompact}
            width={64}
            label={{ value: 'Revenue (PHP)', angle: -90, position: 'insideLeft', fill: CHART_INK.muted, fontSize: 11 }}
          />
          <YAxis
            yAxisId="margin"
            orientation="right"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
            width={52}
            label={{ value: 'Margin (%)', angle: 90, position: 'insideRight', fill: CHART_INK.muted, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={tooltipCursor}
            formatter={(value, name) =>
              name === 'Profit Margin'
                ? [`${Number(value).toFixed(1)}%`, String(name)]
                : [formatPeso(Number(value)), String(name)]
            }
          />
          <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill={INDIGO} fillOpacity={0.45} radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="revenue"
            dataKey="revenue"
            name="Sales Trend"
            type="monotone"
            stroke={INDIGO}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="margin"
            dataKey="margin"
            name="Profit Margin"
            type="monotone"
            stroke={YELLOW}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <ReferenceLine yAxisId="revenue" y={maxTarget} stroke={GREEN} strokeWidth={1.5} strokeDasharray="6 6" />
          <ReferenceLine yAxisId="revenue" y={minTarget} stroke={RED} strokeWidth={1.5} strokeDasharray="6 6" />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-2"
        items={[
          { label: 'Revenue', color: INDIGO },
          { label: 'Sales Trend', color: INDIGO },
          { label: 'Profit Margin', color: YELLOW, dashed: true },
          { label: 'Max Target', color: GREEN, dashed: true },
          { label: 'Min Target', color: RED, dashed: true },
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 2. Logistics Status

export function LogisticsDonut({ delivered, pending }: { delivered: number; pending: number }) {
  const data = [
    { name: 'Delivered', value: delivered, color: GREEN },
    { name: 'Pending', value: pending, color: YELLOW },
  ]
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="92%" stroke="#fcfcfb" strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [`${Number(value).toLocaleString()} orders`, String(name)]}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          iconSize={8}
          formatter={(v: string) => <span style={{ color: '#52514e', fontSize: 12 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------- 3. Company Performance

function CompanyTooltip(props: TooltipContentProps) {
  const { active, payload } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as CompanyPerf
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="font-medium">{entry.company}</p>
      <p className="tabular-nums">{formatPeso(entry.total)}</p>
      <p className="text-ink-muted">Account Manager: {entry.manager}</p>
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
              { label: 'Max Target', color: GREEN, dashed: true },
              { label: 'Min Target', color: RED, dashed: true },
            ]}
          />
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div style={{ width: Math.max(800, data.length * 60), height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: 12 }}>
              <CartesianGrid stroke={CHART_INK.grid} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="company"
                tick={{ ...axisTick, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: CHART_INK.baseline }}
                tickFormatter={(name: string) => name.split(' ')[0]}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={64}
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={64} />
              <Tooltip content={CompanyTooltip} cursor={tooltipCursor} />
              <Bar
                dataKey="total"
                radius={[4, 4, 0, 0]}
                onClick={(_, index) => onToggle(data[index].company)}
              >
                {data.map((entry) => (
                  <Cell key={entry.company} fill={managerColor(entry.manager)} cursor="pointer" />
                ))}
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v) => pesoCompact(Number(v))}
                  style={{ fill: CHART_INK.muted, fontSize: 10 }}
                />
              </Bar>
              <ReferenceLine y={maxTarget} stroke={GREEN} strokeWidth={1.5} strokeDasharray="6 6" />
              <ReferenceLine y={minTarget} stroke={RED} strokeWidth={1.5} strokeDasharray="6 6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 4. Account Managers

function ManagerTooltip(props: TooltipContentProps) {
  const { active, payload } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as ManagerPerf
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="font-medium">{entry.manager}</p>
      <p className="tabular-nums">
        {formatPeso(entry.total)} ({entry.companies} {entry.companies === 1 ? 'Company' : 'Companies'})
      </p>
    </div>
  )
}

export function ManagersChart({ data, onToggle }: { data: ManagerPerf[]; onToggle: (manager: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 44 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART_INK.grid} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_INK.baseline }} tickFormatter={pesoCompact} />
        <YAxis
          type="category"
          dataKey="manager"
          width={92}
          tick={{ ...axisTick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(name: string) => truncate(name, 12)}
        />
        <Tooltip content={ManagerTooltip} cursor={tooltipCursor} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={20} onClick={(_, index) => onToggle(data[index].manager)}>
          {data.map((entry) => (
            <Cell key={entry.manager} fill={managerColor(entry.manager)} cursor="pointer" />
          ))}
          <LabelList
            dataKey="total"
            position="right"
            formatter={(v) => pesoCompact(Number(v))}
            style={{ fill: CHART_INK.muted, fontSize: 10 }}
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
  return (
    <div>
      <ResponsiveContainer width="100%" height={170}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="category"
            innerRadius="70%"
            outerRadius="95%"
            stroke="#ffffff"
            strokeWidth={2}
            onClick={(_, index) => onToggle(data[index].category)}
            cursor="pointer"
          >
            {data.map((entry, i) => (
              <Cell key={entry.category} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatPeso(Number(value)), String(name)]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="slim-scrollbar mt-2 max-h-[130px] space-y-0.5 overflow-y-auto pr-1">
        {data.map((entry, i) => (
          <button
            key={entry.category}
            type="button"
            onClick={() => onToggle(entry.category)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-black/5 ${
              activeCategory === entry.category ? 'bg-black/5 font-medium' : ''
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }}
            />
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
  const data = [
    { name: 'Paid', value: paid, color: GREEN },
    { name: 'Unpaid', value: unpaid, color: RED },
  ]
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="65%" outerRadius="90%" stroke="#fcfcfb" strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatPeso(Number(value)), String(name)]} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(v: string) => <span style={{ color: '#52514e', fontSize: 12 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------- 7 & 8. Top Products / Supplier Costs

export function NamedTotalsBarChart({ data, color }: { data: NamedTotal[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART_INK.grid} strokeWidth={1} horizontal={false} />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_INK.baseline }} tickFormatter={pesoCompact} />
        <YAxis
          type="category"
          dataKey="name"
          width={104}
          tick={{ ...axisTick, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(name: string) => truncate(name, 15)}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatPeso(Number(value)), 'Total']} cursor={tooltipCursor} />
        <Bar dataKey="total" fill={color ?? SKY} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  )
}
