import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type StatTone = 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical'

/** Icon + value share the tone colour so they read as one unit. */
const TONE_TEXT: Record<StatTone, string> = {
  neutral: 'text-ink-secondary',
  accent: 'text-accent',
  good: 'text-good-text',
  warning: 'text-warning-text',
  serious: 'text-serious-text',
  critical: 'text-critical-text',
}

type StatCardProps = {
  label: string
  value: ReactNode
  /** Material Symbols (Rounded) ligature name, e.g. "trending_up". */
  icon?: string
  tone?: StatTone
  /** Sub-line(s) under the metric — growth badges, secondary figures, links. */
  hint?: ReactNode
  /** Whole card becomes a link when set. */
  href?: string
  className?: string
}

/**
 * Uniform Material metric card: a bold label over an inline row where the
 * Material Symbols icon sits flush with a bold value in the same tone — the
 * familiar Google console look.
 */
export function StatCard({ label, value, icon, tone = 'neutral', hint, href, className }: StatCardProps) {
  const body = (
    <>
      <p className="truncate text-[13px] font-bold text-ink-secondary">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {icon && <span className={cn('material-symbols-rounded text-[26px]', TONE_TEXT[tone])} aria-hidden>{icon}</span>}
        <span className="truncate text-[26px] leading-none font-bold tabular-nums text-ink">{value}</span>
      </div>
      {hint && <div className="mt-2 text-xs font-medium text-ink-secondary">{hint}</div>}
    </>
  )

  const base = cn(
    'block rounded-xl bg-surface p-4 shadow-e1 transition-shadow duration-150',
    href && 'hover:shadow-e2',
    className,
  )

  return href ? (
    <Link to={href} className={base}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  )
}
