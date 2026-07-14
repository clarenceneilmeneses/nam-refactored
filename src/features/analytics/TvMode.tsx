import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { useSettings } from '@/hooks/useSettings'
import { formatPeso } from '@/lib/format'
import { INSIGHT_TONE } from './InsightTile'
import { SeasonalityChart, TrendChart, WeeklyMaChart } from './AnalyticsCharts'
import type { Insight, MonthPoint, Seasonality, WeekPoint } from './analyticsLogic'

const SLIDE_MS = 15_000
const TICKER_MS = 9_000
const CHART_HEIGHT = 380

export type TvTotals = { revenue: number; profit: number; margin: number; orders: number }

/**
 * Presentation mode for a wall screen: enters fullscreen, shows the headline
 * numbers big, auto-rotates the main charts, and cycles the plain-language
 * insights along the bottom. Closes on Esc / leaving fullscreen.
 */
export function TvMode({
  onClose,
  scope,
  totals,
  monthly,
  seasonality,
  weekly,
  insights,
}: {
  onClose: () => void
  scope: string
  totals: TvTotals
  monthly: MonthPoint[]
  seasonality: Seasonality | null
  weekly: WeekPoint[]
  insights: Insight[]
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const el = rootRef.current
    // Best-effort fullscreen — the overlay still works if the browser refuses.
    el?.requestFullscreen?.().catch(() => {})
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.body.style.overflow = ''
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onClose])

  const slides = useMemo(() => {
    const list: Array<{ key: string; title: string; render: () => ReactNode }> = []
    if (monthly.length > 0) {
      list.push({
        key: 'revenue',
        title: 'Revenue by Month',
        render: () => (
          <TrendChart
            data={monthly.map((p) => ({ label: p.label, value: p.revenue }))}
            avg={monthly.reduce((s, p) => s + p.revenue, 0) / monthly.length}
            tickFormat={(v) => formatPeso(v)}
            tooltipFormat={(v) => formatPeso(v)}
            name="Revenue"
            height={CHART_HEIGHT}
          />
        ),
      })
    }
    if (seasonality) {
      list.push({
        key: 'seasonality',
        title: `Seasonality: ${seasonality.currentYear} vs ${seasonality.previousYear}`,
        render: () => <SeasonalityChart seasonality={seasonality} height={CHART_HEIGHT} />,
      })
    }
    if (weekly.length > 0) {
      list.push({
        key: 'weekly',
        title: 'Weekly Revenue Momentum',
        render: () => <WeeklyMaChart data={weekly} height={CHART_HEIGHT} />,
      })
    }
    return list
  }, [monthly, seasonality, weekly])

  const [slide, setSlide] = useState(0)
  useEffect(() => {
    if (slides.length < 2) return
    const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), SLIDE_MS)
    return () => clearInterval(id)
  }, [slides.length])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (insights.length < 2) return
    const id = setInterval(() => setTick((t) => (t + 1) % insights.length), TICKER_MS)
    return () => clearInterval(id)
  }, [insights.length])

  const current = slides[slide % Math.max(slides.length, 1)]
  const insight = insights[tick % Math.max(insights.length, 1)]

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col gap-5 overflow-hidden bg-page p-6 lg:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="TV mode"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">NAM Builders &amp; Supply — Live Analytics</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">{scope}</p>
        </div>
        <div className="flex items-center gap-4">
          <TvClock />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Exit TV mode">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TvStat label="Total Revenue" value={<AnimatedNumber value={totals.revenue} format={formatPeso} />} />
        <TvStat
          label="Net Profit"
          value={<AnimatedNumber value={totals.profit} format={formatPeso} />}
          sub={`${totals.margin.toFixed(1)}% margin`}
        />
        <TvStat
          label="Orders"
          value={<AnimatedNumber value={totals.orders} format={(v) => Math.round(v).toLocaleString()} />}
        />
        <TvStat
          label="Avg. Order Value"
          value={
            <AnimatedNumber value={totals.orders > 0 ? totals.revenue / totals.orders : 0} format={formatPeso} />
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-hairline bg-surface p-5 shadow-e1">
        {current ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{current.title}</h2>
              {slides.length > 1 && (
                <div className="flex items-center gap-1.5" aria-hidden>
                  {slides.map((s, i) => (
                    <span
                      key={s.key}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        i === slide ? 'w-5 bg-accent' : 'w-1.5 bg-ink/20'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
            {/* Remount per slide so recharts replays its entrance animation. */}
            <div key={current.key} className="min-h-0 flex-1">
              {current.render()}
            </div>
          </>
        ) : (
          <p className="m-auto text-sm text-ink-muted">No data for this selection</p>
        )}
      </div>

      {insight && (
        <div key={insight.headline} className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-4 shadow-e1">
          <span
            className={`material-symbols-rounded flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[24px] ${INSIGHT_TONE[insight.tone]}`}
            aria-hidden
          >
            {insight.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{insight.headline}</p>
            <p className="truncate text-sm text-ink-secondary">{insight.detail}</p>
          </div>
          {insights.length > 1 && (
            <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-muted">
              {(tick % insights.length) + 1} / {insights.length}
            </span>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}

function TvStat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-e1">
      <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink lg:text-3xl">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-ink-secondary">{sub}</p>}
    </div>
  )
}

/** Live Manila clock, same conventions as the sidebar clock. */
function TvClock() {
  const { clock24 } = useSettings()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const time = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: !clock24,
  }).format(now)
  const date = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now)
  return (
    <div className="text-right">
      <p className="text-2xl leading-none font-bold tabular-nums text-ink">{time}</p>
      <p className="mt-1 text-xs text-ink-muted">{date}</p>
    </div>
  )
}
