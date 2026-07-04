import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-ink/5 text-ink-secondary',
        good: 'bg-good/10 text-good-text',
        warning: 'bg-warning/15 text-warning-text',
        serious: 'bg-serious/15 text-serious-text',
        critical: 'bg-critical/10 text-critical-text',
        accent: 'bg-accent-soft text-accent-strong',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
