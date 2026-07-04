import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white hover:bg-accent-strong',
        outline: 'border border-hairline bg-surface text-ink hover:bg-page',
        ghost: 'text-ink-secondary hover:bg-ink/5 hover:text-ink',
        destructive: 'bg-critical text-white hover:brightness-95',
        subtle: 'bg-accent-soft text-accent-strong hover:brightness-95',
      },
      size: {
        default: 'h-9 px-5 py-2',
        sm: 'h-8 px-4 text-xs',
        lg: 'h-10 px-7',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
