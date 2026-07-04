import { cn } from '@/lib/utils'

function initials(name?: string | null, fallback?: string | null): string {
  const src = (name || fallback || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

type AvatarProps = {
  url?: string | null
  name?: string | null
  fallback?: string | null
  /** Tailwind size classes for the circle, e.g. "h-10 w-10". */
  className?: string
}

/** Round avatar — shows the uploaded photo, else the user's initials. */
export function Avatar({ url, name, fallback, className = 'h-10 w-10' }: AvatarProps) {
  if (url) {
    return (
      <img
        src={url}
        alt={name || 'Profile photo'}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    )
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-strong',
        className,
      )}
      aria-hidden
    >
      {initials(name, fallback)}
    </span>
  )
}
