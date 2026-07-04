import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-black/5 text-ink-secondary',
        good: 'bg-[#0ca30c]/10 text-good-text',
        warning: 'bg-[#fab219]/15 text-[#7a5200]',
        serious: 'bg-[#ec835a]/15 text-[#8a3a1a]',
        critical: 'bg-[#d03b3b]/10 text-[#a32020]',
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
