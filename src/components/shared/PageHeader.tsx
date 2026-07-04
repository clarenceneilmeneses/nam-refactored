import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  subtitle?: ReactNode
  /** Right-aligned actions (buttons, toggles). */
  actions?: ReactNode
  className?: string
}

/**
 * Google-product page header (Analytics / Cloud Console style): a bold
 * Google Sans/Roboto title over a blue-grey supporting subtitle, with a
 * right-aligned actions slot.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-[26px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[#6b7a9c]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
