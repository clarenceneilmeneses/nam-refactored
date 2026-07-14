import type { Insight, InsightTone } from './analyticsLogic'

/** Icon circle wears the tone; text stays in ink tokens (status is never color-alone). */
export const INSIGHT_TONE: Record<InsightTone, string> = {
  neutral: 'bg-ink/8 text-ink-secondary',
  good: 'bg-good/15 text-good-text',
  warning: 'bg-warning/15 text-warning-text',
  critical: 'bg-critical/15 text-critical-text',
}

export function InsightTile({ insight }: { insight: Insight }) {
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
