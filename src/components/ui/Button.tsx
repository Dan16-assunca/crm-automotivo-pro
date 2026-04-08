import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-[8px]',
    'font-semibold text-[13px] tracking-[0.02em] font-[Space_Grotesk,sans-serif]',
    'transition-all duration-[250ms] ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-neon-full)]',
    'disabled:opacity-40 disabled:pointer-events-none select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--neon)] text-[var(--text-inverse)]',
          'hover:bg-[var(--neon-dim)] hover:shadow-[var(--neon-glow)] hover:-translate-y-px',
          'active:translate-y-0 active:shadow-[var(--neon-glow-sm)]',
        ].join(' '),
        secondary: [
          'bg-transparent text-[var(--neon)] border border-[var(--border-neon)]',
          'hover:bg-[var(--neon-muted)] hover:border-[var(--neon)] hover:shadow-[var(--neon-glow-sm)]',
        ].join(' '),
        ghost: [
          'bg-transparent text-[var(--text-secondary)] border border-transparent',
          'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]',
        ].join(' '),
        danger: [
          'bg-[var(--status-error)] text-white',
          'hover:brightness-110 hover:shadow-[0_0_20px_rgba(255,59,48,0.4)]',
        ].join(' '),
        outline: [
          'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)]',
          'hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
        ].join(' '),
      },
      size: {
        sm:   'h-8 px-3 text-xs',
        md:   'h-[38px] px-4 text-[13px]',
        lg:   'h-11 px-6 text-[14px]',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
