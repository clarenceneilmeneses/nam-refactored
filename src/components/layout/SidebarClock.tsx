import { useEffect, useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'

const TZ = 'Asia/Manila'

/** Live Manila (PH) clock for the sidebar. Ticks each second; the date line and
 *  12/24-hour format follow the user's system preferences. Collapsed = time only. */
export function SidebarClock({ collapsed }: { collapsed: boolean }) {
  const { clock24 } = useSettings()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = new Intl.DateTimeFormat('en-PH', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: !clock24,
  }).format(now)

  const date = new Intl.DateTimeFormat('en-PH', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now)

  if (collapsed) {
    return (
      <div className="border-b border-hairline px-0 py-2 text-center" title={date}>
        <p className="text-[11px] font-semibold tabular-nums text-ink-secondary">{time}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex items-baseline justify-between gap-2 border-b border-hairline px-3 py-2.5')}>
      <span className="text-lg font-semibold tabular-nums tracking-tight text-ink">{time}</span>
      <span className="truncate text-[11px] font-medium text-ink-muted">{date}</span>
    </div>
  )
}
