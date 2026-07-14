/**
 * Minimal inline trend line for KPI cards: stroke + soft area fill, both in
 * currentColor so the tone comes from a token text class (e.g. text-accent).
 * Decorative only — the real chart below carries axes and tooltips.
 */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null
  const w = 120
  const h = 28
  const pad = 2
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1)
  const y = (v: number) => h - pad - ((v - min) * (h - pad * 2)) / span
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
