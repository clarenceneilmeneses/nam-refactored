import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Counts from the previously shown value (0 on mount) to `value` with an
 * ease-out ramp, rendering through `format` each frame. Honors
 * prefers-reduced-motion by snapping straight to the target.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 800,
}: {
  value: number
  format: (v: number) => string
  duration?: number
}) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0))
  const shownRef = useRef(display)

  useEffect(() => {
    if (prefersReducedMotion()) {
      shownRef.current = value
      setDisplay(value)
      return
    }
    const from = shownRef.current
    if (from === value) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      const v = t < 1 ? from + (value - from) * eased : value
      shownRef.current = v
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <>{format(display)}</>
}
