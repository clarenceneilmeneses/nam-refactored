import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatPeso } from '@/lib/format'
import { ChartLegend, pesoCompact, useChartTheme } from '../dashboard/charts'
import type { ChartTheme } from '../dashboard/palette'
import type { CollectionPoint, MarginBin, Seasonality, WeekPoint, WeekdayPoint } from './analyticsLogic'

// ---------------------------------------------------------------- Monthly trend (one measure per card — never dual-axis)

export type TrendPoint = { label: string; value: number }

export function TrendChart({
  data,
  avg,
  tickFormat,
  tooltipFormat,
  name,
  height = 180,
}: {
  data: TrendPoint[]
  avg: number
  tickFormat: (v: number) => string
  tooltipFormat: (v: number) => string
  name: string
  height?: number
}) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 10 }
  const last = data[data.length - 1]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 20, right: 42, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} minTickGap={28} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={tickFormat} width={46} />
        <Tooltip
          contentStyle={theme.tooltip}
          cursor={{ stroke: theme.baseline }}
          formatter={(value) => [tooltipFormat(Number(value)), name]}
        />
        <Area dataKey="value" name={name} stroke="none" fill={theme.primary} fillOpacity={0.1} />
        <Line
          dataKey="value"
          name={name}
          type="monotone"
          stroke={theme.primary}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
        />
        <ReferenceLine y={avg} stroke={theme.ink} strokeWidth={1} strokeDasharray="5 4" />
        {last && (
          <ReferenceDot
            x={last.label}
            y={last.value}
            r={3.5}
            fill={theme.primary}
            stroke={theme.surface}
            strokeWidth={1.5}
            label={{ value: tickFormat(last.value), position: 'top', fill: theme.label, fontSize: 10, fontWeight: 600 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------- Day-of-week pattern

const DAY_PLURAL: Record<WeekdayPoint['day'], string> = {
  Mon: 'Mondays',
  Tue: 'Tuesdays',
  Wed: 'Wednesdays',
  Thu: 'Thursdays',
  Fri: 'Fridays',
  Sat: 'Saturdays',
  Sun: 'Sundays',
}

function WeekdayTooltip(props: TooltipContentProps & { theme: ChartTheme }) {
  const { active, payload, theme } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as WeekdayPoint
  return (
    <div style={theme.tooltip} className="px-3 py-2">
      <p className="font-medium">A typical {entry.day}</p>
      <p className="tabular-nums">{formatPeso(entry.avg)}</p>
      <p style={{ color: theme.ink }}>
        {formatPeso(entry.revenue)} · {entry.orders.toLocaleString()} orders across {entry.occurrences.toLocaleString()}{' '}
        {DAY_PLURAL[entry.day]}
      </p>
    </div>
  )
}

/** Bars are the per-weekday average (not the sum); pale bars run below the mean day; the peak day is full-strength. */
export function WeekdayChart({ data, mean }: { data: WeekdayPoint[]; mean: number }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={52} />
        <Tooltip content={(p) => <WeekdayTooltip {...p} theme={theme} />} cursor={{ fill: theme.cursorFill }} />
        <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((d) => (
            <Cell key={d.day} fill={theme.primary} fillOpacity={d.belowAvg ? 0.4 : 1} />
          ))}
          <LabelList
            dataKey="avg"
            position="top"
            formatter={(v) => pesoCompact(Number(v))}
            style={{ fill: theme.label, fontSize: 10 }}
          />
        </Bar>
        <ReferenceLine y={mean} stroke={theme.ink} strokeWidth={1} strokeDasharray="5 4" />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------- Seasonality: latest year vs the one before

export function SeasonalityChart({ seasonality, height = 260 }: { seasonality: Seasonality; height?: number }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={seasonality.points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
          <Tooltip
            contentStyle={theme.tooltip}
            cursor={{ stroke: theme.baseline }}
            formatter={(value, seriesName) => [formatPeso(Number(value)), String(seriesName)]}
          />
          <Line
            dataKey="previous"
            name={seasonality.previousYear}
            type="monotone"
            stroke={theme.ink}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
          />
          <Line
            dataKey="current"
            name={seasonality.currentYear}
            type="monotone"
            stroke={theme.primary}
            strokeWidth={2}
            dot={{ r: 3, fill: theme.primary, strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-2"
        items={[
          { label: seasonality.currentYear, color: theme.primary },
          { label: seasonality.previousYear, color: theme.ink, dashed: true },
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------- Collection days vs target

function CollectionTooltip(props: TooltipContentProps & { theme: ChartTheme }) {
  const { active, payload, theme } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as CollectionPoint
  return (
    <div style={theme.tooltip} className="px-3 py-2">
      <p className="font-medium">{entry.label}</p>
      <p className="tabular-nums">Avg {entry.avgDays.toFixed(1)} days to payment</p>
      <p style={{ color: theme.ink }}>{entry.invoices.toLocaleString()} paid invoices</p>
    </div>
  )
}

export function CollectionDaysChart({ data, target }: { data: CollectionPoint[]; target: number }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 10 }
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} minTickGap={24} />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}d`}
            width={36}
          />
          <Tooltip content={(p) => <CollectionTooltip {...p} theme={theme} />} cursor={{ fill: theme.cursorFill }} />
          <Bar dataKey="avgDays" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.breach ? theme.critical : theme.good} />
            ))}
          </Bar>
          <ReferenceLine y={target} stroke={theme.ink} strokeWidth={1.5} strokeDasharray="6 6" />
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-2"
        items={[
          { label: 'Within target', color: theme.good },
          { label: 'Over target', color: theme.critical },
          { label: `${target}-day target`, color: theme.ink, dashed: true },
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------- Ring gauge (headline %)

export function GaugeRing({ percent, caption, detail, color }: { percent: number; caption: string; detail: string; color: 'primary' | 'good' }) {
  const theme = useChartTheme()
  const arc = Math.max(0, Math.min(100, percent))
  const fill = color === 'good' ? theme.good : theme.primary
  const data = [
    { name: 'value', value: arc },
    { name: 'rest', value: 100 - arc },
  ]
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <ResponsiveContainer width={132} height={132}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              innerRadius="76%"
              outerRadius="98%"
              stroke="none"
              cornerRadius={8}
              isAnimationActive={false}
            >
              <Cell fill={fill} />
              <Cell fill={theme.grid} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums text-ink">{percent.toFixed(1)}%</span>
        </div>
      </div>
      <p className="mt-1 text-xs font-medium text-ink">{caption}</p>
      <p className="text-[11px] text-ink-muted">{detail}</p>
    </div>
  )
}

// ---------------------------------------------------------------- Order size vs margin (binned)

function MarginBinTooltip(props: TooltipContentProps & { theme: ChartTheme }) {
  const { active, payload, theme } = props
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload as MarginBin
  return (
    <div style={theme.tooltip} className="px-3 py-2">
      <p className="font-medium">{entry.label}</p>
      <p className="tabular-nums">Avg margin {entry.avgMargin.toFixed(1)}%</p>
      <p style={{ color: theme.ink }}>{entry.orders.toLocaleString()} orders</p>
    </div>
  )
}

export function MarginBinsChart({ bins }: { bins: MarginBin[] }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 11 }
  // Least-squares trend over bin positions, drawn as the dashed guide line.
  const n = bins.length
  const meanX = (n - 1) / 2
  const meanY = bins.reduce((s, b) => s + b.avgMargin, 0) / n
  const varX = bins.reduce((s, _, i) => s + (i - meanX) ** 2, 0)
  const slope = varX > 0 ? bins.reduce((s, b, i) => s + (i - meanX) * (b.avgMargin - meanY), 0) / varX : 0
  const data = bins.map((b, i) => ({ ...b, trend: meanY + slope * (i - meanX) }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 20, right: 16, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
          width={40}
        />
        <Tooltip content={(p) => <MarginBinTooltip {...p} theme={theme} />} cursor={{ stroke: theme.baseline }} />
        <Line dataKey="trend" name="Trend" type="linear" stroke={theme.ink} strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
        <Line
          dataKey="avgMargin"
          name="Avg margin"
          stroke="none"
          dot={{ r: 5, fill: theme.primary, strokeWidth: 2, stroke: theme.surface }}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="avgMargin"
            position="top"
            formatter={(v) => `${Number(v).toFixed(1)}%`}
            style={{ fill: theme.label, fontSize: 10, fontWeight: 600 }}
          />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------- Weekly revenue vs 4-week moving average

type WeekDotProps = { cx?: number; cy?: number; payload?: WeekPoint }

export function WeeklyMaChart({ data, height = 260 }: { data: WeekPoint[]; height?: number }) {
  const theme = useChartTheme()
  const axisTick = { fill: theme.ink, fontSize: 10 }
  const dirDot = (props: WeekDotProps) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <circle key="empty" r={0} fill="none" />
    const fill = payload.dir === 'up' ? theme.good : payload.dir === 'down' ? theme.critical : theme.ink
    return <circle key={payload.key} cx={cx} cy={cy} r={3.5} fill={fill} stroke={theme.surface} strokeWidth={1} />
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: theme.baseline }} minTickGap={48} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={52} />
          <Tooltip
            contentStyle={theme.tooltip}
            cursor={{ stroke: theme.baseline }}
            formatter={(value, seriesName) => [formatPeso(Number(value)), String(seriesName)]}
          />
          <Line
            dataKey="revenue"
            name="Weekly revenue"
            type="monotone"
            stroke={theme.baseline}
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={dirDot}
            activeDot={{ r: 5, strokeWidth: 2, stroke: theme.surface }}
          />
          <Line
            dataKey="ma4"
            name="4-week average"
            type="monotone"
            stroke={theme.primary}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-2"
        items={[
          { label: 'Up vs prior week', color: theme.good },
          { label: 'Down vs prior week', color: theme.critical },
          { label: '4-week average', color: theme.primary },
        ]}
      />
    </div>
  )
}
